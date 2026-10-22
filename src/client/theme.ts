import type { editor } from 'monaco-editor/editor';

export type Scheme = 'dark' | 'light';

/** The panel's `--editor-*` tokens (any CSS colour syntax), resolved to the hex colours Monaco reads. */
export type EditorTokens = Readonly<Record<string, string | null>>;

const TOKENS = [
    'background',
    'foreground',
    'caret',
    'selection',
    'selected-foreground',
    'border',
    'muted',
    'active-line',
    'search-match',
    'search-match-selected',
    'tooltip',
    'tooltip-border',
    'syntax-keyword',
    'syntax-name',
    'syntax-function',
    'syntax-constant',
    'syntax-definition',
    'syntax-type',
    'syntax-operator',
    'syntax-string',
    'syntax-invalid',
] as const;

/** Monarch token classes, coloured like the panel's own editor colours the same syntax. */
const SYNTAX: readonly (readonly [token: string, color: string])[] = [
    ['comment', 'muted'],
    ['keyword', 'syntax-keyword'],
    ['metatag', 'syntax-keyword'],
    ['string', 'syntax-string'],
    ['attribute.value', 'syntax-string'],
    ['number', 'syntax-constant'],
    ['constant', 'syntax-constant'],
    ['regexp', 'syntax-constant'],
    ['type', 'syntax-type'],
    ['annotation', 'syntax-type'],
    ['tag', 'syntax-name'],
    ['key', 'syntax-definition'],
    ['attribute.name', 'syntax-definition'],
    ['variable.predefined', 'syntax-function'],
    ['predefined', 'syntax-function'],
    ['delimiter', 'syntax-operator'],
    ['operator', 'syntax-operator'],
    ['invalid', 'syntax-invalid'],
];

/** `#rrggbb`, or `#rrggbbaa` for a translucent colour; null when the canvas cannot draw it. */
export function toHex(color: string): string | null {
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!context || !color) return null;

    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
    const hex = (value: number) => value.toString(16).padStart(2, '0');

    return `#${hex(red)}${hex(green)}${hex(blue)}${alpha === 255 ? '' : hex(alpha)}`;
}

/** Each token as the browser computes it under the active theme and scheme, `color-mix()` and `var()` included. */
export function readEditorTokens(root: HTMLElement = document.documentElement): EditorTokens {
    const probe = document.createElement('span');
    probe.style.display = 'none';
    root.append(probe);

    try {
        return Object.fromEntries(
            TOKENS.map((token) => {
                probe.style.color = '';
                probe.style.color = `var(--editor-${token})`;

                return [token, toHex(getComputedStyle(probe).color)];
            })
        );
    } finally {
        probe.remove();
    }
}

/** A Monaco theme over its stock dark or light one, with every colour the panel's tokens supply. */
export function editorTheme(scheme: Scheme, tokens: EditorTokens): editor.IStandaloneThemeData {
    const colors: Record<string, string> = {};
    const set = (keys: readonly string[], token: string) => {
        const value = tokens[token];
        if (value) for (const key of keys) colors[key] = value;
    };

    set(['editor.background', 'editorGutter.background', 'minimap.background'], 'background');
    set(['editor.foreground', 'editorLineNumber.activeForeground'], 'foreground');
    set(['editorCursor.foreground'], 'caret');
    set(['editor.selectionBackground', 'editorSuggestWidget.selectedBackground', 'list.activeSelectionBackground'], 'selection');
    set(['editorSuggestWidget.selectedForeground', 'list.activeSelectionForeground'], 'selected-foreground');
    set(['editorIndentGuide.background1', 'editorWhitespace.foreground', 'editorRuler.foreground'], 'border');
    set(['editorLineNumber.foreground'], 'muted');
    set(['editor.lineHighlightBackground'], 'active-line');
    set(['editor.findMatchHighlightBackground'], 'search-match');
    set(['editor.findMatchBackground'], 'search-match-selected');
    set(['editorWidget.background', 'editorSuggestWidget.background', 'editorHoverWidget.background'], 'tooltip');
    set(['editorWidget.border', 'editorSuggestWidget.border', 'editorHoverWidget.border'], 'tooltip-border');

    return {
        base: scheme === 'dark' ? 'vs-dark' : 'vs',
        inherit: true,
        colors,
        rules: SYNTAX.flatMap(([token, color]) => {
            const value = tokens[color];

            return value ? [{ token, foreground: value.slice(1, 7) }] : [];
        }),
    };
}
