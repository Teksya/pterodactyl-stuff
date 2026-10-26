<?php

/*
 * Stand-ins for the panel's classes, shared by the tests: interfaces of its contracts, a server whose
 * files, console and power state live in memory, and the few facades the code calls.
 */

declare(strict_types=1);

namespace Pterodactyl\Contracts\Files {
    interface ReadsFileContents { public function read(\Pterodactyl\Models\Server $server, string $path, ?int $maxBytes = null): string; }
    interface WritesFileContents { public function write(\Pterodactyl\Models\Server $server, string $path, string $contents): void; }
    interface ListsDirectories { public function list(\Pterodactyl\Models\Server $server, string $directory = '/'): array; }
    interface CompressesFiles { public function compress(\Pterodactyl\Models\Server $server, ?string $root, array $files): array; }
    interface DecompressesFiles { public function decompress(\Pterodactyl\Models\Server $server, ?string $root, string $file): void; }
    interface DeletesFiles { public function delete(\Pterodactyl\Models\Server $server, ?string $root, array $files): void; }
    interface RenamesFiles { public function rename(\Pterodactyl\Models\Server $server, ?string $root, array $files): void; }
    interface CreatesDirectories { public function create(\Pterodactyl\Models\Server $server, string $name, string $root): void; }
}

namespace Pterodactyl\Contracts\Servers {
    interface SendsServerCommands { public function send(\Pterodactyl\Models\Server $server, string $command): void; }
    interface ReadsServerLogs { public function read(\Pterodactyl\Models\Server $server, int $lines = 100): array; }
    interface ReadsServerState { public function read(\Pterodactyl\Models\Server $server): object; }
    interface SendsServerPower { public function send(\Pterodactyl\Models\Server $server, string $signal): void; }
}

namespace Pterodactyl\Exceptions\Http\Connection {
    class DaemonConnectionException extends \RuntimeException
    {
        public function getStatusCode(): int
        {
            return $this->getCode();
        }
    }
}

namespace Pterodactyl\Models {
    class Server
    {
        public int $id = 1;
        public string $uuid = 'server-1';
        public ?object $allocation = null;
        public object $node;
        /** @var list<int> the allocation ports. */
        public array $ports = [];

        public function __construct()
        {
            $this->node = (object) ['fqdn' => 'node.example'];
        }

        public function allocations(): Allocations
        {
            return new Allocations(array_map(fn (int $port): Allocation => new Allocation('0.0.0.0', $port), $this->ports));
        }
    }

    class Allocation
    {
        public function __construct(public string $ip, public int $port) {}
    }

    /** The few query and collection calls made on a server's allocations. */
    class Allocations
    {
        /** @param list<mixed> $items */
        public function __construct(private array $items) {}

        public function where(string $column, mixed $value): self
        {
            return new self(array_values(array_filter($this->items, fn (Allocation $item): bool => $item->{$column} === $value)));
        }

        public function orderBy(string $column): self
        {
            $items = $this->items;
            usort($items, fn (Allocation $a, Allocation $b): int => $a->{$column} <=> $b->{$column});

            return new self($items);
        }

        public function first(): mixed
        {
            return $this->items[0] ?? null;
        }

        public function pluck(string $column): self
        {
            return new self(array_map(fn (Allocation $item): mixed => $item->{$column}, $this->items));
        }

        public function map(callable $map): self
        {
            return new self(array_map($map, $this->items));
        }

        public function reject(callable $test): self
        {
            return new self(array_filter($this->items, fn (mixed $item): bool => ! $test($item)));
        }

        public function values(): self
        {
            return new self(array_values($this->items));
        }

        public function all(): array
        {
            return $this->items;
        }
    }
}

namespace Pterodactyl\Facades {
    class Extensions
    {
        public static function settings(string $id): object
        {
            return new class {
                public function get(string $key, mixed $default = null): mixed
                {
                    return $default;
                }
            };
        }
    }
}

namespace Illuminate\Support\Facades {
    class Cache
    {
        public static array $store = [];

