export type SunAngleData = {
    altitude: number;
    azimuth: number;
    light_phase: string;
    season: string;
    evaluated_at: string;
    best_photo_window_start?: string;
    best_photo_window_end?: string;
    best_photo_window_label?: string;
    best_photo_window_reason?: string;
    preferred_light_direction?: 'front_light' | 'back_light' | 'side_light';
    camera_heading_hint?: number;
};

export type RoutePlanningContext = {
    currentDateTimeIso: string;
    localDateTimeLabel: string;
    season: string;
    timeOfDay: string;
    lightPhase: string;
    startSun: SunAngleData;
};

type LightPreference = 'front_light' | 'back_light' | 'side_light';

const toRadians = (degrees: number) => degrees * (Math.PI / 180);
const toDegrees = (radians: number) => radians * (180 / Math.PI);

const getDayOfYear = (date: Date) => {
    const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0);
    const currentDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return Math.floor((currentDay - startOfYear) / 86400000);
};

const getSeasonLabel = (date: Date) => {
    const month = date.getUTCMonth() + 1;

    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'autumn';
    return 'winter';
};

const getTimeOfDayLabel = (date: Date) => {
    const hour = Number(
        new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit',
            hourCycle: 'h23',
            timeZone: 'Asia/Tokyo',
        }).format(date)
    );

    if (hour < 5) return 'late_night';
    if (hour < 8) return 'early_morning';
    if (hour < 11) return 'morning';
    if (hour < 15) return 'midday';
    if (hour < 18) return 'afternoon';
    if (hour < 19) return 'golden_hour';
    return 'evening';
};

const getLightPhase = (altitude: number) => {
    if (altitude >= 30) return 'hard_daylight';
    if (altitude >= 12) return 'daylight';
    if (altitude >= 0) return 'low_angle_light';
    if (altitude >= -6) return 'blue_hour';
    return 'night';
};

const formatTimeLabel = (date: Date) =>
    new Intl.DateTimeFormat('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: 'Asia/Tokyo',
    }).format(date);

const createJapanTimeDate = (baseDate: Date, hour: number, minute: number) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Tokyo',
    });
    const parts = formatter.formatToParts(baseDate);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    return new Date(`${year}-${month}-${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`);
};

const normalizeAngle = (degrees: number) => ((degrees % 360) + 360) % 360;
const angularDistance = (a: number, b: number) => {
    const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
    return Math.min(diff, 360 - diff);
};

export const calculateBestPhotoWindow = (date: Date) => {
    const season = getSeasonLabel(date);
    const hour = Number(
        new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit',
            hourCycle: 'h23',
            timeZone: 'Asia/Tokyo',
        }).format(date)
    );

    const morningBySeason: Record<string, [number, number, number, number]> = {
        spring: [6, 0, 7, 30],
        summer: [5, 30, 7, 0],
        autumn: [6, 0, 7, 30],
        winter: [6, 30, 8, 0],
    };
    const eveningBySeason: Record<string, [number, number, number, number]> = {
        spring: [16, 30, 18, 0],
        summer: [17, 0, 18, 45],
        autumn: [16, 0, 17, 30],
        winter: [15, 0, 16, 30],
    };

    const useMorningWindow = hour < 11;
    const [startHour, startMinute, endHour, endMinute] = useMorningWindow
        ? morningBySeason[season]
        : eveningBySeason[season];

    const start = createJapanTimeDate(date, startHour, startMinute);
    const end = createJapanTimeDate(date, endHour, endMinute);
    const midpoint = new Date((start.getTime() + end.getTime()) / 2);

    return {
        start,
        end,
        midpoint,
        label: `${formatTimeLabel(start)}-${formatTimeLabel(end)}`,
    };
};

