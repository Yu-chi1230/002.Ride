import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../src/contexts/AuthContext';
import { apiFetch } from '../src/lib/api';
import './ContactPage.css';

const MAX_SUBJECT_LENGTH = 60;
const MAX_MESSAGE_LENGTH = 2000;

type ContactCategory = 'bug' | 'question' | 'feature' | 'other';

type ContactFormData = {
    name: string;
    email: string;
    category: ContactCategory;
    subject: string;
    message: string;
};

type ContactFormErrors = Partial<Record<keyof ContactFormData, string>>;

const CATEGORY_OPTIONS: Array<{ value: ContactCategory; label: string }> = [
    { value: 'bug', label: '不具合報告' },
    { value: 'question', label: '使い方の質問' },
    { value: 'feature', label: '改善要望' },
    { value: 'other', label: 'その他' },
];

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const validateForm = (formData: ContactFormData): ContactFormErrors => {
    const errors: ContactFormErrors = {};

    if (!formData.email.trim()) {
        errors.email = 'メールアドレスを入力してください。';
    } else if (!isValidEmail(formData.email.trim())) {
        errors.email = 'メールアドレスの形式が正しくありません。';
    }

    if (!formData.category) {
        errors.category = '問い合わせ種別を選択してください。';
    }

    if (!formData.subject.trim()) {
        errors.subject = '件名を入力してください。';
    } else if (formData.subject.trim().length > MAX_SUBJECT_LENGTH) {
        errors.subject = `件名は${MAX_SUBJECT_LENGTH}文字以内で入力してください。`;
    }

    if (!formData.message.trim()) {
        errors.message = '内容を入力してください。';
    } else if (formData.message.trim().length > MAX_MESSAGE_LENGTH) {
        errors.message = `内容は${MAX_MESSAGE_LENGTH}文字以内で入力してください。`;
    }

    return errors;
};

function ContactPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const contentRef = useRef<HTMLDivElement | null>(null);

    const [formData, setFormData] = useState<ContactFormData>({
        name: '',
        email: user?.email ?? '',
        category: 'question',
        subject: '',
        message: '',
    });
    const [errors, setErrors] = useState<ContactFormErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitState, setSubmitState] = useState<'idle' | 'success' | 'error'>('idle');
    const [submitMessage, setSubmitMessage] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        const rootElement = document.getElementById('root');

        if (rootElement) {
            rootElement.scrollTop = 0;
        }

        if (contentRef.current) {
            contentRef.current.scrollTop = 0;
        }
    }, []);

    const remainingSubjectLength = useMemo(
        () => Math.max(0, MAX_SUBJECT_LENGTH - formData.subject.length),
        [formData.subject]
    );
    const remainingMessageLength = useMemo(
        () => Math.max(0, MAX_MESSAGE_LENGTH - formData.message.length),
        [formData.message]
    );

    const handleInputChange = (
        e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        setErrors((prev) => ({ ...prev, [name]: undefined }));
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const nextErrors = validateForm(formData);
        setErrors(nextErrors);
        setSubmitState('idle');
        setSubmitMessage('');
        setIsModalOpen(false);

        if (Object.keys(nextErrors).length > 0) {
            return;
        }

        setIsSubmitting(true);

        try {
            const metadata = {
                userId: user?.id ?? null,
                route: location.pathname,
                ua: navigator.userAgent,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                locale: navigator.language,
                screen: `${window.innerWidth}x${window.innerHeight}`,
            };

            const response = await apiFetch('/api/contact', {
                method: 'POST',
                body: JSON.stringify({
                    email: formData.email.trim(),
                    name: formData.name.trim() || null,
                    category: formData.category,
                    subject: formData.subject.trim(),
                    message: formData.message.trim(),
                    metadata,
                }),
            });

            if (!response.ok) {
                throw new Error('Contact submission failed');
            }

            setSubmitState('success');
            setSubmitMessage('送信しました。返信が必要な場合は入力したメールに連絡します。');
            setIsModalOpen(true);
            setFormData({
                name: '',
                email: user?.email ?? formData.email.trim(),
                category: 'question',
                subject: '',
                message: '',
            });
            setErrors({});
        } catch (error) {
            console.error('Contact submission error:', error);
            setSubmitState('error');
            setSubmitMessage('送信に失敗しました。時間をおいて再試行してください。');
            setIsModalOpen(true);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="contact-page">
            <div ref={contentRef} className="contact-content">
                <header className="contact-header">
                    <button type="button" className="contact-back-button" onClick={() => navigate('/settings')}>
                        Settings に戻る
                    </button>
                    <h1>お問い合わせ</h1>
                    <p>質問、不具合報告、改善要望を受け付けています。</p>
                    <p>個人情報や機微情報は必要最小限で入力してください。詳細は内部管理DBに保存し、Notion には運用用の要約のみ連携します。</p>
                </header>

                <form className="contact-form" onSubmit={handleSubmit}>
                    <div className="contact-section">
                        <div className="form-group">
                            <label htmlFor="contact-name">お名前（任意）</label>
                            <input
                                id="contact-name"
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleInputChange}
                                disabled={isSubmitting}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="contact-email">メールアドレス</label>
                            <input
                                id="contact-email"
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleInputChange}
                                disabled={isSubmitting}
                                required
                            />
                            {errors.email && <p className="contact-error-text">{errors.email}</p>}
                        </div>

                        <div className="form-group">
                            <label htmlFor="contact-category">種別</label>
                            <select
                                id="contact-category"
                                name="category"
                                value={formData.category}
                                onChange={handleInputChange}
                                disabled={isSubmitting}
                                required
                            >
                                {CATEGORY_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            {errors.category && <p className="contact-error-text">{errors.category}</p>}
                        </div>
                    </div>

                    <div className="contact-section">
                        <div className="form-group">
                            <label htmlFor="contact-subject">件名</label>
                            <input
                                id="contact-subject"
                                type="text"
                                name="subject"
                                value={formData.subject}
                                onChange={handleInputChange}
                                maxLength={MAX_SUBJECT_LENGTH}
                                disabled={isSubmitting}
                                required
                            />
                            <div className="contact-counter">{remainingSubjectLength}文字入力できます</div>
                            {errors.subject && <p className="contact-error-text">{errors.subject}</p>}
                        </div>

                        <div className="form-group">
                            <label htmlFor="contact-message">内容</label>
                            <textarea
                                id="contact-message"
                                className="contact-textarea"
                                name="message"
                                value={formData.message}
                                onChange={handleInputChange}
                                maxLength={MAX_MESSAGE_LENGTH}
                                disabled={isSubmitting}
                                rows={8}
                                style={{
                                    backgroundColor: '#000000',
                                    color: '#c9d1d9',
                                }}
                                required
                            />
                            <div className="contact-counter">{remainingMessageLength}文字入力できます</div>
                            {errors.message && <p className="contact-error-text">{errors.message}</p>}
                        </div>
                    </div>

                    <div className="contact-metadata">
                        <h2>送信時に自動付与される情報</h2>
                        <p>現在の画面、ブラウザ情報、タイムゾーン、画面サイズ、ログイン中のユーザーIDを内部情報として保存します。</p>
                    </div>

                    <div className="contact-actions">
                        <button type="submit" className="btn-primary" disabled={isSubmitting}>
                            {isSubmitting ? '送信中...' : submitState === 'error' ? '再試行する' : '送信する'}
                        </button>
                    </div>
                </form>
            </div>

            {isModalOpen && submitMessage && (
                <div className="contact-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="contact-modal-title">
                    <div className={`contact-modal contact-modal-${submitState}`}>
                        <h2 id="contact-modal-title" className="contact-modal-title">
                            {submitState === 'success' ? '送信完了' : '送信エラー'}
                        </h2>
                        <p className="contact-modal-message">{submitMessage}</p>
                        <button
                            type="button"
                            className="btn-primary contact-modal-button"
                            onClick={() => setIsModalOpen(false)}
                        >
                            閉じる
                        </button>
                    </div>
                </div>
            )}

            <BottomNav />
        </div>
    );
}

export default ContactPage;
