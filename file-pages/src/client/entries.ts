import type { PanelDestination } from '@pterodactyl/sdk';
import type { FileManagerEntry, FileManagerModel } from '@pterodactyl/sdk/theme';

export type FileObject = FileManagerModel['slot']['files'][number];

/** The archives the panel can extract, as the panel tells them apart. */
const archiveTypes = [
    'application/vnd.rar',
    'application/x-rar-compressed',
    'application/x-tar',
    'application/x-br',
    'application/x-bzip2',
    'application/gzip',
    'application/x-gzip',
    'application/x-lzip',
    'application/x-sz',
    'application/x-xz',
    'application/zstd',
    'application/zip',
];

const isArchive = ({ attributes }: FileObject) => attributes.is_file && archiveTypes.includes(attributes.mimetype);

/** A text file the editor opens: neither an archive, nor a binary, nor an image other than SVG. */
const isEditable = (file: FileObject) =>
    file.attributes.is_file &&
    !isArchive(file) &&
    ['application/jar', 'application/octet-stream', 'inode/directory', /^image\/(?!svg\+xml)/].every((type) => !file.attributes.mimetype.match(type));

const kindOf = (file: FileObject): FileManagerEntry['kind'] => {
    if (!file.attributes.is_file) return 'directory';
    if (file.attributes.is_symlink) return 'symlink';

    return isArchive(file) ? 'archive' : 'file';
};

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

const join = (directory: string, name: string) => `${directory.replace(/\/+$/, '')}/${name}`;

/**
 * Every file of the listing as the panel's own entries, which it builds for the first 250 only:
 * directories first, then files, by name, each name once.
 */
export function buildEntries(
    files: readonly FileObject[],
    { directory, id, canRead, canReadContent }: { directory: string; id: string; canRead: boolean; canReadContent: boolean }
): FileManagerEntry[] {
    const sorted = [...files]
        .sort((a, b) => a.attributes.name.localeCompare(b.attributes.name))
        .sort((a, b) => Number(a.attributes.is_file) - Number(b.attributes.is_file))
        .filter((file, index, all) => index === 0 || file.attributes.name !== all[index - 1].attributes.name);

    return sorted.map((file) => {
        const path = join(directory, file.attributes.name);
        const openable = file.attributes.is_file ? isEditable(file) && canReadContent : canRead;
        const destination: PanelDestination | null = !openable
            ? null
            : file.attributes.is_file
              ? { to: '/server/$id/files/$action', params: { id, action: 'edit' }, hash: encodePath(path) }
              : { to: '/server/$id/files', params: { id }, hash: encodePath(path) };

        return {
            name: file.attributes.name,
            path,
            kind: kindOf(file),
            size: file.attributes.size ?? 0,
            mimetype: file.attributes.mimetype,
            mode: file.attributes.mode ?? '',
            modeBits: file.attributes.mode_bits ?? '',
            modifiedAt: file.attributes.modified_at,
            openable,
            extractable: isArchive(file),
            destination,
            file,
        } as FileManagerEntry;
    });
}

/** The entries whose name holds `term`, in any case. */
export function filterEntries(entries: readonly FileManagerEntry[], term: string): readonly FileManagerEntry[] {
    const needle = term.trim().toLocaleLowerCase();

    return needle === '' ? entries : entries.filter((entry) => entry.name.toLocaleLowerCase().includes(needle));
}
