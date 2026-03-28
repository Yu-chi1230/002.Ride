import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createLoginHandler,
    extractClientIp,
    normalizeEmail,
} from '../auth/loginHandler';

const createMockResponse = () => {
    const response = {
        statusCode: 200,
        body: undefined as unknown,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(payload: unknown) {
            this.body = payload;
            return this;
        },
    };

    return response;
};

test('normalizeEmail trims and lowercases string input', () => {
    assert.equal(normalizeEmail('  Test@Example.COM  '), 'test@example.com');
    assert.equal(normalizeEmail(null), '');
});

test('extractClientIp prefers x-forwarded-for and strips ipv6 prefix', () => {
    const forwardedRequest = {
        headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
        ip: '::ffff:127.0.0.1',
        socket: { remoteAddress: '::ffff:127.0.0.1' },
    };
    const socketRequest = {
        headers: {},
        ip: '',
        socket: { remoteAddress: '::ffff:192.0.2.55' },
    };

    assert.equal(extractClientIp(forwardedRequest as any), '203.0.113.10');
    assert.equal(extractClientIp(socketRequest as any), '192.0.2.55');
});

test('returns 400 when email or password is missing', async () => {
    const signInWithPassword = async () => {
        throw new Error('should not be called');
    };
    const handler = createLoginHandler({
        signInWithPassword,
        getLoginAttemptState: async () => null,
        recordLoginFailure: async () => ({ failure_count: 1, locked_until: null }),
        resetLoginAttempts: async () => undefined,
    });
    const response = createMockResponse();

    await handler({ body: { email: 'user@example.com', password: '   ' }, headers: {}, socket: {} } as any, response as any);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
        error: 'メールアドレスとパスワードを入力してください。',
    });
});

test('returns 429 when login is already locked for the request IP', async () => {
    const lockedUntil = new Date('2026-03-28T03:05:00.000Z');
    const handler = createLoginHandler({
        signInWithPassword: async () => {
            throw new Error('should not be called');
        },
        getLoginAttemptState: async () => ({ failure_count: 5, locked_until: lockedUntil }),
        recordLoginFailure: async () => ({ failure_count: 6, locked_until: lockedUntil }),
        resetLoginAttempts: async () => undefined,
        now: () => new Date('2026-03-28T03:00:00.000Z'),
    });
    const response = createMockResponse();

    await handler({ body: { email: 'user@example.com', password: 'pass1234' }, headers: {}, socket: {} } as any, response as any);

    assert.equal(response.statusCode, 429);
    assert.deepEqual(response.body, {
        error: 'ログイン試行回数の上限に達しました。しばらくしてから再試行してください。',
        retryAfterSeconds: 300,
        lockedUntil: '2026-03-28T03:05:00.000Z',
    });
});

test('returns 401 and records failure when credentials are invalid', async () => {
    const calls = {
        signIn: [] as Array<{ email: string; password: string; }>,
        recordFailure: [] as Array<{ email: string; ip: string; }>,
        reset: [] as string[],
    };
    const handler = createLoginHandler({
        signInWithPassword: async (params) => {
            calls.signIn.push(params);
            return { data: { session: null, user: null }, error: { message: 'invalid login' } };
        },
        getLoginAttemptState: async () => null,
        recordLoginFailure: async (email, ip) => {
            calls.recordFailure.push({ email, ip });
            return { failure_count: 1, locked_until: null };
        },
        resetLoginAttempts: async (email) => {
            calls.reset.push(email);
        },
        extractClientIp: () => '198.51.100.24',
    });
    const response = createMockResponse();

    await handler({ body: { email: '  User@Example.com ', password: '  pass1234  ' }, headers: {}, socket: {} } as any, response as any);

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, {
        error: 'メールアドレスまたはパスワードが間違っています。',
    });
    assert.deepEqual(calls.signIn, [{ email: 'user@example.com', password: 'pass1234' }]);
    assert.deepEqual(calls.recordFailure, [{ email: 'user@example.com', ip: '198.51.100.24' }]);
    assert.deepEqual(calls.reset, []);
});

test('returns 429 when failed login reaches lock threshold', async () => {
    const lockedUntil = new Date('2026-03-28T03:20:00.000Z');
    const handler = createLoginHandler({
        signInWithPassword: async () => ({
            data: { session: null, user: null },
            error: { message: 'invalid login' },
        }),
        getLoginAttemptState: async () => null,
        recordLoginFailure: async () => ({ failure_count: 5, locked_until: lockedUntil }),
        resetLoginAttempts: async () => undefined,
        now: () => new Date('2026-03-28T03:00:00.000Z'),
    });
    const response = createMockResponse();

    await handler({ body: { email: 'user@example.com', password: 'pass1234' }, headers: {}, socket: {} } as any, response as any);

    assert.equal(response.statusCode, 429);
    assert.deepEqual(response.body, {
        error: 'ログイン試行回数の上限に達しました。しばらくしてから再試行してください。',
        retryAfterSeconds: 1200,
        lockedUntil: '2026-03-28T03:20:00.000Z',
    });
});

test('returns 200 and resets login attempts on successful login', async () => {
    const resetCalls: string[] = [];
    const handler = createLoginHandler({
        signInWithPassword: async () => ({
            data: {
                session: {
                    access_token: 'access-token',
                    refresh_token: 'refresh-token',
                    expires_in: 3600,
                    expires_at: 1234567890,
                    token_type: 'bearer',
                },
                user: { id: 'user-1', email: 'user@example.com' },
            },
            error: null,
        }),
        getLoginAttemptState: async () => null,
        recordLoginFailure: async () => ({ failure_count: 1, locked_until: null }),
        resetLoginAttempts: async (email) => {
            resetCalls.push(email);
        },
    });
    const response = createMockResponse();

    await handler({ body: { email: 'user@example.com', password: 'pass1234' }, headers: {}, socket: {} } as any, response as any);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
        session: {
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
            expires_at: 1234567890,
            token_type: 'bearer',
            user: { id: 'user-1', email: 'user@example.com' },
        },
    });
    assert.deepEqual(resetCalls, ['user@example.com']);
});

test('returns 500 when unexpected error occurs', async () => {
    const errors: Array<{ message: string; error: unknown; }> = [];
    const handler = createLoginHandler({
        signInWithPassword: async () => {
            throw new Error('supabase down');
        },
        getLoginAttemptState: async () => null,
        recordLoginFailure: async () => ({ failure_count: 1, locked_until: null }),
        resetLoginAttempts: async () => undefined,
        logError: (message, error) => {
            errors.push({ message, error });
        },
    });
    const response = createMockResponse();

    await handler({ body: { email: 'user@example.com', password: 'pass1234' }, headers: {}, socket: {} } as any, response as any);

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, {
        error: 'ログイン処理中にエラーが発生しました。',
    });
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.message, '[POST /api/auth/login] Failed:');
    assert.equal(errors[0]?.error, 'supabase down');
});
