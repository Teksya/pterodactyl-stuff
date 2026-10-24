import { useEffect, useRef } from 'react';
import { cn, SpinnerOverlay, useExtensionAction, type ViewProps } from '@pterodactyl/sdk';
import { useTheme } from '@pterodactyl/sdk/theme';
import type { editor } from 'monaco-editor/editor';
import monaco from './monaco';
import { monacoLanguage } from './languages';
import { editorTheme, readEditorTokens, type Scheme } from './theme';

const THEME = 'pterodactyl-monaco';

// The same box as the panel's own editor: half the screen on phones, the rest of the page above.
const boxClass = 'mon:h-[50dvh] mon:min-h-64 mon:sm:h-[calc(100dvh-22rem)] mon:sm:min-h-80 mon:lg:h-[calc(100dvh-20rem)]';

let defined = '';

/** The panel's tokens as a Monaco theme; the stock dark or light one where a token is missing. */
function applyTheme(scheme: Scheme) {
    try {
        const theme = editorTheme(scheme, readEditorTokens());
        // <html> also changes for unrelated reasons, such as a dialog locking the scroll.
        if (JSON.stringify(theme) !== defined) {
            monaco.editor.defineTheme(THEME, theme);
            defined = JSON.stringify(theme);
        }
        monaco.editor.setTheme(THEME);
    } catch {
        monaco.editor.setTheme(scheme === 'dark' ? 'vs-dark' : 'vs');
    }
}

/** A size the panel's stylesheet sets, such as `--text-xs`, in pixels. */
function cssPixels(host: HTMLElement, value: string, fallback: number): number {
    const probe = document.createElement('span');
    probe.style.fontSize = value;
    host.append(probe);
    const size = Number.parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();

    return Number.isFinite(size) && size > 0 ? size : fallback;
}

/**
 * Monaco in place of the panel's code editor. The panel holds the buffer: every edit is reported
 * with `model.change`, so its Save button, its unsaved-changes guard and a remounted editor all
 * see the text typed here.
 */
export default function MonacoCanvas({ model, className }: ViewProps<'server.files.editor.canvas'>) {
    const host = useRef<HTMLDivElement>(null);
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const { scheme } = useTheme();

    const change = useExtensionAction('change', (content: string) => model.change(content));
    const save = useExtensionAction('save', async () => void (await model.save()));
    // The editor is created once per document; its listeners call the latest callbacks.
    const actions = useRef({ change, save });
    actions.current = { change, save };

    // Follow the scheme switch, and a theme setting changing the tokens: both land on <html>.
    useEffect(() => {
        applyTheme(scheme);
        const observer = new MutationObserver(() => applyTheme(scheme));
        observer.observe(document.documentElement, { attributes: true });

        return () => observer.disconnect();
    }, [scheme]);

    useEffect(() => {
        const element = host.current;
        if (!element) return;

        const text = monaco.editor.createModel(model.read(), monacoLanguage(model.language, monaco.languages.getLanguages()));
        const instance = monaco.editor.create(element, {
            model: text,
            theme: THEME,
            readOnly: model.readOnly,
            automaticLayout: true,
            fontFamily: getComputedStyle(element).fontFamily,
            fontSize: cssPixels(element, 'var(--text-xs)', 12),
            lineHeight: cssPixels(element, 'var(--text-sm--line-height)', 20),
            padding: { top: 12 },
            fixedOverflowWidgets: true,
            // With fixed overflow widgets, a shadow DOM puts the context menu under <body>, outside the
            // editor that carries Monaco's colours, and it draws with no background.
            useShadowDOM: false,
        });

        const edits = instance.onDidChangeModelContent(() => actions.current.change(instance.getValue()));
        instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => actions.current.save());
        editorRef.current = instance;

        return () => {
            editorRef.current = null;
            edits.dispose();
            instance.dispose();
            text.dispose();
        };
        // One editor per document: the panel remounts the view for another file.
    }, []);

    useEffect(() => {
        const text = editorRef.current?.getModel();
        if (text) monaco.editor.setModelLanguage(text, monacoLanguage(model.language, monaco.languages.getLanguages()));
    }, [model.language]);

    useEffect(() => {
        editorRef.current?.updateOptions({ readOnly: model.readOnly });
    }, [model.readOnly]);

    return (
        <div className={cn('mon:relative', className)} aria-busy={model.saving}>
            <SpinnerOverlay visible={model.saving} />
            <div
                ref={host}
                data-monaco-editor=''
                className={cn(boxClass, 'mon:overflow-hidden mon:rounded-sm mon:font-mono')}
            />
        </div>
    );
}