        public static function remember(string $key, int $seconds, callable $value): mixed
        {
            return $value();
        }

        public static function add(string $key, mixed $value, int $seconds): bool
        {
            return true;
        }

        public static function get(string $key): mixed
        {
            return null;
        }

        public static function put(string $key, mixed $value, int $seconds): void {}

        public static function has(string $key): bool
        {
            return false;
        }

        public static function forget(string $key): void {}

        /** One lock per name; the test can hold one to play another job. */
        public static array $locks = [];

        public static function lock(string $name, int $seconds): object
        {
            return new class ($name) {
                public function __construct(private string $name) {}

                public function get(): bool
                {
                    if (isset(Cache::$locks[$this->name])) {
                        return false;
                    }
                    Cache::$locks[$this->name] = true;

                    return true;
                }

                public function release(): void
                {
                    unset(Cache::$locks[$this->name]);
                }
            };
        }
    }
}

namespace Illuminate\Support {
    class Str
    {
        public static int $next = 0;

        public static function uuid(): string
        {
            return sprintf('00000000-0000-4000-8000-%012d', ++self::$next);
        }
    }
}

namespace Illuminate\Database\Eloquent\Relations {
    class BelongsTo {}
}

namespace Illuminate\Database\Eloquent {
    /** Rows in memory, per model class, with the few query calls the code makes. */
    class Model
    {
        public static array $rows = [];
        public array $attributes = [];

        public static function query(): Query
        {
            return new Query(static::class);
        }

        public function __get(string $key): mixed
        {
            $value = $this->attributes[$key] ?? null;
            if ($key === 'created_at' && $value !== null && ! $value instanceof \DateTimeInterface) {
                return new class ($value) {
                    public function __construct(public string $value) {}

                    public function toIso8601String(): string
                    {
                        return $this->value;
                    }
                };
            }

            return $value;
        }

        public function delete(): void
        {
            self::$rows[static::class] = array_values(array_filter(self::$rows[static::class] ?? [], fn (Model $row): bool => $row !== $this));
        }

        public function belongsTo(string $class): Relations\BelongsTo
        {
            return new Relations\BelongsTo();
        }
    }

    class Query
    {
        private array $wheres = [];
        private int $skip = 0;

        public function __construct(private string $class) {}

        public function create(array $attributes): Model
        {
            $row = new $this->class();
            $row->attributes = $attributes + ['id' => count(Model::$rows[$this->class] ?? []) + 1, 'created_at' => date(DATE_ATOM)];
            Model::$rows[$this->class][] = $row;

            return $row;
        }

        public function where(string $column, mixed $value): self
        {
            $this->wheres[$column] = $value;

            return $this;
        }

        public function find(mixed $id): ?Model
        {
            return null;
        }

        public function orderByDesc(string $column): self
        {
            return $this;
        }

        public function skip(int $count): self
        {
            $this->skip = $count;

            return $this;
        }

        public function take(int $count): self
        {
            return $this;
        }

        public function get(): \ArrayObject
        {
            $rows = array_values(array_filter(Model::$rows[$this->class] ?? [], function (Model $row): bool {
                foreach ($this->wheres as $column => $value) {
                    if ($row->attributes[$column] !== $value) {
                        return false;
                    }
                }

                return true;
            }));

            // Newest first, as the code orders them.
            return new Rows(array_slice(array_reverse($rows), $this->skip));
        }
    }

    class Rows extends \ArrayObject
    {
        public function reject(callable $test): self
        {
            return new self(array_values(array_filter($this->getArrayCopy(), fn ($row): bool => ! $test($row))));
        }
    }
}

namespace {
    /** Laravel's report(): the tests keep what was reported. */
    function report(Throwable $exception): void
    {
        $GLOBALS['reported'][] = $exception->getMessage();
    }
}

namespace {
    spl_autoload_register(function (string $class): void {
        $prefix = 'OlivierDutoit\\Minecraft\\';
        if (str_starts_with($class, $prefix)) {
            require __DIR__.'/../src/'.str_replace('\\', '/', substr($class, strlen($prefix))).'.php';
        }
    });

