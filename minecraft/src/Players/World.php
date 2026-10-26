<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Players;

use OlivierDutoit\Minecraft\Nbt\Nbt;
use OlivierDutoit\Minecraft\Nbt\Tag;
use OlivierDutoit\Minecraft\Server\MinecraftServer;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * A world as it was last saved: its version, seed, spawn, weather, time and game rules.
 *
 * Until 1.21.11 all of it is in level.dat. From 26.1 the game rules, the weather, the generation
 * settings and the clocks are files of their own in data/minecraft/, and level.dat keeps the rest
 * under new names (spawn, difficulty_settings). Each value is read where its file has it, so every
 * version reads the same way.
 */
final class World
{
    /** The files 26.1 moved out of level.dat, in <world>/data/minecraft/. */
    private const array SAVED_DATA = ['game_rules', 'weather', 'world_gen_settings', 'world_clocks'];

    public function __construct(private readonly MinecraftServer $files) {}

    /**
     * The active world (level-name), or the world in `$folder`. Without `$details`, level.dat alone
     * (a list of worlds needs no game rules).
     *
     * @return array<string, mixed>
     */
    public function info(Server $server, ?string $folder = null, bool $details = true): array
    {
        $folder ??= $this->files->world($server);
        $level = $this->read($server, $folder.'/level.dat');
        if ($level === null) {
            return ['found' => false, 'rules' => []];
        }

        $saved = [];
        if ($details) {
            foreach (self::SAVED_DATA as $name) {
                $saved[$name] = $this->read($server, "{$folder}/data/minecraft/{$name}.dat");
            }
        }

        return self::describe($level, $saved, $folder);
    }

    /**
     * @param  array<string, Tag|null>  $saved  the data/minecraft files of 26.1 and later, by name.
     * @return array<string, mixed>
     */
    public static function describe(Tag $level, array $saved, string $folder): array
    {
        $dataTag = $level->get('Data') ?? $level;
        $data = (array) $dataTag->plain();
        $generation = isset($saved['world_gen_settings']) ? (array) self::payload($saved['world_gen_settings'])->plain() : (is_array($data['WorldGenSettings'] ?? null) ? $data['WorldGenSettings'] : []);
        $weather = isset($saved['weather']) ? (array) self::payload($saved['weather'])->plain() : $data;
        $difficulty = is_array($data['difficulty_settings'] ?? null) ? $data['difficulty_settings'] : [];
        // The seed moved into WorldGenSettings in 1.16, and into its own file in 26.1.
        $seed = $generation['seed'] ?? $data['RandomSeed'] ?? null;

        return [
            'found' => true,
            'name' => is_string($data['LevelName'] ?? null) ? $data['LevelName'] : $folder,
            'version' => is_string($data['Version']['Name'] ?? null) ? $data['Version']['Name'] : null,
            'seed' => is_int($seed) ? (string) $seed : null,
            'spawn' => self::spawn($data),
            'hardcore' => (bool) ($difficulty['hardcore'] ?? $data['hardcore'] ?? false),
            'raining' => (bool) ($weather['raining'] ?? false),
            'thundering' => (bool) ($weather['thundering'] ?? false),
            // In ticks; a day is 24000.
            'dayTime' => self::dayTime($data, $saved['world_clocks'] ?? null),
            // When the world was last played, in milliseconds.
            'lastPlayed' => is_int($data['LastPlayed'] ?? null) && $data['LastPlayed'] > 0 ? date(DATE_ATOM, intdiv($data['LastPlayed'], 1000)) : null,
            'gameMode' => ['survival', 'creative', 'adventure', 'spectator'][(int) ($data['GameType'] ?? 0)] ?? null,
            'rules' => self::rules($saved['game_rules'] ?? null, $dataTag),
        ];
    }

    /** A file the game saves (data/minecraft/*.dat) keeps its values under "data". */
    private static function payload(Tag $file): Tag
    {
        $data = $file->get('data');

        return $data !== null && $data->type === Tag::COMPOUND ? $data : $file;
    }

    /**
     * Game rules as strings: "true"/"false" or a number. They were strings in level.dat until 1.21.10,
     * then typed values (a boolean as a byte), and from 26.1 in game_rules.dat.
     *
     * @return array<string, string>
     */
    private static function rules(?Tag $file, Tag $data): array
    {
        $rules = $file !== null ? self::payload($file) : ($data->get('GameRules') ?? $data->get('game_rules'));
        if ($rules === null || $rules->type !== Tag::COMPOUND) {
            return [];
        }
        // Some versions nest them once more.
        foreach (['rules', 'game_rules'] as $key) {
            if ($rules->get($key)?->type === Tag::COMPOUND) {
                $rules = $rules->get($key);
            }
        }

        $values = [];
        foreach ($rules->value as $name => $tag) {
            // A rule whose name a command cannot carry (some mods') is left out rather than breaking the page.
            if (! is_string($name) || ! preg_match(Commands::GAMERULE, $name)) {
                continue;
            }
            $values[$name] = match ($tag->type) {
                Tag::STRING => (string) $tag->value,
                Tag::BYTE => $tag->value ? 'true' : 'false',
                Tag::SHORT, Tag::INT, Tag::LONG => (string) $tag->value,
                default => null,
            };
        }
        $values = array_filter($values, fn (?string $value): bool => $value !== null);
        ksort($values);

        return $values;
    }

    /** @param array<string, mixed> $data */
    private static function spawn(array $data): ?array
    {
        // 26.1: spawn: {pos: [x, y, z], dimension, yaw, pitch}.
        $position = $data['spawn']['pos'] ?? null;
        if (is_array($position) && count($position) >= 3) {
            return ['x' => (int) $position[0], 'y' => (int) $position[1], 'z' => (int) $position[2]];
        }

        return isset($data['SpawnX'], $data['SpawnY'], $data['SpawnZ']) ? ['x' => (int) $data['SpawnX'], 'y' => (int) $data['SpawnY'], 'z' => (int) $data['SpawnZ']] : null;
    }

    /**
     * The time of day: DayTime in level.dat, or from 26.1 the overworld's clock in world_clocks.dat.
     *
     * @param  array<string, mixed>  $data
     */
    private static function dayTime(array $data, ?Tag $clocks): ?int
    {
        if (is_int($data['DayTime'] ?? null)) {
            return $data['DayTime'];
        }
        if ($clocks === null) {
            return null;
        }

        $ticks = null;
        $values = (array) self::payload($clocks)->plain();
        array_walk_recursive($values, function (mixed $value, string|int $key) use (&$ticks): void {
            if ($ticks === null && $key === 'total_ticks' && is_int($value)) {
                $ticks = $value;
            }
        });

        return $ticks;
    }

    private function read(Server $server, string $path): ?Tag
    {
        try {
            $contents = $this->files->readBinaryIfExists($server, $path);

            return $contents === null ? null : Nbt::read($contents);
        } catch (Throwable) {
            return null;
        }
    }
}
