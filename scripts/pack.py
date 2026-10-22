"""Packs one extension of this repository into pterodactyl-<id>-<version>.zip at the repository root,
as `php artisan p:extension:pack` would (no source maps), for machines without PHP.

    python scripts/pack.py security-keys

Build the extension first (`npm run build` in a panel checkout), then copy its dist/ back here.
"""
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = ('extension.json', 'composer.json', 'composer.lock', 'README.md')
DIRECTORIES = ('dist', 'src', 'vendor', 'routes', 'database', 'resources')

folder = ROOT / sys.argv[1]
manifest = json.loads((folder / 'extension.json').read_text(encoding='utf-8'))
if not (folder / 'dist').is_dir():
    sys.exit(f'{folder.name}: dist/ is missing, build the extension first.')

paths = [folder / name for name in FILES if (folder / name).is_file()]
icon = manifest.get('icon', '')
if '.' in icon and (folder / icon).is_file():
    paths.append(folder / icon)
for directory in DIRECTORIES:
    if (folder / directory).is_dir():
        paths += sorted(p for p in (folder / directory).rglob('*') if p.is_file())
paths = [p for p in paths if not p.name.endswith(('.map', '.spec.ts', '.spec.tsx'))]

out = ROOT / f"pterodactyl-{manifest['id']}-{manifest['version']}.zip"
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in paths:
        archive.write(path, path.relative_to(folder).as_posix())

print(f'{out.name}: {len(paths)} files, {out.stat().st_size // 1024} KB')
