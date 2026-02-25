export interface AIAnalysisResult {
    rawResponse: Record<string, any>;
    mileage?: number;
    score?: number;
    feedback?: string;
}

export type HealthLogType = 'engine' | 'tire' | 'chain' | 'plug' | 'meter';

/**
 * 簡易版：画像をAI解析するモック関数
 * 将来的にGoogle Cloud Vision APIやOpenAI Vision APIなどに差し替えるためのラッパー
 */
class AIAnalyzer {

    /**
     * メーター画像のOCRモック
     * 実際は画像（Buffer）をVision APIに投げて数値を抽出する
     */
    async analyzeMeter(imageBuffer: Buffer): Promise<AIAnalysisResult> {
        console.log(`[AIAnalyzer Mock] Analyzing meter image (${imageBuffer.length} bytes)...`);

        const mockMileage = Math.floor(Math.random() * 500) + 34200;

        return {
            rawResponse: { type: 'mock_ocr', odo: mockMileage, raw: `MOCK_OCR_RESULT: ODO ${mockMileage}` },
            mileage: mockMileage,
            feedback: "メーターの数値を正常に読み取りました。",
        };
    }

    /**
     * 部品（タイヤ・チェーン等）の画像解析モック
     */
    async analyzeComponent(imageBuffer: Buffer, type: HealthLogType): Promise<AIAnalysisResult> {
        console.log(`[AIAnalyzer Mock] Analyzing ${type} image (${imageBuffer.length} bytes)...`);

        const mockScore = Math.round((Math.random() * 0.51 + 0.49) * 100) / 100; // 0.49〜1.0
        const displayScore = Math.round(mockScore * 100);
        let mockFeedback = "状態は概ね良好です。引き続き定期的な点検を行なってください。";

        if (mockScore < 0.6) {
            mockFeedback = `警告: ${type} の摩耗が進行しています。早めの交換をお勧めします。`;
        } else if (mockScore > 0.9) {
            mockFeedback = `素晴らしい状態です。${type} のコンディションは完璧です。`;
        }

        return {
            rawResponse: { type: 'mock_vision', component: type, score: mockScore, displayScore, feedback: mockFeedback },
            score: mockScore,
            feedback: mockFeedback,
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
