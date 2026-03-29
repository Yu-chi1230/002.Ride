import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { createLoginHandler } from './src/auth/loginHandler';
import { createLatestRouteHandler } from './src/explore/latestRouteHandler';
import { createRouteDetailsHandler } from './src/explore/routeDetailsHandler';
import { createHealthMileageHandler } from './src/health/mileageHandler';
import { createGenerateHandler } from './src/create/generateHandler';
import {
    OIL_MAINTENANCE_ITEM_NAMES,
    buildVehicleWithMaintenanceStatus,
    hasOilChangeStateChanged,
    syncManualOilChangeHistory
} from './src/settings/maintenance';

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
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const healthMediaBucket = process.env.SUPABASE_HEALTH_MEDIA_BUCKET || 'health-media';
const supabaseAdmin = supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        }
    })
    : null;
const notionToken = process.env.NOTION_TOKEN || '';
const notionContactDatabaseId = process.env.NOTION_CONTACT_DATABASE_ID || '71a9b60a-c40d-4b56-ac87-d39cff04e841';
const notionAnnouncementDatabaseId = process.env.NOTION_ANNOUNCEMENT_DATABASE_ID || 'cebb4ec8-856f-4011-bc7e-1667100bde2a';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const parsePositiveIntOrDefault = (value: string | undefined, fallback: number) => {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parsePositiveNumberOrDefault = (value: string | undefined, fallback: number) => {
    const parsed = Number.parseFloat(value ?? '');
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const LOGIN_MAX_ATTEMPTS = parsePositiveIntOrDefault(process.env.LOGIN_MAX_ATTEMPTS, 5);
const LOGIN_LOCK_MINUTES = parsePositiveIntOrDefault(process.env.LOGIN_LOCK_MINUTES, 15);
const LOGIN_ATTEMPT_WINDOW_MINUTES = parsePositiveIntOrDefault(process.env.LOGIN_ATTEMPT_WINDOW_MINUTES, 30);
const LOGIN_LOCK_MULTIPLIER = parsePositiveNumberOrDefault(process.env.LOGIN_LOCK_MULTIPLIER, 2);
const LOGIN_LOCK_MAX_MINUTES = parsePositiveIntOrDefault(process.env.LOGIN_LOCK_MAX_MINUTES, 24 * 60);

const latestRouteHandler = createLatestRouteHandler({
    findLatestRoute: async (userId) => prisma.routes.findFirst({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
    }),
});

const healthMileageHandler = createHealthMileageHandler({
    findVehicleByUserId: async (userId) => prisma.vehicles.findFirst({
        where: { user_id: userId }
    }),
    updateMileage: async (vehicle, normalizedMileage) => prisma.$transaction(async (tx) => {
        const updatedVehicle = await tx.vehicles.update({
            where: { id: vehicle.id as string },
            data: {
                current_mileage: normalizedMileage
            }
        });

        const healthLog = await tx.health_logs.create({
            data: {
                vehicle_id: vehicle.id as string,
                log_type: 'engine',
                media_url: null,
                detected_mileage: normalizedMileage,
                ai_feedback: '手動ODO入力により走行距離を更新しました。',
                raw_ai_response: {
                    type: 'manual_mileage',
                    mileage: normalizedMileage
                }
            }
        });

        return { updatedVehicle, healthLog };
    }),
    buildVehicleWithMaintenanceStatus: async (vehicle) => buildVehicleWithMaintenanceStatus(prisma, vehicle),
});

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

const inferFileExtension = (file: Express.Multer.File) => {
    const originalExt = extname(file.originalname || '').toLowerCase();
    if (originalExt) {
        return originalExt;
    }

    const mimeToExt: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'audio/webm': '.webm',
        'audio/mpeg': '.mp3',
        'audio/wav': '.wav',
        'audio/x-wav': '.wav',
        'audio/mp4': '.m4a',
    };

    return mimeToExt[file.mimetype] || '';
};

const uploadHealthMediaOrThrow = async (
    file: Express.Multer.File,
    userId: string,
    vehicleId: string,
    mediaType: 'image' | 'audio'
) => {
    if (!supabaseAdmin) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
    }

    const extension = inferFileExtension(file);
    const objectPath = `health/${userId}/${vehicleId}/${mediaType}/${Date.now()}-${randomUUID()}${extension}`;

    const { error } = await supabaseAdmin.storage
        .from(healthMediaBucket)
        .upload(objectPath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
        });

    if (error) {
        throw new Error(`Health media upload failed: ${error.message}`);
    }

    return objectPath;
};

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

const attachOptionalUser = async (req: AuthRequest, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }

    const token = authHeader.split(' ')[1];
    const { data: { user } } = await supabase.auth.getUser(token);

    if (user) {
        req.user = user;
    }

    next();
};

