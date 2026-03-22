const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org';

export type Coordinate = {
    lat: number;
    lng: number;
};

type RouteSummary = {
    distanceKm: number;
    durationMinutes: number;
};

export type RoutePathPoint = {
    latitude: number;
    longitude: number;
    order_index: number;
};

type RoadRoute = RouteSummary & {
    geometry: RoutePathPoint[];
};

type OsrmRouteResponse = {
    code: string;
    routes?: Array<{
        distance: number;
        duration: number;
        geometry?: {
            coordinates: [number, number][];
        };
    }>;
};

const routingBaseUrl = (process.env.ROUTING_BASE_URL || DEFAULT_OSRM_BASE_URL).replace(/\/$/, '');

export async function getRoadRoute(points: Coordinate[]): Promise<RoadRoute> {
    try {
        if (points.length < 2) {
            return {
                distanceKm: 0,
                durationMinutes: 0,
                geometry: points.map((point, index) => ({
                    latitude: point.lat,
                    longitude: point.lng,
                    order_index: index,
                })),
            };
        }

        const coordinates = points
            .map((point) => `${point.lng},${point.lat}`)
            .join(';');

        const url = `${routingBaseUrl}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false&annotations=false`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`routing API returned status ${response.status}`);
        }

        const data = await response.json() as OsrmRouteResponse;
        const route = data.routes?.[0];

        if (data.code !== 'Ok' || !route) {
            throw new Error(`routing API returned no route`);
        }

        return {
            distanceKm: Math.round((route.distance / 1000) * 10) / 10,
            durationMinutes: Math.round(route.duration / 60),
            geometry: (route.geometry?.coordinates || []).map(([lng, lat], index) => ({
                latitude: lat,
                longitude: lng,
                order_index: index,
            })),
        };
    } catch (_error) {
        throw new Error('ルート提案に失敗しました。ネットワーク接続を確認して再度お試しください。');
    }
}

export async function getRoadRouteSummary(points: Coordinate[]): Promise<RouteSummary> {
    const route = await getRoadRoute(points);
    return {
        distanceKm: route.distanceKm,
        durationMinutes: route.durationMinutes,
    };
}
