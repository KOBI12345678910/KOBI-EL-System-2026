import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageCircle, X, Send, Search, Settings, Lock } from 'lucide-react';
import { cn , authJson } from "@/lib/utils";
import { entityCreate, entityFilter, entityList } from "@/lib/entity-api";

export default function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedChannel, setSelectedChannel] = useState(null);
    const [messageText, setMessageText] = useState('');
    const [user, setUser] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const messagesEndRef = useRef(null);
    const queryClient = useQueryClient();

    useEffect(() => {
        authJson("/api/auth/me").then(setUser).catch(() => {});
    }, []);

    const { data: channels = [], isLoading: channelsLoading } = useQuery({
        queryKey: ['chatChannels'],
        queryFn: async () => {
            if (!user) return [];
            const allChannels = await entityList<any>("organization-chats");
            return allChannels.filter(ch => 
                ch.channel_name !== 'ספורט' && 
                ch.channel_name !== 'תמיכה'
            );
        },
        enabled: !!user
    });

    const { data: messages = [], isLoading: messagesLoading } = useQuery({
        queryKey: ['messages', selectedChannel?.id],
        queryFn: () => entityFilter<any>("chat-messages", { channel_id: selectedChannel.id }),
        enabled: !!selectedChannel,
        refetchInterval: 2000
    });

    const sendMessageMutation = useMutation({
        mutationFn: async () => {
            if (!messageText.trim() || !selectedChannel || !user) return;
            await entityCreate<any>("chat-messages", {
                channel_id: selectedChannel.id,
                user_id: user.id,
                user_name: user.full_name,
                user_department: user.department || 'כללי',
                message: messageText,
                timestamp: new Date().toISOString()
            });
            setMessageText('');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['messages', selectedChannel?.id] });
        }
    });

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    if (!user) return null;

    const filteredChannels = channels.filter(ch => 
        ch.channel_name.includes(searchQuery) || 
        (ch.description && ch.description.includes(searchQuery))
    );

    const getChannelIcon = (type) => {
        switch(type) {
            case 'general': return '🌐';
            case 'department': return '🏢';
            case 'direct': return '💬';
            default: return '📍';
        }
    };

    const currentUserIsAdmin = user?.role === 'admin';

    return (
        <div className="fixed bottom-6 right-6 z-50">
            {!isOpen ? (
                <button
                    onClick={() => setIsOpen(true)}
                    className="rounded-full w-14 h-14 flex items-center justify-center shadow-lg bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white transition-all hover:scale-110"
                    title="פתח צ'ט"
                >
                    <MessageCircle className="w-6 h-6" />
                    <span className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></span>
                </button>
            ) : (
                <Card className="w-96 h-[32rem] flex flex-col shadow-2xl rounded-xl overflow-hidden border-0">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 flex items-center justify-between">
                        {!selectedChannel ? (
                            <>
                                <div>
                                    <h3 className="font-bold text-lg">צ'ט ארגוני</h3>
                                    <p className="text-xs opacity-90">{channels.length} ערוצים</p>
                                </div>
                                <div className="flex gap-2">
                                    {currentUserIsAdmin && (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="text-white hover:bg-white/20"
                                            title="הגדרות צ'ט"
                                        >
                                            <Settings className="w-4 h-4" />
                                        </Button>
                                    )}
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => setIsOpen(false)}
                                        className="text-white hover:bg-white/20"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div>
                                    <h3 className="font-bold text-lg">{selectedChannel.channel_name}</h3>
                                    <p className="text-xs opacity-90">{getChannelIcon(selectedChannel.channel_type)} {selectedChannel.channel_type}</p>
                                </div>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setSelectedChannel(null)}
                                    className="text-white hover:bg-white/20"
                                    title="חזור לערוצים"
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </>
                        )}
                    </div>

                    {/* Content */}
                    {!selectedChannel ? (
                        <>
                            {/* Search */}
                            <div className="p-3 border-b border-slate-200">
                                <div className="relative">
                                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        placeholder="חיפוש ערוץ..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-3 pr-10 h-9"
                                    />
                                </div>
                            </div>

                            {/* Channels List */}
                            <div className="flex-1 overflow-y-auto space-y-1 p-2">
                                {channelsLoading ? (
                                    <div className="flex items-center justify-center h-full">
                                        <p className="text-slate-400 text-sm">טוען...</p>
                                    </div>
                                ) : filteredChannels.length === 0 ? (
                                    <div className="flex items-center justify-center h-full">
                                        <p className="text-slate-400 text-sm">אין ערוצים</p>
                                    </div>
                                ) : (
                                    filteredChannels.map(ch => (
                                        <button
                                            key={ch.id}
                                            onClick={() => setSelectedChannel(ch)}
                                            className="w-full text-right p-3 rounded-lg hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-lg">{getChannelIcon(ch.channel_type)}</span>
                                                <div className="flex-1 mr-2">
                                                    <p className="font-semibold text-sm text-slate-900">{ch.channel_name}</p>
                                                    {ch.description && (
                                                        <p className="text-xs text-slate-500 truncate">{ch.description}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                                {messagesLoading ? (
                                    <div className="flex items-center justify-center h-full">
                                        <p className="text-slate-400 text-sm">טוען הודעות...</p>
                                    </div>
                                ) : messages.length === 0 ? (
                                    <div className="flex items-center justify-center h-full">
                                        <p className="text-slate-400 text-sm">אין הודעות בערוץ זה</p>
                                    </div>
                                ) : (
                                    messages.map((msg, idx) => (
                                        <div
                                            key={msg.id}
                                            className={cn(
                                                'flex gap-2',
                                                msg.user_id === user.id ? 'flex-row-reverse' : 'flex-row'
                                            )}
                                        >
                                            <Avatar className="w-7 h-7 flex-shrink-0">
                                                <AvatarFallback className="text-xs bg-indigo-100 text-indigo-700">
                                                    {msg.user_name?.charAt(0) || 'U'}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className={cn(
                                                'max-w-xs',
                                                msg.user_id === user.id ? 'text-left' : 'text-right'
                                            )}>
                                                <p className="text-xs font-semibold text-slate-600 mb-1">{msg.user_name}</p>
                                                <div className={cn(
                                                    'rounded-lg p-2.5 text-sm',
                                                    msg.user_id === user.id
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-white text-slate-900 border border-slate-200'
                                                )}>
                                                    {msg.message}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <div className="border-t border-slate-200 p-3 flex gap-2 bg-white">
                                <Input
                                    placeholder="הודעה..."
                                    value={messageText}
                                    onChange={(e) => setMessageText(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessageMutation.mutate())}
                                    className="text-sm flex-1"
                                />
                                <Button
                                    size="icon"
                                    onClick={() => sendMessageMutation.mutate()}
                                    className="bg-indigo-600 hover:bg-indigo-700"
                                    disabled={sendMessageMutation.isPending}
                                >
                                    <Send className="w-4 h-4" />
                                </Button>
                            </div>
                        </>
                    )}
                </Card>
            )}
        </div>
    );
}