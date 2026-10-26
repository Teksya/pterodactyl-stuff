<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Worlds;

use Pterodactyl\Contracts\Files\CompressesFiles;
use Pterodactyl\Contracts\Files\CreatesDirectories;
use Pterodactyl\Contracts\Files\DecompressesFiles;
use Pterodactyl\Contracts\Files\DeletesFiles;
use Pterodactyl\Contracts\Files\RenamesFiles;
use Pterodactyl\Models\Server;
use Throwable;

/** The archive and folder operations snapshots need, through Wings. */
final class WorldFiles
{
    public function __construct(
        private readonly CompressesFiles $compressor,
        private readonly DecompressesFiles $decompressor,
        private readonly DeletesFiles $deleter,
        private readonly RenamesFiles $renamer,
        private readonly CreatesDirectories $directories,
    ) {}

    /**
     * Archives `$folders` (in the server's root) and moves the archive to `$target` in `$directory`.
     * An archive that cannot be moved is deleted rather than left in the root.
     *
     * @param  list<string>  $folders
     * @return int|null the archive's size in bytes.
     */
    public function archive(Server $server, array $folders, string $directory, string $target): ?int
    {
        $archive = $this->compressor->compress($server, '/', $folders);
        $name = (string) $archive['name'];
        try {
            $this->ensureDirectory($server, $directory);
            $this->renamer->rename($server, '/', [['from' => $name, 'to' => "{$directory}/{$target}"]]);
        } catch (Throwable $exception) {
            try {
                $this->deleter->delete($server, '/', [$name]);
            } catch (Throwable) {
                // Left in the root, named archive-*.tar.gz.
            }
            throw $exception;
        }

        return isset($archive['size']) ? (int) $archive['size'] : null;
    }

    /** Extracts `$archive` into the server's root. */
    public function extract(Server $server, string $archive): void
    {
        $this->decompressor->decompress($server, '/', $archive);
    }

    /** @param array<string, string> $names old name => new name, in the server's root. */
    public function rename(Server $server, array $names): void
    {
        if ($names !== []) {
            $this->renamer->rename($server, '/', array_map(fn (string $from, string $to): array => ['from' => $from, 'to' => $to], array_keys($names), array_values($names)));
        }
    }

    /** @param list<string> $names */
    public function delete(Server $server, string $directory, array $names): void
    {
        if ($names !== []) {
            $this->deleter->delete($server, $directory, $names);
        }
    }

    private function ensureDirectory(Server $server, string $directory): void
    {
        try {
            $this->directories->create($server, $directory, '/');
        } catch (Throwable) {
            // It exists already.
        }
    }
}
