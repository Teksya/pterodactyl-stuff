import { defineTheme, lazyView } from '@pterodactyl/sdk/theme';
import { skins } from './skins';
import ActivityLog from './views/ActivityLog';
import AreaLayout from './views/AreaLayout';
import AuthLayout from './views/AuthLayout';
import FileList from './views/FileList';

// The pages use the UI kit from @pterodactyl/sdk, so they load with their route.
const pages = () => import('./views/pages');

/**
 * Classic's pages ("theme.extends") in Portal's frame: a sidebar that draws every area's navigation,
 * softer skins for the UI kit, the file list and the activity log as cards, and the split-screen sign-in.
 */
export default defineTheme({
    ui: skins,
    views: {
        // The sign-in screen renders before anything else, so its layout loads with the entry.
        'layout.auth': AuthLayout,
        'page.auth.login': lazyView(pages, 'LoginPage'),
        'page.auth.checkpoint': lazyView(pages, 'CheckpointPage'),
        'page.auth.password': lazyView(pages, 'ForgotPasswordPage'),
        'page.auth.passwordReset': lazyView(pages, 'ResetPasswordPage'),
        'layout.app': lazyView(() => import('./views/Shell')),
        'layout.account': AreaLayout,
        'layout.server': AreaLayout,
        'layout.admin': AreaLayout,
        'app.search': lazyView(() => import('./views/Search')),
        'server.files.manager.list': FileList,
        'activity.log': ActivityLog,
    },
});
