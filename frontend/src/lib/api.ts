import { supabase } from './supabase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

/**
 * 認証トークン（Access Token）を付与して fetch を実行するラッパー関数
 * @param endpoint エンドポイント（例: '/api/users/onboarding'）
 * @param options fetch のオプション
 * @returns fetch の Response オブジェクト
 */
export async function apiFetch(endpoint: string, options: RequestInit = {}, tokenOverride?: string | null): Promise<Response> {
    console.log(`[apiFetch] Starting request for endpoint: ${endpoint}`);

    let token = tokenOverride;

    // If no token override is provided, try to fetch it from Supabase
    if (token === undefined) {
        console.log(`[apiFetch] Calling supabase.auth.getSession()...`);
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) {
                console.error('[apiFetch] Failed to get session from supabase auth:', error.message);
            }
            token = session?.access_token;
            console.log(`[apiFetch] supabase.auth.getSession() resolved. Token retrieved: ${!!token}`);
        } catch (e) {
            console.error(`[apiFetch] supabase.auth.getSession() threw error:`, e);
            throw e;
        }
    } else {
        console.log(`[apiFetch] Using provided token override: ${!!token}`);
    }

    // ヘッダーの設定
    const headers = new Headers(options.headers || {});

    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    // デフォルトで JSON を扱うことが多い場合は Content-Type を設定してもよいですが、
    // 送信データが FormData の場合などは設定しない方が良いので、呼び出し元に任せるか、
    // 必要に応じてここで付与します。
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
    }

    const config: RequestInit = {
        ...options,
        headers,
    };

    // Add a 30s timeout to avoid infinite hanging when the backend is unreachable
    // (Increased from 10s to 30s as AI requests via Gemini can take 10-20 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    config.signal = controller.signal;

    // URLの構築
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
    console.log(`[apiFetch] Executing fetch to URL: ${url}`);

    try {
        const response = await fetch(url, config);
        clearTimeout(timeoutId);
        console.log(`[apiFetch] fetch completed for ${url} with status ${response.status}`);
        return response;
    } catch (e: any) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
            console.error(`[apiFetch] Request timed out for ${url}`);
        } else {
            console.error(`[apiFetch] fetch threw an error for ${url}:`, e);
        }
        throw e;
    }
}
