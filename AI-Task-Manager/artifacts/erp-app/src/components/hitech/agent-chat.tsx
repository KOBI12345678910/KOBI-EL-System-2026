import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
    MessageSquare, Send, X, Sparkles, Users, 
    TrendingUp, AlertTriangle, CheckCircle2, Loader2 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AgentChat({ agent, onClose, onEscalate }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [conversation, setConversation] = useState(null);
    const scrollRef = useRef(null);

    useEffect(() => {
        initChat();
    }, [agent]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const initChat = async () => {
        // Welcome message
        const welcome = {
            id: Date.now(),
            role: 'assistant',
            content: `שלום! אני ${agent.name}, ${agent.role}. איך אוכל לעזור לך היום?`,
            timestamp: new Date()
        };
        setMessages([welcome]);

        // Create conversation context
        try {
            const conv = await fetch("/api/integrations/invoke-llm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
                prompt: `אתה ${agent.name}, ${agent.role} בצוות הייטק. התחל שיחה ידידותית ומקצועית.`,
                response_json_schema: {
                    type: 'object',
                    properties: {
                        conversation_id: { type: 'string' },
                        context: { type: 'string' }
                    }
                }
            }) });
            setConversation(conv);
        } catch (error) {
            console.error('Chat init failed:', error);
        }
    };

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg = {
            id: Date.now(),
            role: 'user',
            content: input,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        try {
            // Build conversation history
            const history = messages.map(m => `${m.role}: ${m.content}`).join('\n');
            
            // Get AI response with context
            const response = await fetch("/api/integrations/invoke-llm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
                prompt: `
אתה ${agent.name}, ${agent.role} בחברת הייטק שעובדת על MetalPro ERP.

היסטוריית שיחה:
${history}

משתמש: ${input}

השב באופן מקצועי, ממוקד וידידותי. אם יש בעיה טכנית או משימה - הצע פתרון קונקרטי.
אם זה דחוף או קריטי - ציין זאת במפורש.
`,
                response_json_schema: {
                    type: 'object',
                    properties: {
                        response: { type: 'string' },
                        is_critical: { type: 'boolean' },
                        suggested_action: { type: 'string' },
                        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
                    }
                }
            }) });

            const aiMsg = {
                id: Date.now() + 1,
                role: 'assistant',
                content: response.response,
                timestamp: new Date(),
                metadata: {
                    is_critical: response.is_critical,
                    suggested_action: response.suggested_action,
                    priority: response.priority
                }
            };

            setMessages(prev => [...prev, aiMsg]);

            // Auto-escalate if critical
            if (response.is_critical && onEscalate) {
                setTimeout(() => {
                    onEscalate({
                        agent: agent.name,
                        issue: input,
                        priority: response.priority,
                        action: response.suggested_action
                    });
                }, 1000);
            }

        } catch (error) {
            console.error('Send message failed:', error);
            const errorMsg = {
                id: Date.now() + 1,
                role: 'assistant',
                content: 'מצטער, נתקלתי בבעיה. נסה שוב.',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleSummarize = async () => {
        setIsTyping(true);
        try {
            const history = messages.map(m => `${m.role}: ${m.content}`).join('\n');
            
            const summary = await fetch("/api/integrations/invoke-llm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
                prompt: `סכם את השיחה הבאה בצורה תמציתית:

${history}

החזר סיכום קצר, נקודות עיקריות, והמלצות לפעולה.`,
                response_json_schema: {
                    type: 'object',
                    properties: {
                        summary: { type: 'string' },
                        key_points: { type: 'array', items: { type: 'string' } },
                        recommendations: { type: 'array', items: { type: 'string' } }
                    }
                }
            }) });

            const summaryMsg = {
                id: Date.now(),
                role: 'system',
                content: `📋 סיכום שיחה:\n\n${summary.summary}\n\nנקודות עיקריות:\n${summary.key_points.map(p => `• ${p}`).join('\n')}\n\nהמלצות:\n${summary.recommendations.map(r => `→ ${r}`).join('\n')}`,
                timestamp: new Date()
            };

            setMessages(prev => [...prev, summaryMsg]);
        } catch (error) {
            console.error('Summarize failed:', error);
        } finally {
            setIsTyping(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed bottom-4 right-4 z-[9999] w-[420px] h-[600px] flex flex-col"
        >
            <Card className="flex flex-col h-full border-2 shadow-2xl" style={{ borderColor: agent.color }}>
                {/* Header */}
                <div 
                    className="p-4 border-b flex items-center justify-between"
                    style={{ background: `${agent.color}10`, borderColor: `${agent.color}30` }}
                >
                    <div className="flex items-center gap-3">
                        <div 
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl relative"
                            style={{ background: `${agent.color}20` }}
                        >
                            {agent.icon}
                            <div 
                                className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white animate-pulse"
                                style={{ background: agent.color }}
                            />
                        </div>
                        <div>
                            <div className="font-bold text-sm" style={{ color: agent.color }}>
                                {agent.name}
                            </div>
                            <div className="text-xs text-slate-500">{agent.role}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleSummarize}
                            className="text-xs"
                        >
                            <Sparkles className="w-3 h-3 ml-1" />
                            סכם
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* Messages */}
                <ScrollArea ref={scrollRef} className="flex-1 p-4">
                    <div className="space-y-3">
                        <AnimatePresence>
                            {messages.map((msg) => (
                                <motion.div
                                    key={msg.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                                            msg.role === 'user'
                                                ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                                                : msg.role === 'system'
                                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                                                : 'bg-slate-100 text-slate-900'
                                        }`}
                                    >
                                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                        {msg.metadata?.is_critical && (
                                            <div className="mt-2 flex items-center gap-2">
                                                <AlertTriangle className="w-4 h-4 text-red-300" />
                                                <span className="text-xs font-semibold">קריטי - מועלה למשימות</span>
                                            </div>
                                        )}
                                        {msg.metadata?.suggested_action && (
                                            <div className="mt-2 text-xs bg-white/20 rounded px-2 py-1">
                                                💡 {msg.metadata.suggested_action}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {isTyping && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex justify-start"
                            >
                                <div className="bg-slate-100 rounded-2xl px-4 py-3">
                                    <div className="flex gap-1">
                                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </ScrollArea>

                {/* Input */}
                <div className="p-4 border-t bg-slate-50">
                    <div className="flex gap-2">
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="הקלד הודעה..."
                            className="flex-1"
                            disabled={isTyping}
                        />
                        <Button
                            onClick={handleSend}
                            disabled={!input.trim() || isTyping}
                            style={{ background: agent.color }}
                        >
                            {isTyping ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Send className="w-4 h-4" />
                            )}
                        </Button>
                    </div>
                </div>
            </Card>
        </motion.div>
    );
}