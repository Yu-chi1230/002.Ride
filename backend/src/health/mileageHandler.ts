type Vehicle = {
    id: string;
    last_oil_change_mileage?: number | null;
    [key: string]: unknown;
};

type RequestLike = {
    user?: { id: string };
    body?: { mileage?: unknown };
};

type ResponseLike = {
    status: (code: number) => ResponseLike;
    json: (payload: unknown) => ResponseLike;
};

type Dependencies = {
    findVehicleByUserId: (userId: string) => Promise<Vehicle | null>;
    updateMileage: (vehicle: Vehicle, normalizedMileage: number) => Promise<{
        updatedVehicle: Vehicle;
        healthLog: unknown;
    }>;
    buildVehicleWithMaintenanceStatus: (vehicle: Vehicle) => Promise<unknown>;
    logError?: (message: string, error: unknown) => void;
};

export const createHealthMileageHandler = ({
    findVehicleByUserId,
    updateMileage,
    buildVehicleWithMaintenanceStatus,
    logError = console.error,
}: Dependencies) => {
    return async (req: RequestLike, res: ResponseLike) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const mileage = req.body?.mileage;

            if (mileage === undefined || mileage === null || mileage === '') {
                return res.status(400).json({ error: 'mileage is required' });
            }

            const parsedMileage = Number(mileage);
            if (!Number.isFinite(parsedMileage) || parsedMileage < 0) {
                return res.status(400).json({ error: 'Invalid mileage' });
            }

            const vehicle = await findVehicleByUserId(req.user.id);

            if (!vehicle) {
                return res.status(404).json({ error: 'Vehicle not found' });
            }

            const normalizedMileage = Math.trunc(parsedMileage);

            if (
                vehicle.last_oil_change_mileage !== null &&
                vehicle.last_oil_change_mileage !== undefined &&
                normalizedMileage < vehicle.last_oil_change_mileage
            ) {
                return res.status(400).json({
                    error: `現在の走行距離は前回オイル交換時の走行距離以上で入力してください。前回オイル交換時: ${vehicle.last_oil_change_mileage.toLocaleString()}km`
                });
            }

            const result = await updateMileage(vehicle, normalizedMileage);
            const vehicleWithMaintenanceStatus = await buildVehicleWithMaintenanceStatus(result.updatedVehicle);

            return res.status(200).json({
                message: 'Mileage updated successfully',
                data: {
                    vehicle: vehicleWithMaintenanceStatus,
                    log: result.healthLog,
                    mileage: normalizedMileage
                }
            });
        } catch (error) {
            logError('Health Mileage Update Error:', error);
            return res.status(500).json({ error: 'Internal Server Error during mileage update' });
        }
    };
};
