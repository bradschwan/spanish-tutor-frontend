require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-1.5-pro',
            contents: 'say hi'
        });
        console.log("Response:", response.text);
    } catch (e) {
        console.log("Error details:", JSON.stringify(e, null, 2));
    }
}
run();