    use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
    use Pterodactyl\Models\Server;

    /** The server's files, console and power state. */
    final class FakeServer implements Pterodactyl\Contracts\Files\ReadsFileContents, Pterodactyl\Contracts\Files\WritesFileContents, Pterodactyl\Contracts\Files\ListsDirectories, Pterodactyl\Contracts\Servers\SendsServerCommands
    {
        public array $files = [];
        public array $sent = [];
        public array $log = ['[12:00:00 INFO]: Done (3.2s)!'];
        public string $state = 'offline';
        /** Players `list` names. */
        public array $online = [];
        public bool $failReads = false;

        public function read(Server $server, string $path, ?int $maxBytes = null): string
        {
            if ($this->failReads) {
                throw new DaemonConnectionException('Wings timed out.', 504);
            }
            if (! isset($this->files[$path])) {
                throw new DaemonConnectionException('Not found.', 404);
            }

            return $this->files[$path];
        }

        public function write(Server $server, string $path, string $contents): void
        {
            $this->files[$path] = $contents;
        }

        /** The files and folders right inside `$directory`, as Wings lists them. */
        public function list(Server $server, string $directory = '/'): array
        {
            $prefix = trim($directory, '/') === '' ? '' : trim($directory, '/').'/';
            $entries = [];
            foreach (array_keys($this->files) as $path) {
                if ($prefix !== '' && ! str_starts_with($path, $prefix)) {
                    continue;
                }
                $rest = substr($path, strlen($prefix));
                $folder = str_contains($rest, '/');
                $name = $folder ? strstr($rest, '/', true) : $rest;
                $entries[$name] = ['name' => $name, 'file' => ! $folder, 'modified' => '2026-10-24T20:00:00+00:00'];
            }

            return array_values($entries);
        }

        public function send(Server $server, string $command): void
        {
            $this->sent[] = $command;
            if ($command === 'list') {
                $this->log[] = '[12:00:01 INFO]: There are '.count($this->online).' of a max of 20 players online: '.implode(', ', $this->online);
            }
            if (str_starts_with($command, 'save-all')) {
                $this->log[] = '[12:00:01 INFO]: Saved the game';
            }
            // Online players' data, as SNBT by name and path.
            if (preg_match('/^data get entity (\S+) (\S+)$/', $command, $match)) {
                $this->log[] = isset($this->live[$match[1]][$match[2]])
                    ? "[12:00:01 INFO]: {$match[1]} has the following entity data: {$this->live[$match[1]][$match[2]]}"
                    : "[12:00:01 INFO]: Found no elements matching {$match[2]}";
            }
        }

        /** @var array<string, array<string, string>> */
        public array $live = [];
    }

    /**
     * Archive and folder operations on a FakeServer's files: renames and deletes move its paths, an
     * archive remembers the files it held, and extracting puts them back.
     */
    final class FileArchives implements Pterodactyl\Contracts\Files\CompressesFiles, Pterodactyl\Contracts\Files\DecompressesFiles, Pterodactyl\Contracts\Files\DeletesFiles, Pterodactyl\Contracts\Files\RenamesFiles, Pterodactyl\Contracts\Files\CreatesDirectories
    {
        /** @var array<string, array<string, string>> archive path => files */
        public array $archives = [];
        public array $calls = [];
        /** A Throwable the next extraction throws, after writing half of the archive. */
        public ?Throwable $failExtract = null;

        public function __construct(private FakeServer $server) {}

        public function compress(Server $server, ?string $root, array $files): array
        {
            $this->calls[] = ['compress', $files];
            $content = [];
            foreach ($this->server->files as $path => $data) {
                foreach ($files as $folder) {
                    if (str_starts_with($path, $folder.'/')) {
                        $content[$path] = $data;
                    }
                }
            }
            $this->archives['archive-1.tar.gz'] = $content;
            $this->server->files['archive-1.tar.gz'] = 'tar';

            return ['name' => 'archive-1.tar.gz', 'size' => strlen(serialize($content))];
        }

