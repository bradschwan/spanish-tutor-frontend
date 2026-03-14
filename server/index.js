const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const dbConfig = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve the compiled frontend static files
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

// Initialize Google Gen AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `You are a Spanish language tutor. Your goal is to converse with the user to help them learn Spanish.
The user's response will be provided. If they make a mistake in grammar or vocabulary, explain the mistake in English and provide the correct Spanish phrasing.
Then, continue the conversation in Spanish.
Keep your responses relatively short, conversational, and encouraging.
Format your output in JSON with the exact following structure:
{
  "transcription": "The exact text of what the user said, if they used audio. Otherwise null.",
  "correction": "English explanation of their mistake, if any. Otherwise null.",
  "expected": "The correct Spanish phrasing of what they tried to say, if they made a mistake. Otherwise null.",
  "isCorrect": boolean (true if their Spanish was correct, false if there was a typo/grammar issue),
  "responsePhrase": "Your conversational reply in Spanish",
  "responseEnglish": "The English translation of your reply"
}
`;

let chatHistory = [];

app.post('/api/chat', async (req, res) => {
    try {
        const { message, base64Audio, audioMimeType, difficulty = 'intermediate' } = req.body;
        if (!message && !base64Audio) {
            return res.status(400).json({ error: "Message or Audio is required" });
        }

        // Apply Difficulty Modifiers
        let difficultyInstruction = "";
        if (difficulty === 'beginner') {
            difficultyInstruction = "\n\nCRITICAL INSTRUCTION: The user is a COMPLETE BEGINNER. You MUST use only the most basic, fundamental vocabulary. You MUST use short, 3-to-5 word sentences. You MUST speak extremely slowly about basic topics (greetings, colors, numbers). DO NOT use complex grammatical structures or advanced tenses under any circumstances.";
        } else if (difficulty === 'advanced') {
            difficultyInstruction = "\n\nCRITICAL INSTRUCTION: The user is ADVANCED. Converse naturally at full speed. Use complex grammar, colloquialisms, advanced vocabulary, and idioms when appropriate. Do not hold back.";
        } else {
            difficultyInstruction = "\n\nCRITICAL INSTRUCTION: The user is INTERMEDIATE. Speak clearly with moderate vocabulary. Introduce new words occasionally but keep the core conversation accessible.";
        }

        let contextPrompt = SYSTEM_PROMPT + difficultyInstruction;

        // If audio was provided, tell Gemini to act as a transcription layer too
        if (base64Audio) {
            contextPrompt += "\n\nCRITICAL INSTRUCTION: The user has provided an audio clip of their voice instead of text. First, you must transcribe what they said and put it in the 'transcription' field of your JSON output. Then, analyze their transcription for grammatical or vocabulary mistakes just like normal. Return your standard JSON format, but respond as if the user had typed out whatever you transcribed. Ensure the transcription perfectly matches their spoken audio.";
        }

        // Build context with recent mistakes
        const recentMistakes = dbConfig.getRecentMistakes(5);
        if (recentMistakes.length > 0) {
            contextPrompt += `\n\nNote: The user recently struggled with these phrases, try to weave concepts from them into the conversation to re-test them naturally:\n`;
            recentMistakes.forEach(m => {
                contextPrompt += `- Instead of "${m.user_input}", they should say "${m.expected}".\n`;
            });
        }

        const contents = [
            { role: 'user', parts: [{ text: contextPrompt }] },
            { role: 'model', parts: [{ text: '{"transcription": null, "correction": null, "expected": null, "isCorrect": true, "responsePhrase": "¡Hola! ¿Cómo estás hoy?", "responseEnglish": "Hello! How are you today?"}' }] },
            ...chatHistory
        ];

        // Append the user's new message (either audio or text)
        let userMessageParts = [];
        if (base64Audio) {
            userMessageParts.push({
                inlineData: {
                    data: base64Audio,
                    mimeType: audioMimeType || 'audio/webm'
                }
            });
            // Gemini requires a text prompt alongside media
            userMessageParts.push({ text: "Please respond to this audio clip." });
        } else {
            userMessageParts.push({ text: message });
        }

        contents.push({ role: 'user', parts: userMessageParts });

        let response;
        let retries = 3;
        while (retries > 0) {
            try {
                response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: contents,
                    config: {
                        responseMimeType: "application/json",
                    }
                });
                break; // Success
            } catch (err) {
                if (err.status === 429 && retries > 1) {
                    console.log(`Rate limited (429). Retrying in 2 seconds... (${retries - 1} left)`);
                    await new Promise(res => setTimeout(res, 2000));
                    retries--;
                } else {
                    throw err; // Re-throw if not 429 or out of retries
                }
            }
        }

        const responseText = response.text;
        const parsedResponse = JSON.parse(responseText);

        // If there's a correction, log the mistake
        if (!parsedResponse.isCorrect && parsedResponse.expected) {
            const loggedInput = message ? message : "[Audio Clip]";
            dbConfig.logMistake(loggedInput, parsedResponse.expected, parsedResponse.correction);
        }

        // append to history
        const finalUserText = parsedResponse.transcription || message || "[Audio Clip]";
        chatHistory.push({ role: 'user', parts: [{ text: finalUserText }] });
        chatHistory.push({ role: 'model', parts: [{ text: JSON.stringify(parsedResponse) }] });

        // keep history short
        if (chatHistory.length > 20) {
            chatHistory = chatHistory.slice(chatHistory.length - 20);
        }

        res.json(parsedResponse);

    } catch (error) {
        console.error("Chat Error:", error);
        if (error.status === 429) {
            return res.status(429).json({ error: "API Rate Limit Exceeded (429). The Gemini 3.1 Pro Preview model may restrict request frequency. Please wait a moment before trying again." });
        }
        res.status(500).json({ error: "Failed to generate response." });
    }
});

app.post('/api/tts', async (req, res) => {
    try {
        const { text, voiceId } = req.body;
        if (!text) return res.status(400).json({ error: "Text is required" });

        const VOICE_ID = voiceId || 'EXAVITQu4vr4xnSDxMaL'; // Default to Bella

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': process.env.ELEVENLABS_API_KEY
            },
            body: JSON.stringify({
                text: text,
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ElevenLabs API Error: ${response.status} ${errorText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': buffer.length
        });

        res.send(buffer);

    } catch (error) {
        console.error("TTS Error:", error);
        res.status(500).json({ error: "Failed to generate audio" });
    }
});

app.get('/api/progress', (req, res) => {
    const mistakes = dbConfig.getRecentMistakes(20);
    const words = dbConfig.getLearnedWords();
    res.json({ mistakes, words });
});

app.delete('/api/progress', (req, res) => {
    try {
        dbConfig.clearAllMistakes();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Failed to clear mistakes" });
    }
});

app.delete('/api/progress/:id', (req, res) => {
    try {
        dbConfig.deleteMistake(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Failed to delete mistake" });
    }
});

app.post('/api/reset', (req, res) => {
    chatHistory = [];
    res.json({ success: true });
});

// Catch-all route to serve the React index.html for any frontend navigation
app.use((req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
