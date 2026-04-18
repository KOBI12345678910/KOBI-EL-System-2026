import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Send, Loader2, Edit2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { entityCreate, entityDelete, entityFilter, entityUpdate } from "@/lib/entity-api";
import { authJson } from "@/lib/utils";

export default function ChatWindow({ channelId, channelName, channelType }) {
    const [message, setMessage] = useState('');
    const [user, setUser] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editText, setEditText] = useState('');
    const messagesEndRef = useRef(null);
    const queryClient = useQueryClient();

    useEffect(() => {
        authJson("/api/auth/me").then(setUser);
    }, []);

    const { data: messages = [] } = useQuery({
        queryKey: ['chatMessages', channelId],
        queryFn: async () => {
            const msgs = await entityFilter<any>("chat-messages", 
                { channel_id: channelId },
                'created_date',
                100
            );
            return msgs.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        },
        refetchInterval: 3000
    });

    const sendMessageMutation = useMutation({
        mutationFn: async (text) => {
            return entityCreate<any>("chat-messages", {
                channel_id: channelId,
                user_id: user.id,
                user_name: user.full_name,
                user_department: user.department || 'General',
                message: text,
                timestamp: new Date().toISOString()
            });
        },
        onSuccess: () => {
            setMessage('');
            queryClient.invalidateQueries({ queryKey: ['chatMessages', channelId] });
        }
    });

    const updateMessageMutation = useMutation({
        mutationFn: async ({ id, text }) => {
            return entityUpdate<any>("chat-messages", id, {
                message: text,
                is_edited: true,
                edited_at: new Date().toISOString()
            });
        },
        onSuccess: () => {
            setEditingId(null);
            setEditText('');
            queryClient.invalidateQueries({ queryKey: ['chatMessages', channelId] });
        }
    });

    const deleteMessageMutation = useMutation({
        mutationFn: async (id) => {
            return entityDelete("chat-messages", id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['chatMessages', channelId] });
        }
    });

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = () => {
        if (message.trim()) {
            sendMessageMutation.mutate(message);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="border-b pb-3">
                <CardTitle className="text-lg">{channelName}</CardTitle>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-400">
                        <p>אין הודעות עדיין. התחל שיחה!</p>
                    </div>
                ) : (
                    <>
                        {messages.map((msg) => (
                            <div key={msg.id} className="flex gap-3">
                                <div className="flex-1">
                                    <div className="flex items-baseline gap-2 mb-1">
                                        <span className="font-semibold text-sm text-slate-900">
                                            {msg.user_name}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                            {format(new Date(msg.created_date), 'HH:mm', { locale: he })}
                                        </span>
                                        {msg.is_edited && (
                                            <span className="text-xs text-slate-400 italic">(נערך)</span>
                                        )}
                                    </div>
                                    {editingId === msg.id ? (
                                        <div className="flex gap-2 mt-2">
                                            <Input
                                                value={editText}
                                                onChange={(e) => setEditText(e.target.value)}
                                                className="text-sm"
                                            />
                                            <Button
                                                size="sm"
                                                onClick={() => updateMessageMutation.mutate({ id: msg.id, text: editText })}
                                                disabled={updateMessageMutation.isPending}
                                            >
                                                שמור
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setEditingId(null)}
                                            >
                                                בטל
                                            </Button>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-700 bg-slate-50 p-2 rounded">
                                            {msg.message}
                                        </p>
                                    )}
                                </div>
                                {user?.id === msg.user_id && editingId !== msg.id && (
                                    <div className="flex gap-1">
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-6 w-6"
                                            onClick={() => {
                                                setEditingId(msg.id);
                                                setEditText(msg.message);
                                            }}
                                        >
                                            <Edit2 className="w-3 h-3" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-6 w-6 text-red-500"
                                            onClick={() => deleteMessageMutation.mutate(msg.id)}
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </CardContent>

            <div className="border-t p-4 flex gap-2">
                <Input
                    placeholder="כתוב הודעה..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={sendMessageMutation.isPending}
                />
                <Button
                    onClick={handleSend}
                    disabled={sendMessageMutation.isPending || !message.trim()}
                >
                    {sendMessageMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Send className="w-4 h-4" />
                    )}
                </Button>
            </div>
        </Card>
    );
}