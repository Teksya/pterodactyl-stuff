import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { http } from '@pterodactyl/sdk/api';
import TurnstileWidget, { type TurnstileTheme } from './TurnstileWidget';
import { isProtectedRequest, takeToken, withToken } from './token';

const themes: readonly TurnstileTheme[] = ['auto', 'light', 'dark'];

export default definePterodactylExtension({
    setup({ slots, config }) {
        const siteKey = typeof config.site_key === 'string' ? config.site_key.trim() : '';
        const theme = themes.find((value) => value === config.theme) ?? 'auto';

        // Without a site key the panel keeps its own reCAPTCHA, on the server as here.
        if (!siteKey) return;

        const Widget = () => <TurnstileWidget siteKey={siteKey} theme={theme} />;

        slots.register('auth.login.form.after', Widget);
        slots.register('auth.password.after', Widget);
        slots.register('auth.passwordReset.after', Widget);

        // The auth forms post through the panel's shared axios instance; add the token on the way out.
        http.interceptors.request.use(async (request) => {
            if (!isProtectedRequest(request.method, request.url)) return request;

            request.data = withToken(request.data, (await takeToken()) ?? '');

            return request;
        });
    },
});
