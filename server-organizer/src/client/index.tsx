import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';

export default definePterodactylExtension({
    setup({ views }) {
        views.override('dashboard.serverList', { load: () => import('./ServerList') });
    },
});
