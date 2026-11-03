<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Forges;

use Illuminate\Http\Request;

/**
 * A push a forge reports to the repository's webhook URL. GitHub and Gitea/Forgejo sign the body
 * with the secret (HMAC-SHA256), GitLab sends the secret as its token, and anything else (a CI job,
 * a script) can send it as X-Deploy-Token.
 */
final readonly class Webhook
{
    private function __construct(
        /** push, ping or other. */
        public string $event,
        public ?string $branch = null,
        public ?string $sha = null,
        public ?string $message = null,
        public ?string $author = null,
    ) {}

    /** The push, or null when the request is not signed with the secret. */
    public static function from(Request $request, string $secret): ?self
    {
        $body = $request->getContent();

        if (! self::authentic($request, $body, $secret)) {
            return null;
        }

        $event = strtolower((string) ($request->header('X-GitHub-Event') ?? $request->header('X-Gitea-Event') ?? $request->header('X-Forgejo-Event') ?? $request->header('X-Gitlab-Event') ?? 'push'));
        if ($event === 'ping') {
            return new self('ping');
        }
        if (! in_array($event, ['push', 'push hook'], true)) {
            return new self('other');
        }

        $data = json_decode($body, true);
        if (! is_array($data)) {
            // A bare call from a script: deploy the branch's last commit.
            return new self('push');
        }

        $ref = (string) ($data['ref'] ?? '');
        $sha = $data['checkout_sha'] ?? $data['after'] ?? null;
        if (! str_starts_with($ref, 'refs/heads/') || ! is_string($sha) || ! preg_match('/^[0-9a-f]{40,64}$/', $sha) || preg_match('/^0+$/', $sha)) {
            // A tag, or a deleted branch.
            return new self('other');
        }

        $head = is_array($data['head_commit'] ?? null) ? $data['head_commit'] : null;
        if ($head === null && is_array($data['commits'] ?? null)) {
            foreach ($data['commits'] as $commit) {
                if (is_array($commit) && ($commit['id'] ?? null) === $sha) {
                    $head = $commit;
                }
            }
        }

        return new self(
            'push',
            substr($ref, strlen('refs/heads/')),
            $sha,
            is_string($head['message'] ?? null) ? mb_substr(trim($head['message']), 0, 500) : null,
            is_string($head['author']['name'] ?? null) ? $head['author']['name'] : (is_string($data['user_name'] ?? null) ? $data['user_name'] : null),
        );
    }

    private static function authentic(Request $request, string $body, string $secret): bool
    {
        $expected = hash_hmac('sha256', $body, $secret);

        $github = (string) $request->header('X-Hub-Signature-256', '');
        if ($github !== '') {
            return hash_equals('sha256='.$expected, $github);
        }

        $gitea = (string) ($request->header('X-Gitea-Signature') ?? $request->header('X-Forgejo-Signature') ?? '');
        if ($gitea !== '') {
            return hash_equals($expected, $gitea);
        }

        $token = (string) ($request->header('X-Gitlab-Token') ?? $request->header('X-Deploy-Token') ?? '');

        return $token !== '' && hash_equals($secret, $token);
    }
}
