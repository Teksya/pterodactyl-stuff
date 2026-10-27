"""Builds src/client/completion/minecraft.json, the Minecraft: Java Edition commands and names the console
completes, from PrismarineJS' minecraft-data (https://github.com/PrismarineJS/minecraft-data):

    python scripts/minecraft-data.py [cache directory]

The command trees (1.13 and later) of every version minecraft-data has are merged into one, each node
carrying the versions it exists in: `lo` (inclusive) and `hi` (exclusive). Between two versions with a
tree, a node either of them has shows. A few commands added or removed in those gaps are dated by hand
(DATES). The registries (items, blocks, entities, effects, enchantments, biomes, particles) are merged
the same way from 1.8 on. Commands before 1.13 are written by hand in minecraft.ts.
"""
import json
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

SOURCE = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/'
OUT = Path(__file__).resolve().parent.parent / 'src' / 'client' / 'completion' / 'minecraft.json'
CACHE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.gettempdir()) / 'minecraft-data'

# Top-level commands added or removed between two versions minecraft-data has a tree for: [from, until).
DATES = {
    'item': ('1.17', None),
    'replaceitem': (None, '1.17'),
    'perf': ('1.17', None),
    'jfr': ('1.18', None),
    'place': ('1.19', None),
    'locatebiome': ('1.16', '1.19'),
    'fillbiome': ('1.19.3', None),
    'damage': ('1.19.4', None),
    'ride': ('1.19.4', None),
    'return': ('1.20.2', None),
    'random': ('1.20.2', None),
    'transfer': ('1.20.5', None),
    'test': ('1.21.5', None),
    'rotate': ('1.21.2', None),
    'fetchprofile': ('1.21.9', None),
}
# Game rules took snake_case names (and a namespace) in 1.21.11.
SNAKE_RULES = '1.21.11'

REGISTRIES = {'items': 'item', 'blocks': 'block', 'entities': 'entity', 'effects': 'effect', 'enchantments': 'enchantment', 'biomes': 'biome', 'particles': 'particle'}


def key(version):
    return tuple(int(part) for part in version.split('.'))


def after(version):
    """The first release that can come after `version`: 1.16.2 -> 1.16.3."""
    parts = version.split('.')
    if len(parts) == 2:
        parts.append('0')
    parts[-1] = str(int(parts[-1]) + 1)
    return '.'.join(parts)


def fetch(path, kind):
    file = CACHE / f"{path.replace('/', '_')}_{kind}.json"
    if not file.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(f'{SOURCE}{path}/{kind}.json', file)
    return json.loads(file.read_text(encoding='utf-8'))


def simplify(parser):
    """The argument's kind as the console completes it."""
    if parser is None:
        return 'word'
    name = parser['parser'] if isinstance(parser, dict) else parser
    modifier = (parser.get('modifier') if isinstance(parser, dict) else None) or {}
    registry = str(modifier.get('registry', '')).removeprefix('minecraft:')
    name = name.removeprefix('minecraft:').removeprefix('brigadier:')
    if name == 'entity':
        return 'players' if modifier.get('type') == 'players' else 'entities'
    if name in ('game_profile', 'score_holder'):
        return 'players'
    if name in ('item_stack', 'item_predicate'):
        return 'item'
    if name in ('block_state', 'block_predicate'):
        return 'block'
    if name == 'entity_summon':
        return 'entity'
    if name == 'mob_effect':
        return 'effect'
    if name == 'item_enchantment':
        return 'enchantment'
    if name in ('resource', 'resource_or_tag', 'resource_key', 'resource_or_tag_key'):
        return {'item': 'item', 'block': 'block', 'entity_type': 'entity', 'mob_effect': 'effect', 'enchantment': 'enchantment', 'worldgen/biome': 'biome'}.get(registry, 'id')
    if name in ('block_pos', 'vec3'):
        return 'xyz'
    if name in ('vec2', 'column_pos', 'rotation'):
        return 'xz'
    if name == 'message' or (name == 'string' and modifier.get('type') == 'greedy'):
        return 'text'
    if name in ('integer', 'float', 'double', 'long', 'time', 'int_range', 'float_range', 'angle'):
        return 'number'
    if name in ('bool', 'dimension', 'gamemode', 'color', 'entity_anchor', 'operation', 'swizzle', 'heightmap', 'template_mirror', 'template_rotation', 'scoreboard_slot', 'objective_criteria', 'item_slot', 'item_slots', 'particle'):
        return {'entity_anchor': 'anchor', 'template_mirror': 'mirror', 'template_rotation': 'turn', 'scoreboard_slot': 'display', 'objective_criteria': 'criteria', 'item_slots': 'item_slot'}.get(name, name)
    return 'word'


def node_key(node):
    return (node['name'], None if node['type'] == 'literal' else simplify(node.get('parser')))


