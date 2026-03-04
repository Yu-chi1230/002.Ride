import { createClient } from '@supabase/supabase-js';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const isLocalhostUrl = envUrl && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'));

// Convert localhost in VITE_SUPABASE_URL to the current hostname for local network access
const supabaseUrl = isLocalhostUrl
    ? envUrl.replace(/localhost|127\.0\.0\.1/, window.location.hostname)
    : envUrl;

const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);
