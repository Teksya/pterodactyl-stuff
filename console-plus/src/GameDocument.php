<?php

declare(strict_types=1);

namespace OlivierDutoit\ConsolePlus;

/**
 * What the console needs to know of a server's game to complete its commands: the egg's name and
 * tags, and the few variables that name the game, its version or its mod framework.
 *
 *     egg        "Paper"
 *     tags       ["minecraft"]
 *     variables  { MINECRAFT_VERSION: "1.21.4" }
 *
 * Only those variables leave the panel, whoever may read the server's startup settings: a version,
 * a Source game folder or app id, Rust's framework, Garry's Mod's game mode. Never a password, a
 * token or anything else an egg keeps in its variables.
 */
final class GameDocument
{
    /** Variables passed on by name, besides any *_VERSION. */
    public const array VARIABLES = ['SRCDS_APPID', 'SRCDS_GAME', 'SRCDS_MAP', 'FRAMEWORK', 'GAMEMODE'];

    /**
     * @param  list<string>  $tags
     * @param  array<string, string|null>  $variables  env name => value
     * @return array{egg: string, tags: list<string>, variables: array<string, string>}
     */
    public static function describe(string $egg, array $tags, array $variables): array
    {
        $kept = [];
        foreach ($variables as $name => $value) {
            $name = (string) $name;
            if (! in_array($name, self::VARIABLES, true) && ! str_ends_with($name, '_VERSION')) {
                continue;
            }
            $value = trim((string) $value);
            // A version, an id, a folder or a word: nothing else is wanted, so nothing else goes.
            if ($value !== '' && preg_match('/^[\w.+\-:]{1,64}$/', $value) === 1) {
                $kept[$name] = $value;
            }
        }
        ksort($kept);

        return [
            'egg' => mb_substr($egg, 0, 191),
            'tags' => array_values(array_filter($tags, 'is_string')),
            'variables' => $kept,
        ];
    }
}
