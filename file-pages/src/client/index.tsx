import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';

export default definePterodactylExtension({
    setup({ views }) {
        // The manager hands every entry and the selection down; the list adds the pages around them.
        views.override('server.files.manager', { load: () => import('./PagedManager') });
        views.override('server.files.manager.list', { load: () => import('./PagedList') });
    },
});
