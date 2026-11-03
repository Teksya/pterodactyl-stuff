import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';

export default definePterodactylExtension({
    setup({ screens }) {
        screens.register('admin-deploys', () => import('./AdminScreen'));
        screens.register('server-deploy', () => import('./DeployScreen'));
    },
});
