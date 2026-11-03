<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Players;

use OlivierDutoit\Minecraft\Rcon\RconException;
use OlivierDutoit\Minecraft\Server\MinecraftServer;
use OlivierDutoit\Minecraft\Server\ServerRcon;
use Pterodactyl\Models\Server;

/**
 * What changes in a running world, asked over RCON rather than read from its last save: the time of
 * day, the weather (from 1.20.5, whose `execute if predicate` can test it) and each game rule, on
 * one connection.
 */
final class WorldLive
{
    /** 1.20.5: `execute if predicate` takes a predicate written in the command. */
    private const int V1_20_5 = 3837;

    public function __construct(
        private readonly ServerRcon $rcon,
        private readonly MinecraftServer $files,
    ) {}

    /**
     * `$info`, as World::info() read it from the save, with the time, the weather and the rules as
     * the server holds them now. A rule the server does not answer for is not one of its rules: it
     * goes. The weather is null before 1.20.5.
     *
     * @param  array<string, mixed>  $info
     * @return array<string, mixed>
     *
     * @throws RconException
     */
    public function read(Server $server, array $info): array
    {
        $version = (int) ($this->files->version($server)['dataVersion'] ?? 0);
        $weather = $version === 0 || $version >= self::V1_20_5;
        $rules = array_keys($info['rules']);

        $answers = $this->rcon->ask($server, [
            // A plugin can take the name `time` (EssentialsX does) on Bukkit-family servers, which keep
            // the vanilla command as `minecraft:time`, a name the other servers do not know.
            'minecraft:time query daytime',
            'time query daytime',
            ...($weather ? [self::weatherTest('thundering'), self::weatherTest('raining')] : []),
            ...array_map(fn (string $rule): string => "gamerule {$rule}", $rules),
        ]);

        $info['dayTime'] = self::dayTime((string) array_shift($answers), (string) array_shift($answers));
        $info['thundering'] = $weather ? self::passed((string) array_shift($answers)) : null;
        $info['raining'] = $weather ? self::passed((string) array_shift($answers)) : null;

        $values = [];
        foreach ($rules as $index => $rule) {
            // "Gamerule keepInventory is currently set to: true"; before 1.13, "keepInventory = true".
            if (preg_match('/(?:currently set to:?|=)\s*(\S+)\s*$/i', (string) ($answers[$index] ?? ''), $match)) {
                $values[$rule] = $match[1];
            }
        }
        $info['rules'] = $values;

        return $info;
    }

    /** "The time is 6000" (before 1.13, "Time is 6000"): the first of the answers the vanilla command gave. */
    private static function dayTime(string ...$answers): ?int
    {
        foreach ($answers as $answer) {
            if (preg_match('/\btime is (\d+)/i', $answer, $match)) {
                return (int) $match[1];
            }
        }

        return null;
    }

    /** "Test passed" when it rains (or thunders), "Test failed" when not. */
    private static function weatherTest(string $what): string
    {
        return 'execute if predicate {condition:"minecraft:weather_check",'.$what.':true}';
    }

    private static function passed(string $answer): ?bool
    {
        return match (true) {
            stripos($answer, 'passed') !== false => true,
            stripos($answer, 'failed') !== false => false,
            default => null,
        };
    }
}
