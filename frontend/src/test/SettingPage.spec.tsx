import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingPage from '../../pages/SettingPage';

const defaultCropArea = { x: 10, y: 20, width: 120, height: 240 };

const {
    mockApiFetch,
    mockNavigate,
    mockUseAuth,
    mockGetCroppedImg,
    mockSignOut,
    mockRefreshProfile,
} = vi.hoisted(() => ({
    mockApiFetch: vi.fn(),
    mockNavigate: vi.fn(),
    mockUseAuth: vi.fn(),
    mockGetCroppedImg: vi.fn(),
    mockSignOut: vi.fn(),
    mockRefreshProfile: vi.fn(),
}));

vi.mock('../lib/api', () => ({
    apiFetch: mockApiFetch,
}));

vi.mock('../contexts/AuthContext', () => ({
    useAuth: mockUseAuth,
}));

vi.mock('../lib/cropImage', () => ({
    default: mockGetCroppedImg,
}));

vi.mock('../../components/BottomNav', () => ({
    default: () => <div data-testid="bottom-nav" />,
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        auth: {
            signOut: mockSignOut,
        },
    },
}));

vi.mock('react-easy-crop', () => ({
    default: (props: { onCropComplete?: (croppedArea: unknown, croppedAreaPixels: typeof defaultCropArea) => void }) => {
        React.useEffect(() => {
            props.onCropComplete?.(null, defaultCropArea);
        }, [props]);
        return <div data-testid="cropper" />;
    },
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

type ProfileOverrides = {
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    vehicle_maker?: string;
    vehicle_model_name?: string;
    oilRemainingKm?: number | null;
    oilIsOverdue?: boolean;
    oilIntervalKm?: number | null;
    lastOilChangeDate?: string | null;
    lastOilChangeMileage?: number | null;
    monthlyAvgMileage?: number | null;
};

const createProfileData = (overrides: ProfileOverrides = {}) => ({
    id: 'profile-1',
    display_name: overrides.display_name ?? 'Ride Taro',
    first_name: overrides.first_name ?? 'Taro',
    last_name: overrides.last_name ?? 'Ride',
    vehicles: [
        {
            id: 'vehicle-1',
            maker: overrides.vehicle_maker ?? 'Honda',
            model_name: overrides.vehicle_model_name ?? 'CBR250RR',
            current_mileage: 12345,
            last_oil_change_mileage: overrides.lastOilChangeMileage ?? 11000,
            last_oil_change_date: overrides.lastOilChangeDate ?? '2025-01-15T00:00:00.000Z',
            monthly_avg_mileage: overrides.monthlyAvgMileage ?? 350,
            oil_maintenance_status: overrides.oilIntervalKm === null
                ? null
                : {
                    item_name: 'engine_oil',
                    interval_km: overrides.oilIntervalKm ?? 3000,
                    distance_since_last_change: 1345,
                    remaining_km: overrides.oilRemainingKm ?? 1655,
                    is_overdue: overrides.oilIsOverdue ?? false,
                },
        },
    ],
});

function createResponse(ok: boolean, jsonData: unknown = {}, status = ok ? 200 : 400) {
    return {
        ok,
        status,
        json: vi.fn().mockResolvedValue(jsonData),
    };
}

function renderSettingPage(profileOverrides: ProfileOverrides = {}) {
    mockUseAuth.mockReturnValue({
        profileData: createProfileData(profileOverrides),
        refreshProfile: mockRefreshProfile,
    });
    return render(
        <MemoryRouter initialEntries={['/settings']}>
            <SettingPage />
        </MemoryRouter>
    );
}

function getInputByName(container: HTMLElement, name: string) {
    const input = container.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
    if (!input) {
        throw new Error(`Input not found: ${name}`);
    }
    return input;
}

describe('SettingPage', () => {
    const originalImage = globalThis.Image;
    const originalCreateElement = document.createElement.bind(document);

    beforeEach(() => {
        mockApiFetch.mockReset();
        mockNavigate.mockReset();
        mockUseAuth.mockReset();
        mockGetCroppedImg.mockReset();
        mockSignOut.mockReset();
        mockRefreshProfile.mockReset();

        mockUseAuth.mockReturnValue({
            profileData: createProfileData(),
            refreshProfile: mockRefreshProfile,
        });
        mockApiFetch.mockResolvedValue(createResponse(true, {}));
        mockGetCroppedImg.mockResolvedValue('blob:cropped-image');
        mockSignOut.mockResolvedValue(undefined);

        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
            if (key === 'default_riding_time') {
                return '90';
            }
            return null;
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        class MockFileReader {
            onload: ((event: ProgressEvent<FileReader>) => void) | null = null;

            readAsDataURL() {
                this.onload?.({
                    target: { result: 'data:image/png;base64,cropped' },
                } as ProgressEvent<FileReader>);
            }
        }

        vi.stubGlobal('FileReader', MockFileReader);
        vi.stubGlobal('Image', class {
            width = 2400;
            height = 1600;
            onload: (() => void) | null = null;

            set src(_value: string) {
                setTimeout(() => {
                    this.onload?.();
                }, 0);
            }
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        cleanup();
        vi.unstubAllGlobals();
        globalThis.Image = originalImage;
        document.createElement = originalCreateElement;
    });

    it('ST-UT-001 初期表示: profileData と localStorage の値を画面へ反映する', () => {
        const { container } = renderSettingPage();

        expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
        expect(getInputByName(container, 'display_name')).toHaveValue('Ride Taro');
        expect(getInputByName(container, 'last_name')).toHaveValue('Ride');
        expect(getInputByName(container, 'first_name')).toHaveValue('Taro');
        expect(getInputByName(container, 'vehicle_maker')).toHaveValue('Honda');
        expect(getInputByName(container, 'vehicle_model_name')).toHaveValue('CBR250RR');
        expect(getInputByName(container, 'last_oil_change_date')).toHaveValue('2025-01-15');
        expect(getInputByName(container, 'last_oil_change_mileage')).toHaveValue(11000);
        expect(screen.getByDisplayValue('1時間30分 (90分)')).toBeInTheDocument();
        expect(getInputByName(container, 'display_name')).toBeDisabled();
    });

    it('ST-UT-001A 問い合わせ完了後の遷移 state がある場合は画面先頭へスクロールする', () => {
        const originalScrollTopDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
        const rootElement = document.createElement('div');
        rootElement.scrollTop = 320;
        const getElementByIdSpy = vi.spyOn(document, 'getElementById').mockImplementation((id: string) => {
            if (id === 'root') {
                return rootElement;
            }
            return null;
        });
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
            configurable: true,
            writable: true,
            value: 180,
        });

        mockUseAuth.mockReturnValue({
            profileData: createProfileData(),
            refreshProfile: mockRefreshProfile,
        });

        try {
            const { container } = render(
                <MemoryRouter initialEntries={[{ pathname: '/settings', state: { scrollToTop: true } }]}>
                    <SettingPage />
                </MemoryRouter>
            );

            const contentElement = container.querySelector<HTMLElement>('.setting-content');
            expect(contentElement).not.toBeNull();

            if (!contentElement) {
                throw new Error('setting-content not found');
            }

            expect(getElementByIdSpy).toHaveBeenCalledWith('root');
            expect(rootElement.scrollTop).toBe(0);
            expect(contentElement.scrollTop).toBe(0);
        } finally {
            if (originalScrollTopDescriptor) {
                Object.defineProperty(HTMLElement.prototype, 'scrollTop', originalScrollTopDescriptor);
            } else {
                delete (HTMLElement.prototype as { scrollTop?: number }).scrollTop;
            }
        }
    });

    it('ST-UT-002/ST-UT-003 プロフィール編集開始とキャンセル: 入力活性化後に元の値へ戻す', async () => {
        const user = userEvent.setup();
        const { container } = renderSettingPage();

        await user.click(screen.getByRole('button', { name: '編集' }));
        const displayNameInput = getInputByName(container, 'display_name');

        expect(displayNameInput).toBeEnabled();

        await user.clear(displayNameInput);
        await user.type(displayNameInput, 'Updated Name');
        await user.click(screen.getByRole('button', { name: 'キャンセル' }));

        expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();
        expect(getInputByName(container, 'display_name')).toHaveValue('Ride Taro');
        expect(screen.queryByText('プロフィールを更新しました。')).not.toBeInTheDocument();
    });

    it('ST-UT-004 プロフィール保存正常系: PUT と refreshProfile を実行する', async () => {
        const user = userEvent.setup();
        mockApiFetch.mockResolvedValue(createResponse(true, {}));
        const { container } = renderSettingPage();

        await user.click(screen.getByRole('button', { name: '編集' }));
        await user.clear(getInputByName(container, 'display_name'));
        await user.type(getInputByName(container, 'display_name'), 'New Display');
        await user.selectOptions(getInputByName(container, 'vehicle_maker'), 'Yamaha');
        await user.clear(getInputByName(container, 'vehicle_model_name'));
        await user.type(getInputByName(container, 'vehicle_model_name'), 'MT-07');
        await user.click(screen.getByRole('button', { name: '保存する' }));

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledWith('/api/users/me', {
                method: 'PUT',
                body: JSON.stringify({
                    first_name: 'Taro',
                    last_name: 'Ride',
                    display_name: 'New Display',
                    vehicle_maker: 'Yamaha',
                    vehicle_model_name: 'MT-07',
                }),
            });
        });
        expect(await screen.findByText('プロフィールを更新しました。')).toBeInTheDocument();
        expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();
    });

    it('ST-UT-005/ST-UT-006 プロフィール保存失敗時: エラー文言を表示する', async () => {
        const user = userEvent.setup();
        const { container, rerender } = render(
            <MemoryRouter>
                <SettingPage />
            </MemoryRouter>
        );

        await user.click(screen.getByRole('button', { name: '編集' }));
        await user.clear(getInputByName(container, 'display_name'));
        await user.type(getInputByName(container, 'display_name'), 'Error Name');

        mockApiFetch.mockResolvedValueOnce(createResponse(false, { error: 'プロフィール更新失敗' }, 400));
        await user.click(screen.getByRole('button', { name: '保存する' }));
        expect(await screen.findByText('プロフィール更新失敗')).toBeInTheDocument();

        rerender(
            <MemoryRouter>
                <SettingPage />
            </MemoryRouter>
        );

        mockApiFetch.mockRejectedValueOnce(new Error('network'));
        await user.click(screen.getByRole('button', { name: '保存する' }));
        expect(await screen.findByText('通信エラーが発生しました。')).toBeInTheDocument();
    });

    it('ST-UT-007 オイル管理初期表示: 残距離文言を表示する', () => {
        renderSettingPage();
        expect(screen.getByText('交換推奨まであと1,655kmです。')).toBeInTheDocument();
    });

    it('ST-UT-008/ST-UT-009/ST-UT-010 オイル管理バリデーション: 不正値では API を呼ばない', async () => {
        const user = userEvent.setup();
        const { container } = renderSettingPage();

        await user.clear(getInputByName(container, 'last_oil_change_mileage'));
        await user.type(getInputByName(container, 'last_oil_change_mileage'), '-1');
        await user.click(screen.getByRole('button', { name: 'オイル管理を保存' }));
        expect(await screen.findByText('前回オイル交換時の走行距離は0以上の数値で入力してください。')).toBeInTheDocument();

        await user.clear(getInputByName(container, 'last_oil_change_mileage'));
        await user.type(getInputByName(container, 'last_oil_change_mileage'), '11000');
        await user.clear(getInputByName(container, 'monthly_avg_mileage'));
        await user.type(getInputByName(container, 'monthly_avg_mileage'), '-10');
        await user.click(screen.getByRole('button', { name: 'オイル管理を保存' }));
        expect(await screen.findByText('一ヶ月あたりの平均走行距離は0以上の数値で入力してください。')).toBeInTheDocument();

        await user.clear(getInputByName(container, 'monthly_avg_mileage'));
        await user.type(getInputByName(container, 'monthly_avg_mileage'), '350');
        await user.clear(getInputByName(container, 'oil_change_interval_km'));
        await user.type(getInputByName(container, 'oil_change_interval_km'), '-5');
        await user.click(screen.getByRole('button', { name: 'オイル管理を保存' }));
        expect(await screen.findByText('オイル交換サイクルは0以上の数値で入力してください。')).toBeInTheDocument();
        expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('ST-UT-011/ST-UT-012/ST-UT-013 オイル管理保存: 正常系と異常系を処理する', async () => {
        const user = userEvent.setup();
        const { container, rerender } = render(
            <MemoryRouter>
                <SettingPage />
            </MemoryRouter>
        );

        fireEvent.change(getInputByName(container, 'last_oil_change_date'), { target: { value: '2025-03-01' } });
        await user.clear(getInputByName(container, 'last_oil_change_mileage'));
        await user.type(getInputByName(container, 'last_oil_change_mileage'), '12000');
        await user.clear(getInputByName(container, 'monthly_avg_mileage'));
        await user.type(getInputByName(container, 'monthly_avg_mileage'), '480');
        await user.clear(getInputByName(container, 'oil_change_interval_km'));
        await user.type(getInputByName(container, 'oil_change_interval_km'), '3500');

        mockApiFetch.mockResolvedValueOnce(createResponse(true, {}));
        await user.click(screen.getByRole('button', { name: 'オイル管理を保存' }));
        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledWith('/api/users/me', {
                method: 'PUT',
                body: JSON.stringify({
                    last_oil_change_date: '2025-03-01',
                    last_oil_change_mileage: 12000,
                    monthly_avg_mileage: 480,
                    oil_change_interval_km: 3500,
                }),
            });
        });
        expect(await screen.findByText('オイル管理情報を更新しました。')).toBeInTheDocument();
        expect(mockRefreshProfile).toHaveBeenCalledTimes(1);

        rerender(
            <MemoryRouter>
                <SettingPage />
            </MemoryRouter>
        );
        mockApiFetch.mockResolvedValueOnce(createResponse(false, { error: 'オイル管理保存失敗' }, 400));
        await user.click(screen.getByRole('button', { name: 'オイル管理を保存' }));
        expect(await screen.findByText('オイル管理保存失敗')).toBeInTheDocument();

        mockApiFetch.mockRejectedValueOnce(new Error('network'));
        await user.click(screen.getByRole('button', { name: 'オイル管理を保存' }));
        expect(await screen.findByText('通信エラーが発生しました。')).toBeInTheDocument();
    });

    it('ST-UT-014 デフォルト走行時間保存: localStorage を更新してメッセージを出す', async () => {
        const user = userEvent.setup();
        renderSettingPage();

        await user.selectOptions(screen.getByDisplayValue('1時間30分 (90分)'), '120');

        expect(window.localStorage.setItem).toHaveBeenCalledWith('default_riding_time', '120');
        expect(screen.getByText('デフォルトの走行時間を更新しました。')).toBeInTheDocument();
    });

    it('ST-UT-015/ST-UT-016 背景画像変更: クロップモーダル表示後に保存する', async () => {
        const user = userEvent.setup();

        const mockCanvas = {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue({
                drawImage: vi.fn(),
            }),
            toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,saved'),
        };

        document.createElement = vi.fn((tagName: string) => {
            if (tagName === 'canvas') {
                return mockCanvas as unknown as HTMLCanvasElement;
            }
            return originalCreateElement(tagName);
        }) as typeof document.createElement;

        renderSettingPage();
        const file = new File(['image'], 'background.png', { type: 'image/png' });
        const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
        if (!fileInput) {
            throw new Error('File input not found');
        }

        await user.upload(fileInput, file);

        expect(await screen.findByText('背景画像の位置調整')).toBeInTheDocument();
        expect(screen.getByTestId('cropper')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: '完了' }));

        await waitFor(() => {
            expect(mockGetCroppedImg).toHaveBeenCalledWith('data:image/png;base64,cropped', defaultCropArea);
        });
        await waitFor(() => {
            expect(window.localStorage.setItem).toHaveBeenCalledWith('home_bg_image', 'data:image/jpeg;base64,saved');
        });
        expect(await screen.findByText('背景画像を更新しました。')).toBeInTheDocument();
        expect(screen.queryByText('背景画像の位置調整')).not.toBeInTheDocument();
    });

    it('ST-UT-017/ST-UT-018/ST-UT-019 背景画像変更異常系: サイズ超過、切り抜き失敗、キャンセルを処理する', async () => {
        const user = userEvent.setup();

        const mockCanvas = {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue({
                drawImage: vi.fn(),
            }),
            toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,saved'),
        };

        document.createElement = vi.fn((tagName: string) => {
            if (tagName === 'canvas') {
                return mockCanvas as unknown as HTMLCanvasElement;
            }
            return originalCreateElement(tagName);
        }) as typeof document.createElement;

        renderSettingPage();
        const file = new File(['image'], 'background.png', { type: 'image/png' });
        const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
        if (!fileInput) {
            throw new Error('File input not found');
        }

        await user.upload(fileInput, file);
        vi.mocked(window.localStorage.setItem).mockImplementationOnce(() => {
            throw new Error('quota exceeded');
        });
        await user.click(screen.getByRole('button', { name: '完了' }));
        expect(await screen.findByText('画像サイズが大きすぎます。')).toBeInTheDocument();

        await user.upload(fileInput, file);
        mockGetCroppedImg.mockRejectedValueOnce(new Error('crop failed'));
        await user.click(screen.getByRole('button', { name: '完了' }));
        expect(await screen.findByText('画像の切り抜きに失敗しました。')).toBeInTheDocument();

        await user.upload(fileInput, file);
        expect(await screen.findByText('背景画像の位置調整')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'キャンセル' }));
        expect(screen.queryByText('背景画像の位置調整')).not.toBeInTheDocument();
    });

    it('ST-UT-020 問い合わせ導線: /settings/contact へ遷移要求する', async () => {
        const user = userEvent.setup();
        renderSettingPage();

        await user.click(screen.getByRole('button', { name: '問い合わせフォームを開く' }));

        expect(mockNavigate).toHaveBeenCalledWith('/settings/contact');
    });

    it('ST-UT-021 サインアウト: signOut 後にトップへ遷移する', async () => {
        const user = userEvent.setup();
        renderSettingPage();

        await user.click(screen.getByRole('button', { name: 'サインアウト' }));

        await waitFor(() => {
            expect(mockSignOut).toHaveBeenCalledTimes(1);
        });
        expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    it('ST-UT-022/ST-UT-023/ST-UT-024/ST-UT-025 退会処理: confirm、成功、失敗、例外を処理する', async () => {
        const user = userEvent.setup();
        const { rerender } = render(
            <MemoryRouter>
                <SettingPage />
            </MemoryRouter>
        );

        vi.mocked(window.confirm).mockReturnValueOnce(false);
        await user.click(screen.getByRole('button', { name: '退会する' }));
        expect(mockApiFetch).not.toHaveBeenCalled();

        mockApiFetch.mockResolvedValueOnce(createResponse(true, {}));
        await user.click(screen.getByRole('button', { name: '退会する' }));
        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledWith('/api/users/me', { method: 'DELETE' });
        });
        expect(mockSignOut).toHaveBeenCalledTimes(1);
        expect(mockNavigate).toHaveBeenCalledWith('/');

        rerender(
            <MemoryRouter>
                <SettingPage />
            </MemoryRouter>
        );
        mockApiFetch.mockResolvedValueOnce(createResponse(false, { error: '退会失敗' }, 400));
        await user.click(screen.getByRole('button', { name: '退会する' }));
        expect(await screen.findByText('退会失敗')).toBeInTheDocument();

        mockApiFetch.mockRejectedValueOnce(new Error('network'));
        await user.click(screen.getByRole('button', { name: '退会する' }));
        expect(await screen.findByText('通信エラーが発生しました。')).toBeInTheDocument();
    });

    it('ST-UT-026 ローディング表示: 保存中・処理中の文言と disabled を切り替える', async () => {
        const user = userEvent.setup();
        const { container, rerender } = render(
            <MemoryRouter>
                <SettingPage />
            </MemoryRouter>
        );

        let resolveProfileSave: (value: unknown) => void = () => {};
        mockApiFetch.mockReturnValueOnce(new Promise((resolve) => {
            resolveProfileSave = resolve;
        }));

        await user.click(screen.getByRole('button', { name: '編集' }));
        fireEvent.click(screen.getByRole('button', { name: '保存する' }));
        expect(screen.getAllByRole('button', { name: '保存中...' })).toHaveLength(2);
        resolveProfileSave(createResponse(true, {}));
        await waitFor(() => {
            expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();
        });

        let resolveOilSave: (value: unknown) => void = () => {};
        mockApiFetch.mockReturnValueOnce(new Promise((resolve) => {
            resolveOilSave = resolve;
        }));
        fireEvent.click(screen.getByRole('button', { name: 'オイル管理を保存' }));
        expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled();
        resolveOilSave(createResponse(true, {}));
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'オイル管理を保存' })).toBeEnabled();
        });

        rerender(
            <MemoryRouter>
                <SettingPage />
            </MemoryRouter>
        );

        let resolveDelete: (value: unknown) => void = () => {};
        mockApiFetch.mockReturnValueOnce(new Promise((resolve) => {
            resolveDelete = resolve;
        }));
        await user.click(screen.getByRole('button', { name: '退会する' }));
        expect(screen.getByRole('button', { name: '処理中...' })).toBeDisabled();
        resolveDelete(createResponse(true, {}));
        await waitFor(() => {
            expect(mockSignOut).toHaveBeenCalled();
        });

        expect(getInputByName(container, 'display_name')).toBeInTheDocument();
    });
});
