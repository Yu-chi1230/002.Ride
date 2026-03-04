import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const app = express();
const PORT = 8001;

// Allow multiple possible frontend ports
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://10.4.6.3:5173',
    'http://10.4.6.3:5174',
    'http://10.4.6.3:5175'
];

app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Allow localhost, 127.0.0.1, and local network IPs (10.x.x.x, 192.168.x.x, 172.16-31.x.x)
        const isAllowed = /^http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin);

        if (!isAllowed && allowedOrigins.indexOf(origin) === -1) {
            var msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true // Allow cookies and authorization headers
}));
app.use(express.json());

// Initialize Supabase and Prisma
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || ''; // Use anon key for signups
const supabase = createClient(supabaseUrl, supabaseKey);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

app.get('/', (_req, res) => {
    res.json({ message: '🏍️ Ride API is running!', status: 'ok' });
});

app.get('/health', (_req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Extend Express Request to include user
interface AuthRequest extends Request {
    user?: any; // Supabase user type
    file?: Express.Multer.File;
}

// Supabase JWT Verification Middleware
const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];

    // Validate token against Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        console.error('Auth Verification Error:', error?.message);
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    req.user = user;
    next();
};

// Get Current User Profile
app.get('/api/users/me', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.user.id;

        // Fetch profile with vehicles
        const profile = await prisma.profiles.findUnique({
            where: { id: userId },
            include: { vehicles: true } // Assuming relation is named 'vehicles'
        });

        if (!profile) {
            return res.status(404).json({ error: 'Profile not found', hasProfile: false });
        }

        res.json({ data: profile, hasProfile: true });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Update Current User Profile
app.put('/api/users/me', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.user.id;
        const { first_name, last_name, display_name, vehicle_maker, vehicle_model_name } = req.body;

        const updatedProfile = await prisma.$transaction(async (tx) => {
            // Update the profile
            const profile = await tx.profiles.update({
                where: { id: userId },
                data: {
                    first_name: first_name ?? undefined,
                    last_name: last_name ?? undefined,
                    display_name: display_name ?? undefined,
                },
            });

            // Update the first vehicle (assuming single vehicle per user for now)
            // Fetch current vehicle to see if one exists
            let vehicle = await tx.vehicles.findFirst({
                where: { user_id: userId }
            });

            if (vehicle && (vehicle_maker !== undefined || vehicle_model_name !== undefined)) {
                vehicle = await tx.vehicles.update({
                    where: { id: vehicle.id },
                    data: {
                        maker: vehicle_maker ?? undefined,
                        model_name: vehicle_model_name ?? undefined,
                    }
                });
            }

            return { ...profile, vehicles: vehicle ? [vehicle] : [] };
        });

        res.json({ message: 'Profile updated successfully', data: updatedProfile });
    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({ error: 'Internal Server Error during profile update' });
    }
});

// Delete Current User Account
app.delete('/api/users/me', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.user.id;
        console.log(`[DELETE /api/users/me] Attempting to delete user: ${userId}`);

        // We use the raw SQL connection from pg pool (adapter) to safely delete
        // the user from the `auth.users` table. Due to FOREIGN KEY ... ON DELETE CASCADE
        // configured on `public.profiles` and `public.vehicles`, this will automatically
        // clean up all related user data across both schema.

        const deleteRes = await pool.query('DELETE FROM auth.users WHERE id = $1', [userId]);

        if ((deleteRes.rowCount ?? 0) > 0) {
            console.log(`[DELETE /api/users/me] Successfully deleted user ${userId}`);
            res.status(200).json({ message: 'Account deleted successfully' });
        } else {
            console.warn(`[DELETE /api/users/me] User ${userId} not found in auth.users`);
            // Even if not found or already deleted, returning 200 is often safest to clear client state
            res.status(200).json({ message: 'Account already removed or not found' });
        }

    } catch (error) {
        console.error('Error deleting user account:', error);
        res.status(500).json({ error: 'Internal Server Error during account deletion' });
    }
});

