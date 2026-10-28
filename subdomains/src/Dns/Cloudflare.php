<?php

declare(strict_types=1);

namespace OlivierDutoit\Subdomains\Dns;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Cloudflare's DNS API, with an API token that has Zone → DNS → Edit (and Zone → Zone → Read)
 * on the zones of the offered domains. Records are never proxied: game traffic cannot go
 * through Cloudflare's proxy.
 */
final class Cloudflare implements DnsProvider
{
    private const string API = 'https://api.cloudflare.com/client/v4';

    /** Cloudflare's code for a record id that does not exist. */
    private const int RECORD_NOT_FOUND = 81044;

    /** @param  int  $ttl  seconds, or 1 for Cloudflare's automatic TTL */
    public function __construct(private readonly string $token, private readonly int $ttl = 1) {}

    public function zoneFor(string $domain): string
    {
        $key = 'subdomains:zone:'.md5($this->token).':'.$domain;
        $cached = Cache::get($key);
        if (is_string($cached)) {
            return $cached;
        }

        // play.example.co.uk may live in a zone for play.example.co.uk, example.co.uk or co.uk.
        $labels = explode('.', $domain);
        while (count($labels) >= 2) {
            $result = $this->request('get', '/zones', query: ['name' => implode('.', $labels), 'status' => 'active']);
            $id = $result[0]['id'] ?? null;
            if (is_string($id)) {
                Cache::put($key, $id, 3600);

                return $id;
            }
            array_shift($labels);
        }

        throw new DnsException(sprintf('The Cloudflare token cannot reach a zone for %s.', $domain));
    }

    public function find(string $zone, string $name): array
    {
        $result = $this->request('get', "/zones/{$zone}/dns_records", query: ['name' => $name, 'per_page' => 100]);

        return array_values(array_map(
            fn (array $record): array => ['id' => (string) $record['id'], 'type' => (string) $record['type']],
            array_filter($result, fn (mixed $record): bool => is_array($record) && isset($record['id'], $record['type'])),
        ));
    }

    public function create(string $zone, DnsRecord $record, string $comment): string
    {
        $result = $this->request('post', "/zones/{$zone}/dns_records", $this->body($record, $comment));
        $id = $result['id'] ?? null;
        if (! is_string($id)) {
            throw new DnsException('Cloudflare did not return the new record.');
        }

        return $id;
    }

    public function update(string $zone, string $id, DnsRecord $record, string $comment): void
    {
        $this->request('put', "/zones/{$zone}/dns_records/{$id}", $this->body($record, $comment));
    }

    public function delete(string $zone, string $id): void
    {
        try {
            $this->request('delete', "/zones/{$zone}/dns_records/{$id}");
        } catch (DnsException $exception) {
            if (! $exception->notFound) {
                throw $exception;
            }
        }
    }

    public function zones(): array
    {
        $result = $this->request('get', '/zones', query: ['per_page' => 50]);

        return array_values(array_filter(array_map(fn (mixed $zone): ?string => is_array($zone) && is_string($zone['name'] ?? null) ? $zone['name'] : null, $result)));
    }

    /** @return array<string, mixed> */
    private function body(DnsRecord $record, string $comment): array
    {
        $body = ['type' => $record->type, 'name' => $record->name, 'ttl' => $this->ttl, 'comment' => mb_substr($comment, 0, 100)];

        return $record->srv !== null
            ? [...$body, 'data' => $record->srv]
            : [...$body, 'content' => $record->content, 'proxied' => false];
    }

    /**
     * @param  array<string, mixed>|null  $body
     * @param  array<string, mixed>  $query
     * @return array<mixed> the response's `result`
     */
    private function request(string $method, string $path, ?array $body = null, array $query = []): array
    {
        if ($this->token === '') {
            throw new DnsException('No Cloudflare API token is set in the extension\'s settings.');
        }

        try {
            $client = Http::withToken($this->token)->acceptJson()->timeout(10)->connectTimeout(5);
            $url = self::API.$path.($query !== [] ? '?'.http_build_query($query) : '');
            /** @var Response $response */
            $response = match ($method) {
                'get' => $client->get($url),
                'post' => $client->post($url, $body ?? []),
                'put' => $client->put($url, $body ?? []),
                'delete' => $client->delete($url),
            };
        } catch (ConnectionException) {
            throw new DnsException('Cloudflare could not be reached.');
        }

        $json = $response->json();
        if ($response->successful() && is_array($json) && ($json['success'] ?? false) === true) {
            return is_array($json['result'] ?? null) ? $json['result'] : [];
        }

        $errors = is_array($json) && is_array($json['errors'] ?? null) ? $json['errors'] : [];
        $first = is_array($errors[0] ?? null) ? $errors[0] : [];
        $notFound = ($first['code'] ?? null) === self::RECORD_NOT_FOUND || $response->status() === 404;
        $message = is_string($first['message'] ?? null) ? $first['message'] : sprintf('HTTP %d', $response->status());

        if ($response->status() === 401 || $response->status() === 403) {
            $message = 'Cloudflare refused the API token ('.$message.'). It needs Zone → DNS → Edit on the domain\'s zone.';
        }

        throw new DnsException('Cloudflare: '.$message, $notFound);
    }
}
