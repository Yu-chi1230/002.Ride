export interface AIAnalysisResult {
    rawResponse: string;
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

        // モック実装: ランダムな走行距離を「読み取った」ふりをする
        // 実際のアプリでの初期テストでは現在のODOより少し増えた値などを返すと良いが、
        // ここでは単純にランダムな数値を返す（例: 34,200km前後）
        const mockMileage = Math.floor(Math.random() * 500) + 34200;

        return {
            rawResponse: `MOCK_OCR_RESULT: ODO ${mockMileage}`,
            mileage: mockMileage,
            feedback: "メーターの数値を正常に読み取りました。",
        };
    }

    /**
     * 部品（タイヤ・チェーン等）の画像解析モック
     */
    async analyzeComponent(imageBuffer: Buffer, type: HealthLogType): Promise<AIAnalysisResult> {
        console.log(`[AIAnalyzer Mock] Analyzing ${type} image (${imageBuffer.length} bytes)...`);

        // モック実装: パーツに応じてランダムなスコア(50〜100)とコメントを生成
        const mockScore = Math.floor(Math.random() * 51) + 50;
        let mockFeedback = "状態は概ね良好です。引き続き定期的な点検を行なってください。";

        if (mockScore < 60) {
            mockFeedback = `警告: ${type} の摩耗が進行しています。早めの交換をお勧めします。`;
        } else if (mockScore > 90) {
            mockFeedback = `素晴らしい状態です。${type} のコンディションは完璧です。`;
        }

        return {
            rawResponse: `MOCK_AI_VISION: SCORE=${mockScore} FEEDBACK="${mockFeedback}"`,
            score: mockScore,
            feedback: mockFeedback,
        };
    }
}

export const aiAnalyzer = new AIAnalyzer();