// User Onboarding Endpoint (Profile Data only)
app.post('/api/users/onboarding', requireAuth, async (req: AuthRequest, res: Response) => {
    // Ignore userId from body to prevent tampering, use req.user.id from the verified JWT instead.
    const { lastName, firstName, displayName, email, vehicleMaker, vehicleName } = req.body;
    const userId = req.user.id;

    if (!lastName || !firstName || !displayName || !email || !vehicleMaker || !vehicleName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Since Auth is done securely on the frontend, we just Insert or update the Profile using Prisma
        const profile = await prisma.profiles.upsert({
            where: { id: userId },
            update: {
                last_name: lastName,
                first_name: firstName,
                display_name: displayName,
                username: displayName // username is required in schema
            },
            create: {
                id: userId,
                last_name: lastName,
                first_name: firstName,
                display_name: displayName,
                username: displayName // username is required in schema
            }
        });

        // Create the Vehicle record
        const vehicle = await prisma.vehicles.create({
            data: {
                user_id: userId,
                maker: vehicleMaker,
                model_name: vehicleName,
            }
        });

        console.log('Profile Onboarding successful for user:', email);
        res.status(201).json({
            message: 'Onboarding data saved successfully',
            data: { profile, vehicle }
        });
    } catch (error: any) {
        console.error('Onboarding Server Error:', error);
        res.status(500).json({ error: 'Internal Server Error during onboarding' });
    }
});


import multer from 'multer';
import { aiAnalyzer, HealthLogType } from './src/services/aiAnalyzer';

// Multer Setup for handling file uploads (in-memory for mock processing)
const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/health/analyze', requireAuth, upload.single('image'), async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.user.id;
        const logType = req.body.log_type as HealthLogType;
        const file = req.file;

        if (!logType || !file) {
            return res.status(400).json({ error: 'Image file and log_type are required' });
        }

        // Get the user's primary vehicle (assuming 1 vehicle per user for now)
        const vehicle = await prisma.vehicles.findFirst({
            where: { user_id: userId }
        });

        if (!vehicle) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }

        // Trigger the mock AI Analysis
        let analysisResult;
        if (logType === 'meter') {
            analysisResult = await aiAnalyzer.analyzeMeter(file.buffer);

            // If it's a meter and we got a mileage reading, update the vehicle ODO
            if (analysisResult.mileage !== undefined) {
                await prisma.vehicles.update({
                    where: { id: vehicle.id },
                    data: { current_mileage: analysisResult.mileage }
                });
                console.log(`[Health API] Updated ODO for ${vehicle.id} to ${analysisResult.mileage}km`);
            }
        } else {
            // Tire, Chain, Plug, Engine visual checks
            analysisResult = await aiAnalyzer.analyzeComponent(file.buffer, logType);
        }

        // Save the result to health_logs
        const healthLog = await prisma.health_logs.create({
            data: {
                vehicle_id: vehicle.id,
                log_type: logType,
                // In a real app we would upload the buffer to S3/Supabase Storage and save the URL here
                media_url: null,
                detected_mileage: analysisResult.mileage,
                ai_score: analysisResult.score,
                ai_feedback: analysisResult.feedback,
                raw_ai_response: analysisResult.rawResponse
            }
        });

        console.log(`[Health API] Successfully processed ${logType} analysis for user: ${userId}`);
        res.status(200).json({
            message: 'Analysis completed successfully',
            data: {
                log: healthLog,
                analysis: analysisResult
            }
        });

    } catch (error: any) {
        console.error('Health Analyze API Error:', error);
        res.status(500).json({ error: 'Internal Server Error during health analysis' });
    }
});

app.post('/api/health/analyze-audio', requireAuth, upload.single('audio'), async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.user.id;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'Audio file is required' });
        }

        // Get the user's primary vehicle
        const vehicle = await prisma.vehicles.findFirst({
            where: { user_id: userId }
        });

        if (!vehicle) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }

        // Run mock AI engine sound analysis
        const analysisResult = await aiAnalyzer.analyzeEngineSound(file.buffer);

        // Save to health_logs
        const healthLog = await prisma.health_logs.create({
            data: {
                vehicle_id: vehicle.id,
                log_type: 'engine',
                media_url: null,
                ai_score: analysisResult.score,
                ai_feedback: analysisResult.feedback,
                raw_ai_response: analysisResult.rawResponse
            }
        });

        console.log(`[Health API] Engine sound analysis complete for user: ${userId}`);
        res.status(200).json({
            message: 'Engine sound analysis completed',
            data: {
                log: healthLog,
                analysis: analysisResult
            }
        });

    } catch (error: any) {
        console.error('Engine Sound Analysis Error:', error);
        res.status(500).json({ error: 'Internal Server Error during engine sound analysis' });
    }
});