type ContactCategory = 'bug' | 'question' | 'feature' | 'other';

const notionCategoryLabelMap: Record<ContactCategory, string> = {
    bug: '不具合報告',
    question: '使い方の質問',
    feature: '改善要望',
    other: 'その他',
};

const isValidContactCategory = (value: unknown): value is ContactCategory => (
    value === 'bug' || value === 'question' || value === 'feature' || value === 'other'
);

const buildContactSummary = (message: string) => {
    const normalized = message.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 160) {
        return normalized;
    }

    return `${normalized.slice(0, 157)}...`;
};

const isIsoDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const normalizeNotionDate = (value: unknown, options?: { endOfDay?: boolean }): string | null => {
    if (typeof value !== 'string' || !value.trim()) {
        return null;
    }

    if (isIsoDateOnly(value)) {
        const suffix = options?.endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
        return `${value}${suffix}`;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed.toISOString();
};

const toPlainText = (value: unknown): string => {
    if (!Array.isArray(value)) {
        return '';
    }

    return value
        .map((item) => (item && typeof item === 'object' && typeof (item as { plain_text?: unknown }).plain_text === 'string'
            ? (item as { plain_text: string }).plain_text
            : ''))
        .join('')
        .trim();
};

const getNotionTitleText = (properties: Record<string, unknown>, key: string): string => {
    const prop = properties[key];
    if (!prop || typeof prop !== 'object') {
        return '';
    }

    return toPlainText((prop as { title?: unknown }).title);
};

const getNotionRichText = (properties: Record<string, unknown>, key: string): string => {
    const prop = properties[key];
    if (!prop || typeof prop !== 'object') {
        return '';
    }

    return toPlainText((prop as { rich_text?: unknown }).rich_text);
};

const getNotionSelectName = (properties: Record<string, unknown>, key: string): string => {
    const prop = properties[key];
    if (!prop || typeof prop !== 'object') {
        return '';
    }

    const selectName = (prop as { select?: { name?: unknown } }).select?.name;
    if (typeof selectName === 'string') {
        return selectName;
    }

    const statusName = (prop as { status?: { name?: unknown } }).status?.name;
    return typeof statusName === 'string' ? statusName : '';
};

const getNotionDateStart = (properties: Record<string, unknown>, key: string): string | null => {
    const prop = properties[key];
    if (!prop || typeof prop !== 'object') {
        return null;
    }

    const start = (prop as { date?: { start?: unknown } }).date?.start;
    return typeof start === 'string' ? start : null;
};

const isSuperAdmin = async (userId: string): Promise<boolean> => {
    const result = await pool.query<{ is_super_admin: boolean | null }>(
        'select is_super_admin from auth.users where id = $1',
        [userId]
    );

    return result.rows[0]?.is_super_admin === true;
};

type NotionAnnouncement = {
    notionPageId: string;
    title: string;
    content: string;
    startDateIso: string;
    endDateIso: string | null;
    createdAtIso: string;
};

const fetchPublishedNotionAnnouncements = async (): Promise<NotionAnnouncement[]> => {
    const announcements: NotionAnnouncement[] = [];
    let nextCursor: string | null = null;

    while (true) {
        const response = await fetch(`https://api.notion.com/v1/databases/${notionAnnouncementDatabaseId}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${notionToken}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28',
            },
            body: JSON.stringify({
                filter: {
                    property: '公開状態',
                    select: {
                        equals: '公開',
                    },
                },
                ...(nextCursor ? { start_cursor: nextCursor } : {}),
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Notion announcement query failed: ${errorText.slice(0, 500)}`);
        }

        const payload = await response.json() as {
            results?: Array<{
                id?: string;
                created_time?: string;
                properties?: Record<string, unknown>;
            }>;
            has_more?: boolean;
            next_cursor?: string | null;
        };
        const results = Array.isArray(payload.results) ? payload.results : [];

        for (const page of results) {
            if (!page?.id || !page.properties) {
                continue;
            }

            const status = getNotionSelectName(page.properties, '公開状態');
            if (status !== '公開') {
                continue;
            }

            const title = getNotionTitleText(page.properties, 'タイトル');
            const content = getNotionRichText(page.properties, '本文');
            const createdAtIso = normalizeNotionDate(page.created_time) ?? new Date().toISOString();
            const startDateIso = normalizeNotionDate(getNotionDateStart(page.properties, '公開開始')) ?? createdAtIso;
            const endDateIso = normalizeNotionDate(getNotionDateStart(page.properties, '公開終了'), { endOfDay: true });

            if (!title || !content) {
                continue;
            }

            announcements.push({
                notionPageId: page.id,
                title,
                content,
                startDateIso,
                endDateIso,
                createdAtIso,
            });
        }

        if (!payload.has_more || !payload.next_cursor) {
            break;
        }

        nextCursor = payload.next_cursor;
    }

    return announcements;
};

