/**
 * The panel names the language of the open file by MIME type (its own list, `model.languages`);
 * Monaco by language id. Types missing here fall back to a Monaco language that declares the
 * type, then to plain text.
 */
const languages: Readonly<Record<string, string>> = {
    'text/x-csrc': 'c',
    'text/x-c++src': 'cpp',
    'text/x-csharp': 'csharp',
    'text/css': 'css',
    'text/x-cassandra': 'sql',
    'text/x-dockerfile': 'dockerfile',
    'text/x-gfm': 'markdown',
    'text/x-go': 'go',
    'text/html': 'html',
    'text/javascript': 'javascript',
    'application/json': 'json',
    'text/x-lua': 'lua',
    'text/x-markdown': 'markdown',
    'text/x-mariadb': 'mysql',
    'text/x-mssql': 'sql',
    'text/x-mysql': 'mysql',
    'text/x-php': 'php',
    'text/plain': 'plaintext',
    'text/x-pgsql': 'pgsql',
    'text/x-properties': 'ini',
    'text/x-pug': 'pug',
    'text/x-python': 'python',
    'text/x-ruby': 'ruby',
    'text/x-rustsrc': 'rust',
    'text/x-sass': 'scss',
    'text/x-scss': 'scss',
    'text/x-sh': 'shell',
    'text/x-sql': 'sql',
    'text/x-sqlite': 'sql',
    // Monaco has no TOML grammar; INI highlights its keys, sections, strings and comments.
    'text/x-toml': 'ini',
    'application/typescript': 'typescript',
    'script/x-vue': 'html',
    'application/xml': 'xml',
    'text/x-yaml': 'yaml',
};

export interface KnownLanguage {
    readonly id: string;
    readonly mimetypes?: readonly string[];
}

/** The Monaco language id for the panel's MIME type; `known` is what Monaco has registered. */
export function monacoLanguage(mime: string, known: readonly KnownLanguage[] = []): string {
    return languages[mime] ?? known.find((language) => language.mimetypes?.includes(mime))?.id ?? 'plaintext';
}
