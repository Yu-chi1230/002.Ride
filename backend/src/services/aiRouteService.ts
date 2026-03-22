import { GoogleGenAI, Type, Schema } from '@google/genai';
import { RoutePlanningContext } from './sunService';

// Initialize the Gemini client
// Note: This requires GEMINI_API_KEY to be set in the environment variables
let ai: GoogleGenAI;
try {
    ai = new GoogleGenAI({});
} catch (error) {
    console.warn("⚠️ Warning: Failed to initialize GoogleGenAI. Is GEMINI_API_KEY set?");
}

export type GeneratedSpot = {
    location_name: string;
    shooting_guide: string;
    latitude: number;
    longitude: number;
    reason_for_picking: string;
    preferred_light_direction: 'front_light' | 'back_light' | 'side_light';
    camera_heading_hint: number;
};

export type GeminiRouteProposal = {
    title: string;
    theme: string;
    spots: GeneratedSpot[];
};

/**
 * 制限時間と現在地に基づき、Geminiにシネマティックスポットとルートテーマを提案させる
 * 
 * @param timeLimitMinutes 走行制限時間（分） 例: 60, 120
 * @param startLat 現在地緯度
 * @param startLng 現在地経度
 * @returns 提案されたルートテーマとスポット一覧（0〜3件）
 */
export async function suggestCinematicSpotsBase(
    timeLimitMinutes: number,
    startLat: number,
    startLng: number,
    planningContext?: RoutePlanningContext
): Promise<{ routes: GeminiRouteProposal[] }> {
    if (!ai) {
        throw new Error("Gemini AI client is not initialized. Check GEMINI_API_KEY.");
    }

    // 制限時間に基づいて、大体の移動可能距離（半径）を推定する
    // バイクでの下道移動を想定し、平均時速30km/hとして計算（片道分）
    const maxOneWayDurationMinutes = timeLimitMinutes * 0.4; // 往復＋滞在時間を考慮
    const maxRadiusKm = (30 / 60) * maxOneWayDurationMinutes;

    const contextualPrompt = planningContext
        ? `
【撮影コンテキスト】
- 現在日時: ${planningContext.localDateTimeLabel}
- 季節: ${planningContext.season}
- 時間帯: ${planningContext.timeOfDay}
- 現在の光の状態: ${planningContext.lightPhase}
- 出発地点での太陽高度: ${planningContext.startSun.altitude}°
- 出発地点での太陽方位角: ${planningContext.startSun.azimuth}°

- 季節感の弱い場所より、今の季節に映える景観を優先してください。
- 太陽高度と時間帯を前提に、逆光・順光・サイド光のどれが活きるかを考えてください。
- shooting_guide には「どの向きから、どの光で撮ると良いか」を短く具体的に含めてください。
- reason_for_picking には「なぜ今この季節と光で良いか」を含めてください。
- 各スポットには preferred_light_direction を必ず設定してください。値は front_light / back_light / side_light のいずれかです。
- 各スポットには camera_heading_hint を 0-359 の整数で必ず設定してください。撮影時にカメラを向ける推奨方角です。0=北, 90=東, 180=南, 270=西。
`
        : '';

    const prompt = `
あなたはプロのモーターサイクル・ツーリングプランナーであり、映画監督です。
ユーザーの現在地から出発して、制限時間内に戻ってこられる範囲で、最高に「シネマティック（映画的）」な写真や動画が撮れるツーリングルートを条件に合う範囲で0〜3つ企画してください。
もし時間的に厳しい場合は、無理にルートを作らず0件（空の配列）として返してください。

【条件】
- 出発地（現在地）: 緯度 ${startLat}, 経度 ${startLng}
- 全体の制限時間: ${timeLimitMinutes} 分（出発地からスポットを巡り、出発地に戻ってくるまでの総時間）
- 想定移動可能半径: 現在地から約 ${maxRadiusKm.toFixed(1)} km 圏内
- 提案するスポット数（1ルートあたり）: 1〜3箇所の立ち寄りスポット
- バイクや車と一緒に撮影できる、景色が開けた場所、特徴的な建造物、美しい自然の中の道などを選んでください。
- 複数のルートを提案する場合は、それぞれ異なるテーマや方向のルートにしてください。
- 各ルートのタイトルは【必ず15文字以内】で作成してください。長すぎるタイトルは画面に収まりません。
${contextualPrompt}

【出力形式】
JSON形式で出力してください。以下のスキーマに従うこと。
`;

    // 期待するJSONスキーマを定義
    const responseSchema: Schema = {
        type: Type.OBJECT,
        properties: {
            routes: {
                type: Type.ARRAY,
                description: "提案するルートのリスト",
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: {
                            type: Type.STRING,
                            description: "このルートの魅力的なタイトル（必ず15文字以内にする。例: '東京湾岸サイバーパンク'）",
                        },
                        theme: {
                            type: Type.STRING,
                            description: "このルートのシネマティックなコンセプトやテーマの説明",
                        },
                        spots: {
                            type: Type.ARRAY,
                            description: "提案する撮影スポットのリスト",
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    location_name: { type: Type.STRING, description: "スポットの名称" },
                                    shooting_guide: { type: Type.STRING, description: "どんなアングル、どんな光で撮ると映画的になるか等の具体的なアドバイス" },
                                    latitude: { type: Type.NUMBER, description: "スポットの緯度" },
                                    longitude: { type: Type.NUMBER, description: "スポットの経度" },
                                    reason_for_picking: { type: Type.STRING, description: "なぜこの場所を選んだかの理由" },
                                    preferred_light_direction: {
                                        type: Type.STRING,
                                        description: "撮影に向く光の向き。front_light/back_light/side_light のいずれか"
                                    },
                                    camera_heading_hint: {
                                        type: Type.NUMBER,
                                        description: "撮影時にカメラを向ける推奨方位角。0=北,90=東,180=南,270=西"
                                    }
                                },
                                required: [
                                    "location_name",
                                    "shooting_guide",
                                    "latitude",
                                    "longitude",
                                    "reason_for_picking",
                                    "preferred_light_direction",
                                    "camera_heading_hint"
                                ]
                            }
                        }
                    },
                    required: ["title", "theme", "spots"]
                }
            }
        },
        required: ["routes"]
    };

    console.log(`[Gemini] Requesting route proposal for Lat:${startLat} Lng:${startLng}, Time:${timeLimitMinutes} m, Radius:${maxRadiusKm} km`);

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.7,
            }
        });

        const responseText = response.text;
        if (!responseText) {
            throw new Error("Gemini API returned empty response.");
        }

        const data = JSON.parse(responseText) as { routes: GeminiRouteProposal[] };

        // ログ出力（デバッグ用）
        console.log(`[Gemini] Proposal received: ${data.routes.length} routes`);

        return data;

    } catch (error) {
        console.error("Gemini API Error:", error);
        throw new Error("Failed to generate cinematic spots with AI.");
    }
}
