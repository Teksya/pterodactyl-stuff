import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';

export default definePterodactylExtension({
    setup({ screens }) {
        screens.register('admin-subdomains', () => import('./AdminScreens'));
        screens.register('admin-server-subdomains', () => import('./AdminScreens').then((module) => ({ default: module.AdminServerSubdomainsScreen })));
        // Hidden while the administrator keeps subdomains to themselves.
        screens.register('server-subdomains', () => import('./ServerSubdomainsScreen'), {
            visible: ({ config }) => config.server_subdomains !== false,
        });
    },
});
