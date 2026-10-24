import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';

export default definePterodactylExtension({
    setup({ views }) {
        views.override('server.terminal', { load: () => import('./ConsoleView') });
        views.override('server.stats', { load: () => import('./stats/StatsView') });
        views.override('server.graphs', { load: () => import('./stats/GraphsView') });
    },
});
