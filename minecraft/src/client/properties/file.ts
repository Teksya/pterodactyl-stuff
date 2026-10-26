/**
 * server.properties, a Java properties file. Changing a key rewrites only its line, so comments, the
 * order and the keys of plugins and mods stay as the server wrote them.
 */
export interface PropertiesFile {
    lines: string[];
    values: Map<string, string>;
}

const ENTRY = /^((?:\\.|[^\\=:\s])*)\s*[=:\s]\s*(.*)$/s;

export function parseProperties(contents: string): PropertiesFile {
    const lines = contents.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
    const values = new Map<string, string>();
    for (const line of lines) {
        const entry = parseLine(line);
        if (entry) values.set(entry[0], entry[1]);
    }

    return { lines: lines.length === 1 && lines[0] === '' ? [] : lines, values };
}

/** The file with `changes` applied: changed keys in place, new keys at the end. */
export function serializeProperties(file: PropertiesFile, changes: Record<string, string>): string {
    const pending = new Map(Object.entries(changes));
    const lines = file.lines.map((line) => {
        const entry = parseLine(line);
        if (!entry || !pending.has(entry[0])) return line;
        const value = pending.get(entry[0])!;
        pending.delete(entry[0]);

        return `${escape(entry[0], true)}=${escape(value, false)}`;
    });
    for (const [key, value] of pending) lines.push(`${escape(key, true)}=${escape(value, false)}`);

    return `${lines.join('\n')}\n`;
}

function parseLine(line: string): [string, string] | null {
    const trimmed = line.trimStart();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('!')) return null;
    const match = ENTRY.exec(trimmed);
    if (!match) return [unescape(trimmed), ''];

    return [unescape(match[1]), unescape(match[2])];
}

export function unescape(text: string): string {
    return text.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, escaped: string) => {
        if (escaped.length === 5 && escaped[0] === 'u') return String.fromCharCode(Number.parseInt(escaped.slice(1), 16));

        return ({ n: '\n', t: '\t', r: '\r', f: '\f' } as Record<string, string>)[escaped] ?? escaped;
    });
}

/** As Java writes it: separators and backslashes escaped, characters outside ASCII as \uXXXX. */
export function escape(text: string, key: boolean): string {
    let escaped = '';
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        const code = text.charCodeAt(index);
        if (char === '\\') escaped += '\\\\';
        else if (char === '\n') escaped += '\\n';
        else if (char === '\t') escaped += '\\t';
        else if (char === '\r') escaped += '\\r';
        else if ('=:#!'.includes(char)) escaped += `\\${char}`;
        else if (char === ' ' && (key || index === 0)) escaped += '\\ ';
        // UTF-16 units, as Java's: a character beyond the BMP becomes its two surrogates.
        else if (code < 0x20 || code > 0x7e) escaped += `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`;
        else escaped += char;
    }

    return escaped;
}
