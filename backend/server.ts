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
    'http://10.4.6.3:5173',
    'http://10.4.6.3:5174'
];

app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
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
import { generateMockRoute } from './src/services/mockRouteService';

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

        // Generate mock route data
        const mockData = generateMockRoute(time_limit_minutes, latitude, longitude);

        // Save route to DB
        const route = await prisma.routes.create({
            data: {
                user_id: userId,
                vehicle_id: vehicle?.id ?? null,
                title: mockData.title,
                time_limit_minutes: time_limit_minutes,
                total_distance_km: mockData.total_distance_km,
            }
        });

        // Save waypoints
        const waypointRecords = await Promise.all(
            mockData.waypoints.map((wp) =>
                prisma.waypoints.create({
                    data: {
                        route_id: route.id,
                        latitude: wp.latitude,
                        longitude: wp.longitude,
                        order_index: wp.order_index,
                    }
                })
            )
        );

        // Save cinematic spots
        const spotRecords = await Promise.all(
            mockData.cinematic_spots.map((spot) =>
                prisma.cinematic_spots.create({
                    data: {
                        route_id: route.id,
                        location_name: spot.location_name,
                        shooting_guide: spot.shooting_guide,
                        sun_angle_data: spot.sun_angle_data,
                        latitude: spot.latitude,
                        longitude: spot.longitude,
                    }
                })
            )
        );

        console.log(`[Explore API] Route generated for user: ${userId}, route: ${route.id}`);
        res.status(200).json({
            message: 'Route generated successfully',
            data: {
                route: {
                    id: route.id,
                    title: route.title,
                    time_limit_minutes: route.time_limit_minutes,
                    total_distance_km: route.total_distance_km,
                },
                waypoints: waypointRecords.map((wp) => ({
                    latitude: wp.latitude,
                    longitude: wp.longitude,
                    order_index: wp.order_index,
                })),
                cinematic_spots: spotRecords.map((spot) => ({
                    location_name: spot.location_name,
                    shooting_guide: spot.shooting_guide,
                    sun_angle_data: spot.sun_angle_data,
                    latitude: spot.latitude,
                    longitude: spot.longitude,
                })),
            }
        });

    } catch (error: any) {
        console.error('Explore Route Generation Error:', error);
        res.status(500).json({ error: 'Internal Server Error during route generation' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏍️ Ride backend running on http://0.0.0.0:${PORT}`);
});
