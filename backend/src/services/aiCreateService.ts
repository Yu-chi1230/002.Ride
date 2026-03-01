import { GoogleGenAI, Type, Schema } from '@google/genai';

// Initialize the Gemini client
let ai: GoogleGenAI;
try {
    ai = new GoogleGenAI({});
} catch (error) {
    console.warn("⚠️ Warning: Failed to initialize GoogleGenAI for Create Service. Is GEMINI_API_KEY set?");
}

export type CinematicScriptResponse = {
    color_logic_memo: string;
    script_lines: string[];
};

/**
 * 写真のテーマに基づいて、映画のような短いナレーションスクリプトとカラー方針を生成する
 * 
 * @param theme ユーザーが選んだテーマ（例: 'Cyberpunk', 'Vintage'）
 * @param imageCount アップロードされた画像の数
 * @returns カラーロジックのメモと、画像ごとに表示する字幕（スクリプト）の配列
 */
export async function generateCinematicScript(
    theme: string,
    imageCount: number
): Promise<CinematicScriptResponse> {
    if (!ai) {
        throw new Error("Gemini AI client is not initialized.");
    }

    const prompt = `
あなたは数々の賞を受賞した映画のトレーラー（予告編）やCMのディレクターです。
ユーザーは自分の愛車（バイクや車）の写真を ${imageCount} 枚アップロードし、「${theme}」というテーマでのショートムービーを作成しようとしています。

このスライドショー動画で流す、最高にシネマティックでポエティックなナレーション（字幕）のスクリプトを日本語で作成してください。
文字数は少なめで、画面に字幕として短く表示されるイメージです（1画像につき1文程度）。

また、この映像を編集するカラリスト（色調補正のスペシャリスト）に対して、どのようなカラーグレーディング（LUT）をあてるべきか、色彩のトーンやコントラストの指示出し（color_logic_memo）を簡潔に書いてください。

【出力形式】
JSON形式で出力してください。以下のスキーマに従うこと。
`;

    // 期待するJSONスキーマ
    const responseSchema: Schema = {
        type: Type.OBJECT,
        properties: {
            color_logic_memo: {
                type: Type.STRING,
                description: "カラリストへの指示メモ（例: 'シャドウにティール、ハイライトにオレンジ。コントラスト強めで彩度は落とす'）"
            },
            script_lines: {
                type: Type.ARRAY,
                description: "画像に合わせて順番に画面下部に表示する短い字幕テキストの配列",
                items: {
                    type: Type.STRING
                }
            }
        },
        required: ["color_logic_memo", "script_lines"]
    };

    console.log(`[Gemini Create] Requesting script for theme: ${theme}, images: ${imageCount}`);

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.8, // Slightly higher creativity for storytelling
            }
        });

        const responseText = response.text;
        if (!responseText) {
            throw new Error("Gemini API returned empty response.");
        }

        const data = JSON.parse(responseText) as CinematicScriptResponse;

        // 画像の数と合わない場合の保険
        if (!data.script_lines || data.script_lines.length === 0) {
            data.script_lines = ["(No script generated)"];
        }

        console.log(`[Gemini Create] Script generated successfully.`);
        return data;

    } catch (error) {
        console.error("Gemini API Error (Create):", error);
        throw new Error("Failed to generate cinematic script with AI.");
    }
}
