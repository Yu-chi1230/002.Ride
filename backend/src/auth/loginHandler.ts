import { Request, Response } from 'express';

export type LoginAttemptState = {
    failure_count: number;
    locked_until: Date | null;
};

type LoginSuccessPayload = {
    session?: {
        access_token: string;
        refresh_token: string;
        expires_in: number;
        expires_at?: number | null;
        token_type: string;
    } | null;
    user?: unknown;
};

type LoginHandlerDependencies = {
    signInWithPassword: (params: { email: string; password: string; }) => Promise<{
        data: LoginSuccessPayload;
        error: { message: string; } | null;
    }>;
    getLoginAttemptState: (emailNormalized: string, ipAddress: string) => Promise<LoginAttemptState | null>;
    recordLoginFailure: (emailNormalized: string, ipAddress: string) => Promise<LoginAttemptState>;
    resetLoginAttempts: (emailNormalized: string) => Promise<void>;
    normalizeEmail?: (value: unknown) => string;
    extractClientIp?: (req: Request) => string;
    now?: () => Date;
    logError?: (message: string, error: unknown) => void;
};

export const normalizeEmail = (value: unknown): string => (
    typeof value === 'string' ? value.trim().toLowerCase() : ''
);

export const extractClientIp = (req: Request): string => {
    const forwarded = req.headers['x-forwarded-for'];
    const fromForwarded = typeof forwarded === 'string'
        ? forwarded.split(',')[0]?.trim()
        : Array.isArray(forwarded)
            ? forwarded[0]?.split(',')[0]?.trim()
            : '';
    const raw = fromForwarded || req.ip || req.socket.remoteAddress || '';
    return raw.replace(/^::ffff:/, '');
};

export const createLoginHandler = ({
    signInWithPassword,
    getLoginAttemptState,
    recordLoginFailure,
    resetLoginAttempts,
    normalizeEmail: normalizeEmailInput = normalizeEmail,
    extractClientIp: extractClientIpInput = extractClientIp,
    now = () => new Date(),
    logError = (message, error) => console.error(message, error),
}: LoginHandlerDependencies) => {
    return async (req: Request, res: Response) => {
        const emailNormalized = normalizeEmailInput(req.body?.email);
        const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
        const ipAddress = extractClientIpInput(req);

        if (!emailNormalized || !password) {
            return res.status(400).json({ error: 'メールアドレスとパスワードを入力してください。' });
        }

        try {
            const currentAttemptState = await getLoginAttemptState(emailNormalized, ipAddress);
            const currentTime = now();

            if (currentAttemptState?.locked_until && currentAttemptState.locked_until > currentTime) {
                const retryAfterSeconds = Math.max(
                    1,
                    Math.ceil((currentAttemptState.locked_until.getTime() - currentTime.getTime()) / 1000)
                );

                return res.status(429).json({
                    error: 'ログイン試行回数の上限に達しました。しばらくしてから再試行してください。',
                    retryAfterSeconds,
                    lockedUntil: currentAttemptState.locked_until.toISOString(),
                });
            }

            const { data, error } = await signInWithPassword({
                email: emailNormalized,
                password,
            });

            if (error || !data.session || !data.user) {
                const updatedAttemptState = await recordLoginFailure(emailNormalized, ipAddress);
                const lockedUntil = updatedAttemptState.locked_until;

                if (lockedUntil && lockedUntil > currentTime) {
                    const retryAfterSeconds = Math.max(
                        1,
                        Math.ceil((lockedUntil.getTime() - currentTime.getTime()) / 1000)
                    );

                    return res.status(429).json({
                        error: 'ログイン試行回数の上限に達しました。しばらくしてから再試行してください。',
                        retryAfterSeconds,
                        lockedUntil: lockedUntil.toISOString(),
                    });
                }

                return res.status(401).json({
                    error: 'メールアドレスまたはパスワードが間違っています。',
                });
            }

            await resetLoginAttempts(emailNormalized);

            return res.status(200).json({
                session: {
                    access_token: data.session.access_token,
                    refresh_token: data.session.refresh_token,
                    expires_in: data.session.expires_in,
                    expires_at: data.session.expires_at,
                    token_type: data.session.token_type,
                    user: data.user,
                },
            });
        } catch (error: any) {
            logError('[POST /api/auth/login] Failed:', error?.message || error);
            return res.status(500).json({ error: 'ログイン処理中にエラーが発生しました。' });
        }
    };
};
