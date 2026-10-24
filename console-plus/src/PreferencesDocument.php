<?php

declare(strict_types=1);

namespace OlivierDutoit\ConsolePlus;

use Illuminate\Validation\ValidationException;

/**
 * The console preferences a user saves for a server, checked and reduced to what the console
 * reads:
 *
 *     favourites  [command]               buttons that send a command
 *     history     [command]               the commands sent, newest last
 *     hide        [rule]                  lines containing it (or matching /regex/) are hidden
 *     highlight   [rule]                  words marked wherever they appear
 *     view        { level, timestamps, wrap, traces, repeats, size, toolbar, range, original }
 *
 * Saving rejects what breaks a limit; reading (lenient) trims it, so older data still loads.
 */
final class PreferencesDocument
{
    public const array LEVELS = ['all', 'warn', 'error'];

    public const array SIZES = ['sm', 'md', 'lg'];

    public const array RANGES = ['1m', '5m', '15m', '1h'];

    /** @var array<string, array{0: int, 1: int}> list => [max items, max length] */
    private const array LISTS = [
        'favourites' => [50, 200],
        'history' => [100, 500],
        'hide' => [50, 200],
        'highlight' => [50, 200],
    ];

    /**
     * @param  array<mixed>  $input
     * @return array{favourites: list<string>, history: list<string>, hide: list<string>, highlight: list<string>, view: array{level: string, timestamps: bool, wrap: bool, traces: bool, repeats: bool, size: string, toolbar: bool, range: string, original: bool}}
     *
     * @throws ValidationException
     */
    public static function normalize(array $input, bool $lenient = false): array
    {
        $document = [];
        foreach (self::LISTS as $key => [$max, $length]) {
            $items = [];
            foreach (is_array($input[$key] ?? null) && array_is_list($input[$key]) ? $input[$key] : [] as $index => $item) {
                if (! is_string($item) || trim($item) === '') {
                    continue;
                }
                if (mb_strlen($item) > $length) {
                    if (! $lenient) {
                        throw ValidationException::withMessages(["$key.$index" => sprintf('At most %d characters.', $length)]);
                    }

                    continue;
                }
                $items[] = $key === 'history' ? $item : trim($item);
            }
            // The history keeps its newest entries; the other lists their first.
            if (count($items) > $max) {
                if (! $lenient && $key !== 'history') {
                    throw ValidationException::withMessages([$key => sprintf('At most %d entries.', $max)]);
                }
                $items = $key === 'history' ? array_slice($items, -$max) : array_slice($items, 0, $max);
            }
            $document[$key] = $key === 'history' ? $items : array_values(array_unique($items));
        }

        $view = is_array($input['view'] ?? null) ? $input['view'] : [];
        $document['view'] = [
            'level' => in_array($view['level'] ?? null, self::LEVELS, true) ? $view['level'] : 'all',
            'timestamps' => ($view['timestamps'] ?? false) === true,
            'wrap' => ($view['wrap'] ?? true) !== false,
            'traces' => ($view['traces'] ?? true) !== false,
            'repeats' => ($view['repeats'] ?? true) !== false,
            'size' => in_array($view['size'] ?? null, self::SIZES, true) ? $view['size'] : 'md',
            'toolbar' => ($view['toolbar'] ?? false) === true,
            'range' => in_array($view['range'] ?? null, self::RANGES, true) ? $view['range'] : '5m',
            'original' => ($view['original'] ?? false) === true,
        ];

        return $document;
    }
}
