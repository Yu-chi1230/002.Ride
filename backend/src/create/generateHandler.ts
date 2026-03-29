type RequestLike = {
    user?: { id: string };
    body?: {
        theme?: string;
        intensity?: string;
    };
    files?: Array<{
        buffer: Buffer;
        originalname?: string;
    }>;
};

type ResponseLike = {
    status: (code: number) => ResponseLike;
    json: (payload: unknown) => ResponseLike;
};

type TransformedImage = {
    index: number;
    filename: string;
    mime_type: string;
    data_url: string;
};

type Dependencies = {
    isCreateThemeId: (value: string) => boolean;
    applyThemeToImage: (buffer: Buffer, theme: string, intensity: number) => Promise<Buffer>;
    getCreateThemePreset: (theme: string) => { colorLogicMemo: string };
    createCreation: (input: {
        userId: string;
        colorLogicMemo: string;
    }) => Promise<{ id: string }>;
    now?: () => number;
    logError?: (message: string, error: unknown) => void;
};

export const normalizeCreateIntensity = (input: string | undefined) => {
    if (input === undefined) {
        return 50;
    }

    if (input === 'normal') {
        return 50;
    }

    if (input === 'strong') {
        return 100;
    }

    return Number(input);
};

export const createGenerateHandler = ({
    isCreateThemeId,
    applyThemeToImage,
    getCreateThemePreset,
    createCreation,
    now = Date.now,
    logError = console.error,
}: Dependencies) => {
    return async (req: RequestLike, res: ResponseLike) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const userId = req.user.id;
            const theme = req.body?.theme as string | undefined;
            const intensityInput = req.body?.intensity;
            const files = req.files ?? [];

            if (!theme || files.length === 0) {
                return res.status(400).json({ error: 'Theme and at least one image are required' });
            }

            if (!isCreateThemeId(theme)) {
                return res.status(400).json({ error: 'Unsupported theme' });
            }

            const intensity = normalizeCreateIntensity(intensityInput);
            if (!Number.isFinite(intensity) || intensity < 0 || intensity > 100) {
                return res.status(400).json({ error: 'Intensity must be between 0 and 100' });
            }

            const transformedImages: TransformedImage[] = await Promise.all(
                files.map(async (file, index) => {
                    const transformedBuffer = await applyThemeToImage(file.buffer, theme, intensity);
                    return {
                        index,
                        filename: file.originalname || `image-${index + 1}.jpg`,
                        mime_type: 'image/jpeg',
                        data_url: `data:image/jpeg;base64,${transformedBuffer.toString('base64')}`
                    };
                })
            );

            const themePreset = getCreateThemePreset(theme);
            const _mockMediaUrl = `styled_images_${now()}.json`;

            const creation = await createCreation({
                userId,
                colorLogicMemo: themePreset.colorLogicMemo,
            });

            return res.status(200).json({
                message: 'Image style applied successfully',
                data: {
                    creation_id: creation.id,
                    theme,
                    intensity,
                    color_logic_memo: themePreset.colorLogicMemo,
                    processed_images: transformedImages,
                }
            });
        } catch (error) {
            logError('Create Generation API Error:', error);
            return res.status(500).json({ error: 'Internal Server Error during image styling' });
        }
    };
};
