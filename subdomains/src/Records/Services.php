<?php

declare(strict_types=1);

namespace OlivierDutoit\Subdomains\Records;

use OlivierDutoit\Subdomains\Settings;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * The SRV service a server's game looks up, such as _minecraft._tcp, which lets players join
 * with the name alone whatever the port. Only Minecraft Java, TeamSpeak 3 and Mumble look
 * one up; other games join with name:port.
 */
final class Services
{
    public const string MINECRAFT = '_minecraft._tcp';

    public const string TEAMSPEAK = '_ts3._udp';

    public const string MUMBLE = '_mumble._tcp';

    private const string PATTERN = '/^_[a-z0-9-]{1,63}\._(tcp|udp|tls)$/';

    public static function for(Server $server): ?string
    {
        $egg = $server->egg;
        $overrides = self::overrides();
        foreach ([(string) ($egg?->id ?? ''), strtolower((string) ($egg?->name ?? ''))] as $key) {
            if ($key !== '' && array_key_exists($key, $overrides)) {
                return $overrides[$key];
            }
        }

        try {
            $tags = $server->tagSlugs();
        } catch (Throwable) {
            $tags = [];
        }

        return self::detect((string) ($egg?->name ?? ''), $tags, (string) $server->image, (string) $server->startup);
    }

    /** @param  list<string>  $tags */
    public static function detect(string $egg, array $tags, string $image, string $startup): ?string
    {
        $haystack = strtolower(implode(' ', [$egg, implode(' ', $tags), $image, $startup]));

        // Bedrock and its server software take name:port, without SRV.
        if (preg_match('/bedrock|pocketmine|nukkit|geyser-standalone/', $haystack)) {
            return null;
        }
        if (preg_match('/teamspeak|ts3server|\bts3\b/', $haystack)) {
            return self::TEAMSPEAK;
        }
        if (preg_match('/mumble|murmur/', $haystack)) {
            return self::MUMBLE;
        }
        if (in_array('minecraft', $tags, true)
            || preg_match('/minecraft|paper|spigot|bukkit|purpur|folia|forge|fabric|quilt|sponge|bungee|waterfall|velocity|vanilla/', strtolower($egg.' '.$image))
            || preg_match('/server_jarfile|unix_args\.txt|-jar\s+\S*server\S*\.jar/', strtolower($startup))) {
            return self::MINECRAFT;
        }

        return null;
    }

    /**
     * The administrator's lines `egg: service`, keyed by egg id or lower-cased egg name, with
     * null for `none`. `Rust: none` turns SRV off for an egg; `My game: _mygame._udp` turns it on.
     *
     * @return array<string, string|null>
     */
    public static function overrides(): array
    {
        $text = Settings::get('srv_overrides');
        $overrides = [];
        foreach (preg_split('/\R/', is_string($text) ? $text : '') ?: [] as $line) {
            $at = strrpos($line, ':');
            if ($at === false) {
                continue;
            }
            $egg = strtolower(trim(substr($line, 0, $at)));
            $service = strtolower(trim(substr($line, $at + 1)));
            if ($egg === '') {
                continue;
            }
            if ($service === 'none' || $service === '') {
                $overrides[$egg] = null;
            } elseif (preg_match(self::PATTERN, $service)) {
                $overrides[$egg] = $service;
            }
        }

        return $overrides;
    }
}
