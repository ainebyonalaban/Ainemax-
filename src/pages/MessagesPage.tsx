import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Download,
  Image as ImageIcon,
  Loader2,
  MessageSquarePlus,
  Send,
  Users,
  X,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { downloadMediaFile, uploadImageAsset } from '../services/mediaUploadService';
import {
  createGroupConversation,
  getOrCreateDirectConversation,
  markMessagesRead,
  sendChatMessage,
  setConversationTyping,
  subscribeConversationMessages,
  subscribeUserConversations,
} from '../services/messagingService';
import { fetchActiveUsers } from '../services/socialService';
import { ChatMessage, Conversation } from '../types/features';
import { UserPublicProfile } from '../types/user';

function formatMessageTime(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  return ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessagesPage() {
  const { profile, firebaseUser } = useAuth();
  const [searchParams] = useSearchParams();
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<UserPublicProfile[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(() => searchParams.get('chat'));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);

  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New conversation modal
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newMode, setNewMode] = useState<'direct' | 'group'>('direct');
  const [groupTitle, setGroupTitle] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [creatingConv, setCreatingConv] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    setLoadingConvs(true);
    const unsub = subscribeUserConversations(firebaseUser.uid, (list) => {
      setConversations(list);
      setLoadingConvs(false);
    });
    fetchActiveUsers(60)
      .then((users) => setDirectoryUsers(users.filter((u) => u.uid !== firebaseUser.uid)))
      .catch(() => setDirectoryUsers([]));
    return () => unsub();
  }, [firebaseUser]);

  const userById = useMemo(() => {
    const map = new Map<string, UserPublicProfile>();
    directoryUsers.forEach((u) => map.set(u.uid, u));
    if (profile) map.set(profile.uid, profile);
    return map;
  }, [directoryUsers, profile]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConvId) ?? null,
    [conversations, selectedConvId]
  );

  useEffect(() => {
    if (!activeConversation || !firebaseUser) {
      setMessages([]);
      return;
    }
    const unsub = subscribeConversationMessages(
      activeConversation.id,
      firebaseUser.uid,
      (msgs) => {
        setMessages(msgs);
        const unread = msgs.filter(
          (m) => m.senderId !== firebaseUser.uid && !m.readBy.includes(firebaseUser.uid)
        );
        if (unread.length > 0) {
          void markMessagesRead(activeConversation.id, firebaseUser.uid, unread);
        }
      }
    );
    return () => unsub();
  }, [activeConversation, firebaseUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const getConversationDisplayName = (conv: Conversation): string => {
    if (conv.type === 'group') return conv.title || 'Group Chat';
    const otherId = conv.participantIds.find((id) => id !== firebaseUser?.uid);
    const other = otherId ? userById.get(otherId) : undefined;
    return other ? `${other.displayName} (@${other.username})` : conv.title || 'Direct Message';
  };

  const handleTypingChange = (val: string) => {
    setMessageText(val);
    if (!activeConversation || !firebaseUser) return;
    if (val.trim().length > 0) {
      void setConversationTyping(activeConversation.id, firebaseUser.uid, true);
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = window.setTimeout(() => {
        void setConversationTyping(activeConversation.id, firebaseUser.uid, false);
      }, 2500);
    } else {
      void setConversationTyping(activeConversation.id, firebaseUser.uid, false);
    }
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConversation || !profile || !messageText.trim()) return;
    setSending(true);
    setErrorMsg(null);
    const txt = messageText;
    setMessageText('');
    try {
      await sendChatMessage(activeConversation, profile, { text: txt });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to send message.');
      setMessageText(txt);
    } finally {
      setSending(false);
    }
  };

  const handleSendImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeConversation || !profile) return;
    setUploadingImg(true);
    setErrorMsg(null);
    try {
      const imageUrl = await uploadImageAsset(file, 'msg', profile.uid);
      await sendChatMessage(activeConversation, profile, {
        text: messageText.trim(),
        imageUrl,
      });
      setMessageText('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to upload chat image.');
    } finally {
      setUploadingImg(false);
    }
  };

  const handleStartDirectChat = async (target: UserPublicProfile) => {
    if (!profile) return;
    setCreatingConv(true);
    try {
      const convId = await getOrCreateDirectConversation(profile, target);
      setSelectedConvId(convId);
      setNewModalOpen(false);
    } finally {
      setCreatingConv(false);
    }
  };

  const handleCreateGroupChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || selectedUserIds.size === 0 || !groupTitle.trim()) return;
    setCreatingConv(true);
    try {
      const convId = await createGroupConversation(
        profile,
        groupTitle,
        Array.from(selectedUserIds)
      );
      setSelectedConvId(convId);
      setGroupTitle('');
      setSelectedUserIds(new Set());
      setNewModalOpen(false);
    } finally {
      setCreatingConv(false);
    }
  };

  const typingUsers = (activeConversation?.typingUserIds || [])
    .filter((id) => id !== firebaseUser?.uid)
    .map((id) => userById.get(id)?.displayName || 'Someone');

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[600px] h-[calc(100dvh-160px)] md:h-[680px]">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleSendImage}
      />

      {/* Conversation List */}
      <aside
        className={`md:col-span-4 border-r border-slate-200 dark:border-slate-800 flex flex-col ${
          activeConversation ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Messages</h2>
          <button
            type="button"
            onClick={() => setNewModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>New</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {loadingConvs ? (
            <div className="p-6 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>Loading conversations...</span>
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">No conversations yet</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Start a direct message or group chat with someone on AINEMAX.
              </p>
              <button
                type="button"
                onClick={() => setNewModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
              >
                Start a chat
              </button>
            </div>
          ) : (
            conversations.map((conv) => {
              const selected = conv.id === selectedConvId;
              const name = getConversationDisplayName(conv);
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setSelectedConvId(conv.id)}
                  className={`w-full p-3.5 text-left flex items-center gap-3 transition-colors ${
                    selected
                      ? 'bg-blue-50/80 dark:bg-blue-950/50'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold text-sm flex items-center justify-center shrink-0">
                    {conv.type === 'group' ? (
                      <Users className="w-4 h-4" />
                    ) : (
                      name.slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{name}</p>
                      <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                        {formatMessageTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {conv.lastMessageText || 'No messages yet'}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Active Chat Thread */}
      <section
        className={`md:col-span-8 flex flex-col bg-slate-50/40 dark:bg-slate-950/50 ${
          activeConversation ? 'flex' : 'hidden md:flex'
        }`}
      >
        {!activeConversation ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-2">
            <MessageSquarePlus className="w-9 h-9 text-slate-300 dark:text-slate-700" aria-hidden="true" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Select a conversation</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
              Choose an existing thread on the left or start a new 1-to-1 or group chat.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedConvId(null)}
                  aria-label="Back to conversations"
                  className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                    {getConversationDisplayName(activeConversation)}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {typingUsers.length > 0
                      ? `${typingUsers.join(', ')} typing...`
                      : `${activeConversation.participantIds.length} participants`}
                  </p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => {
                const isMine = msg.senderId === firebaseUser?.uid;
                const readByOthers = msg.readBy.some((id) => id !== msg.senderId);
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                  >
                    {!isMine && activeConversation.type === 'group' && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5 px-1">
                        {msg.senderDisplayName}
                      </span>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 space-y-2 ${
                        isMine
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {msg.imageUrl && (
                        <div className="relative group">
                          <img
                            src={msg.imageUrl}
                            alt="Chat attachment"
                            referrerPolicy="no-referrer"
                            className="rounded-xl max-h-60 object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void downloadMediaFile(
                                msg.imageUrl,
                                `ainemax_chat_${msg.senderUsername}_${msg.id.slice(0, 6)}`
                              ).catch((err) =>
                                setErrorMsg(
                                  err instanceof Error ? err.message : 'Unable to download chat photo.'
                                )
                              )
                            }
                            aria-label="Download image"
                            title="Download"
                            className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-slate-950/70 text-white flex items-center justify-center hover:bg-slate-950 transition-colors"
                          >
                            <Download className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                      {msg.text && (
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                      )}
                      <div
                        className={`flex items-center justify-end gap-1 text-[10px] tabular-nums ${
                          isMine ? 'text-blue-100' : 'text-slate-400'
                        }`}
                      >
                        <span>{formatMessageTime(msg.createdAt)}</span>
                        {isMine &&
                          (readByOthers ? (
                            <CheckCheck className="w-3.5 h-3.5" aria-label="Read" />
                          ) : (
                            <Check className="w-3.5 h-3.5" aria-label="Sent" />
                          ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {errorMsg && (
              <p className="px-4 py-2 text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border-t border-red-200 dark:border-red-900">
                {errorMsg}
              </p>
            )}

            {/* Composer */}
            <form
              onSubmit={handleSendText}
              className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
            >
              <button
                type="button"
                disabled={uploadingImg || sending}
                onClick={() => imageInputRef.current?.click()}
                aria-label="Send image from files or gallery"
                className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center shrink-0"
              >
                {uploadingImg ? (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                ) : (
                  <ImageIcon className="w-4 h-4" />
                )}
              </button>
              <input
                type="text"
                maxLength={2000}
                value={messageText}
                onChange={(e) => handleTypingChange(e.target.value)}
                placeholder="Write a message..."
                className="flex-1 h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending || uploadingImg || !messageText.trim()}
                aria-label="Send message"
                className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 shrink-0"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </>
        )}
      </section>

      {/* New Chat Modal */}
      {newModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Start new conversation"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Start New Conversation</h3>
              <button
                type="button"
                onClick={() => setNewModalOpen(false)}
                aria-label="Close modal"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setNewMode('direct')}
                className={`py-2 rounded-lg text-xs font-medium ${
                  newMode === 'direct'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                1-to-1 Direct
              </button>
              <button
                type="button"
                onClick={() => setNewMode('group')}
                className={`py-2 rounded-lg text-xs font-medium ${
                  newMode === 'group'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Group Chat
              </button>
            </div>

            {newMode === 'group' && (
              <input
                type="text"
                maxLength={80}
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="Group chat name..."
                className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
              />
            )}

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl">
              {directoryUsers.length === 0 ? (
                <p className="p-4 text-xs text-slate-500 dark:text-slate-400 text-center">
                  No other registered users found yet.
                </p>
              ) : (
                directoryUsers.map((u) => {
                  const picked = selectedUserIds.has(u.uid);
                  return (
                    <div
                      key={u.uid}
                      className="p-3 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {u.displayName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">@{u.username}</p>
                      </div>
                      {newMode === 'direct' ? (
                        <button
                          type="button"
                          disabled={creatingConv}
                          onClick={() => void handleStartDirectChat(u)}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                        >
                          Message
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedUserIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(u.uid)) next.delete(u.uid);
                              else next.add(u.uid);
                              return next;
                            })
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                            picked
                              ? 'bg-blue-600 text-white'
                              : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {picked ? 'Added' : 'Select'}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {newMode === 'group' && (
              <button
                type="button"
                disabled={creatingConv || !groupTitle.trim() || selectedUserIds.size === 0}
                onClick={handleCreateGroupChat}
                className="w-full h-11 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {creatingConv ? 'Creating...' : `Create Group (${selectedUserIds.size} selected)`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
