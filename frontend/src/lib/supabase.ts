import { createClient } from '@supabase/supabase-js';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const isLocalhostUrl = envUrl && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'));

// Convert localhost in VITE_SUPABASE_URL to the current hostname for local network access
const supabaseUrl = isLocalhostUrl
    ? envUrl.replace(/localhost|127\.0\.0\.1/, window.location.hostname)
    : envUrl;

const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const getAppOrigin = () => {
    const envOrigin = import.meta.env.VITE_APP_ORIGIN;
    return trimTrailingSlash(envOrigin || window.location.origin);
};

export const getOAuthRedirectUrl = () => {
    const envRedirectUrl = import.meta.env.VITE_GOOGLE_OAUTH_REDIRECT_URL;
    if (envRedirectUrl) {
        return envRedirectUrl;
    }

    const redirectPath = import.meta.env.VITE_GOOGLE_OAUTH_REDIRECT_PATH || '/home';
    return `${getAppOrigin()}${redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`}`;
};

export const supabase = createClient(supabaseUrl, supabaseKey);
