# Monaco Editor

A Pterodactyl Panel 2.0 extension by Olivier DUTOIT. It replaces the code editor of the file
editor (Server → Files → open or create a file) with [Monaco](https://microsoft.github.io/monaco-editor/),
the editor of Visual Studio Code.

## What you get

- Monaco's editing: multi-cursor, find and replace, code folding, bracket matching, minimap,
  command palette (F1), go to line (Ctrl+G), comment toggling, and the rest.
- Syntax highlighting for every language of the panel's language picker, plus validation and
  completion for JSON, CSS and HTML.
- **Ctrl+S** (Cmd+S on macOS) saves, exactly like the panel's Save button.
- The colours of the panel's editor: Monaco is themed with the active panel theme's
  `--editor-*` tokens, over Monaco's dark or light theme for the scheme in use, and follows a
  scheme or theme setting change without a reload.
- Read-only for subusers without the file update (or create) permission.

Everything else on the page is the panel's: the file name, the `.pteroignore` notice, the
language picker, the Save / Create File button, the new-file name dialog, the unsaved-changes
warning, permissions and the save request itself.

## How it works

The panel splits its file editor into views. The extension overrides only
`server.files.editor.canvas` (declared under `ui.views` in `extension.json`) with
`views.override(..., { load })`, so Monaco is downloaded the first time a file is opened, never on
other pages. The layer reads the panel's buffer with `model.read()`, reports each edit with
`model.change()`, saves with `model.save()` and maps `model.language` (a MIME type such as
`text/x-yaml`) to a Monaco language (`src/client/languages.ts`).

Monaco is bundled in `dist/` with its web workers (editor, JSON, CSS, HTML); nothing is loaded from
a CDN. TypeScript's language service is left out (it would add some ten megabytes); JavaScript and
TypeScript files still get highlighting.

If the bundle fails to load, the panel falls back to its own editor with the user's text.

## Install

Upload `pterodactyl-monaco-<version>.zip` in Admin → Extensions, or on the panel host:

```bash
php artisan p:extension:install pterodactyl-monaco-1.0.0.zip --enable --replace
```

Reload the page after enabling, disabling or updating the extension. To go back to the panel's
editor, disable it: `php artisan p:extension:disable monaco`.

## Files

| File | Purpose |
| --- | --- |
| `extension.json` | Manifest: the overridden view, Tailwind prefix `mon` |
| `src/client/index.tsx` | Registers the lazy view override |
| `src/client/MonacoCanvas.tsx` | The canvas layer: creates Monaco and wires it to the panel's model |
| `src/client/monaco.ts` | Monaco's features, languages and workers |
| `src/client/languages.ts` | Panel MIME types to Monaco language ids |
| `src/client/theme.ts` | Panel `--editor-*` tokens to a Monaco theme |
| `src/client/monaco.spec.tsx` | Tests, run with the SDK's real runtime |
