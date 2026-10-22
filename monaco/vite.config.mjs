import { defineExtensionConfig } from '@pterodactyl/sdk/vite';

const config = defineExtensionConfig({ entry: 'src/client/index.tsx' });

// Monaco's workers are ES modules; they load beside the chunk that starts them.
export default { ...config, worker: { format: 'es' } };
