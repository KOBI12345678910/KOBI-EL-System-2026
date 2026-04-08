import { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic, MicOff, Volume2, VolumeX, X, Send, Loader2,
  MessageCircle, ChevronDown, ChevronUp, Trash2, Settings,
  Globe, Sparkles, Clock, User, Bot
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || "";
const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isVoice?: boolean;
}

export default function VoiceAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [isMinimized, setIsMinimized] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [language] = useState("he-IL");

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language;

      recognition.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += t;
          } else {
            interimTranscript += t;
          }
        }
        setTranscript(interimTranscript);
        if (finalTranscript) {
          handleVoiceInput(finalTranscript);
          setTranscript("");
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    synthRef.current = window.speechSynthesis;

    return () => {
      recognitionRef.current?.abort();
      synthRef.current?.cancel();
    };
  }, [language]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) {
      alert("\u05D4\u05D3\u05E4\u05D3\u05E4\u05DF \u05E9\u05DC\u05DA \u05DC\u05D0 \u05EA\u05D5\u05DE\u05DA \u05D1\u05D6\u05D9\u05D4\u05D5\u05D9 \u05E7\u05D5\u05DC\u05D9");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, [isListening]);

  const speak = useCallback((text: string) => {
    if (isMuted || !synthRef.current) return;
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);

    // Try to find Hebrew voice
    const voices = synthRef.current.getVoices();
    const hebrewVoice = voices.find(v => v.lang.startsWith("he"));
    if (hebrewVoice) utterance.voice = hebrewVoice;

    synthRef.current.speak(utterance);
  }, [isMuted, language]);

  const handleVoiceInput = async (text: string) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date(),
      isVoice: true,
    };
    setMessages(prev => [...prev, userMsg]);
    await processMessage(text);
  };

  const handleTextSubmit = async () => {
    if (!inputText.trim()) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputText.trim(),
      timestamp: new Date(),
      isVoice: false,
    };
    setMessages(prev => [...prev, userMsg]);
    const text = inputText.trim();
    setInputText("");
    await processMessage(text);
  };

  const processMessage = async (text: string) => {
    setIsProcessing(true);
    try {
      const response = await fetch(`${API}/ai/chat`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ message: text, context: "erp_voice_assistant", language: "he" }),
      });

      let reply = "\u05E7\u05D9\u05D1\u05DC\u05EA\u05D9 \u05D0\u05EA \u05D4\u05D1\u05E7\u05E9\u05D4 \u05E9\u05DC\u05DA. \u05D0\u05E0\u05D9 \u05DE\u05E2\u05D1\u05D3 \u05D0\u05EA \u05D4\u05DE\u05D9\u05D3\u05E2.";
      if (response.ok) {
        const data = await response.json();
        reply = data.reply || data.response || data.message || reply;
      }

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: reply,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      speak(reply);
    } catch (err) {
      console.error("Voice assistant error:", err);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "\u05DE\u05E6\u05D8\u05E2\u05E8, \u05D0\u05D9\u05E8\u05E2\u05D4 \u05E9\u05D2\u05D9\u05D0\u05D4. \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    }
    setIsProcessing(false);
  };

  const clearHistory = () => {
    setMessages([]);
  };

  // Floating button when closed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 z-50 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center transition-all hover:scale-110 animate-pulse"
        title="\u05E2\u05D5\u05D6\u05E8 \u05E7\u05D5\u05DC\u05D9"
      >
        <Mic className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 left-6 z-50" style={{ width: isMinimized ? "auto" : "380px" }}>
      {isMinimized ? (
        <div className="flex gap-2">
          <button
            onClick={() => setIsMinimized(false)}
            className="w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg flex items-center justify-center"
          >
            <ChevronUp className="w-6 h-6" />
          </button>
          <button
            onClick={toggleListening}
            className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center ${isListening ? "bg-red-500 text-white animate-pulse" : "bg-green-500 text-white"}`}
          >
            {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
        </div>
      ) : (
        <Card className="shadow-2xl border-blue-200">
          <CardHeader className="pb-2 bg-gradient-to-l from-blue-600 to-blue-700 text-white rounded-t-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                <CardTitle className="text-sm">\u05E2\u05D5\u05D6\u05E8 \u05E7\u05D5\u05DC\u05D9 AI</CardTitle>
                {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="text-white hover:bg-blue-500 h-7 w-7 p-0" onClick={() => setIsMuted(!isMuted)}>
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="sm" className="text-white hover:bg-blue-500 h-7 w-7 p-0" onClick={() => setIsMinimized(true)}>
                  <ChevronDown className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className="text-white hover:bg-blue-500 h-7 w-7 p-0" onClick={() => setIsOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* Messages Area */}
            <div className="h-[300px] overflow-y-auto p-3 space-y-3 bg-gray-50">
              {messages.length === 0 && (
                <div className="text-center text-gray-400 mt-12 space-y-2">
                  <Mic className="w-8 h-8 mx-auto opacity-50" />
                  <p className="text-sm">\u05DC\u05D7\u05E5 \u05E2\u05DC \u05D4\u05DE\u05D9\u05E7\u05E8\u05D5\u05E4\u05D5\u05DF \u05D0\u05D5 \u05D4\u05E7\u05DC\u05D3 \u05D4\u05D5\u05D3\u05E2\u05D4</p>
                  <p className="text-xs">\u05D3\u05D1\u05E8 \u05D1\u05E2\u05D1\u05E8\u05D9\u05EA, \u05D0\u05E0\u05D9 \u05DE\u05E7\u05E9\u05D9\u05D1</p>
                </div>
              )}
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === "user" ? "bg-blue-100" : "bg-purple-100"}`}>
                    {msg.role === "user" ? <User className="w-4 h-4 text-blue-600" /> : <Bot className="w-4 h-4 text-purple-600" />}
                  </div>
                  <div className={`max-w-[80%] rounded-lg p-2.5 text-sm ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-white border shadow-sm"}`}>
                    <p>{msg.content}</p>
                    <div className={`flex items-center gap-1 mt-1 text-xs ${msg.role === "user" ? "text-blue-200" : "text-gray-400"}`}>
                      <Clock className="w-3 h-3" />
                      {msg.timestamp.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                      {msg.isVoice && <Mic className="w-3 h-3 mr-1" />}
                    </div>
                  </div>
                </div>
              ))}
              {isProcessing && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="bg-white border shadow-sm rounded-lg p-2.5">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" />
                      <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                      <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                    </div>
                  </div>
                </div>
              )}
              {transcript && (
                <div className="flex gap-2 flex-row-reverse">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Mic className="w-4 h-4 text-blue-600 animate-pulse" />
                  </div>
                  <div className="max-w-[80%] rounded-lg p-2.5 text-sm bg-blue-50 border border-blue-200 italic text-gray-600">
                    {transcript}...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 border-t bg-white">
              {/* Voice indicator */}
              {isListening && (
                <div className="flex items-center gap-2 mb-2 p-2 bg-red-50 rounded-lg">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-xs text-red-600">\u05DE\u05D0\u05D6\u05D9\u05DF... \u05D3\u05D1\u05E8 \u05E2\u05DB\u05E9\u05D9\u05D5</span>
                </div>
              )}
              {isSpeaking && (
                <div className="flex items-center gap-2 mb-2 p-2 bg-blue-50 rounded-lg">
                  <Volume2 className="w-3 h-3 text-blue-500 animate-pulse" />
                  <span className="text-xs text-blue-600">\u05DE\u05D3\u05D1\u05E8...</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={toggleListening}
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                    isListening
                      ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-200"
                      : "bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-600"
                  }`}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <Input
                  placeholder="\u05D4\u05E7\u05DC\u05D3 \u05D4\u05D5\u05D3\u05E2\u05D4..."
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleTextSubmit()}
                  className="flex-1 text-sm"
                  disabled={isProcessing}
                />
                <Button size="sm" disabled={!inputText.trim() || isProcessing} onClick={handleTextSubmit} className="h-10 w-10 p-0">
                  <Send className="w-4 h-4" />
                </Button>
              </div>

              {/* History button */}
              <div className="flex justify-between items-center mt-2">
                <Button variant="ghost" size="sm" className="text-xs text-gray-400" onClick={clearHistory}>
                  <Trash2 className="w-3 h-3 ml-1" />\u05E0\u05E7\u05D4 \u05D4\u05D9\u05E1\u05D8\u05D5\u05E8\u05D9\u05D4
                </Button>
                <Badge variant="outline" className="text-xs"><Globe className="w-3 h-3 ml-1" />\u05E2\u05D1\u05E8\u05D9\u05EA</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