const syncAnnouncementsFromNotion = async (): Promise<{ syncedCount: number; disabledCount: number }> => {
    if (!notionToken) {
        throw new Error('NOTION_TOKEN is not configured');
    }

    if (!notionAnnouncementDatabaseId) {
        throw new Error('NOTION_ANNOUNCEMENT_DATABASE_ID is not configured');
    }

    const announcements = await fetchPublishedNotionAnnouncements();
    const notionPageIds = announcements.map((item) => item.notionPageId);
    let syncedCount = 0;

    for (const item of announcements) {
        await pool.query(
            `insert into public.announcements (
                notion_page_id,
                is_global,
                target_user_id,
                title,
                content,
                start_date,
                end_date,
                created_at
            ) values (
                $1,
                true,
                null,
                $2,
                $3,
                $4::timestamptz,
                $5::timestamptz,
                $6::timestamptz
            )
            on conflict (notion_page_id) where notion_page_id is not null do update
            set is_global = true,
                target_user_id = null,
                title = excluded.title,
                content = excluded.content,
                start_date = excluded.start_date,
                end_date = excluded.end_date`,
            [
                item.notionPageId,
                item.title,
                item.content,
                item.startDateIso,
                item.endDateIso,
                item.createdAtIso,
            ]
        );
        syncedCount += 1;
    }

    const disabledResult = notionPageIds.length > 0
        ? await pool.query(
            `update public.announcements
             set end_date = now()
             where notion_page_id is not null
               and notion_page_id <> all($1::text[])
               and (end_date is null or end_date > now())`,
            [notionPageIds]
        )
        : await pool.query(
            `update public.announcements
             set end_date = now()
             where notion_page_id is not null
               and (end_date is null or end_date > now())`
        );

    return {
        syncedCount,
        disabledCount: disabledResult.rowCount ?? 0,
    };
};

const getLoginAttemptState = async (emailNormalized: string, ipAddress: string) => {
    const result = await pool.query<{ failure_count: number; locked_until: Date | null }>(
        `select failure_count, locked_until
         from public.login_attempts
         where email_normalized = $1 and ip_address = $2`,
        [emailNormalized, ipAddress]
    );

    return result.rows[0] ?? null;
};

const recordLoginFailure = async (emailNormalized: string, ipAddress: string) => {
    const incremented = await pool.query<{ failure_count: number }>(
        `insert into public.login_attempts (
            email_normalized,
            ip_address,
            failure_count,
            locked_until,
            last_attempt_at,
            created_at,
            updated_at
        ) values (
            $1,
            $2,
            1,
            null,
            now(),
            now(),
            now()
        )
        on conflict (email_normalized, ip_address) do update
        set
            failure_count = case
                when public.login_attempts.last_attempt_at < now() - ($3::text || ' minutes')::interval then 1
                else public.login_attempts.failure_count + 1
            end,
            locked_until = null,
            last_attempt_at = now(),
            updated_at = now()
        returning failure_count`,
        [emailNormalized, ipAddress, LOGIN_ATTEMPT_WINDOW_MINUTES]
    );

    const failureCount = incremented.rows[0]?.failure_count ?? 1;
    if (failureCount < LOGIN_MAX_ATTEMPTS) {
        return { failure_count: failureCount, locked_until: null };
    }

    // Lock only when the number of failures reaches each threshold boundary:
    // 5, 10, 15... (with default LOGIN_MAX_ATTEMPTS=5).
    if (failureCount % LOGIN_MAX_ATTEMPTS !== 0) {
        return { failure_count: failureCount, locked_until: null };
    }

    const lockLevel = Math.floor(failureCount / LOGIN_MAX_ATTEMPTS) - 1;
    const rawLockMinutes = LOGIN_LOCK_MINUTES * Math.pow(LOGIN_LOCK_MULTIPLIER, lockLevel);
    const lockMinutes = Math.min(
        LOGIN_LOCK_MAX_MINUTES,
        Math.max(1, Math.ceil(rawLockMinutes))
    );

    const locked = await pool.query<{ failure_count: number; locked_until: Date | null }>(
        `update public.login_attempts
         set locked_until = now() + ($3::text || ' minutes')::interval,
             updated_at = now()
         where email_normalized = $1 and ip_address = $2
         returning failure_count, locked_until`,
        [emailNormalized, ipAddress, lockMinutes]
    );

    return locked.rows[0] ?? { failure_count: failureCount, locked_until: null };
};

const resetLoginAttempts = async (emailNormalized: string) => {
    await pool.query(
        'delete from public.login_attempts where email_normalized = $1',
        [emailNormalized]
    );
};

