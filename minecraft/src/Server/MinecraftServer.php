<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Server;

use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use OlivierDutoit\Minecraft\MinecraftProvider;
use OlivierDutoit\Minecraft\Nbt\Nbt;
use Pterodactyl\Contracts\Files\ListsDirectories;
use Pterodactyl\Contracts\Files\ReadsFileContents;
use Pterodactyl\Contracts\Files\WritesFileContents;
use Pterodactyl\Enum\JwtScope;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Facades\Extensions;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Nodes\NodeJwt;
use RuntimeException;
use Throwable;

/** A Minecraft server's files as the panel reads and writes them through Wings, and where it listens. */
final class MinecraftServer
{
    public const string PROPERTIES = 'server.properties';

    /** What Wings answered when the last binary read found nothing, to tell the user. */
    public ?string $lastMissing = null;

    /** @var array<string, Properties> server.properties by server, as read in this request */
    private array $properties = [];
    private const int MAX_FILE = 8 * 1024 * 1024;

    public function __construct(
        private readonly ReadsFileContents $reader,
        private readonly WritesFileContents $writer,
        private readonly ListsDirectories $directories,
    ) {}

    public function read(Server $server, string $path): string
    {
        return $this->reader->read($server, $path, self::MAX_FILE);
    }

    /** The file, or null when it does not exist (yet). */
    public function readIfExists(Server $server, string $path): ?string
    {
        try {
            return $this->read($server, $path);
        } catch (DaemonConnectionException $exception) {
            if ($exception->getStatusCode() === 404) {
                return null;
            }
            throw $exception;
        }
    }

    /**
     * A binary file (player files, level.dat), or null when it does not exist. Wings' file contents
     * endpoint is for text and refuses them, so they come through its download endpoint, as the file
     * manager downloads files, with a token the panel signs for two minutes.
     */
    public function readBinaryIfExists(Server $server, string $path): ?string
    {
        $this->lastMissing = null;
        $download = null;
        if (class_exists(NodeJwt::class)) {
            $download = $this->download($server, $path);
            if (is_string($download)) {
                return $download;
            }
        }

        // Wings' file contents endpoint, which serves some binary files and some Wings versions.
        try {
            $contents = $this->readIfExists($server, $path);
            if ($contents === null) {
                $this->lastMissing = trim(($download === null ? '' : "download: {$download['answer']}; ").'contents: HTTP 404');
            }

            return $contents;
        } catch (Throwable $exception) {
            $answer = ($download === null ? '' : "download: {$download['answer']}; ").'contents: '.$exception->getMessage();
            if ($download !== null && $download['status'] === 404) {
                $this->lastMissing = $answer;

                return null;
            }
            throw new RuntimeException("Wings could not send {$path} ({$answer}).", 0, $exception);
        }
    }

    /**
     * The file through Wings' download endpoint, with a token the panel signs for two minutes, as the
     * file manager's downloads; Wings ties a download to a user, here the one asking, or the server's
     * owner for background jobs.
     *
     * @return string|array{status: int, answer: string} the file, or what Wings answered instead.
     */
    private function download(Server $server, string $path): string|array
    {
        $user = auth()->user();
        if (! $user instanceof User) {
            $user = $server->user;
        }

        $token = app(NodeJwt::class)->issue(
            $server->node,
            JwtScope::FileDownload,
            identifiedBy: ($user?->id ?? 'minecraft').$server->uuid.bin2hex(random_bytes(6)),
            expiresAt: CarbonImmutable::now()->addMinutes(2),
            user: $user instanceof User ? $user : null,
            claims: ['file_path' => '/'.ltrim($path, '/'), 'server_uuid' => $server->uuid],
        );

        try {
            $response = Http::timeout(30)
                ->withOptions(['verify' => App::isProduction()])
                ->get($server->node->getConnectionAddress().'/download/file', ['token' => $token->toString()]);
        } catch (ConnectionException $exception) {
            return ['status' => 0, 'answer' => $exception->getMessage()];
        }
        if (! $response->successful()) {
            return ['status' => $response->status(), 'answer' => "HTTP {$response->status()} ".mb_substr(trim($response->body()), 0, 200)];
        }
        if (strlen($response->body()) > self::MAX_FILE) {
            throw new RuntimeException("{$path} is larger than the panel reads.");
        }

        return $response->body();
    }

    public function write(Server $server, string $path, string $contents): void
    {
        $this->writer->write($server, $path, $contents);
        if (ltrim($path, '/') === self::PROPERTIES) {
            unset($this->properties[$server->uuid]);
        }
    }

