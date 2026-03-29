import test from 'node:test';
import assert from 'node:assert/strict';

import { createGenerateHandler, normalizeCreateIntensity } from '../create/generateHandler';

const createMockResponse = () => {
    const response = {
        statusCode: 200,
        body: undefined as unknown,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(payload: unknown) {
            this.body = payload;
            return this;
        },
    };

    return response;
};

test('normalizeCreateIntensity converts presets and numbers', () => {
    assert.equal(normalizeCreateIntensity(undefined), 50);
    assert.equal(normalizeCreateIntensity('normal'), 50);
    assert.equal(normalizeCreateIntensity('strong'), 100);
    assert.equal(normalizeCreateIntensity('75'), 75);
});

test('returns 401 when user is missing', async () => {
    const handler = createGenerateHandler({
        isCreateThemeId: () => true,
        applyThemeToImage: async () => Buffer.from('x'),
        getCreateThemePreset: () => ({ colorLogicMemo: 'memo' }),
        createCreation: async () => ({ id: 'creation-1' }),
    });
    const response = createMockResponse();

    await handler({ body: { theme: 'cyberpunk' }, files: [] } as any, response as any);

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: 'Unauthorized' });
});

test('returns 400 when theme or files are missing', async () => {
    const handler = createGenerateHandler({
        isCreateThemeId: () => true,
        applyThemeToImage: async () => Buffer.from('x'),
        getCreateThemePreset: () => ({ colorLogicMemo: 'memo' }),
        createCreation: async () => ({ id: 'creation-1' }),
    });
    const response = createMockResponse();

    await handler({ user: { id: 'user-1' }, body: {}, files: [] } as any, response as any);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: 'Theme and at least one image are required' });
});

test('returns 400 when theme is unsupported', async () => {
    const handler = createGenerateHandler({
        isCreateThemeId: () => false,
        applyThemeToImage: async () => Buffer.from('x'),
        getCreateThemePreset: () => ({ colorLogicMemo: 'memo' }),
        createCreation: async () => ({ id: 'creation-1' }),
    });
    const response = createMockResponse();

    await handler({
        user: { id: 'user-1' },
        body: { theme: 'invalid' },
        files: [{ buffer: Buffer.from('a') }],
    } as any, response as any);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: 'Unsupported theme' });
});

test('returns 400 when intensity is out of range', async () => {
    const handler = createGenerateHandler({
        isCreateThemeId: () => true,
        applyThemeToImage: async () => Buffer.from('x'),
        getCreateThemePreset: () => ({ colorLogicMemo: 'memo' }),
        createCreation: async () => ({ id: 'creation-1' }),
    });
    const response = createMockResponse();

    await handler({
        user: { id: 'user-1' },
        body: { theme: 'cyberpunk', intensity: '101' },
        files: [{ buffer: Buffer.from('a') }],
    } as any, response as any);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: 'Intensity must be between 0 and 100' });
});

test('passes intensity 50 to image transform when intensity is omitted', async () => {
    const calls: Array<{ theme: string; intensity: number }> = [];
    const handler = createGenerateHandler({
        isCreateThemeId: (value) => value === 'cyberpunk',
        applyThemeToImage: async (_buffer, theme, intensity) => {
            calls.push({ theme, intensity });
            return Buffer.from('styled-default');
        },
        getCreateThemePreset: () => ({ colorLogicMemo: 'memo-default' }),
        createCreation: async () => ({ id: 'creation-default' }),
    });
    const response = createMockResponse();

    await handler({
        user: { id: 'user-1' },
        body: { theme: 'cyberpunk' },
        files: [{ buffer: Buffer.from('a') }],
    } as any, response as any);

    assert.deepEqual(calls, [{ theme: 'cyberpunk', intensity: 50 }]);
    assert.equal(response.statusCode, 200);
});

