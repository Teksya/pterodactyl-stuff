<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Delivery;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use InvalidArgumentException;
use JsonException;
use OlivierDutoit\Webhooks\Models\Delivery;
use OlivierDutoit\Webhooks\Models\Endpoint;
use OlivierDutoit\Webhooks\Scope;
use OlivierDutoit\Webhooks\Settings;
use OlivierDutoit\Webhooks\Targets\Message;
use OlivierDutoit\Webhooks\Targets\ProviderRegistry;
use Throwable;

/** Sends deliveries and records what happened, on the delivery and on its endpoint. */
final readonly class Sender
{
    private const int RESPONSE_LIMIT = 2000;

    public function __construct(private ProviderRegistry $providers, private TargetGuard $guard) {}

    /** One attempt: the request is built, checked, sent, and the answer stored on the delivery. */
    public function attempt(Delivery $delivery): DeliveryResult
    {
        $endpoint = $delivery->endpoint;
        $delivery->attempts++;
        $delivery->error = null;
        $started = hrtime(true);

        try {
            $provider = $this->providers->find($endpoint->provider) ?? throw new InvalidTarget(sprintf('The "%s" provider does not exist.', $endpoint->provider));
            $request = $provider->request($endpoint->config ?? [], $delivery->payload, Message::fromPayload($delivery->payload));
            $target = $this->guard->check($request->url, $this->allowsPrivate($endpoint));

            $headers = [];
            $type = 'application/json';
            foreach ($request->headers as $name => $value) {
                if (mb_strtolower($name) === 'content-type') {
                    $type = $value;
                } else {
                    $headers[$name] = $value;
                }
            }

            // Streamed, so a target answering with a huge body cannot fill the worker's memory.
            $options = ['allow_redirects' => false, 'stream' => true];
            if ($target['ip'] !== null && defined('CURLOPT_RESOLVE')) {
                $ip = str_contains($target['ip'], ':') ? '['.$target['ip'].']' : $target['ip'];
                $options['curl'] = [CURLOPT_RESOLVE => [sprintf('%s:%d:%s', $target['host'], $target['port'], $ip)]];
            }

            $pending = Http::timeout(Settings::int('timeout', 1, 30))
                ->connectTimeout(5)
                ->withUserAgent('Pterodactyl-Webhooks/1.0')
                ->withHeaders($headers)
                ->withOptions($options);
            if ($request->body !== null) {
                $pending = $pending->withBody($request->body, $type);
            }

            $response = $pending->send($request->method, $request->url);
            $result = $this->record($delivery, $response);
        } catch (InvalidTarget|InvalidArgumentException|JsonException $exception) {
            $delivery->error = $this->redact($exception->getMessage());
            $result = new DeliveryResult(false, permanent: true);
        } catch (ConnectionException $exception) {
            $delivery->error = $this->redact('Could not connect: '.$exception->getMessage());
            $result = new DeliveryResult(false);
        } catch (Throwable $exception) {
            report($exception);
            $delivery->error = $this->redact($exception->getMessage());
            $result = new DeliveryResult(false);
        }

        $delivery->duration_ms = (int) ((hrtime(true) - $started) / 1_000_000);

        try {
            $delivery->save();
        } catch (Throwable $exception) {
            // The attempt happened: losing its record must not make the job send it again.
            report($exception);
            $delivery->forceFill(['response_body' => null, 'error' => 'The response could not be stored.'])->save();
        }

        return $result;
    }

    /**
     * Error messages name the URL they failed on, and a Telegram token or a Discord webhook
     * secret is part of it: only the scheme and host are kept.
     */
    private function redact(string $message): string
    {
        $message = (string) preg_replace_callback('#\b(https?)://([^/\s:?\#]+)[^\s]*#i', fn (array $match): string => $match[1].'://'.$match[2].'/…', $message);

        return Str::limit(mb_scrub($message, 'UTF-8'), 490);
    }

    /**
     * Settle a delivery: success, or failure once no attempt is left. A failure counts against
     * the endpoint, which is turned off after the configured number of failures in a row.
     */
    public function settle(Delivery $delivery, DeliveryResult $result, bool $final): void
    {
        $endpoint = $delivery->endpoint;

        if ($result->ok) {
            $delivery->forceFill(['status' => Delivery::SUCCESS, 'delivered_at' => now()])->save();
            $endpoint->forceFill(['failure_count' => 0, 'last_status' => Delivery::SUCCESS, 'last_delivery_at' => now()])->save();

            return;
        }

        if (! $final) {
            return;
        }

        $delivery->forceFill(['status' => Delivery::FAILED])->save();
        $endpoint->forceFill(['last_status' => Delivery::FAILED, 'last_delivery_at' => now()]);
        if (! $delivery->is_test) {
            $endpoint->failure_count++;
            $limit = Settings::int('auto_disable');
            if ($limit > 0 && $endpoint->failure_count >= $limit && $endpoint->enabled) {
                $endpoint->enabled = false;
                $endpoint->disabled_reason = sprintf('Turned off after %d failed deliveries in a row.', $endpoint->failure_count);
                Dispatcher::forget();
            }
        }

        $endpoint->save();
    }

    /** Send now and settle at once, for the Test and Redeliver buttons. */
    public function deliverNow(Delivery $delivery): Delivery
    {
        $this->settle($delivery, $this->attempt($delivery), true);

        return $delivery->refresh();
    }

    private function record(Delivery $delivery, Response $response): DeliveryResult
    {
        $status = $response->status();
        // Only the start of the body is read, and scrubbed: a Latin-1 or binary answer would not fit a utf8mb4 column.
        $stream = $response->toPsrResponse()->getBody();
        $body = '';
        while (! $stream->eof() && strlen($body) < self::RESPONSE_LIMIT * 2) {
            $chunk = $stream->read(self::RESPONSE_LIMIT * 2 - strlen($body));
            if ($chunk === '') {
                break;
            }
            $body .= $chunk;
        }
        $stream->close();
        $body = mb_scrub($body, 'UTF-8');
        $delivery->response_status = $status;
        $delivery->response_body = Str::limit($body, self::RESPONSE_LIMIT);

        if ($response->successful()) {
            return new DeliveryResult(true);
        }

        $delivery->error = sprintf('The target answered HTTP %d.', $status);
        if ($status === 429) {
            return new DeliveryResult(false, retryAfter: $this->retryAfter($response, $body));
        }

        return new DeliveryResult(false, permanent: $status >= 400 && $status < 500 && ! in_array($status, [408, 425], true));
    }

    /** Seconds from Retry-After, or from Discord's JSON retry_after. */
    private function retryAfter(Response $response, string $body): int
    {
        $header = $response->header('Retry-After');
        $json = json_decode($body, true);
        $seconds = is_numeric($header) ? (float) $header : (float) (is_array($json) && is_numeric($json['retry_after'] ?? null) ? $json['retry_after'] : 30);

        return max(1, min(3600, (int) ceil($seconds)));
    }

    private function allowsPrivate(Endpoint $endpoint): bool
    {
        return $endpoint->scope === Scope::Admin || Settings::bool('private_targets');
    }
}
