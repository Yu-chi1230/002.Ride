export const OIL_MAINTENANCE_ITEM_NAMES = ['oil', 'engine_oil'];
export const MANUAL_OIL_CHANGE_HISTORY_NOTE_MARKER = 'source=manual_oil_change_registration';

type VehicleRecord = {
    id: string;
    current_mileage?: number | null;
    last_oil_change_mileage?: number | null;
    last_oil_change_date?: Date | null;
    [key: string]: unknown;
};

export const formatDateOnly = (value: Date | null | undefined) => {
    if (!value) {
        return null;
    }

    return value.toISOString().slice(0, 10);
};

export const hasOilChangeStateChanged = (
    previousVehicle: { last_oil_change_mileage: number | null; last_oil_change_date: Date | null },
    nextVehicle: { last_oil_change_mileage: number | null; last_oil_change_date: Date | null }
) => {
    return previousVehicle.last_oil_change_mileage !== nextVehicle.last_oil_change_mileage ||
        formatDateOnly(previousVehicle.last_oil_change_date) !== formatDateOnly(nextVehicle.last_oil_change_date);
};

export const buildVehicleWithMaintenanceStatus = async (
    db: any,
    vehicle: VehicleRecord
) => {
    const oilSetting = await db.maintenance_settings.findFirst({
        where: {
            vehicle_id: vehicle.id,
            item_name: { in: OIL_MAINTENANCE_ITEM_NAMES }
        }
    });

    const currentMileage = vehicle.current_mileage;
    const lastOilChangeMileage = vehicle.last_oil_change_mileage;
    const distanceSinceLastChange =
        currentMileage !== null &&
            currentMileage !== undefined &&
            lastOilChangeMileage !== null &&
            lastOilChangeMileage !== undefined
            ? Math.max(0, currentMileage - lastOilChangeMileage)
            : null;

    const remainingKm =
        oilSetting && distanceSinceLastChange !== null
            ? oilSetting.interval_km - distanceSinceLastChange
            : null;

    return {
        ...vehicle,
        oil_maintenance_status: oilSetting ? {
            item_name: oilSetting.item_name,
            interval_km: oilSetting.interval_km,
            distance_since_last_change: distanceSinceLastChange,
            remaining_km: remainingKm,
            is_overdue: remainingKm !== null ? remainingKm <= 0 : false
        } : null
    };
};

export const syncManualOilChangeHistory = async (
    tx: any,
    vehicle: { id: string; last_oil_change_mileage: number | null; last_oil_change_date: Date | null }
) => {
    await tx.maintenance_history.deleteMany({
        where: {
            vehicle_id: vehicle.id,
            action_type: 'オイル交換',
            notes: { contains: MANUAL_OIL_CHANGE_HISTORY_NOTE_MARKER }
        }
    });

    if (vehicle.last_oil_change_mileage === null || vehicle.last_oil_change_mileage === undefined) {
        return;
    }

    const noteParts = [MANUAL_OIL_CHANGE_HISTORY_NOTE_MARKER];

    if (vehicle.last_oil_change_date) {
        noteParts.push(`last_oil_change_date=${formatDateOnly(vehicle.last_oil_change_date)}`);
    }

    noteParts.push(`last_oil_change_mileage=${vehicle.last_oil_change_mileage}`);

    await tx.maintenance_history.create({
        data: {
            vehicle_id: vehicle.id,
            action_type: 'オイル交換',
            executed_at: vehicle.last_oil_change_date ?? new Date(),
            mileage_at_execution: vehicle.last_oil_change_mileage,
            notes: noteParts.join(', ')
        }
    });
};