def merge_trees(trees):
    """trees: [(version, root)] oldest first. Returns the merged children of root."""
    versions = [version for version, _ in trees]

    def collect(nodes_by_version):
        """nodes_by_version: [(index, node)]; returns merged children of those nodes."""
        order, seen, definitions = [], {}, {}
        for index, node in nodes_by_version:
            for child in node.get('children', []):
                k = node_key(child)
                if k not in seen:
                    seen[k] = []
                    order.append(k)
                seen[k].append((index, child))
                definitions[k] = child
        # Newest order first, so the list reads as the current game does; then the old ones.
        newest = max(index for index, _ in nodes_by_version)
        order.sort(key=lambda k: (0 if any(i == newest for i, _ in seen[k]) else 1))
        parents = sorted({index for index, _ in nodes_by_version})
        merged = []
        for k in order:
            present = sorted({i for i, _ in seen[k]})
            definition = definitions[k]
            entry = {'n': k[0]}
            if k[1] is not None:
                entry['t'] = k[1]
            if any(child.get('executable') for _, child in seen[k]):
                entry['x'] = 1
            redirect = definition.get('redirects') or []
            if redirect:
                entry['r'] = redirect[0]
            # Only the versions the parent had count: a child is new when a parent version lacked it.
            first, last = present[0], present[-1]
            missing_before = [i for i in parents if i < first]
            missing_after = [i for i in parents if i > last]
            if missing_before:
                entry['lo'] = after(versions[missing_before[-1]])
            if missing_after:
                entry['hi'] = versions[missing_after[0]]
            children = collect(seen[k])
            if children:
                entry['c'] = children
            merged.append(entry)
        return merged

    return collect([(index, root) for index, (_, root) in enumerate(trees)])


def date_rules(commands):
    for command in commands:
        if command['n'] in DATES:
            lo, hi = DATES[command['n']]
            command.pop('lo', None)
            command.pop('hi', None)
            if lo:
                command['lo'] = lo
            if hi:
                command['hi'] = hi
        if command['n'] == 'gamerule':
            rules = command.get('c', [])
            for rule in rules:
                if rule['n'].startswith('minecraft:') or '_' in rule['n']:
                    rule['lo'] = SNAKE_RULES
                elif 'lo' not in rule or key(rule['lo']) < key(SNAKE_RULES):
                    rule['hi'] = SNAKE_RULES
            # The namespaced copies of the same rules are noise beside the short names.
            names = {rule['n'] for rule in rules}
            command['c'] = [rule for rule in rules if not (rule['n'].startswith('minecraft:') and rule['n'][10:] in names)]


def snake(name):
    if name == 'BadLuck':
        return 'unluck'
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()


def registry(kind, entries):
    """entries: [(version, names)] oldest first, every version. Returns [name | [name, lo?, hi?]]."""
    versions = [version for version, _ in entries]
    present = {}
    for index, (_, names) in enumerate(entries):
        for name in names:
            present.setdefault(name, []).append(index)
    out = []
    for name, indices in present.items():
        lo = None if indices[0] == 0 else versions[indices[0]]
        hi = None if indices[-1] == len(versions) - 1 else versions[indices[-1] + 1]
        out.append(name if lo is None and hi is None else [name, lo or 0, hi or 0])
    out.sort(key=lambda item: item if isinstance(item, str) else item[0])
    return out


def names(kind, data):
    result = []
    for entry in data:
        name = entry['name']
        if kind == 'effects' and name[:1].isupper():
            name = snake(name)
        if ' ' in name or kind == 'entities' and name in ('Mob', 'Monster', 'player', 'fishing_bobber'):
            continue
        result.append(name)
    return result


def main():
    paths = fetch_paths()
    releases = sorted((v for v in paths if re.fullmatch(r'\d+\.\d+(\.\d+)?', v) and key(v) >= key('1.8')), key=key)

    trees = []
    for version in releases:
        path = paths[version].get('commands')
        if path and path.endswith('/' + version):
            trees.append((version, fetch(path, 'commands')['root']))
    commands = merge_trees(trees)
    date_rules(commands)

    registries = {}
    for kind, label in REGISTRIES.items():
        entries = []
        for version in releases:
            path = paths[version].get(kind)
            if path:
                entries.append((version, names(kind, fetch(path, kind))))
        registries[label] = registry(kind, entries)

    data = {
        'source': 'PrismarineJS/minecraft-data',
        'trees': [version for version, _ in trees],
        'commands': commands,
        'registries': registries,
    }
    OUT.write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
    print(f'{OUT.name}: {len(commands)} commands, {OUT.stat().st_size // 1024} KB, trees {data["trees"][0]} to {data["trees"][-1]}')


def fetch_paths():
    file = CACHE / 'dataPaths.json'
    if not file.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(SOURCE + 'dataPaths.json', file)
    return json.loads(file.read_text(encoding='utf-8'))['pc']


if __name__ == '__main__':
    main()
