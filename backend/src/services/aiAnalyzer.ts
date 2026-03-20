import { GoogleGenAI, Schema, Type } from '@google/genai';

export interface AIAnalysisResult {
    rawResponse: Record<string, any>;
    mileage?: number;
    score?: number;
    feedback?: string;
    isEngineSound?: boolean;
    isTargetDetected?: boolean;
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
- isTargetDetected: 画像内に「${type}」の点検対象が十分に写っていて判定可能ならtrue、そうでなければfalse
- score: 0.0〜1.0（1.0に近いほど良好）
- feedback: 日本語で、ユーザー向けに簡潔かつ具体的に
- 画像が不鮮明、別部位、対象が写っていないなどで判定不能な場合は、isTargetDetected を false にし、その旨をfeedbackに明記する
`;
    }

    private getAudioPrompt(): string {
        return `
あなたは熟練の二輪整備士です。バイクのエンジン音を聞いて状態を判定してください。
次のルールを守ってください:
- isEngineSound: バイクのエンジン音として判定可能ならtrue、そうでなければfalse
- score: 0.0〜1.0（1.0に近いほど良好）
- feedback: 日本語で、ユーザー向けに簡潔かつ具体的に
- 正常、注意、異常のいずれかが分かる表現にする
- 音声が短すぎる、雑音が強い、判定不能な場合はその旨をfeedbackに明記し、scoreを0.5前後にする
- エンジン音ではない場合は isEngineSound を false にし、feedback にその旨を明記する
- 根拠のない断定は避け、点検推奨が必要なら明記する
`;
    }

    private readonly responseSchema: Schema = {
        type: Type.OBJECT,
        properties: {
            isTargetDetected: { type: Type.BOOLEAN, description: 'Whether the requested part is visible and diagnosable in the image' },
            isEngineSound: { type: Type.BOOLEAN, description: 'Whether the audio is motorcycle engine sound' },
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

        const parsed = JSON.parse(responseText) as { isTargetDetected?: boolean; score: number; feedback: string };
        const score = this.clampScore(parsed.score);
        const feedback = (parsed.feedback || '診断結果を取得できませんでした。').trim();
        const isTargetDetected = parsed.isTargetDetected !== false;

        return {
            rawResponse: {
                type: 'gemini_vision',
                component: type,
                isTargetDetected,
                score,
                feedback,
                model: 'gemini-2.5-flash'
            },
            score,
            feedback,
            isTargetDetected,
        };
    }

    /**
     * エンジン音の実解析
     */
    async analyzeEngineSound(
        audioBuffer: Buffer,
        mimeType: string = 'audio/webm'
    ): Promise<AIAnalysisResult> {
        if (!this.ai) {
            throw new Error("Gemini AI client is not initialized. Check GEMINI_API_KEY.");
        }

        console.log(`[AIAnalyzer Gemini] Analyzing engine sound (${audioBuffer.length} bytes, ${mimeType})...`);

        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{
                role: 'user',
                parts: [
                    { text: this.getAudioPrompt() },
                    {
                        inlineData: {
                            mimeType,
                            data: audioBuffer.toString('base64')
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
            throw new Error("Gemini API returned empty response for engine sound analysis.");
        }

        const parsed = JSON.parse(responseText) as { isEngineSound?: boolean; score: number; feedback: string };
        const score = this.clampScore(parsed.score);
        const feedback = (parsed.feedback || '診断結果を取得できませんでした。').trim();
        const isEngineSound = parsed.isEngineSound !== false;

        return {
            rawResponse: {
                type: 'gemini_audio',
                isEngineSound,
                score,
                feedback,
                mimeType,
                model: 'gemini-2.5-flash'
            },
            score,
            feedback,
            isEngineSound,
        };
    }
}

export const aiAnalyzer = new AIAnalyzer();
