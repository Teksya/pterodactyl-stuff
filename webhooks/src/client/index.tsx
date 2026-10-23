import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';

export default definePterodactylExtension({
    setup({ screens }) {
        screens.register('admin-webhooks', () => import('./AdminWebhooksScreen'));
        screens.register('admin-server-webhooks', () => import('./AdminResourceScreens').then((module) => ({ default: module.AdminServerWebhooksScreen })));
        screens.register('admin-user-webhooks', () => import('./AdminResourceScreens').then((module) => ({ default: module.AdminUserWebhooksScreen })));
        // Hidden while the administrator has turned these webhooks off.
        screens.register('server-webhooks', () => import('./ServerWebhooksScreen'), {
            visible: ({ config }) => config.server_webhooks !== false,
        });
        screens.register('account-webhooks', () => import('./AccountWebhooksScreen'), {
            visible: ({ config }) => config.account_webhooks !== false,
        });
    },
});
