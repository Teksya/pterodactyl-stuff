import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { settings } from './settings';

export default definePterodactylExtension({
    setup({ screens, config }) {
        settings.textures = config.textures !== false;

        screens.register('players', () => import('./players/PlayersScreen'));
        screens.register('world', () => import('./world/WorldScreen'));
        screens.register('properties', () => import('./properties/PropertiesScreen'));
    },
});