export const calculateDirectionalPhotoWindow = (
    date: Date,
    latitude: number,
    longitude: number,
    preferredLightDirection: LightPreference,
    cameraHeadingHint: number
) => {
    const genericWindow = calculateBestPhotoWindow(date);
    const candidates: Array<{ time: Date; score: number }> = [];

    for (let hour = 5; hour <= 19; hour += 1) {
        for (let minute = 0; minute < 60; minute += 10) {
            if (hour === 19 && minute > 30) {
                continue;
            }

            const time = createJapanTimeDate(date, hour, minute);
            const sun = calculateSunAngleData(time, latitude, longitude);

            if (sun.altitude < 4 || sun.altitude > 38) {
                continue;
            }

            const angleDiff = angularDistance(sun.azimuth, cameraHeadingHint);
            let score = -1;

            if (preferredLightDirection === 'front_light') {
                score = 1 - (angleDiff / 45);
            } else if (preferredLightDirection === 'back_light') {
                score = 1 - (Math.abs(angleDiff - 180) / 45);
            } else {
                score = 1 - (Math.abs(angleDiff - 90) / 35);
            }

            if (score > 0) {
                candidates.push({ time, score });
            }
        }
    }

    if (candidates.length === 0) {
        return {
            ...genericWindow,
            reason: preferredLightDirection === 'front_light'
                ? '順光が入りやすい時間帯'
                : preferredLightDirection === 'back_light'
                    ? '逆光の輪郭光が入りやすい時間帯'
                    : 'サイド光で立体感が出やすい時間帯'
        };
    }

    let bestSegment = { start: candidates[0].time, end: candidates[0].time, score: candidates[0].score };
    let segmentStart = candidates[0].time;
    let segmentEnd = candidates[0].time;
    let segmentScore = candidates[0].score;

    for (let i = 1; i < candidates.length; i += 1) {
        const previous = candidates[i - 1];
        const current = candidates[i];
        const diffMinutes = (current.time.getTime() - previous.time.getTime()) / 60000;

        if (diffMinutes <= 10) {
            segmentEnd = current.time;
            segmentScore += current.score;
        } else {
            if (segmentScore > bestSegment.score) {
                bestSegment = { start: segmentStart, end: segmentEnd, score: segmentScore };
            }
            segmentStart = current.time;
            segmentEnd = current.time;
            segmentScore = current.score;
        }
    }

    if (segmentScore > bestSegment.score) {
        bestSegment = { start: segmentStart, end: segmentEnd, score: segmentScore };
    }

    const midpoint = new Date((bestSegment.start.getTime() + bestSegment.end.getTime()) / 2);
    const reason = preferredLightDirection === 'front_light'
        ? '順光が入りやすい時間帯'
        : preferredLightDirection === 'back_light'
            ? '逆光の輪郭光が入りやすい時間帯'
            : 'サイド光で立体感が出やすい時間帯';

    return {
        start: bestSegment.start,
        end: bestSegment.end,
        midpoint,
        label: `${formatTimeLabel(bestSegment.start)}-${formatTimeLabel(bestSegment.end)}`,
        reason,
    };
};

export const calculateSunAngleData = (date: Date, latitude: number, longitude: number): SunAngleData => {
    const dayOfYear = getDayOfYear(date);
    const utcHours =
        date.getUTCHours() +
        (date.getUTCMinutes() / 60) +
        (date.getUTCSeconds() / 3600);

    const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + ((utcHours - 12) / 24));
    const declination =
        0.006918 -
        0.399912 * Math.cos(gamma) +
        0.070257 * Math.sin(gamma) -
        0.006758 * Math.cos(2 * gamma) +
        0.000907 * Math.sin(2 * gamma) -
        0.002697 * Math.cos(3 * gamma) +
        0.00148 * Math.sin(3 * gamma);

    const equationOfTime =
        229.18 * (
            0.000075 +
            0.001868 * Math.cos(gamma) -
            0.032077 * Math.sin(gamma) -
            0.014615 * Math.cos(2 * gamma) -
            0.040849 * Math.sin(2 * gamma)
        );

    const trueSolarMinutes =
        ((date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60 + equationOfTime + (4 * longitude)) % 1440 + 1440) % 1440;
    const hourAngleDegrees = trueSolarMinutes / 4 < 0
        ? (trueSolarMinutes / 4) + 180
        : (trueSolarMinutes / 4) - 180;

    const latitudeRad = toRadians(latitude);
    const hourAngleRad = toRadians(hourAngleDegrees);

    const cosZenith =
        Math.sin(latitudeRad) * Math.sin(declination) +
        Math.cos(latitudeRad) * Math.cos(declination) * Math.cos(hourAngleRad);

    const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith)));
    const altitude = 90 - toDegrees(zenith);

    const azimuthRad = Math.atan2(
        Math.sin(hourAngleRad),
        Math.cos(hourAngleRad) * Math.sin(latitudeRad) - Math.tan(declination) * Math.cos(latitudeRad)
    );
    const azimuth = (toDegrees(azimuthRad) + 180 + 360) % 360;

    const bestPhotoWindow = calculateBestPhotoWindow(date);

    return {
        altitude: Math.round(altitude * 10) / 10,
        azimuth: Math.round(azimuth * 10) / 10,
        light_phase: getLightPhase(altitude),
        season: getSeasonLabel(date),
        evaluated_at: date.toISOString(),
        best_photo_window_start: bestPhotoWindow.start.toISOString(),
        best_photo_window_end: bestPhotoWindow.end.toISOString(),
        best_photo_window_label: bestPhotoWindow.label,
    };
};

export const buildRoutePlanningContext = (date: Date, latitude: number, longitude: number): RoutePlanningContext => {
    const startSun = calculateSunAngleData(date, latitude, longitude);

    return {
        currentDateTimeIso: date.toISOString(),
        localDateTimeLabel: new Intl.DateTimeFormat('ja-JP', {
            dateStyle: 'full',
            timeStyle: 'short',
            timeZone: 'Asia/Tokyo',
        }).format(date),
        season: getSeasonLabel(date),
        timeOfDay: getTimeOfDayLabel(date),
        lightPhase: startSun.light_phase,
        startSun,
    };
};
