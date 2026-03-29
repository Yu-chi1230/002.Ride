import test from 'node:test';
import assert from 'node:assert/strict';

import { createRouteDetailsHandler } from '../explore/routeDetailsHandler';

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
    const handler = createRouteDetailsHandler({
        findRouteById: async () => {
            throw new Error('should not be called');
        },
        findWaypointsByRouteId: async () => [],
        getRouteGeometryFromWaypoints: async () => [],
        findCinematicSpotsByRouteId: async () => [],
    });
    const response = createMockResponse();

    await handler({ params: { id: 'route-1' } } as any, response as any);

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: 'Unauthorized' });
});

test('returns 404 when route does not exist', async () => {
    const calls: string[] = [];
    const handler = createRouteDetailsHandler({
        findRouteById: async (routeId) => {
            calls.push(routeId);
            return null;
        },
        findWaypointsByRouteId: async () => [],
        getRouteGeometryFromWaypoints: async () => [],
        findCinematicSpotsByRouteId: async () => [],
    });
    const response = createMockResponse();

    await handler({ user: { id: 'user-1' }, params: { id: 'route-1' } } as any, response as any);

    assert.deepEqual(calls, ['route-1']);
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { error: 'Route not found' });
});

test('returns 403 when route owner does not match user', async () => {
    const handler = createRouteDetailsHandler({
        findRouteById: async () => ({
            id: 'route-1',
            user_id: 'other-user',
        }),
        findWaypointsByRouteId: async () => {
            throw new Error('should not be called');
        },
        getRouteGeometryFromWaypoints: async () => [],
        findCinematicSpotsByRouteId: async () => [],
    });
    const response = createMockResponse();

    await handler({ user: { id: 'user-1' }, params: { id: 'route-1' } } as any, response as any);

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.body, { error: 'Forbidden: You do not own this route' });
});

test('returns 200 with route details when route exists and belongs to user', async () => {
    const calls = {
        waypoints: [] as string[],
        geometry: [] as unknown[],
        spots: [] as string[],
    };
    const route = {
        id: 'route-1',
        user_id: 'user-1',
        title: 'Evening Ride',
    };
    const waypoints = [
        { route_id: 'route-1', latitude: 35.0, longitude: 139.0, order_index: 0 },
        { route_id: 'route-1', latitude: 35.1, longitude: 139.1, order_index: 1 },
    ];
    const routeGeometry = [
        { latitude: 35.0, longitude: 139.0, order_index: 0 },
        { latitude: 35.1, longitude: 139.1, order_index: 1 },
    ];
    const cinematicSpots = [
        { route_id: 'route-1', location_name: 'Spot A' },
    ];
    const handler = createRouteDetailsHandler({
        findRouteById: async () => route,
        findWaypointsByRouteId: async (routeId) => {
            calls.waypoints.push(routeId);
            return waypoints;
        },
        getRouteGeometryFromWaypoints: async (inputWaypoints) => {
            calls.geometry.push(inputWaypoints);
            return routeGeometry;
        },
        findCinematicSpotsByRouteId: async (routeId) => {
            calls.spots.push(routeId);
            return cinematicSpots;
        },
    });
    const response = createMockResponse();

    await handler({ user: { id: 'user-1' }, params: { id: 'route-1' } } as any, response as any);

    assert.deepEqual(calls.waypoints, ['route-1']);
    assert.deepEqual(calls.geometry, [waypoints]);
    assert.deepEqual(calls.spots, ['route-1']);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
        message: 'Route details fetched successfully',
        data: {
            route,
            route_geometry: routeGeometry,
            waypoints,
            cinematic_spots: cinematicSpots,
        }
    });
});

test('returns 500 when detail lookup throws', async () => {
    const errors: Array<{ message: string; error: unknown }> = [];
    const handler = createRouteDetailsHandler({
        findRouteById: async () => {
            throw new Error('db unavailable');
        },
        findWaypointsByRouteId: async () => [],
        getRouteGeometryFromWaypoints: async () => [],
        findCinematicSpotsByRouteId: async () => [],
        logError: (message, error) => {
            errors.push({ message, error });
        },
    });
    const response = createMockResponse();

    await handler({ user: { id: 'user-1' }, params: { id: 'route-1' } } as any, response as any);

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: 'Internal Server Error fetching route details' });
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.message, 'Explore Route Fetch Error:');
    assert.equal((errors[0]?.error as Error).message, 'db unavailable');
});
