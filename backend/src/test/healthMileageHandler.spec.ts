import test from 'node:test';
import assert from 'node:assert/strict';

import { createHealthMileageHandler } from '../health/mileageHandler';

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
    const handler = createHealthMileageHandler({
        findVehicleByUserId: async () => {
            throw new Error('should not be called');
        },
        updateMileage: async () => {
            throw new Error('should not be called');
        },
        buildVehicleWithMaintenanceStatus: async () => null,
    });
    const response = createMockResponse();

    await handler({ body: { mileage: 1000 } } as any, response as any);

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: 'Unauthorized' });
});

test('returns 400 when mileage is missing', async () => {
    const handler = createHealthMileageHandler({
        findVehicleByUserId: async () => {
            throw new Error('should not be called');
        },
        updateMileage: async () => {
            throw new Error('should not be called');
        },
        buildVehicleWithMaintenanceStatus: async () => null,
    });
    const response = createMockResponse();

    await handler({ user: { id: 'user-1' }, body: { mileage: '' } } as any, response as any);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: 'mileage is required' });
});

test('returns 400 when mileage is invalid', async () => {
    const handler = createHealthMileageHandler({
        findVehicleByUserId: async () => {
            throw new Error('should not be called');
        },
        updateMileage: async () => {
            throw new Error('should not be called');
        },
        buildVehicleWithMaintenanceStatus: async () => null,
    });
    const response = createMockResponse();

    await handler({ user: { id: 'user-1' }, body: { mileage: -1 } } as any, response as any);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: 'Invalid mileage' });
});

test('returns 404 when vehicle does not exist', async () => {
    const calls: string[] = [];
    const handler = createHealthMileageHandler({
        findVehicleByUserId: async (userId) => {
            calls.push(userId);
            return null;
        },
        updateMileage: async () => {
            throw new Error('should not be called');
        },
        buildVehicleWithMaintenanceStatus: async () => null,
    });
    const response = createMockResponse();

    await handler({ user: { id: 'user-1' }, body: { mileage: 1200 } } as any, response as any);

    assert.deepEqual(calls, ['user-1']);
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { error: 'Vehicle not found' });
});

test('returns 400 when mileage is below last oil change mileage', async () => {
    const handler = createHealthMileageHandler({
        findVehicleByUserId: async () => ({
            id: 'vehicle-1',
            last_oil_change_mileage: 5000,
        }),
        updateMileage: async () => {
            throw new Error('should not be called');
        },
        buildVehicleWithMaintenanceStatus: async () => null,
    });
    const response = createMockResponse();

    await handler({ user: { id: 'user-1' }, body: { mileage: 4500 } } as any, response as any);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
        error: '現在の走行距離は前回オイル交換時の走行距離以上で入力してください。前回オイル交換時: 5,000km'
    });
});

test('returns 200 with normalized mileage and maintenance status', async () => {
    const calls = {
        updateMileage: [] as Array<{ vehicleId: string; normalizedMileage: number }>,
        buildStatus: [] as string[],
    };
    const updatedVehicle = {
        id: 'vehicle-2',
        current_mileage: 1234,
        last_oil_change_mileage: 1000,
    };
    const healthLog = { id: 'log-1' };
    const vehicleWithStatus = {
        ...updatedVehicle,
        oil_maintenance_status: {
            remaining_km: 3766,
        },
    };
    const handler = createHealthMileageHandler({
        findVehicleByUserId: async () => ({
            id: 'vehicle-2',
            last_oil_change_mileage: 1000,
        }),
        updateMileage: async (vehicle, normalizedMileage) => {
            calls.updateMileage.push({ vehicleId: vehicle.id as string, normalizedMileage });
            return { updatedVehicle, healthLog };
        },
        buildVehicleWithMaintenanceStatus: async (vehicle) => {
            calls.buildStatus.push(vehicle.id as string);
            return vehicleWithStatus;
        },
    });
    const response = createMockResponse();

    await handler({ user: { id: 'user-1' }, body: { mileage: 1234.9 } } as any, response as any);

    assert.deepEqual(calls.updateMileage, [{ vehicleId: 'vehicle-2', normalizedMileage: 1234 }]);
    assert.deepEqual(calls.buildStatus, ['vehicle-2']);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
        message: 'Mileage updated successfully',
        data: {
            vehicle: vehicleWithStatus,
            log: healthLog,
            mileage: 1234,
        },
    });
});

test('returns 500 when update flow throws', async () => {
    const errors: Array<{ message: string; error: unknown }> = [];
    const handler = createHealthMileageHandler({
        findVehicleByUserId: async () => ({
            id: 'vehicle-3',
            last_oil_change_mileage: null,
        }),
        updateMileage: async () => {
            throw new Error('db unavailable');
        },
        buildVehicleWithMaintenanceStatus: async () => null,
        logError: (message, error) => {
            errors.push({ message, error });
        },
    });
    const response = createMockResponse();

    await handler({ user: { id: 'user-1' }, body: { mileage: 100 } } as any, response as any);

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: 'Internal Server Error during mileage update' });
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.message, 'Health Mileage Update Error:');
    assert.equal((errors[0]?.error as Error).message, 'db unavailable');
});