// ===== Explore: ルート生成API =====
import { suggestCinematicSpotsBase } from './src/services/aiRouteService';

app.post('/api/explore/routes', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.user.id;
        const { time_limit_minutes, latitude, longitude } = req.body;

        if (!time_limit_minutes || latitude == null || longitude == null) {
            return res.status(400).json({ error: 'time_limit_minutes, latitude, and longitude are required' });
        }

        // Get the user's primary vehicle
        const vehicle = await prisma.vehicles.findFirst({
            where: { user_id: userId }
        });

        // 1. Gemini API からスポット提案を取得 (Google Maps API がないため直線距離のモックルートを構築)
        const proposalResult = await suggestCinematicSpotsBase(time_limit_minutes, latitude, longitude);
        const generatedRoutes = proposalResult.routes || [];

        const savedRoutesData = [];

        for (const proposal of generatedRoutes) {
            // Calculate simple estimated distance and polyline (straight lines between points)
            let estimatedDistanceKm = 0;
            const allPoints = [
                { lat: latitude, lng: longitude },
                ...proposal.spots.map(s => ({ lat: s.latitude, lng: s.longitude })),
                { lat: latitude, lng: longitude } // Return trip
            ];

            for (let i = 0; i < allPoints.length - 1; i++) {
                estimatedDistanceKm += getDistanceFromLatLonInKm(
                    allPoints[i].lat, allPoints[i].lng,
                    allPoints[i + 1].lat, allPoints[i + 1].lng
                );
            }
            estimatedDistanceKm = Math.round(estimatedDistanceKm * 10) / 10;

            // Waypoints definition (simplified straight-line path for now)
            const waypointsData = allPoints.map((pt, index) => ({
                latitude: pt.lat,
                longitude: pt.lng,
                order_index: index,
            }));

            // Cinematic spots mapping
            const cinematicSpotsData = proposal.spots.map((spot) => ({
                location_name: spot.location_name,
                shooting_guide: spot.shooting_guide,
                sun_angle_data: null, // Default
                latitude: spot.latitude,
                longitude: spot.longitude,
            }));

            // 2. Save routing data to DB using Prisma transaction
            const result = await prisma.$transaction(async (tx) => {
                // Create Route
                const route = await tx.routes.create({
                    data: {
                        user_id: userId,
                        vehicle_id: vehicle?.id ?? null,
                        title: proposal.title,
                        time_limit_minutes: time_limit_minutes,
                        total_distance_km: estimatedDistanceKm,
                    }
                });

                // Create Waypoints
                const waypointRecords = await Promise.all(
                    waypointsData.map((wp) =>
                        tx.waypoints.create({
                            data: {
                                route_id: route.id,
                                latitude: wp.latitude,
                                longitude: wp.longitude,
                                order_index: wp.order_index,
                            }
                        })
                    )
                );

                // Create Spots
                const spotRecords = await Promise.all(
                    cinematicSpotsData.map((spot) =>
                        tx.cinematic_spots.create({
                            data: {
                                route_id: route.id,
                                location_name: spot.location_name,
                                shooting_guide: spot.shooting_guide,
                                sun_angle_data: spot.sun_angle_data ? spot.sun_angle_data : undefined,
                                latitude: spot.latitude,
                                longitude: spot.longitude,
                            }
                        })
                    )
                );

                return { route, waypointRecords, spotRecords };
            });

            savedRoutesData.push({
                route: {
                    id: result.route.id,
                    title: result.route.title,
                    time_limit_minutes: result.route.time_limit_minutes,
                    total_distance_km: result.route.total_distance_km,
                },
                waypoints: result.waypointRecords.map((wp) => ({
                    latitude: wp.latitude,
                    longitude: wp.longitude,
                    order_index: wp.order_index,
                })),
                cinematic_spots: result.spotRecords.map((spot) => ({
                    location_name: spot.location_name,
                    shooting_guide: spot.shooting_guide,
                    latitude: spot.latitude,
                    longitude: spot.longitude,
                }))
            });
        }

        console.log(`[Explore API] Routes generated for user: ${userId}, count: ${savedRoutesData.length}`);
        res.status(200).json({
            message: 'Routes generated successfully',
            data: {
                routes: savedRoutesData
            }
        });

    } catch (error: any) {
        console.error('Explore Route Generation Error:', error);
        res.status(500).json({ error: 'Internal Server Error during route generation' });
    }
});

