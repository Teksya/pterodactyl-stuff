import { skin, type ThemeSkins } from '@pterodactyl/sdk/theme';

/**
 * Nightfall's look over classic's recipes: softer corners, sentence-case labels and quieter frames, as on
 * the sign-in pages. Each recipe extends classic's (`below`), so a class here replaces only the classic
 * class it conflicts with and every state classic handles keeps working.
 */
const control = 'rounded-lg border focus:ring-4 focus:ring-ring/25 focus:shadow-none';

export const skins: ThemeSkins = {
    Button: skin('Button', {
        root: (state, below) =>
            below('inline-flex items-center justify-center rounded-lg font-medium normal-case tracking-normal shadow-xs transition'),
    }),
    NewButton: skin('NewButton', { root: (state, below) => below('rounded-lg shadow-xs') }),
    Input: skin('Input', { root: (state, below) => below(control) }),
    TextArea: skin('TextArea', { root: (state, below) => below(control) }),
    NumberInput: skin('NumberInput', { input: (state, below) => below(control) }),
    Select: skin('Select', {
        root: (state, below) => below('rounded-lg focus-within:ring-4 focus-within:ring-ring/25 focus-within:shadow-none'),
        popup: (state, below) => below('rounded-xl shadow-2xl'),
    }),
    // A field like the others, holding a small primary button and the chosen file's name.
    FileInput: skin('FileInput', {
        root: (state, below) =>
            below(
                [
                    'rounded-lg border border-input-border bg-input p-1.5 text-muted-foreground transition-colors',
                    'enabled:hover:border-primary/60 focus-visible:ring-4 focus-visible:ring-ring/25 focus-visible:ring-offset-0',
                    'file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3.5 file:py-1.5 file:text-primary-foreground file:shadow-xs',
                    'enabled:hover:file:bg-primary/85 file:transition-colors',
                ].join(' ')
            ),
    }),
    Checkbox: skin('Checkbox', { root: (state, below) => below('size-4.5 rounded-[0.3rem]') }),
    Label: skin('Label', { root: (state, below) => below('mb-1.5 normal-case font-medium') }),
    Card: skin('Card', {
        root: (state, below) => below('rounded-xl border border-border/60 shadow-sm'),
        header: (state, below) => below('rounded-t-xl bg-transparent px-4 py-3 border-border/60'),
        title: 'font-header text-sm font-semibold text-foreground',
        icon: 'mr-2 text-primary',
        body: (state, below) => below('p-4'),
    }),
    ListRow: skin('ListRow', {
        root: (state, below) => below('rounded-xl border-border/40 shadow-sm'),
        icon: (state, below) => below('size-11 w-11 shrink-0 rounded-xl bg-primary/10 p-0 text-primary ring-1 ring-primary/25'),
        title: (state, below) => below('font-medium'),
    }),
    PageHeading: skin('PageHeading', {
        title: (state, below) => below('tracking-tight'),
        description: (state, below) => below('text-muted-foreground'),
    }),
    Dialog: skin('Dialog', {
        backdrop: (state, below) => below('bg-background/60 backdrop-blur-sm'),
        root: (state, below) => below('rounded-2xl ring-1 ring-border shadow-2xl'),
        footer: (state, below) => below('mt-6 rounded-b-2xl border-t border-border/60 bg-muted/40'),
        icon: (state, below) => below('rounded-xl'),
    }),
    DropdownMenu: skin('DropdownMenu', { root: (state, below) => below('rounded-xl shadow-2xl') }),
    DropdownMenuItem: skin('DropdownMenuItem', {
        // The choice in use (a scheme, a layout) shows its icon in the primary colour.
        root: (state, below) => below('rounded-lg data-checked:[&_[data-part=icon]]:bg-primary/15 data-checked:[&_[data-part=icon]]:text-primary'),
        icon: (state, below) => below('rounded-md'),
    }),
    Tooltip: skin('Tooltip', { root: (state, below) => below('rounded-lg shadow-lg') }),
    Alert: skin('Alert', { root: (state, below) => below('rounded-xl') }),
    Badge: skin('Badge', { root: (state, below) => below('rounded-full font-medium') }),
    Empty: skin('Empty', {
        root: (state, below) => below('rounded-xl'),
        media: (state, below) =>
            below(state.variant === 'icon' ? 'size-12 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/25' : ''),
    }),
    Stat: skin('Stat', { root: (state, below) => below('rounded-xl') }),
    ChartCard: skin('ChartCard', { root: (state, below) => below('rounded-xl border-b-0 shadow-sm') }),
    Table: skin('Table', { root: (state, below) => below('rounded-xl border-border/60 shadow-sm') }),
    // Meters only; the page loading bar stays classic's.
    ProgressBar: skin('ProgressBar', {
        root: (state, below) => below(state.variant === 'meter' ? 'rounded-full' : ''),
        indicator: (state, below) => below(state.variant === 'meter' ? 'rounded-full' : ''),
    }),
    // A thin ring with a primary arc in place of classic's heavy two-tone ring.
    Spinner: skin('Spinner', {
        root: (state, below) =>
            below(
                [
                    'animate-spin border-primary/15 border-t-primary',
                    { small: 'w-4 h-4 border-2', base: 'w-7 h-7 border-[2.5px]', large: 'w-10 h-10 border-[3px]' }[state.size ?? 'base'],
                ].join(' ')
            ),
        container: (state, below) => below(state.size === 'large' ? 'm-12' : ''),
    }),
    Code: skin('Code', { root: (state, below) => below('rounded-md') }),
};