    /** @return list<array<string, mixed>> Wings' entries: name, size, modified, file…; none when it fails. */
    public function list(Server $server, string $directory): array
    {
        try {
            return $this->directories->list($server, $directory);
        } catch (DaemonConnectionException) {
            return [];
        }
    }

    /**
     * The same, for decisions that must not take a failed listing for an empty folder: a missing
     * folder is empty, any other failure throws.
     *
     * @return list<array<string, mixed>>
     */
    public function listOrFail(Server $server, string $directory): array
    {
        try {
            return $this->directories->list($server, $directory);
        } catch (DaemonConnectionException $exception) {
            if ($exception->getStatusCode() === 404) {
                return [];
            }
            throw $exception;
        }
    }

    /** A JSON file's content; a missing or broken file reads as an empty array. */
    public function json(Server $server, string $path): array
    {
        try {
            $decoded = json_decode($this->readIfExists($server, $path) ?? '[]', true);
        } catch (Throwable) {
            return [];
        }

        return is_array($decoded) ? $decoded : [];
    }

    /**
     * A JSON list file about to be rewritten: missing reads as empty, but a read that fails or a file
     * that is not a JSON list throws, so a change never writes over entries it could not read.
     *
     * @return list<mixed>
     */
    public function jsonListForUpdate(Server $server, string $path): array
    {
        $contents = $this->readIfExists($server, $path);
        if ($contents === null || trim($contents) === '') {
            return [];
        }

        $decoded = json_decode($contents, true);
        if (! is_array($decoded) || ! array_is_list($decoded)) {
            throw new InvalidArgumentException("{$path} is not a valid JSON list; fix it in the file manager first.");
        }

        return $decoded;
    }

    /** server.properties; empty on a server that has not started yet. */
    public function properties(Server $server): Properties
    {
        // Read once per request: the world folder, the online mode and more come from it.
        return $this->properties[$server->uuid] ??= Properties::parse($this->readIfExists($server, self::PROPERTIES) ?? '');
    }

    /**
     * Where the world may keep its players' files, newest layout first: players/data and
     * players/stats from 26.1, playerdata and stats before. Both are looked in, so a world migrated
     * from one to the other, or a listing that failed, never hides a player.
     *
     * @return array{data: list<string>, stats: list<string>}
     */
    public function playerFolders(Server $server): array
    {
        $world = $this->world($server);

        return [
            'data' => ["{$world}/players/data", "{$world}/playerdata"],
            'stats' => ["{$world}/players/stats", "{$world}/stats"],
        ];
    }

    /** The world folder, from level-name. */
    public function world(Server $server): string
    {
        try {
            $name = $this->properties($server)->get('level-name', 'world') ?? 'world';
        } catch (Throwable) {
            $name = 'world';
        }
        $name = trim(str_replace('\\', '/', $name), '/');

        return $name === '' || str_contains($name, '..') ? 'world' : $name;
    }

    /**
     * The world's game version, from level.dat; the commands and the item format depend on it.
     *
     * @return array{name: string|null, dataVersion: int|null}
     */
    public function version(Server $server): array
    {
        $key = 'minecraft:version:'.$server->uuid;
        $cached = Cache::get($key);
        if (is_array($cached)) {
            return $cached;
        }

        try {
            $level = Nbt::readPlain((string) $this->readBinaryIfExists($server, $this->world($server).'/level.dat'));
        } catch (Throwable) {
            // Not cached: the world may simply not exist yet.
            return ['name' => null, 'dataVersion' => null];
        }
        $data = is_array($level['Data'] ?? null) ? $level['Data'] : [];
        $version = is_array($data['Version'] ?? null) ? $data['Version'] : [];
        $result = [
            'name' => is_string($version['Name'] ?? null) ? $version['Name'] : null,
            'dataVersion' => is_int($data['DataVersion'] ?? null) ? $data['DataVersion'] : (is_int($version['Id'] ?? null) ? $version['Id'] : null),
        ];
        if ($result['dataVersion'] !== null) {
            Cache::put($key, $result, 120);
        }

        return $result;
    }

    /**
     * Where the game listens: the main allocation's address, or, when it listens on every address,
     * the configured host or else the node's FQDN.
     *
     * @return array{string, int}
     */
    public function address(Server $server): array
    {
        $allocation = $server->allocation;
        $ip = (string) $allocation?->ip;
        if (! in_array($ip, ['', '0.0.0.0', '::', '[::]'], true)) {
            return [$ip, (int) $allocation?->port];
        }

        $configured = trim((string) Extensions::settings(MinecraftProvider::ID)->get('status_host', ''));

        return [$configured !== '' ? $configured : $server->node->fqdn, (int) $allocation?->port];
    }
}
