/**
 * Monaco, bundled with the extension (no CDN) and loaded with the canvas chunk the first time a
 * file is opened. Every editor feature and syntax is in; of the language services only JSON, CSS
 * and HTML are, since TypeScript's would add some ten megabytes for little use on a game server.
 */
import * as monaco from 'monaco-editor/editor';
import 'monaco-editor/features/register.all';
import 'monaco-editor/languages/definitions/register.all';
import 'monaco-editor/languages/features/json/register';
import 'monaco-editor/languages/features/css/register';
import 'monaco-editor/languages/features/html/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/languages/features/json/json.worker?worker';
import CssWorker from 'monaco-editor/languages/features/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/languages/features/html/html.worker?worker';

const workers: Readonly<Record<string, new () => Worker>> = {
    json: JsonWorker,
    css: CssWorker,
    scss: CssWorker,
    less: CssWorker,
    html: HtmlWorker,
    handlebars: HtmlWorker,
    razor: HtmlWorker,
};

// Another copy of Monaco on the page (another extension's) keeps the environment it set up.
globalThis.MonacoEnvironment ??= {
    getWorker: (_moduleId: string, label: string) => new (workers[label] ?? EditorWorker)(),
};

export default monaco;
