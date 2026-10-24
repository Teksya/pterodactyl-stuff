import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, screen } from '@testing-library/react';
import { createTestFileEditor, renderView, type RenderedView } from '@pterodactyl/sdk/testing';
import type { ExtensionSetupContext } from '@pterodactyl/sdk';
import manifest from '../../extension.json';
import extension from './index';
import MonacoCanvas from './MonacoCanvas';
import { monacoLanguage } from './languages';
import { editorTheme } from './theme';

// Monaco needs a real browser; this stands in for the few calls the canvas makes.
const fake = vi.hoisted(() => {
    const listeners: (() => void)[] = [];
    const commands: (() => void)[] = [];
    const state = { value: '', language: '', options: {} as Record<string, unknown> };
    const text = { dispose: vi.fn() };
    const instance = {
        getValue: () => state.value,
        getModel: () => text,
        onDidChangeModelContent: (listener: () => void) => (listeners.push(listener), { dispose: vi.fn() }),
        addCommand: (_keys: number, command: () => void) => void commands.push(command),
        updateOptions: (options: Record<string, unknown>) => Object.assign(state.options, options),
        dispose: vi.fn(),
    };

    return {
        state,
        instance,
        type: (value: string) => ((state.value = value), listeners.forEach((listener) => listener())),
        pressSave: () => commands.forEach((command) => command()),
        reset: () => ((listeners.length = 0), (commands.length = 0), (state.options = {})),
        monaco: {
            KeyMod: { CtrlCmd: 2048 },
            KeyCode: { KeyS: 49 },
            languages: { getLanguages: () => [{ id: 'kotlin', mimetypes: ['text/x-kotlin'] }] },
            editor: {
                defineTheme: vi.fn(),
                setTheme: vi.fn(),
                setModelLanguage: vi.fn((_model: unknown, language: string) => void (state.language = language)),
                createModel: vi.fn((value: string, language: string) => {
                    Object.assign(state, { value, language });

                    return text;
                }),
                create: vi.fn((_element: HTMLElement, options: Record<string, unknown>) => {
                    Object.assign(state.options, options);

                    return instance;
                }),
            },
        },
    };
});

vi.mock('./monaco', () => ({ default: fake.monaco }));

let rendered: RenderedView | undefined;

// jsdom draws no canvas, so the theme keeps Monaco's stock colours here.
beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
    rendered?.unmount();
    rendered = undefined;
    cleanup();
    fake.reset();
    vi.clearAllMocks();
});

function renderEditor(options: Parameters<typeof createTestFileEditor>[0] = {}) {
    const model = createTestFileEditor({ change: vi.fn(), save: vi.fn(async () => true), ...options });
    rendered = renderView('server.files.editor', {
        themes: [{ views: { 'server.files.editor.canvas': MonacoCanvas } }],
        model,
        prefix: 'mon',
    });

    return model;
}

test('lazily overrides only the code editor of the file editor, as the manifest declares', () => {
    const override = vi.fn();
    extension.setup({ meta: { id: 'monaco' }, config: {}, views: { override } } as unknown as ExtensionSetupContext);

    expect(override).toHaveBeenCalledExactlyOnceWith('server.files.editor.canvas', { load: expect.any(Function) });
    expect(manifest.ui.views).toEqual(['server.files.editor.canvas']);
});

test('opens the buffer the panel holds, in the language it picked', () => {
    renderEditor({ read: () => 'motd=Edited\n', language: 'text/x-properties', readOnly: true });

    expect(fake.monaco.editor.createModel).toHaveBeenCalledWith('motd=Edited\n', 'ini');
    // Menus outside a shadow DOM, where Monaco's colours reach them.
    expect(fake.state.options).toMatchObject({ readOnly: true, automaticLayout: true, fixedOverflowWidgets: true, useShadowDOM: false });
    // The panel's language picker and Save button stay around the replaced canvas.
    expect(screen.getByRole('combobox')).toBeTruthy();
});

test('reports every edit to the panel and saves on Ctrl+S', async () => {
    const model = renderEditor();

    act(() => fake.type('motd=Changed\n'));
    expect(model.change).toHaveBeenLastCalledWith('motd=Changed\n');

    await act(async () => fake.pressSave());
    expect(model.save).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Save Content' })).toBeTruthy();
});

test('maps every language of the panel to a Monaco one', () => {
    const { languages } = createTestFileEditor();

    for (const { mime } of languages) expect(monacoLanguage(mime), mime).not.toBe('');
    expect(monacoLanguage('text/x-yaml')).toBe('yaml');
    expect(monacoLanguage('application/json')).toBe('json');
    expect(monacoLanguage('text/x-sh')).toBe('shell');
    expect(monacoLanguage('text/x-kotlin', [{ id: 'kotlin', mimetypes: ['text/x-kotlin'] }])).toBe('kotlin');
    expect(monacoLanguage('text/x-unknown')).toBe('plaintext');
});

test('colours Monaco with the panel editor tokens over the stock theme of the scheme', () => {
    const theme = editorTheme('light', { background: '#1f2430', 'syntax-keyword': '#ffad66', caret: null });

    expect(theme.base).toBe('vs');
    expect(theme.colors).toMatchObject({ 'editor.background': '#1f2430' });
    expect(theme.colors).not.toHaveProperty('editorCursor.foreground');
    expect(theme.rules).toContainEqual({ token: 'keyword', foreground: 'ffad66' });
    expect(editorTheme('dark', {}).base).toBe('vs-dark');
});
