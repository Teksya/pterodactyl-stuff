import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';

export default definePterodactylExtension({
    setup({ views }) {
        // Only the code editor is replaced: the panel's notice, language picker and Save button stay.
        views.override('server.files.editor.canvas', { load: () => import('./MonacoCanvas') });
    },
});
