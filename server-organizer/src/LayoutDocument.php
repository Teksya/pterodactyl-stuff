<?php

declare(strict_types=1);

namespace OlivierDutoit\ServerOrganizer;

use Illuminate\Validation\ValidationException;

/**
 * The layout a user saves, checked and reduced to what the dashboard reads:
 *
 *     folders     [{ id, name, collapsed }], in display order
 *     placements  { server uuid: folder id }
 *     order       [server uuid], the custom order
 *     view        { show, group, sort, collapsed: [group key] }
 *
 * Saving rejects what breaks a limit or a rule; reading (lenient) drops it instead, so a
 * layout saved under other rules still loads.
 */
final class LayoutDocument
{
    public const array SHOW = ['mine', 'owned', 'shared', 'others', 'all'];

    public const array ADMIN_SHOW = ['others', 'all'];

    public const array GROUP = ['folder', 'node', 'location', 'egg', 'ownership', 'none'];

    public const array SORT = ['name', 'custom', 'created'];

    private const int MAX_FOLDERS = 100;

    private const int MAX_SERVERS = 5000;

    private const int MAX_COLLAPSED = 500;

    private const string FOLDER_ID = '/^[a-z0-9-]{1,32}$/';

    private const string UUID = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/';

    /**
     * @param  array<mixed>  $input
     * @return array{folders: list<array{id: string, name: string, collapsed: bool}>, placements: array<string, string>, order: list<string>, view: array{show: string, group: string, sort: string, collapsed: list<string>}}
     *
     * @throws ValidationException
     */
    public static function normalize(array $input, bool $rootAdmin, bool $lenient = false): array
    {
        $fail = function (string $field, string $message) use ($lenient): void {
            if (! $lenient) {
                throw ValidationException::withMessages([$field => $message]);
            }
        };

        $folders = [];
        foreach (self::list($input['folders'] ?? []) as $index => $folder) {
            $id = is_array($folder) ? ($folder['id'] ?? null) : null;
            $name = is_array($folder) && is_string($folder['name'] ?? null) ? trim($folder['name']) : '';
            if (! is_string($id) || ! preg_match(self::FOLDER_ID, $id) || isset($folders[$id])) {
                $fail("folders.$index.id", 'Each folder needs its own id.');

                continue;
            }
            if ($name === '' || mb_strlen($name) > 50) {
                $fail("folders.$index.name", 'A folder name is 1 to 50 characters.');

                continue;
            }
            $folders[$id] = ['id' => $id, 'name' => $name, 'collapsed' => ($folder['collapsed'] ?? false) === true];
        }
        if (count($folders) > self::MAX_FOLDERS) {
            $fail('folders', sprintf('At most %d folders.', self::MAX_FOLDERS));
            $folders = array_slice($folders, 0, self::MAX_FOLDERS, true);
        }

        $placements = [];
        foreach (is_array($input['placements'] ?? null) ? $input['placements'] : [] as $uuid => $folder) {
            // A placement in a folder that is gone puts the server back with the unsorted ones.
            if (is_string($uuid) && preg_match(self::UUID, $uuid) && is_string($folder) && isset($folders[$folder])) {
                $placements[$uuid] = $folder;
            }
        }
        if (count($placements) > self::MAX_SERVERS) {
            $fail('placements', sprintf('At most %d servers.', self::MAX_SERVERS));
            $placements = array_slice($placements, 0, self::MAX_SERVERS, true);
        }

        $order = array_values(array_unique(array_filter(self::list($input['order'] ?? []), fn ($uuid): bool => is_string($uuid) && preg_match(self::UUID, $uuid) === 1)));
        if (count($order) > self::MAX_SERVERS) {
            $fail('order', sprintf('At most %d servers.', self::MAX_SERVERS));
            $order = array_slice($order, 0, self::MAX_SERVERS);
        }

        $view = is_array($input['view'] ?? null) ? $input['view'] : [];
        $show = self::choice($view['show'] ?? null, self::SHOW, 'mine');
        if (! $rootAdmin && in_array($show, self::ADMIN_SHOW, true)) {
            $fail('view.show', 'Only administrators can list other users\' servers.');
            $show = 'mine';
        }

        $collapsed = array_values(array_unique(array_filter(self::list($view['collapsed'] ?? []), fn ($key): bool => is_string($key) && $key !== '' && mb_strlen($key) <= 100)));

        return [
            'folders' => array_values($folders),
            // Empty, this encodes as [] rather than {}: the dashboard reads both.
            'placements' => $placements,
            'order' => $order,
            'view' => [
                'show' => $show,
                'group' => self::choice($view['group'] ?? null, self::GROUP, 'folder'),
                'sort' => self::choice($view['sort'] ?? null, self::SORT, 'name'),
                'collapsed' => array_slice($collapsed, 0, self::MAX_COLLAPSED),
            ],
        ];
    }

    /** @return list<mixed> */
    private static function list(mixed $value): array
    {
        return is_array($value) && array_is_list($value) ? $value : [];
    }

    /** @param list<string> $allowed */
    private static function choice(mixed $value, array $allowed, string $default): string
    {
        return is_string($value) && in_array($value, $allowed, true) ? $value : $default;
    }
}
