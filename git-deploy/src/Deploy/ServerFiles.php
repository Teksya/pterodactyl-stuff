<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Deploy;

use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Http;
use OlivierDutoit\GitDeploy\Forges\ForgeException;
use Pterodactyl\Contracts\Files\CreatesDirectories;
use Pterodactyl\Contracts\Files\DecompressesFiles;
use Pterodactyl\Contracts\Files\DeletesFiles;
use Pterodactyl\Contracts\Files\ListsDirectories;
use Pterodactyl\Contracts\Files\RenamesFiles;
use Pterodactyl\Enum\JwtScope;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Nodes\NodeJwt;

/** The server's files, through Wings, as the deployer needs them. */
final class ServerFiles
{
    public function __construct(
        private readonly ListsDirectories $directories,
        private readonly CreatesDirectories $folders,
        private readonly RenamesFiles $renamer,
        private readonly DeletesFiles $deleter,
        private readonly DecompressesFiles $decompressor,
        private readonly NodeJwt $jwt,
    ) {}

    /**
     * The folder's entries by name, true for folders; empty when it does not exist.
     *
     * @return array<string, bool>
     */
    public function entries(Server $server, string $directory): array
    {
        try {
            $entries = $this->directories->list($server, $directory);
        } catch (DaemonConnectionException $exception) {
            if ($exception->getStatusCode() === 404) {
                return [];
            }
            throw $exception;
        }

        $names = [];
        foreach ($entries as $entry) {
            $name = (string) ($entry['name'] ?? '');
            if ($name !== '') {
                $names[$name] = ($entry['file'] ?? true) === false;
            }
        }

        return $names;
    }

    /** Creates the folder and its parents, if missing. */
    public function makeDirectory(Server $server, string $path): void
    {
        $parent = '/';
        foreach (array_filter(explode('/', trim($path, '/'))) as $segment) {
            if (! array_key_exists($segment, $this->entries($server, $parent))) {
                $this->folders->create($server, $segment, $parent);
            }
            $parent = rtrim($parent, '/').'/'.$segment;
        }
    }

    /**
     * Moves entries, relative to $root, such as `app.js` to `.deploy/releases/x/app.js`.
     *
     * @param  list<array{from: string, to: string}>  $moves
     */
    public function move(Server $server, string $root, array $moves): void
    {
        foreach (array_chunk($moves, 50) as $chunk) {
            $this->renamer->rename($server, $root, $chunk);
        }
    }

    /** @param  list<string>  $names */
    public function delete(Server $server, string $root, array $names): void
    {
        if ($names !== []) {
            $this->deleter->delete($server, $root, $names);
        }
    }

    public function decompress(Server $server, string $root, string $file): void
    {
        $this->decompressor->decompress($server, $root, $file);
    }

    /**
     * Sends a local file into the server's folder, through Wings' upload endpoint with a token the
     * panel signs, as the file manager's uploads.
     */
    public function upload(Server $server, string $directory, string $local, string $name): void
    {
        $user = $server->user;
        $token = $this->jwt->issue(
            $server->node,
            JwtScope::FileUpload,
            identifiedBy: 'git-deploy'.$server->uuid.bin2hex(random_bytes(6)),
            expiresAt: CarbonImmutable::now()->addMinutes(15),
            user: $user,
            claims: ['server_uuid' => $server->uuid],
        );

        $handle = fopen($local, 'r');
        if ($handle === false) {
            throw new ForgeException('The panel cannot read the archive it built.');
        }

        try {
            $response = Http::timeout(600)
                ->withOptions(['verify' => App::isProduction()])
                ->attach('files', $handle, $name)
                ->post($server->node->getConnectionAddress().'/upload/file?'.http_build_query(['token' => $token->toString(), 'directory' => $directory]));
        } catch (ConnectionException $exception) {
            throw new ForgeException('Wings could not be reached: '.$exception->getMessage());
        } finally {
            if (is_resource($handle)) {
                fclose($handle);
            }
        }

        if (! $response->successful()) {
            throw new ForgeException(sprintf('Wings refused the archive (HTTP %d): %s', $response->status(), mb_substr(trim($response->body()), 0, 200)));
        }
    }
}