app.post('/api/auth/login', createLoginHandler({
    signInWithPassword: (params) => supabase.auth.signInWithPassword(params),
    getLoginAttemptState,
    recordLoginFailure,
    resetLoginAttempts,
    logError: (message, error) => console.error(message, error),
}));

app.post('/api/contact', attachOptionalUser, async (req: AuthRequest, res: Response) => {
    const { name, email, category, subject, message, metadata } = req.body ?? {};

    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ error: 'Invalid email' });
    }

    if (!isValidContactCategory(category)) {
        return res.status(400).json({ error: 'Invalid category' });
    }

    if (typeof subject !== 'string' || !subject.trim() || subject.trim().length > 60) {
        return res.status(400).json({ error: 'Invalid subject' });
    }

    if (typeof message !== 'string' || !message.trim() || message.trim().length > 2000) {
        return res.status(400).json({ error: 'Invalid message' });
    }

    const safeMetadata = metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : {};
    const route = typeof safeMetadata.route === 'string' ? safeMetadata.route : '';
    const userId = req.user?.id || (typeof safeMetadata.userId === 'string' ? safeMetadata.userId : '');
    const trimmedName = typeof name === 'string' && name.trim() ? name.trim() : null;
    const trimmedEmail = email.trim();
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();
    const contactSummary = buildContactSummary(trimmedMessage);
    const metadataJson = JSON.stringify({
        ...safeMetadata,
        userId,
    });

    try {
        const insertResult = await pool.query<{
            id: string;
        }>(
            `insert into public.contact_messages (
                email,
                name,
                category,
                subject,
                message,
                metadata,
                status,
                notion_sync_status
            ) values ($1, $2, $3, $4, $5, $6::jsonb, 'new', 'pending')
            returning id`,
            [
                trimmedEmail,
                trimmedName,
                category,
                trimmedSubject,
                trimmedMessage,
                metadataJson,
            ]
        );

        const contactId = insertResult.rows[0]?.id;

        if (!contactId) {
            throw new Error('Failed to create contact record');
        }

        if (!notionToken) {
            await pool.query(
                `update public.contact_messages
                 set notion_sync_status = 'failed',
                     notion_sync_error = $2
                 where id = $1`,
                [contactId, 'NOTION_TOKEN is not configured']
            );

            return res.status(201).json({
                message: 'Contact created successfully',
                contactId,
                notionSyncStatus: 'failed',
            });
        }

        const notionResponse = await fetch('https://api.notion.com/v1/pages', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${notionToken}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28',
            },
            body: JSON.stringify({
                parent: {
                    database_id: notionContactDatabaseId,
                },
                properties: {
                    '件名': {
                        title: [
                            {
                                text: {
                                    content: subject.trim(),
                                },
                            },
                        ],
                    },
                    '種別': {
                        select: {
                            name: notionCategoryLabelMap[category],
                        },
                    },
                    '問い合わせID': {
                        rich_text: [{ text: { content: contactId } }],
                    },
                    '要約': {
                        rich_text: [{ text: { content: contactSummary } }],
                    },
                    'ステータス': {
                        status: {
                            name: '未着手',
                        },
                    },
                },
            }),
        });

        if (!notionResponse.ok) {
            const errorText = await notionResponse.text();
            console.error('Notion contact create error:', errorText);
            await pool.query(
                `update public.contact_messages
                 set notion_sync_status = 'failed',
                     notion_sync_error = $2
                 where id = $1`,
                [contactId, errorText.slice(0, 1000)]
            );

            return res.status(201).json({
                message: 'Contact created successfully',
                contactId,
                notionSyncStatus: 'failed',
            });
        }

        const notionPage = await notionResponse.json() as { id?: string };

        await pool.query(
            `update public.contact_messages
             set notion_sync_status = 'synced',
                 notion_page_id = $2,
                 notion_sync_error = null
             where id = $1`,
            [contactId, notionPage.id ?? null]
        );

        return res.status(201).json({
            message: 'Contact created successfully',
            contactId,
            notionSyncStatus: 'synced',
        });
    } catch (error) {
        console.error('Contact API Error:', error);
        return res.status(500).json({ error: 'Internal Server Error during contact creation' });
    }
});

