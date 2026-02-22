import { supabase } from './supabase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

/**
 * 認証トークン（Access Token）を付与して fetch を実行するラッパー関数
 * @param endpoint エンドポイント（例: '/api/users/onboarding'）
 * @param options fetch のオプション
 * @returns fetch の Response オブジェクト
 */
export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
    // 最新のセッションを取得し、トークンを取り出します
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
        console.error('Failed to get session from supabase auth:', error.message);
    }

    const token = session?.access_token;

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

    // URLの構築
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

    return fetch(url, config);
}
