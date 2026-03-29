type FindLatestRoute = (userId: string) => Promise<unknown | null>;

type ResponseLike = {
    status: (code: number) => ResponseLike;
    json: (payload: unknown) => ResponseLike;
};

type RequestLike = {
    user?: { id: string };
};

type Dependencies = {
    findLatestRoute: FindLatestRoute;
    logError?: (message: string, error: unknown) => void;
};

export const createLatestRouteHandler = ({
    findLatestRoute,
    logError = console.error,
}: Dependencies) => {
    return async (req: RequestLike, res: ResponseLike) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const route = await findLatestRoute(req.user.id);

            if (!route) {
                return res.status(404).json({ error: 'No routes found' });
            }

            return res.status(200).json({
                message: 'Latest route fetched successfully',
                data: { route },
            });
        } catch (error) {
            logError('Explore Latest Route Fetch Error:', error);
            return res.status(500).json({ error: 'Internal Server Error fetching latest route' });
        }
    };
};
