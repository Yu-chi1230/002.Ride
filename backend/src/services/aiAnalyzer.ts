import { GoogleGenAI, Schema, Type } from '@google/genai';

export interface AIAnalysisResult {
    rawResponse: Record<string, any>;
    mileage?: number;
    score?: number;
    feedback?: string;
}

export type HealthLogType = 'engine' | 'tire' | 'chain' | 'plug';

/**
 * 画像/音声をAI解析するラッパー
 */
class AIAnalyzer {
    private ai: GoogleGenAI | null = null;

    constructor() {
        try {
            this.ai = new GoogleGenAI({});
        } catch (_error) {
            console.warn("⚠️ Warning: Failed to initialize GoogleGenAI for Health Analyzer. Is GEMINI_API_KEY set?");
            this.ai = null;
        }
    }

    private getVisualPrompt(type: HealthLogType): string {
        return `
あなたは熟練の二輪整備士です。画像を見て「${type}」の状態を判定してください。
次のルールを守ってください:
- score: 0.0〜1.0（1.0に近いほど良好）
- feedback: 日本語で、ユーザー向けに簡潔かつ具体的に
- 画像が不鮮明で判定不能な場合は、その旨をfeedbackに明記し、scoreを0.5にする
`;
    }

    private readonly responseSchema: Schema = {
        type: Type.OBJECT,
        properties: {
            score: { type: Type.NUMBER, description: '0.0 to 1.0' },
            feedback: { type: Type.STRING, description: 'Japanese diagnosis text for users' }
        },
        required: ['score', 'feedback']
    };

    private clampScore(score: number): number {
        if (!Number.isFinite(score)) return 0.5;
        if (score < 0) return 0;
        if (score > 1) return 1;
        return Math.round(score * 100) / 100;
    }

    /**
     * 部品（タイヤ・チェーン等）の画像解析
     */
    async analyzeComponent(
        imageBuffer: Buffer,
        type: HealthLogType,
        mimeType: string = 'image/jpeg'
    ): Promise<AIAnalysisResult> {
        if (!this.ai) {
            throw new Error("Gemini AI client is not initialized. Check GEMINI_API_KEY.");
        }

        console.log(`[AIAnalyzer Gemini] Analyzing ${type} image (${imageBuffer.length} bytes)...`);
        const prompt = this.getVisualPrompt(type);
        const imageBase64 = imageBuffer.toString('base64');

        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{
                role: 'user',
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType,
                            data: imageBase64
                        }
                    }
                ]
            }],
            config: {
                responseMimeType: "application/json",
                responseSchema: this.responseSchema,
                temperature: 0.2
            }
        });

        const responseText = response.text;
        if (!responseText) {
            throw new Error("Gemini API returned empty response.");
        }

        const parsed = JSON.parse(responseText) as { score: number; feedback: string };
        const score = this.clampScore(parsed.score);
        const feedback = (parsed.feedback || '診断結果を取得できませんでした。').trim();

        return {
            rawResponse: {
                type: 'gemini_vision',
                component: type,
                score,
                feedback,
                model: 'gemini-2.5-flash'
            },
            score,
            feedback,
        };
    }

    /**
     * エンジン音の解析モック
     * 将来的に音声AI（TensorFlow.js / Google Audio Intelligence API等）に差し替える
     */
    async analyzeEngineSound(audioBuffer: Buffer): Promise<AIAnalysisResult> {
        console.log(`[AIAnalyzer Mock] Analyzing engine sound (${audioBuffer.length} bytes)...`);

        const mockScore = Math.round((Math.random() * 0.51 + 0.49) * 100) / 100; // 0.49〜1.0
        const displayScore = Math.round(mockScore * 100);
        let status: string;
        let mockFeedback: string;

        if (mockScore >= 0.8) {
            status = '正常';
            mockFeedback = 'エンジン音は正常です。異常な振動や打音は検出されませんでした。';
        } else if (mockScore >= 0.6) {
            status = '注意';
            mockFeedback = 'エンジン音にわずかな不規則性が検出されました。次回の点検時に確認することをお勧めします。';
        } else {
            status = '異常';
            mockFeedback = '警告: エンジン音に異常なノッキングまたは金属音が検出されました。早急な点検をお勧めします。';
        }

        return {
            rawResponse: { type: 'mock_audio', score: mockScore, displayScore, status, feedback: mockFeedback },
            score: mockScore,
            feedback: `【${status}】 ${mockFeedback}`,
        };
    }
}

export const aiAnalyzer = new AIAnalyzer();
