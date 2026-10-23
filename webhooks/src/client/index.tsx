import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';

export default definePterodactylExtension({
    setup({ screens }) {
        screens.register('admin-webhooks', () => import('./AdminWebhooksScreen'));
        screens.register('admin-webhooks-servers', () => import('./AdminWebhooksScreen').then((module) => ({ default: module.AdminServersWebhooksScreen })));
        screens.register('admin-webhooks-accounts', () => import('./AdminWebhooksScreen').then((module) => ({ default: module.AdminAccountsWebhooksScreen })));
        screens.register('admin-webhooks-log', () => import('./AdminWebhooksScreen').then((module) => ({ default: module.AdminDeliveryLogScreen })));
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
