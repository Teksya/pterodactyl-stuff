<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Deploy;

use OlivierDutoit\GitDeploy\Forges\ForgeException;
use OlivierDutoit\GitDeploy\Forges\Forges;
use OlivierDutoit\GitDeploy\Models\Deployment;
use OlivierDutoit\GitDeploy\Models\Repository;
use OlivierDutoit\GitDeploy\Settings;
use Pterodactyl\Contracts\Servers\SendsServerCommands;
use Pterodactyl\Contracts\Servers\SendsServerPower;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * Puts a commit's files in the server: downloads the commit on the panel, packs it without the
 * shared paths, sends it to Wings, moves the files in place to .deploy/releases/<release>/ and
 * unpacks the new ones. A rollback swaps a kept release back the same way.
 */
final class Deployer
{
    private const string RELEASES = '.deploy/releases';

    public function __construct(
        private readonly ServerFiles $files,
        private readonly SendsServerPower $power,
        private readonly SendsServerCommands $commands,
    ) {}

    public function deploy(Deployment $deployment): void
    {
        $repository = $deployment->repository;
        $server = $repository->server;
        $work = storage_path('app/git-deploy/'.$deployment->uuid);
        $root = $repository->root();
        $keep = self::shared($repository);
        $moved = null;

        $this->start($deployment);

        try {
            $forge = Forges::for($repository);
            if ($deployment->commit === null) {
                $head = $forge->head($deployment->branch);
                $deployment->forceFill(['commit' => $head->sha, 'message' => $head->title() ?: null, 'author' => $head->author ?: null])->save();
            }
            $sha = (string) $deployment->commit;
            $deployment->line(sprintf('Deploying %s of %s (%s)%s.', substr($sha, 0, 8), $deployment->branch, $repository->url, $deployment->message ? ': '.$deployment->message : ''));

            if (! is_dir($work) && ! mkdir($work, 0700, true)) {
                throw new ForgeException('The panel cannot write its temporary folder.');
            }
            $source = $forge->fetch($sha, $work.'/files');
            $deployment->line('Downloaded the commit.');

            // A shared path the server has stays as it is; one it does not have yet comes from the commit.
            $excluded = array_values(array_filter($keep, fn (string $path): bool => $this->exists($server, $root, $path)));
            $zip = $work.'/deploy.zip';
            $count = Archive::build($source, $zip, $excluded);
            $size = (int) filesize($zip);
            $deployment->line(sprintf('Packed %d files (%s)%s.', $count, self::size($size), $excluded !== [] ? ', keeping '.implode(', ', $excluded) : ''));
            if ($size > Settings::int('max_archive_mb', 1, 2048) * 1024 * 1024) {
                throw new ForgeException('The files are larger than the administrator allows.');
            }

            $this->files->makeDirectory($server, $repository->path(self::RELEASES));
            $this->files->upload($server, $repository->path('.deploy'), $zip, 'incoming.zip');
            $deployment->line('Sent the files to the server.');

            $release = now()->format('YmdHis').'-'.substr($sha, 0, 7);
            if ($this->hasLiveFiles($server, $root)) {
                $previous = $repository->current_release ?? 'before-git-deploy-'.now()->format('YmdHis');
                $this->files->makeDirectory($server, $repository->path(self::RELEASES.'/'.$previous));
                $moved = $previous;
                $count = $this->moveAll($server, $root, '', self::RELEASES.'/'.$previous, $keep);
                $deployment->line(sprintf('Moved %d previous entries to %s/%s.', $count, self::RELEASES, $previous));
            }

            $this->files->decompress($server, $root, '.deploy/incoming.zip');
            $moved = null;
            $this->files->delete($server, $repository->path('.deploy'), ['incoming.zip']);
            $deployment->line('Unpacked the new files.');

            $repository->forceFill(['current_release' => $release])->save();
            $deployment->forceFill(['release' => $release])->save();
            $this->prune($deployment, $repository);
            $this->after($deployment, $repository);
            $this->finish($deployment, Deployment::SUCCESS);
        } catch (Throwable $exception) {
            $deployment->line('Failed: '.self::message($exception));
            if ($moved !== null) {
                $this->restore($deployment, $server, $root, $moved, $keep);
            }
            $this->finish($deployment, Deployment::FAILED);
        } finally {
            Archive::remove($work);
        }
    }

    /** Puts back the files of `$release`, a release kept in .deploy/releases/, and keeps the current ones there. */
    public function rollback(Deployment $deployment, string $release): void
    {
        $repository = $deployment->repository;
        $server = $repository->server;
        $root = $repository->root();
        $keep = self::shared($repository);

        $this->start($deployment);

        try {
            if (! array_key_exists($release, $this->files->entries($server, $repository->path(self::RELEASES)))) {
                throw new ForgeException("The release {$release} is no longer kept on the server.");
            }
            $deployment->line("Rolling back to {$release}.");

            $current = $repository->current_release ?? 'before-rollback-'.now()->format('YmdHis');
            if ($this->hasLiveFiles($server, $root)) {
                $this->files->makeDirectory($server, $repository->path(self::RELEASES.'/'.$current));
                $count = $this->moveAll($server, $root, '', self::RELEASES.'/'.$current, $keep);
                $deployment->line(sprintf('Moved %d current entries to %s/%s.', $count, self::RELEASES, $current));
            }

            $count = $this->moveAll($server, $root, self::RELEASES.'/'.$release, '', $keep);
            $this->files->delete($server, $repository->path(self::RELEASES), [$release]);
            $deployment->line(sprintf('Put back %d entries of %s.', $count, $release));

            $repository->forceFill(['current_release' => $release])->save();
            $deployment->forceFill(['release' => $release])->save();
            $this->after($deployment, $repository);
            $this->finish($deployment, Deployment::SUCCESS);
        } catch (Throwable $exception) {
            $deployment->line('Failed: '.self::message($exception));
            $this->finish($deployment, Deployment::FAILED);
        }
    }

