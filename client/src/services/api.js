import axios from 'axios';

// In production, the backend serves the frontend from the same domain, so we just use the relative /api path.
// In development, Vite proxys /api to the local backend port 3000.
const API_BASE_URL = '/api';

export const chatWithGemini = async (input, difficulty = 'intermediate') => {
    // If input is an object containing base64 audio
    if (input && typeof input === 'object' && input.base64) {
        const response = await axios.post(`${API_BASE_URL}/chat`, {
            base64Audio: input.base64,
            audioMimeType: input.mimeType,
            difficulty
        });
        return response.data;
    }

    // Fallback to standard text message
    const response = await axios.post(`${API_BASE_URL}/chat`, { message: input, difficulty });
    return response.data;
};

export const fetchProgress = async () => {
    const response = await axios.get(`${API_BASE_URL}/progress`);
    return response.data;
};

export const resetChat = async () => {
    const response = await axios.post(`${API_BASE_URL}/reset`);
    return response.data;
}

export const clearMistakes = async () => {
    const response = await axios.delete(`${API_BASE_URL}/progress`);
    return response.data;
}

export const deleteMistake = async (id) => {
    const response = await axios.delete(`${API_BASE_URL}/progress/${id}`);
    return response.data;
}

export const generateAudio = async (text, voiceId) => {
    const response = await fetch(`${API_BASE_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId })
    });

    if (!response.ok) {
        throw new Error("Failed to generate audio");
    }

    const arrayBuffer = await response.arrayBuffer();
    return arrayBuffer;
};