test('passes intensity 50 to image transform when intensity is normal', async () => {
    const calls: Array<{ theme: string; intensity: number }> = [];
    const handler = createGenerateHandler({
        isCreateThemeId: (value) => value === 'cyberpunk',
        applyThemeToImage: async (_buffer, theme, intensity) => {
            calls.push({ theme, intensity });
            return Buffer.from('styled-normal');
        },
        getCreateThemePreset: () => ({ colorLogicMemo: 'memo-normal' }),
        createCreation: async () => ({ id: 'creation-normal' }),
    });
    const response = createMockResponse();

    await handler({
        user: { id: 'user-1' },
        body: { theme: 'cyberpunk', intensity: 'normal' },
        files: [{ buffer: Buffer.from('a') }],
    } as any, response as any);

    assert.deepEqual(calls, [{ theme: 'cyberpunk', intensity: 50 }]);
    assert.equal(response.statusCode, 200);
});

test('returns 200 with transformed images and creation payload', async () => {
    const calls = {
        apply: [] as Array<{ theme: string; intensity: number; size: number }>,
        create: [] as Array<{ userId: string; colorLogicMemo: string }>,
    };
    const handler = createGenerateHandler({
        isCreateThemeId: (value) => value === 'cyberpunk',
        applyThemeToImage: async (buffer, theme, intensity) => {
            calls.apply.push({ theme, intensity, size: buffer.length });
            return Buffer.from(`styled-${theme}-${intensity}`);
        },
        getCreateThemePreset: () => ({ colorLogicMemo: 'memo-cyberpunk' }),
        createCreation: async (input) => {
            calls.create.push(input);
            return { id: 'creation-1' };
        },
        now: () => 1234567890,
    });
    const response = createMockResponse();

    await handler({
        user: { id: 'user-1' },
        body: { theme: 'cyberpunk', intensity: 'strong' },
        files: [
            { buffer: Buffer.from('a'), originalname: 'first.jpg' },
            { buffer: Buffer.from('bc') },
        ],
    } as any, response as any);

    assert.deepEqual(calls.apply, [
        { theme: 'cyberpunk', intensity: 100, size: 1 },
        { theme: 'cyberpunk', intensity: 100, size: 2 },
    ]);
    assert.deepEqual(calls.create, [{ userId: 'user-1', colorLogicMemo: 'memo-cyberpunk' }]);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
        message: 'Image style applied successfully',
        data: {
            creation_id: 'creation-1',
            theme: 'cyberpunk',
            intensity: 100,
            color_logic_memo: 'memo-cyberpunk',
            processed_images: [
                {
                    index: 0,
                    filename: 'first.jpg',
                    mime_type: 'image/jpeg',
                    data_url: `data:image/jpeg;base64,${Buffer.from('styled-cyberpunk-100').toString('base64')}`
                },
                {
                    index: 1,
                    filename: 'image-2.jpg',
                    mime_type: 'image/jpeg',
                    data_url: `data:image/jpeg;base64,${Buffer.from('styled-cyberpunk-100').toString('base64')}`
                }
            ],
        }
    });
});

test('returns 500 when create flow throws', async () => {
    const errors: Array<{ message: string; error: unknown }> = [];
    const handler = createGenerateHandler({
        isCreateThemeId: () => true,
        applyThemeToImage: async () => {
            throw new Error('sharp failed');
        },
        getCreateThemePreset: () => ({ colorLogicMemo: 'memo' }),
        createCreation: async () => ({ id: 'creation-1' }),
        logError: (message, error) => {
            errors.push({ message, error });
        },
    });
    const response = createMockResponse();

    await handler({
        user: { id: 'user-1' },
        body: { theme: 'cyberpunk', intensity: '50' },
        files: [{ buffer: Buffer.from('a') }],
    } as any, response as any);

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: 'Internal Server Error during image styling' });
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.message, 'Create Generation API Error:');
    assert.equal((errors[0]?.error as Error).message, 'sharp failed');
});
