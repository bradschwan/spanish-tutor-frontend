// Audio Service handling Web Speech API STT and ElevenLabs TTS
import { generateAudio } from './api';

let currentAudio = null;

export const speakText = async (text, voiceId = 'EXAVITQu4vr4xnSDxMaL', speed = 1.0, prewarmedAudio = null) => {
    return new Promise(async (resolve, reject) => {
        try {
            // If the caller provided a pre-warmed audio element (created during a synchronous click event), use it.
            // Otherwise, create a new one.
            const audioElement = prewarmedAudio || new Audio();
            
            if (currentAudio && currentAudio !== audioElement) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
            }
            
            currentAudio = audioElement;

            const audioData = await generateAudio(text, voiceId);
            const blob = new Blob([audioData], { type: 'audio/mpeg' });
            const url = URL.createObjectURL(blob);

            currentAudio.src = url;
            currentAudio.playbackRate = speed;

            currentAudio.onended = () => {
                URL.revokeObjectURL(url);
                if (currentAudio === audioElement) {
                    currentAudio = null;
                }
                resolve();
            };
            currentAudio.onerror = (err) => {
                URL.revokeObjectURL(url);
                if (currentAudio === audioElement) {
                    currentAudio = null;
                }
                reject(err);
            };

            await currentAudio.play();
        } catch (error) {
            console.error("Failed to play TTS audio:", error);
            reject(error);
        }
    });
};

export const stopAudio = () => {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
};

export class NativeAudioService {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.onStartCallback = null;
    }

    setCallbacks(onStart) {
        this.onStartCallback = onStart;
    }

    async start() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            });

            // Prefer webm/opus or mp4
            let mimeType = 'audio/webm;codecs=opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/mp4';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = ''; // Fallback to browser default
                }
            }

            this.mediaRecorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
            this.audioChunks = [];

            if (this.onStartCallback) {
                this.onStartCallback();
            }

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.start();
        } catch (error) {
            console.error("Error accessing microphone:", error);
            throw error;
        }
    }

    stop() {
        return new Promise((resolve, reject) => {
            if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
                resolve(null);
                return;
            }

            this.mediaRecorder.onstop = async () => {
                if (this.stream) {
                    this.stream.getTracks().forEach(track => track.stop());
                }

                if (this.audioChunks.length === 0) {
                    resolve(null);
                    return;
                }

                const audioBlob = new Blob(this.audioChunks);
                const base64Audio = await this.blobToBase64(audioBlob);

                // Return both the string and the mimeType so Gemini knows what to decode
                resolve({
                    base64: base64Audio.split(',')[1], // Strip the data URL prefix
                    mimeType: audioBlob.type || 'audio/webm'
                });
            };

            this.mediaRecorder.onerror = (event) => {
                reject(event.error);
            };

            try {
                this.mediaRecorder.stop();
            } catch (e) {
                console.warn("MediaRecorder already stopped", e);
                resolve(null);
            }
        });
    }

    abort() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
    }

    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
}