app.post('/api/admin/announcements/sync', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!await isSuperAdmin(req.user.id)) {
            return res.status(403).json({ error: 'Forbidden: Super admin only' });
        }

        const result = await syncAnnouncementsFromNotion();

        return res.status(200).json({
            message: 'Announcements synced successfully',
            syncedCount: result.syncedCount,
            disabledCount: result.disabledCount,
        });
    } catch (error) {
        console.error('Announcement sync error:', error);
        if (error instanceof Error && error.message.includes('is not configured')) {
            return res.status(500).json({ error: error.message });
        }

        return res.status(500).json({ error: 'Internal Server Error during announcement sync' });
    }
});

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

        const vehiclesWithMaintenanceStatus = await Promise.all(
            profile.vehicles.map((vehicle) => buildVehicleWithMaintenanceStatus(prisma, vehicle))
        );

        res.json({
            data: {
                ...profile,
                vehicles: vehiclesWithMaintenanceStatus
            },
            hasProfile: true
        });
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
        const {
            first_name,
            last_name,
            display_name,
            vehicle_maker,
            vehicle_model_name,
            last_oil_change_mileage,
            last_oil_change_date,
            monthly_avg_mileage,
            oil_change_interval_km
        } = req.body;

        let parsedLastOilChangeMileage: number | null | undefined = undefined;
        if (last_oil_change_mileage !== undefined) {
            if (last_oil_change_mileage === null || last_oil_change_mileage === '') {
                parsedLastOilChangeMileage = null;
            } else {
                const parsed = Number(last_oil_change_mileage);
                if (!Number.isFinite(parsed) || parsed < 0) {
                    return res.status(400).json({ error: 'Invalid last_oil_change_mileage' });
                }
                parsedLastOilChangeMileage = Math.trunc(parsed);
            }
        }

        let parsedLastOilChangeDate: Date | null | undefined = undefined;
        if (last_oil_change_date !== undefined) {
            if (last_oil_change_date === null || last_oil_change_date === '') {
                parsedLastOilChangeDate = null;
            } else if (typeof last_oil_change_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(last_oil_change_date)) {
                parsedLastOilChangeDate = new Date(`${last_oil_change_date}T00:00:00.000Z`);
            } else {
                return res.status(400).json({ error: 'Invalid last_oil_change_date. Use YYYY-MM-DD.' });
            }
        }

        let parsedMonthlyAvgMileage: number | null | undefined = undefined;
        if (monthly_avg_mileage !== undefined) {
            if (monthly_avg_mileage === null || monthly_avg_mileage === '') {
                parsedMonthlyAvgMileage = null;
            } else {
                const parsed = Number(monthly_avg_mileage);
                if (!Number.isFinite(parsed) || parsed < 0) {
                    return res.status(400).json({ error: 'Invalid monthly_avg_mileage' });
                }
                parsedMonthlyAvgMileage = Math.trunc(parsed);
            }
        }

        let parsedOilChangeIntervalKm: number | null | undefined = undefined;
        if (oil_change_interval_km !== undefined) {
            if (oil_change_interval_km === null || oil_change_interval_km === '') {
                parsedOilChangeIntervalKm = null;
            } else {
                const parsed = Number(oil_change_interval_km);
                if (!Number.isFinite(parsed) || parsed < 0) {
                    return res.status(400).json({ error: 'Invalid oil_change_interval_km' });
                }
                parsedOilChangeIntervalKm = Math.trunc(parsed);
            }
        }

        const currentVehicle = await prisma.vehicles.findFirst({
            where: { user_id: userId }
        });

        const currentMileageForValidation = currentVehicle?.current_mileage ?? null;
        const nextLastOilChangeMileage =
            parsedLastOilChangeMileage !== undefined
                ? parsedLastOilChangeMileage
                : currentVehicle?.last_oil_change_mileage;

        if (
            currentMileageForValidation !== null &&
            nextLastOilChangeMileage !== null &&
            nextLastOilChangeMileage !== undefined &&
            currentMileageForValidation < nextLastOilChangeMileage
        ) {
            return res.status(400).json({
                error: '前回オイル交換時の走行距離は現在の走行距離以下で入力してください。'
            });
        }

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

            if (vehicle && (
                vehicle_maker !== undefined ||
                vehicle_model_name !== undefined ||
                parsedLastOilChangeMileage !== undefined ||
                parsedLastOilChangeDate !== undefined ||
                parsedMonthlyAvgMileage !== undefined ||
                parsedOilChangeIntervalKm !== undefined
            )) {
                const previousVehicle = {
                    last_oil_change_mileage: vehicle.last_oil_change_mileage,
                    last_oil_change_date: vehicle.last_oil_change_date
                };

                vehicle = await tx.vehicles.update({
                    where: { id: vehicle.id },
                    data: {
                        maker: vehicle_maker ?? undefined,
                        model_name: vehicle_model_name ?? undefined,
                        last_oil_change_mileage: parsedLastOilChangeMileage,
                        last_oil_change_date: parsedLastOilChangeDate,
                        monthly_avg_mileage: parsedMonthlyAvgMileage,
                    }
                });

                if (
                    (parsedLastOilChangeMileage !== undefined || parsedLastOilChangeDate !== undefined) &&
                    hasOilChangeStateChanged(previousVehicle, {
                        last_oil_change_mileage: vehicle.last_oil_change_mileage,
                        last_oil_change_date: vehicle.last_oil_change_date
                    })
                ) {
                    await syncManualOilChangeHistory(tx, vehicle);
                }

                if (parsedOilChangeIntervalKm !== undefined) {
                    if (parsedOilChangeIntervalKm === null) {
                        await tx.maintenance_settings.deleteMany({
                            where: {
                                vehicle_id: vehicle.id,
                                item_name: { in: OIL_MAINTENANCE_ITEM_NAMES }
                            }
                        });
                    } else {
                        const existingOilSetting = await tx.maintenance_settings.findFirst({
                            where: {
                                vehicle_id: vehicle.id,
                                item_name: { in: OIL_MAINTENANCE_ITEM_NAMES }
                            }
                        });

                        if (existingOilSetting) {
                            if (existingOilSetting.interval_km !== parsedOilChangeIntervalKm) {
                                await tx.maintenance_history.create({
                                    data: {
                                        vehicle_id: vehicle.id,
                                        action_type: 'maintenance_settings更新',
                                        mileage_at_execution:
                                            vehicle.current_mileage ??
                                            vehicle.last_oil_change_mileage ??
                                            0,
                                        notes: `item_name=${existingOilSetting.item_name}, previous_interval_km=${existingOilSetting.interval_km}, next_interval_km=${parsedOilChangeIntervalKm}`
                                    }
                                });
                            }

                            await tx.maintenance_settings.update({
                                where: { id: existingOilSetting.id },
                                data: {
                                    item_name: 'oil',
                                    interval_km: parsedOilChangeIntervalKm
                                }
                            });
                        } else {
                            await tx.maintenance_settings.create({
                                data: {
                                    vehicle_id: vehicle.id,
                                    item_name: 'oil',
                                    interval_km: parsedOilChangeIntervalKm
                                }
                            });
                        }
                    }
                }
            }

            const vehiclesWithMaintenanceStatus = vehicle
                ? [await buildVehicleWithMaintenanceStatus(tx, vehicle)]
                : [];

            return { ...profile, vehicles: vehiclesWithMaintenanceStatus };
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
        const manualMileageInput = req.body.manual_mileage;
        const file = req.file;

        if (!logType || !file) {
            return res.status(400).json({ error: 'Image file and log_type are required' });
        }

        const allowedVisualTypes: HealthLogType[] = ['tire', 'chain', 'plug', 'engine'];
        if (!allowedVisualTypes.includes(logType)) {
            return res.status(400).json({ error: 'Unsupported log_type' });
        }

        let manualMileage: number | null = null;
        if (manualMileageInput !== undefined && manualMileageInput !== null && manualMileageInput !== '') {
            const parsedManualMileage = Number(manualMileageInput);
            if (!Number.isFinite(parsedManualMileage) || parsedManualMileage < 0) {
                return res.status(400).json({ error: 'Invalid manual_mileage' });
            }
            manualMileage = Math.trunc(parsedManualMileage);
        }

        // Get the user's primary vehicle (assuming 1 vehicle per user for now)
        const vehicle = await prisma.vehicles.findFirst({
            where: { user_id: userId }
        });

        if (!vehicle) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }

        if (
            manualMileage !== null &&
            vehicle.last_oil_change_mileage !== null &&
            vehicle.last_oil_change_mileage !== undefined &&
            manualMileage < vehicle.last_oil_change_mileage
        ) {
            return res.status(400).json({
                error: `現在の走行距離は前回オイル交換時の走行距離以上で入力してください。前回オイル交換時: ${vehicle.last_oil_change_mileage.toLocaleString()}km`
            });
        }

        // Tire, Chain, Plug, Engine visual checks
        const analysisResult = await aiAnalyzer.analyzeComponent(file.buffer, logType, file.mimetype);
        const mileageToSave = manualMileage ?? analysisResult.mileage ?? null;
        const scoreToSave = analysisResult.isTargetDetected === false ? null : analysisResult.score;
        const mediaPath = await uploadHealthMediaOrThrow(file, userId, vehicle.id, 'image');

        const result = await prisma.$transaction(async (tx) => {
            const healthLog = await tx.health_logs.create({
                data: {
                    vehicle_id: vehicle.id,
                    log_type: logType,
                    media_url: mediaPath,
                    detected_mileage: mileageToSave,
                    ai_score: scoreToSave,
                    ai_feedback: analysisResult.feedback,
                    raw_ai_response: analysisResult.rawResponse
                }
            });

            let updatedVehicle = vehicle;
            if (mileageToSave !== null) {
                updatedVehicle = await tx.vehicles.update({
                    where: { id: vehicle.id },
                    data: {
                        current_mileage: mileageToSave
                    }
                });
            }

            return { healthLog, updatedVehicle };
        });

        console.log(`[Health API] Successfully processed ${logType} analysis for user: ${userId}`);
        res.status(200).json({
            message: 'Analysis completed successfully',
            data: {
                log: result.healthLog,
                analysis: {
                    ...analysisResult,
                    mileage: mileageToSave,
                    mileageSource: manualMileage !== null ? 'manual' : (analysisResult.mileage !== undefined ? 'ai' : null)
                },
                vehicle: result.updatedVehicle
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

        // Run Gemini-based engine sound analysis
        const analysisResult = await aiAnalyzer.analyzeEngineSound(file.buffer, file.mimetype);
        const scoreToSave = analysisResult.isEngineSound === false ? null : analysisResult.score;
        const mediaPath = await uploadHealthMediaOrThrow(file, userId, vehicle.id, 'audio');

        // Save to health_logs
        const healthLog = await prisma.health_logs.create({
            data: {
                vehicle_id: vehicle.id,
                log_type: 'engine',
                media_url: mediaPath,
                ai_score: scoreToSave,
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

app.put('/api/health/mileage', requireAuth, healthMileageHandler as any);

// ===== Explore: ルート生成API =====
import { suggestCinematicSpotsBase } from './src/services/aiRouteService';
import { Coordinate, getRoadRoute } from './src/services/routingService';
import { buildRoutePlanningContext, calculateDirectionalPhotoWindow, calculateSunAngleData } from './src/services/sunService';

const getRouteGeometryFromWaypoints = async (waypoints: Array<{ latitude: number; longitude: number }>) => {
    if (waypoints.length < 2) {
        return waypoints.map((wp, index) => ({
            latitude: wp.latitude,
            longitude: wp.longitude,
            order_index: index,
        }));
    }

    try {
        const route = await getRoadRoute(
            waypoints.map((wp) => ({ lat: wp.latitude, lng: wp.longitude }))
        );

        return route.geometry.length > 0
            ? route.geometry
            : waypoints.map((wp, index) => ({
                latitude: wp.latitude,
                longitude: wp.longitude,
                order_index: index,
            }));
    } catch (error) {
        console.warn('Failed to compute route geometry, falling back to waypoints:', error);
        return waypoints.map((wp, index) => ({
            latitude: wp.latitude,
            longitude: wp.longitude,
            order_index: index,
        }));
    }
};

const rankRoutesByUpcomingPhotoTiming = <T extends {
    route?: { total_distance_km?: number | null };
    cinematic_spots: Array<{ best_photo_time?: Date | string | null }>;
}>(
    routes: T[],
    now: Date
) => {
    const nowTime = now.getTime();

    return [...routes].sort((left, right) => {
        const getNextPhotoTimeDiff = (route: T) => {
            const futureDiffs = route.cinematic_spots
                .map((spot) => {
                    if (!spot.best_photo_time) {
                        return null;
                    }

                    const photoTime = new Date(spot.best_photo_time).getTime();
                    const diff = photoTime - nowTime;
                    return diff >= 0 ? diff : null;
                })
                .filter((value): value is number => value !== null)
                .sort((a, b) => a - b);

            return futureDiffs[0] ?? Number.POSITIVE_INFINITY;
        };

        const leftDiff = getNextPhotoTimeDiff(left);
        const rightDiff = getNextPhotoTimeDiff(right);

        if (leftDiff !== rightDiff) {
            return leftDiff - rightDiff;
        }

        const leftDistance = left.route?.total_distance_km ?? Number.POSITIVE_INFINITY;
        const rightDistance = right.route?.total_distance_km ?? Number.POSITIVE_INFINITY;
        return leftDistance - rightDistance;
    });
};

const routeDetailsHandler = createRouteDetailsHandler({
    findRouteById: async (routeId) => prisma.routes.findUnique({
        where: { id: routeId },
    }),
    findWaypointsByRouteId: async (routeId) => prisma.waypoints.findMany({
        where: { route_id: routeId },
        orderBy: { order_index: 'asc' },
    }),
    getRouteGeometryFromWaypoints,
    findCinematicSpotsByRouteId: async (routeId) => prisma.cinematic_spots.findMany({
        where: { route_id: routeId },
    }),
});

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

        const planningDate = new Date();
        const planningContext = buildRoutePlanningContext(planningDate, latitude, longitude);

        // 1. Gemini API からスポット提案を取得
        const proposalResult = await suggestCinematicSpotsBase(
            time_limit_minutes,
            latitude,
            longitude,
            planningContext
        );
        const generatedRoutes = proposalResult.routes || [];

        const savedRoutesData = [];

        for (const proposal of generatedRoutes) {
            const allPoints = [
                { lat: latitude, lng: longitude },
                ...proposal.spots.map(s => ({ lat: s.latitude, lng: s.longitude })),
                { lat: latitude, lng: longitude } // Return trip
            ];

            const roadRoute = await getRoadRoute(allPoints as Coordinate[]);
            const estimatedDistanceKm = roadRoute.distanceKm;

            // Waypoints definition (simplified straight-line path for now)
            const waypointsData = allPoints.map((pt, index) => ({
                latitude: pt.lat,
                longitude: pt.lng,
                order_index: index,
            }));

            // Cinematic spots mapping
            const cinematicSpotsData = proposal.spots.map((spot) => {
                const bestPhotoWindow = calculateDirectionalPhotoWindow(
                    planningDate,
                    spot.latitude,
                    spot.longitude,
                    spot.preferred_light_direction,
                    spot.camera_heading_hint
                );
                const sunAngleData = {
                    ...calculateSunAngleData(bestPhotoWindow.midpoint, spot.latitude, spot.longitude),
                    best_photo_window_start: bestPhotoWindow.start.toISOString(),
                    best_photo_window_end: bestPhotoWindow.end.toISOString(),
                    best_photo_window_label: bestPhotoWindow.label,
                    best_photo_window_reason: bestPhotoWindow.reason,
                    preferred_light_direction: spot.preferred_light_direction,
                    camera_heading_hint: spot.camera_heading_hint,
                };

                return {
                    best_photo_time: bestPhotoWindow.midpoint,
                    location_name: spot.location_name,
                    shooting_guide: spot.shooting_guide,
                    sun_angle_data: sunAngleData,
                    latitude: spot.latitude,
                    longitude: spot.longitude,
                };
            });

            // 2. Save routing data to DB using Prisma transaction
            const result = await prisma.$transaction(async (tx) => {
                // Create Route
                const route = await tx.routes.create({
                    data: {
                        user_id: userId,
                        vehicle_id: vehicle?.id ?? null,
                        title: proposal.title ? proposal.title.slice(0, 15) : "新規ルート",
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
                                best_photo_time: spot.best_photo_time,
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
                route_geometry: roadRoute.geometry,
                waypoints: result.waypointRecords.map((wp) => ({
                    latitude: wp.latitude,
                    longitude: wp.longitude,
                    order_index: wp.order_index,
                })),
                cinematic_spots: result.spotRecords.map((spot) => ({
                    best_photo_time: spot.best_photo_time,
                    location_name: spot.location_name,
                    shooting_guide: spot.shooting_guide,
                    sun_angle_data: spot.sun_angle_data,
                    latitude: spot.latitude,
                    longitude: spot.longitude,
                }))
            });
        }

        const rankedRoutes = rankRoutesByUpcomingPhotoTiming(savedRoutesData, planningDate);

        console.log(`[Explore API] Routes generated for user: ${userId}, count: ${rankedRoutes.length}`);
        res.status(200).json({
            message: 'Routes generated successfully',
            data: {
                routes: rankedRoutes
            }
        });

    } catch (error: any) {
        console.error('Explore Route Generation Error:', error);
        const isRoutingError = typeof error?.message === 'string' && error.message.includes('Routing service error:');
        res.status(500).json({
            error: isRoutingError
                ? error.message
                : 'ルート生成中に予期しないエラーが発生しました。時間をおいて再度お試しください。'
        });
    }
});

// ===== Explore: 最新ルート取得API =====
app.get('/api/explore/routes/latest', requireAuth, latestRouteHandler as any);

// ===== Explore: ルート詳細取得API =====
app.get('/api/explore/routes/:id', requireAuth, routeDetailsHandler as any);

// ===== Create: シネマティック画像スタイル変換 API =====
import { applyThemeToImage, getCreateThemePreset, isCreateThemeId } from './src/services/imageStyleService';

const createGenerateHandlerInstance = createGenerateHandler({
    isCreateThemeId,
    applyThemeToImage: (buffer, theme, intensity) => applyThemeToImage(buffer, theme as any, intensity),
    getCreateThemePreset: (theme) => getCreateThemePreset(theme as any),
    createCreation: async ({ userId, colorLogicMemo }) => {
        const mockMediaUrl = `styled_images_${Date.now()}.json`;

        const creation = await prisma.$transaction(async (tx) => {
            const newCreation = await tx.creations.create({
                data: {
                    user_id: userId,
                    raw_media_url: 'multiple_images_upload',
                    processed_media_url: mockMediaUrl,
                    aspect_ratio: '2.35:1',
                }
            });

            await tx.cinematic_details.create({
                data: {
                    creation_id: newCreation.id,
                    color_logic_memo: colorLogicMemo,
                    narration_script: null
                }
            });

            return newCreation;
        });

        return { id: creation.id };
    },
});

app.post('/api/create/generate', requireAuth, upload.array('images', 10), createGenerateHandlerInstance as any);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏍️ Ride backend running on http://0.0.0.0:${PORT}`);
});
