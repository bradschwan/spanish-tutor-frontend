require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'say hi'
        });
        console.log("Response:", response.text);
    } catch (e) {
        console.log("--- ERROR CAUGHT ---");
        console.log("Status:", e.status);
        console.log("Message:", e.message);
        console.log("Full Object:", JSON.stringify(e, null, 2));
        if (e.response) {
            console.log("Response headers:", e.response.headers);
        }
    }
}
run();
