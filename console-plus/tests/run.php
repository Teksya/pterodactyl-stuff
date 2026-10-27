<?php

/*
 * Tests of what the extension sends the console of a server's game, which needs neither Laravel nor
 * Wings. Run with any PHP 8.3:
 *
 *     php tests/run.php
 */

declare(strict_types=1);

require __DIR__.'/../src/GameDocument.php';

use OlivierDutoit\ConsolePlus\GameDocument;

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

// The default eggs' variables: versions, Source games, Rust's framework go; nothing else does.
check('Paper', GameDocument::describe('Paper', ['minecraft'], [
    'MINECRAFT_VERSION' => '1.21.4',
    'SERVER_JARFILE' => 'server.jar',
    'DL_PATH' => '',
    'BUILD_NUMBER' => 'latest',
]), ['egg' => 'Paper', 'tags' => ['minecraft'], 'variables' => ['MINECRAFT_VERSION' => '1.21.4']]);

check('Sponge', GameDocument::describe('Sponge (SpongeVanilla)', ['minecraft'], ['SPONGE_VERSION' => '1.12.2-7.3.0', 'SERVER_JARFILE' => 'server.jar'])['variables'], ['SPONGE_VERSION' => '1.12.2-7.3.0']);

check('Forge', GameDocument::describe('Forge Minecraft', ['minecraft'], [
    'SERVER_JARFILE' => 'server.jar',
    'MC_VERSION' => 'latest',
    'BUILD_TYPE' => 'recommended',
    'FORGE_VERSION' => '',
])['variables'], ['MC_VERSION' => 'latest']);

check('Garry\'s Mod', GameDocument::describe('Garrys Mod', ['srcds', 'garrysmod'], [
    'SRCDS_MAP' => 'gm_flatgrass',
    'STEAM_ACC' => 'ABCDEF0123456789',
    'SRCDS_APPID' => '4020',
    'WORKSHOP_ID' => '',
    'GAMEMODE' => 'sandbox',
    'MAX_PLAYERS' => '32',
])['variables'], ['GAMEMODE' => 'sandbox', 'SRCDS_APPID' => '4020', 'SRCDS_MAP' => 'gm_flatgrass']);

check('Rust', GameDocument::describe('Rust', ['rust'], [
    'HOSTNAME' => 'A Rust Server',
    'FRAMEWORK' => 'oxide',
    'RCON_PASS' => 'secret',
    'SERVER_URL' => 'http://pterodactyl.io',
])['variables'], ['FRAMEWORK' => 'oxide']);

check('ARK keeps its passwords', GameDocument::describe('Ark: Survival Evolved', ['srcds'], [
    'ARK_PASSWORD' => 'join',
    'ARK_ADMIN_PASSWORD' => 'PleaseChangeMe',
    'SRCDS_APPID' => '376030',
])['variables'], ['SRCDS_APPID' => '376030']);

check('Teamspeak', GameDocument::describe('Teamspeak3 Server', ['voice'], ['TS_VERSION' => 'latest', 'SERVERADMIN_PASSWORD' => 'x'])['variables'], ['TS_VERSION' => 'latest']);

// A *_VERSION holding something other than a version or a word is not sent.
check('odd values', GameDocument::describe('Custom', [], [
    'CUSTOM_VERSION' => 'https://example.com/a b',
    'OTHER_VERSION' => str_repeat('1', 65),
    'SRCDS_GAME' => '  cstrike ',
    'GAME_VERSION' => null,
])['variables'], ['SRCDS_GAME' => 'cstrike']);

check('tags', GameDocument::describe('Custom', ['minecraft', 3, 'bedrock'], [])['tags'], ['minecraft', 'bedrock']);

echo $failures === 0 ? "OK ({$count} checks)\n" : "{$failures} of {$count} checks failed\n";
exit($failures === 0 ? 0 : 1);
