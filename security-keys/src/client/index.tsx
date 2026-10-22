import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import CheckpointKey from './CheckpointKey';
import PasswordlessButton from './PasswordlessButton';
import { settings } from './settings';

export default definePterodactylExtension({
    setup({ slots, screens, config }) {
        // Sign-in pages: views cannot be overridden for visitors, slots can.
        slots.register('auth.checkpoint.after', CheckpointKey);
        settings.passwordless = config.passwordless === true;
        if (settings.passwordless) {
            slots.register('auth.login.form.after', PasswordlessButton);
        }

        screens.register('keys', () => import('./KeysScreen'));
        screens.register('user-keys', () => import('./UserKeysScreen'));
    },
});
