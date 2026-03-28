import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CreatePage from '../../pages/CreatePage';

const { mockApiFetch } = vi.hoisted(() => ({
    mockApiFetch: vi.fn(),
}));

vi.mock('../../components/BottomNav', () => ({
    default: () => <nav data-testid="bottom-nav" />,
}));

vi.mock('../../src/lib/api', () => ({
    apiFetch: mockApiFetch,
}));

const createProcessedResponse = (dataUrl = 'data:image/jpeg;base64,processed') => ({
    ok: true,
    json: vi.fn().mockResolvedValue({
        data: {
            processed_images: [{
                index: 0,
                filename: 'processed.jpg',
                mime_type: 'image/jpeg',
                data_url: dataUrl,
            }],
        },
    }),
});

const createEmptyProcessedResponse = () => ({
    ok: true,
    json: vi.fn().mockResolvedValue({
        data: {
            processed_images: [],
        },
    }),
});

function renderCreatePage() {
    return render(
        <MemoryRouter initialEntries={['/create']}>
            <CreatePage />
        </MemoryRouter>
    );
}

function getFileInput(container: HTMLElement): HTMLInputElement {
    return container.querySelector('input[type="file"]') as HTMLInputElement;
}

function uploadOneImage(container: HTMLElement, name = 'sample.jpg') {
    const input = getFileInput(container);
    const file = new File(['image-binary'], name, { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    return { input, file };
}

function getLatestFormData(): FormData {
    const options = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1][1];
    return options.body as FormData;
}

describe('CreatePage', () => {
    beforeEach(() => {
        mockApiFetch.mockReset();
        mockApiFetch.mockResolvedValue(createProcessedResponse());

        if (!('createObjectURL' in URL)) {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                writable: true,
                value: vi.fn(),
            });
        }
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-1');
        vi.spyOn(window, 'alert').mockImplementation(() => { });
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        cleanup();
    });

    it('CR-UT-001 初期表示: 主要UIが表示される', () => {
        const { container } = renderCreatePage();
        expect(screen.getByText('Create Editor')).toBeInTheDocument();
        expect(screen.getByText('ADD PHOTOS')).toBeInTheDocument();
        expect(screen.getByText('タップして画像を選択')).toBeInTheDocument();
        expect(screen.getByText('STRENGTH')).toBeInTheDocument();
        expect(screen.getByText('現在値: 50')).toBeInTheDocument();
        expect(container.querySelectorAll('.theme-card').length).toBe(4);
    });

    it('CR-UT-002 初期状態: 保存ボタン非活性と比較スライダー非表示', () => {
        const { container } = renderCreatePage();
        expect(screen.getByRole('button', { name: '画像を保存する' })).toBeDisabled();
        expect(container.querySelector('.comparison-slider')).toBeNull();
        expect(container.querySelector('.img-before')).toBeNull();
        expect(container.querySelector('.img-after')).toBeNull();
        expect(screen.getByTestId('bottom-nav')).toBeInTheDocument();
    });

    it('CR-UT-003 画像選択: プレビュー保持と初期値リセット', async () => {
        const view = renderCreatePage();

        fireEvent.click(screen.getByText('Vintage'));
        const intensitySlider = view.container.querySelector('input[type="range"][min="0"][max="100"]') as HTMLInputElement;
        fireEvent.change(intensitySlider, { target: { value: '72' } });
        expect(screen.getByText('現在値: 72')).toBeInTheDocument();

        uploadOneImage(view.container);
        await waitFor(() => expect(screen.getByText('現在値: 50')).toBeInTheDocument(), { timeout: 2500 });
        expect((URL.createObjectURL as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThan(0);
    });

    it('CR-UT-004 初回自動生成予約: 150ms後に生成API呼び出し', async () => {
        vi.useFakeTimers();
        const view = renderCreatePage();
        const { file } = uploadOneImage(view.container);

        await vi.advanceTimersByTimeAsync(160);
        expect(mockApiFetch).toHaveBeenCalledTimes(1);
        expect(mockApiFetch).toHaveBeenCalledWith('/api/create/generate', expect.objectContaining({
            method: 'POST',
            timeoutMs: 60000,
        }));
        const formData = getLatestFormData();
        expect(formData.get('theme')).toBe('cyberpunk');
        expect(formData.get('intensity')).toBe('50');
        expect(formData.get('images')).toBe(file);
    });

    it('CR-UT-005 テーマ切替: 選択更新と180ms再生成予約', async () => {
        vi.useFakeTimers();
        const view = renderCreatePage();
        uploadOneImage(view.container);
        await vi.advanceTimersByTimeAsync(160);
        mockApiFetch.mockClear();

        fireEvent.click(screen.getByText('Vintage'));
        await vi.advanceTimersByTimeAsync(200);

        expect(mockApiFetch).toHaveBeenCalledTimes(1);
        const formData = getLatestFormData();
        expect(formData.get('theme')).toBe('vintage');
        expect(formData.get('intensity')).toBe('50');
    });

    it('CR-UT-006 強度変更: 現在値表示が更新される', () => {
        const view = renderCreatePage();
        uploadOneImage(view.container);
        const intensitySlider = view.container.querySelector('input[type="range"][min="0"][max="100"]') as HTMLInputElement;
        fireEvent.change(intensitySlider, { target: { value: '72' } });
        expect(screen.getByText('現在値: 72')).toBeInTheDocument();
    });

    it('CR-UT-007 強度操作完了: 120ms再生成予約', async () => {
        vi.useFakeTimers();
        const view = renderCreatePage();
        uploadOneImage(view.container);
        await vi.advanceTimersByTimeAsync(160);
        mockApiFetch.mockClear();

        const intensitySlider = view.container.querySelector('input[type="range"][min="0"][max="100"]:not(.comparison-slider)') as HTMLInputElement;
        fireEvent.change(intensitySlider, { target: { value: '77' } });
        fireEvent.mouseUp(intensitySlider);
        await vi.advanceTimersByTimeAsync(140);

        expect(mockApiFetch).toHaveBeenCalledTimes(1);
        const formData = getLatestFormData();
        expect(formData.get('intensity')).toBe('77');
    });

    it('CR-UT-008 正常応答反映: After画像と比較スライダー表示', async () => {
        const view = renderCreatePage();
        uploadOneImage(view.container);

        await waitFor(() => {
            expect(view.container.querySelector('.img-after')).not.toBeNull();
        }, { timeout: 2500 });
        expect(view.container.querySelector('.comparison-slider')).not.toBeNull();
        expect(screen.getByText('BEFORE')).toBeInTheDocument();
        expect(screen.getByText('AFTER')).toBeInTheDocument();
    });

    it('CR-UT-009 エラー応答: alertなしでBefore維持', async () => {
        mockApiFetch.mockResolvedValueOnce({
            ok: false,
            json: vi.fn().mockResolvedValue({ error: '画像変換に失敗しました。' }),
        });
        const view = renderCreatePage();
        uploadOneImage(view.container);

        await waitFor(() => {
            expect(console.error).toHaveBeenCalled();
        }, { timeout: 2500 });
        expect(window.alert).not.toHaveBeenCalled();
        expect(view.container.querySelector('.img-before')).not.toBeNull();
        expect(view.container.querySelector('.img-after')).toBeNull();
    });

    it('CR-UT-010 AbortError: エラーハンドリングせずUI維持', async () => {
        mockApiFetch.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        const view = renderCreatePage();
        uploadOneImage(view.container);

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalled();
        }, { timeout: 2500 });
        expect(console.error).not.toHaveBeenCalled();
        expect(window.alert).not.toHaveBeenCalled();
        expect(view.container.querySelector('.img-before')).not.toBeNull();
    });

    it('CR-UT-011 多重生成制御: 先行リクエストabortと最新応答のみ反映', async () => {
        vi.useFakeTimers();
        const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

        let resolveFirst: ((value: unknown) => void) | null = null;
        const firstPromise = new Promise((resolve) => { resolveFirst = resolve; });
        mockApiFetch
            .mockImplementationOnce(() => firstPromise as Promise<unknown>)
            .mockResolvedValueOnce(createProcessedResponse('data:image/jpeg;base64,newest'));

        const view = renderCreatePage();
        uploadOneImage(view.container);
        await vi.advanceTimersByTimeAsync(160);
        expect(mockApiFetch).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByText('Vintage'));
        await vi.advanceTimersByTimeAsync(200);
        expect(mockApiFetch).toHaveBeenCalledTimes(2);
        expect(abortSpy).toHaveBeenCalled();

        resolveFirst?.(createProcessedResponse('data:image/jpeg;base64,old'));
        await Promise.resolve();
        await Promise.resolve();

        const afterImage = view.container.querySelector('.img-after') as HTMLImageElement;
        expect(afterImage).not.toBeNull();
        expect(afterImage.src).toContain('data:image/jpeg;base64,newest');
    });

    it('CR-UT-012 保存処理: 加工済み優先、未加工時は元画像', async () => {
        const view = renderCreatePage();
        const originalCreateElement = document.createElement.bind(document);
        const anchor = originalCreateElement('a') as HTMLAnchorElement;
        const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => { });
        const appendSpy = vi.spyOn(document.body, 'appendChild');
        const removeSpy = vi.spyOn(document.body, 'removeChild');
        vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
            if (tagName.toLowerCase() === 'a') {
                return anchor;
            }
            return originalCreateElement(tagName);
        }) as typeof document.createElement);

        uploadOneImage(view.container);
        await waitFor(() => expect(view.container.querySelector('.img-after')).not.toBeNull(), { timeout: 2500 });
        fireEvent.click(screen.getByRole('button', { name: '画像を保存する' }));
        expect(anchor.href).toContain('data:image/jpeg;base64,processed');
        expect(anchor.download).toContain('ride_styled_');
        expect(clickSpy).toHaveBeenCalled();
        expect(appendSpy).toHaveBeenCalled();
        expect(removeSpy).toHaveBeenCalled();

        mockApiFetch.mockResolvedValueOnce(createEmptyProcessedResponse());
        uploadOneImage(view.container, 'sample-2.jpg');
        await waitFor(() => expect(mockApiFetch).toHaveBeenCalled(), { timeout: 2500 });
        fireEvent.click(screen.getByRole('button', { name: '画像を保存する' }));
        expect(anchor.href).toContain('blob:preview-1');
    });

    it('CR-UT-013 アンマウント: clearTimeoutとabort実行', async () => {
        vi.useFakeTimers();
        const clearSpy = vi.spyOn(window, 'clearTimeout');
        const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

        let resolveCall: ((value: unknown) => void) | null = null;
        const pending = new Promise((resolve) => { resolveCall = resolve; });
        mockApiFetch.mockImplementationOnce(() => pending as Promise<unknown>);

        const view = renderCreatePage();
        uploadOneImage(view.container);
        await vi.advanceTimersByTimeAsync(160);
        view.unmount();

        expect(clearSpy).toHaveBeenCalled();
        expect(abortSpy).toHaveBeenCalled();
        resolveCall?.(createProcessedResponse());
    });

    it('CR-UT-014 ファイル未選択ガード: APIを呼ばない', async () => {
        vi.useFakeTimers();
        const view = renderCreatePage();
        fireEvent.click(screen.getByText('Vintage'));
        const intensitySlider = view.container.querySelector('input[type="range"][min="0"][max="100"]') as HTMLInputElement;
        fireEvent.mouseUp(intensitySlider);
        await vi.advanceTimersByTimeAsync(500);
        expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('CR-UT-015 API例外系: reject時もalertなしでログ出力', async () => {
        mockApiFetch.mockRejectedValueOnce(new Error('network fail'));
        const view = renderCreatePage();
        uploadOneImage(view.container);

        await waitFor(() => expect(console.error).toHaveBeenCalled(), { timeout: 2500 });
        expect(window.alert).not.toHaveBeenCalled();
        expect(view.container.querySelector('.img-before')).not.toBeNull();
    });

    it('CR-UT-016 file input再選択: input.valueを空文字へリセット', () => {
        const view = renderCreatePage();
        const { input } = uploadOneImage(view.container);
        expect(input.value).toBe('');
    });

    it('CR-UT-017 保存ボタン無効時: ダウンロード処理未発火', () => {
        renderCreatePage();
        const createElementSpy = vi.spyOn(document, 'createElement');
        fireEvent.click(screen.getByRole('button', { name: '画像を保存する' }));
        expect(createElementSpy).not.toHaveBeenCalledWith('a');
    });

    it('CR-UT-018 無効レスポンス耐性: processed_images欠損でもクラッシュしない', async () => {
        mockApiFetch.mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({ data: {} }),
        });
        const view = renderCreatePage();
        uploadOneImage(view.container);

        await waitFor(() => expect(mockApiFetch).toHaveBeenCalled(), { timeout: 2500 });
        expect(view.container.querySelector('.img-after')).toBeNull();
        expect(view.container.querySelector('.comparison-slider')).toBeNull();
    });
});
