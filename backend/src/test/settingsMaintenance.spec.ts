import test from 'node:test';
import assert from 'node:assert/strict';

import {
    MANUAL_OIL_CHANGE_HISTORY_NOTE_MARKER,
    buildVehicleWithMaintenanceStatus,
    hasOilChangeStateChanged,
    syncManualOilChangeHistory,
} from '../settings/maintenance';

test('buildVehicleWithMaintenanceStatus returns remaining distance and overdue flag', async () => {
    const calls: unknown[] = [];
    const db = {
        maintenance_settings: {
            findFirst: async (args: unknown) => {
                calls.push(args);
                return {
                    item_name: 'oil',
                    interval_km: 5000,
                };
            },
        },
    };

    const result = await buildVehicleWithMaintenanceStatus(db, {
        id: 'vehicle-1',
        current_mileage: 15000,
        last_oil_change_mileage: 12000,
    });

    assert.equal(calls.length, 1);
    assert.deepEqual(result.oil_maintenance_status, {
        item_name: 'oil',
        interval_km: 5000,
        distance_since_last_change: 3000,
        remaining_km: 2000,
        is_overdue: false,
    });
});

test('buildVehicleWithMaintenanceStatus marks overdue when remaining distance is zero or less', async () => {
    const db = {
        maintenance_settings: {
            findFirst: async () => ({
                item_name: 'engine_oil',
                interval_km: 3000,
            }),
        },
    };

    const result = await buildVehicleWithMaintenanceStatus(db, {
        id: 'vehicle-2',
        current_mileage: 15200,
        last_oil_change_mileage: 12000,
    });

    assert.deepEqual(result.oil_maintenance_status, {
        item_name: 'engine_oil',
        interval_km: 3000,
        distance_since_last_change: 3200,
        remaining_km: -200,
        is_overdue: true,
    });
});

test('buildVehicleWithMaintenanceStatus returns null status when no oil setting exists', async () => {
    const db = {
        maintenance_settings: {
            findFirst: async () => null,
        },
    };

    const result = await buildVehicleWithMaintenanceStatus(db, {
        id: 'vehicle-3',
        current_mileage: 15000,
        last_oil_change_mileage: 12000,
    });

    assert.equal(result.oil_maintenance_status, null);
});

test('buildVehicleWithMaintenanceStatus returns null remaining distance when mileage data is missing', async () => {
    const db = {
        maintenance_settings: {
            findFirst: async () => ({
                item_name: 'oil',
                interval_km: 5000,
            }),
        },
    };

    const result = await buildVehicleWithMaintenanceStatus(db, {
        id: 'vehicle-4',
        current_mileage: null,
        last_oil_change_mileage: 12000,
    });

    assert.deepEqual(result.oil_maintenance_status, {
        item_name: 'oil',
        interval_km: 5000,
        distance_since_last_change: null,
        remaining_km: null,
        is_overdue: false,
    });
});

test('hasOilChangeStateChanged detects mileage and date changes at date-only granularity', () => {
    assert.equal(hasOilChangeStateChanged(
        {
            last_oil_change_mileage: 1000,
            last_oil_change_date: new Date('2026-03-10T00:00:00.000Z'),
        },
        {
            last_oil_change_mileage: 1000,
            last_oil_change_date: new Date('2026-03-10T12:34:56.000Z'),
        }
    ), false);

    assert.equal(hasOilChangeStateChanged(
        {
            last_oil_change_mileage: 1000,
            last_oil_change_date: new Date('2026-03-10T00:00:00.000Z'),
        },
        {
            last_oil_change_mileage: 1200,
            last_oil_change_date: new Date('2026-03-10T00:00:00.000Z'),
        }
    ), true);
});

test('hasOilChangeStateChanged handles null comparisons', () => {
    assert.equal(hasOilChangeStateChanged(
        {
            last_oil_change_mileage: null,
            last_oil_change_date: null,
        },
        {
            last_oil_change_mileage: null,
            last_oil_change_date: null,
        }
    ), false);

    assert.equal(hasOilChangeStateChanged(
        {
            last_oil_change_mileage: null,
            last_oil_change_date: null,
        },
        {
            last_oil_change_mileage: 1200,
            last_oil_change_date: null,
        }
    ), true);

    assert.equal(hasOilChangeStateChanged(
        {
            last_oil_change_mileage: 1200,
            last_oil_change_date: new Date('2026-03-10T00:00:00.000Z'),
        },
        {
            last_oil_change_mileage: 1200,
            last_oil_change_date: null,
        }
    ), true);
});

test('syncManualOilChangeHistory recreates manual history entry when mileage exists', async () => {
    const calls = {
        deleteMany: [] as unknown[],
        create: [] as unknown[],
    };
    const tx = {
        maintenance_history: {
            deleteMany: async (args: unknown) => {
                calls.deleteMany.push(args);
            },
            create: async (args: unknown) => {
                calls.create.push(args);
            },
        },
    };

    await syncManualOilChangeHistory(tx, {
        id: 'vehicle-5',
        last_oil_change_mileage: 12345,
        last_oil_change_date: new Date('2026-03-20T00:00:00.000Z'),
    });

    assert.equal(calls.deleteMany.length, 1);
    assert.deepEqual(calls.deleteMany[0], {
        where: {
            vehicle_id: 'vehicle-5',
            action_type: 'オイル交換',
            notes: { contains: MANUAL_OIL_CHANGE_HISTORY_NOTE_MARKER },
        },
    });
    assert.equal(calls.create.length, 1);
    assert.deepEqual(calls.create[0], {
        data: {
            vehicle_id: 'vehicle-5',
            action_type: 'オイル交換',
            executed_at: new Date('2026-03-20T00:00:00.000Z'),
            mileage_at_execution: 12345,
            notes: 'source=manual_oil_change_registration, last_oil_change_date=2026-03-20, last_oil_change_mileage=12345',
        },
    });
});

test('syncManualOilChangeHistory only clears manual history when mileage is absent', async () => {
    const calls = {
        deleteMany: [] as unknown[],
        create: [] as unknown[],
    };
    const tx = {
        maintenance_history: {
            deleteMany: async (args: unknown) => {
                calls.deleteMany.push(args);
            },
            create: async (args: unknown) => {
                calls.create.push(args);
            },
        },
    };

    await syncManualOilChangeHistory(tx, {
        id: 'vehicle-6',
        last_oil_change_mileage: null,
        last_oil_change_date: null,
    });

    assert.equal(calls.deleteMany.length, 1);
    assert.equal(calls.create.length, 0);
});
