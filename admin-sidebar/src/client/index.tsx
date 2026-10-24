import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';

export default definePterodactylExtension({
    setup({ views, screens }) {
        views.override('layout.app', { load: () => import('./AppLayout') });
        views.override('layout.admin', { load: () => import('./AdminLayout') });
        screens.register('sidebar', () => import('./SidebarScreen'));
    },
});