        public function decompress(Server $server, ?string $root, string $file): void
        {
            $this->calls[] = ['decompress', $file];
            $content = $this->archives[$file] ?? [];
            if ($this->failExtract !== null) {
                $failure = $this->failExtract;
                $this->failExtract = null;
                $this->server->files = array_slice($content, 0, 1, true) + $this->server->files;
                throw $failure;
            }
            $this->server->files = $content + $this->server->files;
        }

        public function delete(Server $server, ?string $root, array $files): void
        {
            $this->calls[] = ['delete', $root, $files];
            $prefix = trim((string) $root, '/') === '' ? '' : trim((string) $root, '/').'/';
            foreach (array_keys($this->server->files) as $path) {
                foreach ($files as $name) {
                    if ($path === $prefix.$name || str_starts_with($path, $prefix.$name.'/')) {
                        unset($this->server->files[$path]);
                    }
                }
            }
        }

        public function rename(Server $server, ?string $root, array $files): void
        {
            $this->calls[] = ['rename', $files];
            foreach ($files as ['from' => $from, 'to' => $to]) {
                foreach ($this->server->files as $path => $data) {
                    if ($path === $from || str_starts_with($path, $from.'/')) {
                        unset($this->server->files[$path]);
                        $this->server->files[$to.substr($path, strlen($from))] = $data;
                        if (isset($this->archives[$from])) {
                            $this->archives[$to] = $this->archives[$from];
                        }
                    }
                }
            }
        }

        public function create(Server $server, string $name, string $root): void {}
    }

    /** Power signals, which move the FakeServer's state at once. */
    final class Power implements Pterodactyl\Contracts\Servers\SendsServerPower
    {
        public array $signals = [];

        public function __construct(private FakeServer $server) {}

        public function send(Server $server, string $signal): void
        {
            $this->signals[] = $signal;
            $this->server->state = match ($signal) {
                'start' => 'running',
                default => 'offline',
            };
        }
    }

    /** Records what the archive and folder operations were asked to do. */
    final class FakeArchives implements Pterodactyl\Contracts\Files\CompressesFiles, Pterodactyl\Contracts\Files\DecompressesFiles, Pterodactyl\Contracts\Files\DeletesFiles, Pterodactyl\Contracts\Files\RenamesFiles, Pterodactyl\Contracts\Files\CreatesDirectories
    {
        public array $deleted = [];

        public function compress(Server $server, ?string $root, array $files): array
        {
            return ['name' => 'archive.tar.gz', 'size' => 42];
        }

        public function decompress(Server $server, ?string $root, string $file): void {}

        public function delete(Server $server, ?string $root, array $files): void
        {
            $this->deleted[] = [$root, $files];
        }

        public function rename(Server $server, ?string $root, array $files): void {}

        public function create(Server $server, string $name, string $root): void {}
    }

    final class Logs implements Pterodactyl\Contracts\Servers\ReadsServerLogs
    {
        public function __construct(private FakeServer $server) {}

        public function read(Server $server, int $lines = 100): array
        {
            return array_slice($this->server->log, -$lines);
        }
    }

    final class State implements Pterodactyl\Contracts\Servers\ReadsServerState
    {
        public function __construct(private FakeServer $server) {}

        public function read(Server $server): object
        {
            return (object) ['state' => $this->server->state];
        }
    }

    $failures = 0;
    $count = 0;

    function check(string $what, mixed $actual, mixed $expected): void
    {
        global $failures, $count;
        $count++;
        if ($actual !== $expected) {
            $failures++;
            echo "FAIL {$what}\n  expected: ".var_export($expected, true)."\n  actual:   ".var_export($actual, true)."\n";
        }
    }

    function throws(string $what, callable $run, string $message): void
    {
        global $failures, $count;
        $count++;
        try {
            $run();
            $failures++;
            echo "FAIL {$what}: nothing thrown\n";
        } catch (InvalidArgumentException $exception) {
            if (! str_contains($exception->getMessage(), $message)) {
                $failures++;
                echo "FAIL {$what}: {$exception->getMessage()}\n";
            }
        }
    }

}
