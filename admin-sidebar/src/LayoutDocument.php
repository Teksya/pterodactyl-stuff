<?php

declare(strict_types=1);

namespace OlivierDutoit\AdminSidebar;

use Illuminate\Validation\ValidationException;

/**
 * The arrangement administrators save, checked and reduced to what the navigation reads:
 *
 *     folders     [{ id, name }], in display order
 *     placements  { item key: folder id, or "top" for above the folders }
 *     order       [item key], the order within the top and each folder
 *
 * An item key is "core:<path>" for the panel's pages and "ext:<extension>:<screen>" for an
 * extension's. Items without a placement go where the dashboard's defaults put them.
 */
final class LayoutDocument
{
    private const int MAX_FOLDERS = 30;

    private const int MAX_ITEMS = 300;

    private const string FOLDER_ID = '/^[a-z0-9-]{1,32}$/';

    private const string ITEM_KEY = '/^(core:[a-z0-9_\/-]{1,120}|ext:[a-z0-9-]{1,64}:[a-z0-9-]{1,64})$/';

    /**
     * @param  array<mixed>  $input
     * @return array{folders: list<array{id: string, name: string}>, placements: array<string, string>, order: list<string>}
     *
     * @throws ValidationException
     */
    public static function normalize(array $input, bool $lenient = false): array
    {
        $fail = function (string $field, string $message) use ($lenient): void {
            if (! $lenient) {
                throw ValidationException::withMessages([$field => $message]);
            }
        };

        $folders = [];
        foreach (is_array($input['folders'] ?? null) && array_is_list($input['folders']) ? $input['folders'] : [] as $index => $folder) {
            $id = is_array($folder) ? ($folder['id'] ?? null) : null;
            $name = is_array($folder) && is_string($folder['name'] ?? null) ? trim($folder['name']) : '';
            if (! is_string($id) || ! preg_match(self::FOLDER_ID, $id) || $id === 'top' || isset($folders[$id])) {
                $fail("folders.$index.id", 'Each folder needs its own id.');

                continue;
            }
            if ($name === '' || mb_strlen($name) > 40) {
                $fail("folders.$index.name", 'A folder name is 1 to 40 characters.');

                continue;
            }
            $folders[$id] = ['id' => $id, 'name' => $name];
        }
        if (count($folders) > self::MAX_FOLDERS) {
            $fail('folders', sprintf('At most %d folders.', self::MAX_FOLDERS));
            $folders = array_slice($folders, 0, self::MAX_FOLDERS, true);
        }

        $placements = [];
        foreach (is_array($input['placements'] ?? null) ? $input['placements'] : [] as $key => $folder) {
            if (is_string($key) && preg_match(self::ITEM_KEY, $key) && is_string($folder) && ($folder === 'top' || isset($folders[$folder]))) {
                $placements[$key] = $folder;
            }
        }

        $order = array_values(array_unique(array_filter(
            is_array($input['order'] ?? null) && array_is_list($input['order']) ? $input['order'] : [],
            fn ($key): bool => is_string($key) && preg_match(self::ITEM_KEY, $key) === 1,
        )));
        if (count($placements) > self::MAX_ITEMS || count($order) > self::MAX_ITEMS) {
            $fail('order', sprintf('At most %d items.', self::MAX_ITEMS));
        }

        return [
            'folders' => array_values($folders),
            'placements' => array_slice($placements, 0, self::MAX_ITEMS, true),
            'order' => array_slice($order, 0, self::MAX_ITEMS),
        ];
    }
}
