import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const app = express();
const PORT = 8001;

app.use(cors());
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


app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏍️ Ride backend running on http://0.0.0.0:${PORT}`);
});
