import {
    Archive,
    Blocks,
    CalendarClock,
    Database,
    Egg,
    ExternalLink,
    Folder,
    FolderTree,
    Globe,
    History,
    KeyRound,
    Layers,
    LayoutDashboard,
    LifeBuoy,
    MapPin,
    Network,
    Palette,
    Puzzle,
    Rocket,
    Server,
    Settings,
    SquareTerminal,
    Tag,
    Terminal,
    UserCog,
    UserRound,
    Users,
    type LucideIcon,
} from 'lucide-react';
import { NamedIcon } from '@pterodactyl/sdk';

// The panel's own items draw these directly, so they never wait for the icon catalogue.
const icons = new Map<string, LucideIcon>([
    ['archive', Archive],
    ['blocks', Blocks],
    ['calendar-clock', CalendarClock],
    ['database', Database],
    ['egg', Egg],
    ['external-link', ExternalLink],
    ['folder', Folder],
    ['folder-tree', FolderTree],
    ['globe', Globe],
    ['history', History],
    ['key-round', KeyRound],
    ['layers', Layers],
    ['layout-dashboard', LayoutDashboard],
    ['life-buoy', LifeBuoy],
    ['map-pin', MapPin],
    ['network', Network],
    ['palette', Palette],
    ['rocket', Rocket],
    ['server', Server],
    ['settings', Settings],
    ['square-terminal', SquareTerminal],
    ['tag', Tag],
    ['terminal', Terminal],
    ['user-cog', UserCog],
    ['user-round', UserRound],
    ['users', Users],
]);

/** A navigation icon by its lucide name; names the panel does not use come from the icon catalogue. */
export default function NavIcon({ name }: { name: string | null }) {
    const Glyph = name ? icons.get(name) : Puzzle;

    if (Glyph) return <Glyph aria-hidden className='size-4 shrink-0' />;

    return <NamedIcon name={name ?? ''} fallback={Puzzle} size={16} aria-hidden className='shrink-0' />;
}
