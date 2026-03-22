import sharp from 'sharp';

export type CreateThemeId =
    | 'cyberpunk'
    | 'vintage'
    | 'action'
    | 'romantic';

type ThemePreset = {
    colorLogicMemo: string;
    modulate?: {
        brightness?: number;
        saturation?: number;
    };
    linear?: {
        a?: number;
        b?: number;
    };
    sharpen?: boolean;
    tint?: string;
};

const THEME_PRESETS: Record<CreateThemeId, ThemePreset> = {
    cyberpunk: {
        colorLogicMemo: 'シャドウを青緑寄りに冷やしつつ、ネオン感が出るよう彩度とコントラストを強めます。',
        modulate: { brightness: 1.02, saturation: 1.28 },
        linear: { a: 1.08, b: -8 },
        sharpen: true,
        tint: '#8e6cff'
    },
    vintage: {
        colorLogicMemo: '彩度を少し落とし、やわらかい黄褐色寄りのトーンでフィルム感を出します。',
        modulate: { brightness: 0.98, saturation: 0.82 },
        linear: { a: 1.02, b: 3 },
        tint: '#d2b48c'
    },
    action: {
        colorLogicMemo: 'コントラストを上げ、重いシャドウと引き締まった色で緊張感を強めます。',
        modulate: { brightness: 0.96, saturation: 0.9 },
        linear: { a: 1.14, b: -10 },
        sharpen: true
    },
    romantic: {
        colorLogicMemo: '全体をやわらかく明るめに持ち上げ、少し暖かいピンク寄りの空気感を加えます。',
        modulate: { brightness: 1.06, saturation: 0.92 },
        linear: { a: 0.98, b: 6 },
        tint: '#f1b6c6'
    }
};

export const isCreateThemeId = (value: string): value is CreateThemeId => value in THEME_PRESETS;

export const getCreateThemePreset = (theme: CreateThemeId) => THEME_PRESETS[theme];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

async function normalizeImage(buffer: Buffer): Promise<Buffer> {
    const normalizedPipeline = sharp(buffer).rotate().removeAlpha();
    const stats = await normalizedPipeline.stats();
    const channels = stats.channels;

    const redMean = channels[0]?.mean ?? 128;
    const greenMean = channels[1]?.mean ?? 128;
    const blueMean = channels[2]?.mean ?? 128;
    const luminanceMean = (redMean + greenMean + blueMean) / 3;

    const brightness = clamp(128 / Math.max(luminanceMean, 1), 0.88, 1.14);
    const redScale = clamp(greenMean / Math.max(redMean, 1), 0.92, 1.08);
    const blueScale = clamp(greenMean / Math.max(blueMean, 1), 0.92, 1.08);

    return sharp(buffer)
        .rotate()
        .removeAlpha()
        .recomb([
            [redScale, 0, 0],
            [0, 1, 0],
            [0, 0, blueScale],
        ])
        .modulate({ brightness })
        .jpeg({ quality: 94 })
        .toBuffer();
}

export async function applyThemeToImage(buffer: Buffer, theme: CreateThemeId): Promise<Buffer> {
    const preset = THEME_PRESETS[theme];
    const normalizedBuffer = await normalizeImage(buffer);
    let pipeline = sharp(normalizedBuffer).rotate();

    if (preset.modulate) {
        pipeline = pipeline.modulate(preset.modulate);
    }

    if (preset.linear) {
        pipeline = pipeline.linear(preset.linear.a ?? 1, preset.linear.b ?? 0);
    }

    if (preset.tint) {
        pipeline = pipeline.tint(preset.tint);
    }

    if (preset.sharpen) {
        pipeline = pipeline.sharpen();
    }

    return pipeline.jpeg({ quality: 92 }).toBuffer();
}