    /**
     * Moves the entries of $from into $to, both relative to $root ('' for $root itself). A folder
     * that holds a shared path, or that exists on both sides, is merged entry by entry; shared
     * paths and .deploy never move.
     *
     * @param  list<string>  $keep
     */
    private function moveAll(Server $server, string $root, string $from, string $to, array $keep, string $base = '', int $depth = 0): int
    {
        $source = self::join($root, $from, $base);
        $destination = self::join($root, $to, $base);
        $existing = $to === '' || $base !== '' ? $this->files->entries($server, $destination) : [];
        $moves = [];
        $count = 0;

        foreach ($this->files->entries($server, $source) as $name => $folder) {
            $relative = ltrim($base.'/'.$name, '/');
            if (($relative === '.deploy' && $from === '') || in_array($relative, $keep, true)) {
                continue;
            }

            $holdsShared = false;
            foreach ($keep as $path) {
                $holdsShared = $holdsShared || str_starts_with($path, $relative.'/');
            }
            $there = array_key_exists($name, $existing);

            if ($folder && $depth < 20 && ($holdsShared || ($there && $existing[$name]))) {
                if (! $there) {
                    $this->files->makeDirectory($server, self::join($root, $to, $relative));
                }
                $count += $this->moveAll($server, $root, $from, $to, $keep, $relative, $depth + 1);

                continue;
            }
            if ($there) {
                // A file in the way: the one moved in wins.
                $this->files->delete($server, $destination, [$name]);
            }
            $moves[] = ['from' => self::relative($from, $relative), 'to' => self::relative($to, $relative)];
            $count++;
        }

        $this->files->move($server, $root, $moves);

        return $count;
    }

    /** After a failure between moving the files away and unpacking the new ones: the previous files go back. */
    private function restore(Deployment $deployment, Server $server, string $root, string $release, array $keep): void
    {
        try {
            $this->moveAll($server, $root, self::RELEASES.'/'.$release, '', $keep);
            $deployment->line('Put the previous files back.');
        } catch (Throwable $exception) {
            $deployment->line(sprintf('Could not put the previous files back (%s): they are in %s/%s.', self::message($exception), self::RELEASES, $release));
        }
    }

    /** Keeps the newest releases, as many as the administrator allows. */
    private function prune(Deployment $deployment, Repository $repository): void
    {
        $releases = array_keys(array_filter($this->files->entries($deployment->repository->server, $repository->path(self::RELEASES))));
        rsort($releases);
        $old = array_slice(array_values(array_diff($releases, [(string) $repository->current_release])), Settings::int('keep_releases', 1, 20));
        if ($old !== []) {
            $this->files->delete($repository->server, $repository->path(self::RELEASES), array_values($old));
            $deployment->line(sprintf('Removed %d old release(s).', count($old)));
        }
    }

    private function after(Deployment $deployment, Repository $repository): void
    {
        try {
            match ($repository->after_deploy) {
                'restart' => $this->power->send($repository->server, 'restart'),
                'start' => $this->power->send($repository->server, 'start'),
                'command' => $repository->command ? $this->commands->send($repository->server, $repository->command) : null,
                default => null,
            };
            if ($repository->after_deploy !== 'none') {
                $deployment->line(match ($repository->after_deploy) {
                    'restart' => 'Restarting the server.',
                    'start' => 'Starting the server.',
                    default => 'Sent the command: '.$repository->command,
                });
            }
        } catch (Throwable $exception) {
            // The files are in place: the deploy succeeded even if the server did not take the signal.
            $deployment->line('The files are in place, but the server did not take the '.$repository->after_deploy.' ('.self::message($exception).').');
        }
    }

    private function exists(Server $server, string $root, string $path): bool
    {
        $path = trim($path, '/');
        $parent = dirname($path);

        return array_key_exists(basename($path), $this->files->entries($server, self::join($root, $parent === '.' ? '' : $parent, '')));
    }

    private function hasLiveFiles(Server $server, string $root): bool
    {
        return array_diff(array_keys($this->files->entries($server, $root)), ['.deploy']) !== [];
    }

    private function start(Deployment $deployment): void
    {
        $deployment->forceFill(['status' => Deployment::RUNNING, 'started_at' => now()])->save();
    }

    private function finish(Deployment $deployment, string $status): void
    {
        $deployment->forceFill(['status' => $status, 'finished_at' => now()])->save();
    }

    /** @return list<string> */
    private static function shared(Repository $repository): array
    {
        return array_values(array_filter(array_map(fn (string $path): string => trim($path, '/'), $repository->shared_paths ?? [])));
    }

    private static function join(string $root, string $relative, string $base): string
    {
        $path = rtrim($root, '/').'/'.trim(trim($relative, '/').'/'.trim($base, '/'), '/');

        $path = rtrim($path, '/');

        return $path === '' ? '/' : $path;
    }

    private static function relative(string $folder, string $path): string
    {
        return ltrim(trim($folder, '/').'/'.$path, '/');
    }

    private static function size(int $bytes): string
    {
        return $bytes >= 1048576 ? sprintf('%.1f MB', $bytes / 1048576) : sprintf('%d KB', max(1, intdiv($bytes, 1024)));
    }

    private static function message(Throwable $exception): string
    {
        return mb_substr($exception->getMessage() ?: $exception::class, 0, 500);
    }
}
