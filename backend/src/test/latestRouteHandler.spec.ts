import test from 'node:test';
import assert from 'node:assert/strict';

import { createLatestRouteHandler } from '../explore/latestRouteHandler';

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

test('returns 401 when user is missing', async () => {
    const handler = createLatestRouteHandler({
        findLatestRoute: async () => {
            throw new Error('should not be called');
        },
    });
    const response = createMockResponse();

    await handler({} as any, response as any);

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: 'Unauthorized' });
});

test('returns 404 when latest route does not exist', async () => {
    const calls: string[] = [];
    const handler = createLatestRouteHandler({
        findLatestRoute: async (userId) => {
            calls.push(userId);
            return null;
        },
    });
    const response = createMockResponse();

    await handler({ user: { id: 'user-1' } } as any, response as any);

    assert.deepEqual(calls, ['user-1']);
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { error: 'No routes found' });
});

test('returns 200 with latest route payload when route exists', async () => {
    const route = {
        id: 'route-1',
        user_id: 'user-1',
        title: 'Morning Ride',
        created_at: new Date('2026-03-29T00:00:00.000Z'),
    };
    const handler = createLatestRouteHandler({
        findLatestRoute: async () => route,
    });
    const response = createMockResponse();

    await handler({ user: { id: 'user-1' } } as any, response as any);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
        message: 'Latest route fetched successfully',
        data: { route },
    });
});

test('returns 500 when route lookup throws', async () => {
    const errors: Array<{ message: string; error: unknown }> = [];
    const handler = createLatestRouteHandler({
        findLatestRoute: async () => {
            throw new Error('db unavailable');
        },
        logError: (message, error) => {
            errors.push({ message, error });
        },
    });
    const response = createMockResponse();

    await handler({ user: { id: 'user-1' } } as any, response as any);

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: 'Internal Server Error fetching latest route' });
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.message, 'Explore Latest Route Fetch Error:');
    assert.equal((errors[0]?.error as Error).message, 'db unavailable');
});
