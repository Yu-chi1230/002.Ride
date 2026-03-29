type RequestLike = {
    user?: { id: string };
    params?: { id?: string };
};

type ResponseLike = {
    status: (code: number) => ResponseLike;
    json: (payload: unknown) => ResponseLike;
};

type RouteRecord = {
    id: string;
    user_id: string;
    [key: string]: unknown;
};

type WaypointRecord = {
    route_id?: string;
    latitude: number;
    longitude: number;
    order_index: number;
    [key: string]: unknown;
};

type Dependencies = {
    findRouteById: (routeId: string) => Promise<RouteRecord | null>;
    findWaypointsByRouteId: (routeId: string) => Promise<WaypointRecord[]>;
    getRouteGeometryFromWaypoints: (waypoints: WaypointRecord[]) => Promise<unknown>;
    findCinematicSpotsByRouteId: (routeId: string) => Promise<unknown[]>;
    logError?: (message: string, error: unknown) => void;
};

export const createRouteDetailsHandler = ({
    findRouteById,
    findWaypointsByRouteId,
    getRouteGeometryFromWaypoints,
    findCinematicSpotsByRouteId,
    logError = console.error,
}: Dependencies) => {
    return async (req: RequestLike, res: ResponseLike) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const routeId = req.params?.id ?? '';
            const route = await findRouteById(routeId);

            if (!route) {
                return res.status(404).json({ error: 'Route not found' });
            }

            if (route.user_id !== req.user.id) {
                return res.status(403).json({ error: 'Forbidden: You do not own this route' });
            }

            const waypoints = await findWaypointsByRouteId(routeId);
            const route_geometry = await getRouteGeometryFromWaypoints(waypoints);
            const cinematic_spots = await findCinematicSpotsByRouteId(routeId);

            return res.status(200).json({
                message: 'Route details fetched successfully',
                data: {
                    route,
                    route_geometry,
                    waypoints,
                    cinematic_spots,
                }
            });
        } catch (error) {
            logError('Explore Route Fetch Error:', error);
            return res.status(500).json({ error: 'Internal Server Error fetching route details' });
        }
    };
};
