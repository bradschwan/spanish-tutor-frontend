import { useState, useRef, useEffect } from 'react';
import { Mic, Search, GraduationCap, XCircle, RotateCcw, Settings, Volume2, X } from 'lucide-react';
import { chatWithGemini, fetchProgress, resetChat, clearMistakes, deleteMistake } from './services/api';
import { speakText, stopAudio, NativeAudioService } from './services/audio';

const VOICES = [
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Male)' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice (Female)' },
  { id: 'hpp4J3VqNfWAUOO0d1Us', name: 'Bella (Female)' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill (Male)' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian (Male)' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum (Male)' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie (Male)' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte (Female, Sultry)' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris (Male)' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (Male)' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (Female, Strong)' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli (Female, Emotional)' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric (Male)' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (Male)' },
  { id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry (Male)' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica (Female)' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura (Female)' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam (Male)' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily (Female)' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda (Female)' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Female, Calm)' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River (Neutral)' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger (Male)' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (Female)' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will (Male)' }
];

function App() {
  const [messages, setMessages] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isMicReady, setIsMicReady] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState({ mistakes: [], words: [] });
  const [showProgress, setShowProgress] = useState(false);

  // Settings State - load from localStorage or use defaults
  const [showSettings, setShowSettings] = useState(false);
  const [difficulty, setDifficulty] = useState(() => localStorage.getItem('spanishtutor_difficulty') || 'beginner');
  const [voiceId, setVoiceId] = useState(() => localStorage.getItem('spanishtutor_voiceId') || VOICES.find(v => v.name.includes('Charlotte'))?.id || VOICES[0].id);
  const [speechSpeed, setSpeechSpeed] = useState(() => parseFloat(localStorage.getItem('spanishtutor_speed')) || 0.9);

  const speechNode = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  useEffect(() => {
    // Only scroll when an actual message is added, tutor is thinking, or we first start listening
    scrollToBottom();
  }, [messages, isLoading, isListening]);

  useEffect(() => {
    loadProgress();
  }, []);

  // Persist settings
  useEffect(() => {
    localStorage.setItem('spanishtutor_difficulty', difficulty);
    localStorage.setItem('spanishtutor_voiceId', voiceId);
    localStorage.setItem('spanishtutor_speed', speechSpeed);
  }, [difficulty, voiceId, speechSpeed]);

  const loadProgress = async () => {
    try {
      const data = await fetchProgress();
      setProgress(data);
    } catch (e) {
      console.error("Failed to load progress", e);
    }
  };

  const handleClearMistakes = async () => {
    try {
      await clearMistakes();
      await loadProgress();
    } catch (e) {
      console.error("Failed to clear mistakes", e);
    }
  };

  const handleDeleteMistake = async (id) => {
    try {
      await deleteMistake(id);
      await loadProgress();
    } catch (e) {
      console.error("Failed to delete mistake", e);
    }
  };

  const startListening = async () => {
    if (isListening) {
      // Manual stop
      // IMPORTANT iOS FIX: Synchronously create the audio element exactly during the user's tap
      const prewarmedAudio = new Audio();
      // Provide a tiny silent sound to properly "unlock" the audio context right now
      prewarmedAudio.src = 'data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
      prewarmedAudio.load();

      let audioResult = null;
      if (speechNode.current) {
        audioResult = await speechNode.current.stop();
      }
      setIsListening(false);
      setIsMicReady(false);

      // Submit whatever we have so far
      if (audioResult) {
        handleUserSpeech(audioResult, prewarmedAudio);
      }
      return;
    }

    // Stop any playing TTS audio
    stopAudio();

    if (speechNode.current) {
      speechNode.current.setCallbacks(null);
      try {
        speechNode.current.abort();
      } catch (e) { }
      speechNode.current = null;
    }

    setIsListening(true);
    setIsMicReady(false);

    speechNode.current = new NativeAudioService();
    speechNode.current.setCallbacks(
      () => {
        setIsMicReady(true);
      }
    );

    speechNode.current.start().catch((err) => {
      console.error(err);
      setIsListening(false);
      setIsMicReady(false);
    });
  };

  const handleUserSpeech = async (audioData, prewarmedAudio) => {
    if (!audioData) return;

    // Send a placeholder message to the UI
    const userMsg = { id: Date.now(), role: 'user', text: "🎵 [Audio Message]" };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await chatWithGemini(audioData, difficulty); 

      // Update the placeholder audio message with the actual transcription
      if (response.transcription) {
          setMessages(prev => 
              prev.map(msg => 
                  msg.id === userMsg.id ? { ...msg, text: response.transcription } : msg
              )
          );
      }

      const assistantMsg = {
        id: Date.now() + 1,
        role: 'tutor',
        phrase: response.responsePhrase,
        english: response.responseEnglish,
        isCorrect: response.isCorrect,
        correction: response.correction,
        expected: response.expected
      };

      setMessages(prev => [...prev, assistantMsg]);
      speakText(response.responsePhrase, voiceId, speechSpeed, prewarmedAudio);

      // Reload progress if there was a mistake
      if (!response.isCorrect) {
        loadProgress();
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || "Error connecting to tutor.";
      setMessages(prev => [...prev, { id: Date.now(), role: 'system', text: errorMessage }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    await resetChat();
    setMessages([]);
  }

  const handleReplayAudio = (text) => {
    speakText(text, voiceId, speechSpeed);
  };

  return (
    <div className="min-h-[100dvh] md:h-[100dvh] md:overflow-hidden bg-slate-900 text-slate-100 font-sans flex flex-col md:flex-row">
      {/* Sidebar Progress Tracker */}
      <div className={`w-full md:w-80 bg-slate-800 border-r border-slate-700 p-6 flex-shrink-0 flex flex-col ${showProgress ? 'block' : 'hidden md:flex'}`}>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-2">
            <GraduationCap className="text-blue-400" /> Learn Spanish
          </h1>
          <button className="md:hidden text-slate-400 hover:text-slate-200" onClick={() => setShowProgress(false)}>
            <XCircle />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto w-full">
          <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Things to Work On</h2>
            {(progress?.mistakes?.length > 0) && (
              <button
                onClick={handleClearMistakes}
                className="text-xs text-red-400 hover:text-red-300 bg-red-900/30 hover:bg-red-900/50 px-2 py-1 rounded transition-colors border border-red-900/50"
              >
                Clear All
              </button>
            )}
          </div>
          {(!progress?.mistakes || progress.mistakes.length === 0) ? (
            <p className="text-sm text-slate-500 italic">No mistakes logged yet! Keep practicing.</p>
          ) : (
            <div className="space-y-4">
              {progress.mistakes.map((m) => (
                <div key={m.id || Math.random()} className="bg-red-900/20 p-3 rounded-lg border border-red-900/50 group relative">
                  <button
                    onClick={() => handleDeleteMistake(m.id)}
                    className="absolute top-2 right-2 p-1 text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 hover:bg-slate-700 rounded-md"
                    title="Remove item"
                  >
                    <X size={14} />
                  </button>
                  <p className="text-sm line-through text-red-400/80 pr-6">{m.user_input}</p>
                  <p className="text-sm font-medium text-green-400">{m.expected}</p>
                  <p className="text-xs text-slate-400 mt-1">{m.explanation}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Interface */}
      <div className="flex-1 flex flex-col h-[100dvh] relative">
        <header className="bg-slate-800 border-b border-slate-700 p-4 flex justify-between items-center shadow-lg z-10 relative">
          <button className="md:hidden text-indigo-400 font-medium" onClick={() => setShowProgress(true)}>
            Progress
          </button>
          <div className="text-slate-400 font-medium flex-1 text-center hidden md:block">Tutor Session</div>

          <div className="flex items-center gap-2 relative">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-700 rounded-lg transition-colors"
              title="Settings"
            >
              <Settings size={20} />
            </button>
            <button onClick={handleReset} className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors" title="Reset Session">
              <RotateCcw size={20} />
            </button>

            {/* Settings Dropdown */}
            {showSettings && (
              <div className="absolute right-0 top-12 w-72 bg-slate-800 border border-slate-700 shadow-2xl rounded-xl p-5 z-50">
                <h3 className="font-semibold text-slate-200 mb-4 border-b border-slate-700 pb-2">Tutor Settings</h3>

                {/* Difficulty */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Difficulty</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
                  >
                    <option value="beginner">Beginner (Slow, Simple)</option>
                    <option value="intermediate">Intermediate (Normal)</option>
                    <option value="advanced">Advanced (Fast, Complex)</option>
                  </select>
                </div>

                {/* Voice Selection */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Voice</label>
                  <select
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
                  >
                    {VOICES.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>

                {/* Speech Speed */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Speech Speed</label>
                    <span className="text-xs font-semibold text-indigo-300 bg-indigo-900/50 px-2 py-0.5 rounded border border-indigo-700/50">{speechSpeed}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.1"
                    value={speechSpeed}
                    onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>Slower</span>
                    <span>Normal</span>
                    <span>Faster</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-900 pb-56">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
              <GraduationCap size={48} className="mb-4 text-slate-600" />
              <p className="text-lg">Tap the microphone to start speaking Spanish!</p>
              <p className="text-sm">Say something like "Hola" or "Buenos días".</p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] md:max-w-[70%] rounded-2xl p-4 shadow-sm ${m.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-none'
                : m.role === 'system'
                  ? 'bg-red-900/30 text-red-400 border border-red-800 text-center w-full rounded-2xl'
                  : 'bg-slate-800 border border-slate-700 rounded-bl-none text-slate-200 shadow-md'
                }`}>
                {m.role === 'user' ? (
                  <p className="text-lg">{m.text}</p>
                ) : m.role === 'tutor' ? (
                  <div className="space-y-2">
                    {!m.isCorrect && m.correction && (
                      <div className="bg-amber-900/20 p-3 rounded-xl border border-amber-800/50 mb-3 text-sm text-slate-300">
                        <p className="font-semibold text-amber-400 mb-1">Correction:</p>
                        <p>You should say: <span className="font-medium text-amber-200">{m.expected}</span></p>
                        <p className="mt-1 opacity-90 text-slate-400">{m.correction}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-medium tracking-tight text-white">{m.phrase}</p>
                      <button
                        onClick={() => handleReplayAudio(m.phrase)}
                        className="p-1.5 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-900/40 rounded-full transition-colors"
                        title="Replay Audio"
                      >
                        <Volume2 size={18} />
                      </button>
                    </div>
                    <p className="text-sm text-slate-400">{m.english}</p>
                  </div>
                ) : (
                  <p>{m.text}</p>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-none p-4 shadow-md flex space-x-2 w-20 justify-center">
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} className="h-20" />
        </main>

        {/* Input Area */}
        <div className="absolute flex flex-col bottom-0 w-full md:w-[calc(100%-20rem)] bg-gradient-to-t from-slate-900/80 to-transparent pt-24 pb-8 px-6 pointer-events-none">
          {isListening && (
            <div className="w-full flex justify-center mb-6">
              <div className="bg-slate-800 px-6 py-4 rounded-full border border-slate-700 shadow-xl flex items-center gap-3 animate-pulse pointer-events-auto">
                {!isMicReady ? (
                  <>
                    <div className="w-3 h-3 bg-amber-500 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.6)] animate-ping"></div>
                    <span className="text-slate-400 font-medium">Starting mic...</span>
                  </>
                ) : (
                  <>
                    <div className="w-3 h-3 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.6)]"></div>
                    <span className="text-slate-300 font-medium">Recording Audio...</span>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-center w-full pointer-events-auto">
            <button
              onClick={startListening}
              className={`p-6 rounded-full shadow-2xl transition-all duration-300 flex items-center justify-center ${isListening
                ? 'bg-red-500 text-white scale-110 shadow-red-500/40'
                : 'bg-indigo-600 text-white hover:bg-blue-500 hover:scale-105 shadow-indigo-600/30 hover:shadow-blue-500/50'
                }`}
            >
              <Mic size={32} color="white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
