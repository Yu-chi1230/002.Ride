import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HealthPage from '../../pages/HealthPage';

const {
    mockApiFetch,
    mockCreateObjectURL,
    mockAlert,
} = vi.hoisted(() => ({
    mockApiFetch: vi.fn(),
    mockCreateObjectURL: vi.fn(),
    mockAlert: vi.fn(),
}));

vi.mock('../lib/api', () => ({
    apiFetch: mockApiFetch,
}));

vi.mock('../../components/BottomNav', () => ({
    default: () => <div data-testid="bottom-nav" />,
}));

function renderHealthPage() {
    return render(
        <MemoryRouter initialEntries={['/health']}>
            <HealthPage />
        </MemoryRouter>
    );
}

function createResponse(ok: boolean, jsonData: unknown = {}, status = ok ? 200 : 400) {
    return {
        ok,
        status,
        json: vi.fn().mockResolvedValue(jsonData),
    };
}

describe('HealthPage', () => {
    beforeEach(() => {
        mockApiFetch.mockReset();
        mockCreateObjectURL.mockReset();
        mockAlert.mockReset();

        mockCreateObjectURL.mockReturnValue('blob:preview-file');
        mockApiFetch.mockResolvedValue(createResponse(true, {}));

        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('alert', mockAlert);
        vi.stubGlobal('URL', {
            ...URL,
            createObjectURL: mockCreateObjectURL,
        });
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        cleanup();
    });

    it('HP-UT-001 初期表示: ヘッダーと既定モードが表示される', () => {
        renderHealthPage();

        expect(screen.getByRole('heading', { level: 1, name: 'Health Check' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'エンジン診断' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '目視点検' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '手動ODO' })).toBeInTheDocument();
        expect(screen.getByText('エンジンを始動し、録音ボタンを押してください')).toBeInTheDocument();
        expect(screen.getByTestId('bottom-nav')).toBeInTheDocument();
    });

    it('HP-UT-013 画像解析正常系: 画像選択後に解析APIを呼び出し結果を表示する', async () => {
        const user = userEvent.setup();
        mockApiFetch.mockResolvedValue(createResponse(true, {
            data: {
                analysis: {
                    score: 0.82,
                    feedback: '摩耗は軽微です',
                    mileage: 12345,
                    mileageSource: 'ai',
                    isTargetDetected: true,
                },
            },
        }));

        const { container } = renderHealthPage();
        await user.click(screen.getByRole('button', { name: '目視点検' }));

        const file = new File(['image-bytes'], 'tire.jpg', { type: 'image/jpeg' });
        const input = container.querySelector('#health-gallery-upload') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [file] } });

        expect(mockCreateObjectURL).toHaveBeenCalledWith(file);
        await user.click(screen.getByRole('button', { name: 'アップロード' }));

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledWith('/api/health/analyze', {
                method: 'POST',
                body: expect.any(FormData),
            });
        });

        expect(await screen.findByText('ANALYSIS REPORT')).toBeInTheDocument();
        expect(screen.getByText('摩耗は軽微です')).toBeInTheDocument();
        expect(screen.getByText(/12,345/)).toBeInTheDocument();
        expect(screen.getByText(/82/)).toBeInTheDocument();
    });

    it('HP-UT-016 ODO 未入力バリデーション: 空入力では更新せず警告する', async () => {
        const user = userEvent.setup();
        renderHealthPage();

        await user.click(screen.getByRole('button', { name: '手動ODO' }));
        await user.click(screen.getByRole('button', { name: 'ODOを更新する' }));

        expect(mockAlert).toHaveBeenCalledWith('手動ODOを入力してください');
        expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('HP-UT-018 ODO 更新正常系: 更新API成功時に結果と残距離を表示する', async () => {
        const user = userEvent.setup();
        mockApiFetch.mockResolvedValue(createResponse(true, {
            data: {
                mileage: 54321,
                vehicle: {
                    oil_maintenance_status: {
                        item_name: 'engine_oil',
                        interval_km: 3000,
                        distance_since_last_change: 1500,
                        remaining_km: 1500,
                        is_overdue: false,
                    },
                },
            },
        }));

        renderHealthPage();
        await user.click(screen.getByRole('button', { name: '手動ODO' }));
        await user.type(screen.getByPlaceholderText('例: 12345'), '54321');
        await user.click(screen.getByRole('button', { name: 'ODOを更新する' }));

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledWith('/api/health/mileage', {
                method: 'PUT',
                body: JSON.stringify({
                    mileage: 54321,
                }),
            });
        });

        expect(await screen.findByText('ODO UPDATED')).toBeInTheDocument();
        expect(screen.getByText(/54,321/)).toBeInTheDocument();
        expect(screen.getByText('あと1,500kmです。')).toBeInTheDocument();
    });

    it('HP-UT-015 画像解析失敗系: API失敗時に警告を表示する', async () => {
        const user = userEvent.setup();
        mockApiFetch.mockResolvedValue(createResponse(false, {}));

        const { container } = renderHealthPage();
        await user.click(screen.getByRole('button', { name: '目視点検' }));

        const file = new File(['image-bytes'], 'tire.jpg', { type: 'image/jpeg' });
        const input = container.querySelector('#health-gallery-upload') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [file] } });
        await user.click(screen.getByRole('button', { name: 'アップロード' }));

        await waitFor(() => {
            expect(mockAlert).toHaveBeenCalledWith('Analysis failed');
        });
    });

    it('HP-UT-015 画像解析失敗系: API例外時に警告を表示する', async () => {
        const user = userEvent.setup();
        mockApiFetch.mockRejectedValue(new Error('network fail'));

        const { container } = renderHealthPage();
        await user.click(screen.getByRole('button', { name: '目視点検' }));

        const file = new File(['image-bytes'], 'tire.jpg', { type: 'image/jpeg' });
        const input = container.querySelector('#health-gallery-upload') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [file] } });
        await user.click(screen.getByRole('button', { name: 'アップロード' }));

        await waitFor(() => {
            expect(mockAlert).toHaveBeenCalledWith('Analysis error occurred');
        });
    });

    it('HP-UT-017 ODO 不正値バリデーション: 負数入力では更新せず警告する', async () => {
        const user = userEvent.setup();
        renderHealthPage();

        await user.click(screen.getByRole('button', { name: '手動ODO' }));
        await user.type(screen.getByPlaceholderText('例: 12345'), '-1');
        await user.click(screen.getByRole('button', { name: 'ODOを更新する' }));

        expect(mockAlert).toHaveBeenCalledWith('手動ODOは0以上の数値で入力してください');
        expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('HP-UT-019 ODO 更新失敗応答: API失敗時にレスポンスエラーを表示する', async () => {
        const user = userEvent.setup();
        mockApiFetch.mockResolvedValue(createResponse(false, {
            error: 'ODO更新に失敗しました(400)',
        }));

        renderHealthPage();
        await user.click(screen.getByRole('button', { name: '手動ODO' }));
        await user.type(screen.getByPlaceholderText('例: 12345'), '12345');
        await user.click(screen.getByRole('button', { name: 'ODOを更新する' }));

        await waitFor(() => {
            expect(mockAlert).toHaveBeenCalledWith('ODO更新に失敗しました(400)');
        });
    });

    it('HP-UT-020 ODO 更新例外: API例外時に警告を表示する', async () => {
        const user = userEvent.setup();
        mockApiFetch.mockRejectedValue(new Error('network fail'));

        renderHealthPage();
        await user.click(screen.getByRole('button', { name: '手動ODO' }));
        await user.type(screen.getByPlaceholderText('例: 12345'), '12345');
        await user.click(screen.getByRole('button', { name: 'ODOを更新する' }));

        await waitFor(() => {
            expect(mockAlert).toHaveBeenCalledWith('ODO更新中にエラーが発生しました');
        });
    });

    it('HP-UT-008 エンジン音解析失敗応答: 解析API失敗時に警告を表示する', async () => {
        const user = userEvent.setup();
        const audioTrack = { stop: vi.fn() };
        const stream = {
            getTracks: vi.fn(() => [audioTrack]),
        };
        const analyser = {
            frequencyBinCount: 64,
            getByteFrequencyData: vi.fn(),
        };
        const source = {
            connect: vi.fn(),
        };

        class MockAudioContext {
            createMediaStreamSource() {
                return source;
            }

            createAnalyser() {
                return analyser;
            }
        }

        class MockMediaRecorder {
            mimeType = 'audio/webm';
            state: 'inactive' | 'recording' = 'inactive';
            ondataavailable: ((event: { data: Blob }) => void) | null = null;
            onstop: (() => void) | null = null;

            constructor(_stream: unknown) {}

            start() {
                this.state = 'recording';
            }

            stop() {
                this.state = 'inactive';
                this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: 'audio/webm' }) });
                this.onstop?.();
            }
        }

        vi.stubGlobal('AudioContext', MockAudioContext);
        vi.stubGlobal('MediaRecorder', MockMediaRecorder);
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: {
                getUserMedia: vi.fn().mockResolvedValue(stream),
            },
        });

        mockApiFetch.mockResolvedValue(createResponse(false, {}));

        const { container } = renderHealthPage();
        const recordButton = container.querySelector('.record-btn') as HTMLButtonElement;

        await user.click(recordButton);
        await user.click(recordButton);

        expect(await screen.findByRole('button', { name: '診断を開始する' })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: '診断を開始する' }));

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledWith('/api/health/analyze-audio', {
                method: 'POST',
                body: expect.any(FormData),
            });
        });

        expect(mockAlert).toHaveBeenCalledWith('エンジン音の解析に失敗しました');
        expect(audioTrack.stop).toHaveBeenCalled();
    });
});
