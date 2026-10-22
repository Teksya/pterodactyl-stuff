<?php

declare(strict_types=1);

namespace OlivierDutoit\Turnstile\Http\Middleware;

use Closure;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Pterodactyl\Events\Auth\FailedCaptcha;
use Pterodactyl\Facades\Extensions;
use Pterodactyl\Http\Middleware\VerifyReCaptcha;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Takes the place of the panel's VerifyReCaptcha. While the extension is unavailable or its keys
 * are not set, it hands the request to the panel's own reCAPTCHA check unchanged.
 */
class VerifyTurnstile
{
    private const string EXTENSION = 'turnstile';

    private const string VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    /** The body field the extension's frontend sends the token in. */
    private const string TOKEN_FIELD = 'cf-turnstile-response';

    /**
     * @param  Closure(Request): \Symfony\Component\HttpFoundation\Response  $next
     */
    public function handle(Request $request, Closure $next): mixed
    {
        $settings = Extensions::isAvailable(self::EXTENSION) ? Extensions::settings(self::EXTENSION) : null;
        $siteKey = $settings?->get('site_key');
        $secret = $settings?->get('secret_key');

        if (! is_string($siteKey) || $siteKey === '' || ! is_string($secret) || $secret === '') {
            return (new VerifyReCaptcha)->handle($request, $next);
        }

        $result = $this->verify($request, $secret);
        $hostnameValid = $settings->get('verify_hostname', true) === false || $result['hostname'] === $request->getHost();

        if ($result['success'] && $hostnameValid) {
            return $next($request);
        }

        event(new FailedCaptcha($request->ip() ?? 'unknown', $result['hostname'] ?? 'unknown'));

        throw new HttpException(Response::HTTP_BAD_REQUEST, 'Failed to validate the Turnstile challenge.');
    }

    /**
     * @return array{success: bool, hostname: string|null}
     */
    private function verify(Request $request, string $secret): array
    {
        $token = $request->input(self::TOKEN_FIELD);
        if (! is_string($token) || $token === '' || mb_strlen($token) > 2048) {
            return ['success' => false, 'hostname' => null];
        }

        try {
            $response = (new Client(['timeout' => 5, 'connect_timeout' => 2]))->post(self::VERIFY_URL, [
                'form_params' => array_filter([
                    'secret' => $secret,
                    'response' => $token,
                    'remoteip' => $request->ip(),
                ]),
            ]);

            $decoded = json_decode($response->getBody()->__toString(), true);
        } catch (GuzzleException) {
            return ['success' => false, 'hostname' => null];
        }

        if (! is_array($decoded)) {
            return ['success' => false, 'hostname' => null];
        }

        $hostname = $decoded['hostname'] ?? null;

        return [
            'success' => ($decoded['success'] ?? false) === true,
            'hostname' => is_string($hostname) ? $hostname : null,
        ];
    }
}