// ===== Explore: 最新ルート取得API =====
app.get('/api/explore/routes/latest', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.user.id;

        const route = await prisma.routes.findFirst({
            where: { user_id: userId },
            orderBy: { created_at: 'desc' },
        });

        if (!route) {
            return res.status(404).json({ error: 'No routes found' });
        }

        res.status(200).json({
            message: 'Latest route fetched successfully',
            data: { route }
        });
    } catch (error: any) {
        console.error('Explore Latest Route Fetch Error:', error);
        res.status(500).json({ error: 'Internal Server Error fetching latest route' });
    }
});

// ===== Explore: ルート詳細取得API =====
app.get('/api/explore/routes/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const routeId = req.params.id;
        const userId = req.user.id;

        // Fetch route
        const route = await prisma.routes.findUnique({
            where: { id: routeId },
        });

        if (!route) {
            return res.status(404).json({ error: 'Route not found' });
        }

        // Check ownership (optional based on privacy, but safe)
        if (route.user_id !== userId) {
            return res.status(403).json({ error: 'Forbidden: You do not own this route' });
        }

        // Fetch waypoints
        const waypoints = await prisma.waypoints.findMany({
            where: { route_id: routeId },
            orderBy: { order_index: 'asc' },
        });

        // Fetch cinematic spots
        const cinematic_spots = await prisma.cinematic_spots.findMany({
            where: { route_id: routeId },
        });

        res.status(200).json({
            message: 'Route details fetched successfully',
            data: {
                route,
                waypoints,
                cinematic_spots,
            }
        });
    } catch (error: any) {
        console.error('Explore Route Fetch Error:', error);
        res.status(500).json({ error: 'Internal Server Error fetching route details' });
    }
});

// ===== Create: シネマティック動画生成（モック）API =====
import { generateCinematicScript } from './src/services/aiCreateService';

app.post('/api/create/generate', requireAuth, upload.array('images', 10), async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.user.id;
        const theme = req.body.theme as string;
        const files = req.files as Express.Multer.File[];

        if (!theme || !files || files.length === 0) {
            return res.status(400).json({ error: 'Theme and at least one image are required' });
        }

        console.log(`[Create API] Generating script for ${userId}, theme: ${theme}, images: ${files.length}`);

        // 1. Geminiでテーマに沿ったスクリプト（字幕）とカラーロジックを生成
        const scriptResult = await generateCinematicScript(theme, files.length);

        // 2. DB保存 (creations, cinematic_details)
        // 本来はS3等に画像をアップロードしてURLを取得しますが、今回はMVPモックとしてスキップし
        // 最初の画像を代表としてダミーURLを入れます（実際の画像表示はフロントエンドのローカルURL等で行う想定）
        const mockMediaUrl = `mock_generated_video_${Date.now()}.mp4`;

        const creation = await prisma.$transaction(async (tx) => {
            const newCreation = await tx.creations.create({
                data: {
                    user_id: userId,
                    raw_media_url: 'multiple_images_upload', // 本来は元ファイルのS3 URLなど
                    processed_media_url: mockMediaUrl,
                    aspect_ratio: '2.35:1',
                }
            });

            await tx.cinematic_details.create({
                data: {
                    creation_id: newCreation.id,
                    color_logic_memo: scriptResult.color_logic_memo,
                    // narration_script などのカラムがprismaに存在する場合はここに保存
                    // schema上は narration_script String?等がある前提。無い場合は json カラムなどを利用するか適当に保存
                    narration_script: JSON.stringify(scriptResult.script_lines)
                }
            });

            return newCreation;
        });

        console.log(`[Create API] Successfully generated for user: ${userId}, creation: ${creation.id}`);

        // 3. クライアントに結果を返す
        res.status(200).json({
            message: 'Cinematic slideshow generated successfully',
            data: {
                creation_id: creation.id,
                theme: theme,
                color_logic_memo: scriptResult.color_logic_memo,
                script_lines: scriptResult.script_lines,
            }
        });

    } catch (error: any) {
        console.error('Create Generation API Error:', error);
        res.status(500).json({ error: 'Internal Server Error during cinematic generation' });
    }
});

// Helper for distance calculation
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);  // deg2rad below
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
}

function deg2rad(deg: number) {
    return deg * (Math.PI / 180)
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏍️ Ride backend running on http://0.0.0.0:${PORT}`);
});
