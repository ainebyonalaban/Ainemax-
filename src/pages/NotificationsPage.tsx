import React, { useEffect, useState } from 'react';
import {
  Bell,
  BellRing,
  CheckCheck,
  Heart,
  MessageCircle,
  Radio,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
  requestPushNotificationPermission,
  subscribeUserNotifications,
} from '../services/notificationService';
import { AppNotification } from '../types/features';

function formatNotifTime(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Just now';
  return ts.toDate().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getNotifIcon(type: AppNotification['type']) {
  switch (type) {
    case 'like':
      return <Heart className="w-4 h-4 text-blue-600" aria-hidden="true" />;
    case 'follow':
    case 'friend_request':
      return <UserPlus className="w-4 h-4 text-blue-600" aria-hidden="true" />;
    case 'live':
      return <Radio className="w-4 h-4 text-red-600" aria-hidden="true" />;
    case 'comment':
    case 'reply':
    case 'message':
      return <MessageCircle className="w-4 h-4 text-blue-600" aria-hidden="true" />;
    default:
      return <Bell className="w-4 h-4 text-blue-600" aria-hidden="true" />;
  }
}

export function NotificationsPage() {
  const { firebaseUser, saveFcmToken } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = subscribeUserNotifications(firebaseUser.uid, setItems);
    return () => unsub();
  }, [firebaseUser]);

  const unreadCount = items.filter((i) => !i.read).length;

  const handleEnablePush = async () => {
    const res = await requestPushNotificationPermission(saveFcmToken);
    setPushFeedback(res.message);
  };

  return (
    <div className="space-y-5">
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Bell className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Notifications {unreadCount > 0 ? `(${unreadCount} unread)` : ''}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real-time alerts for likes, comments, followers, messages, and live streams
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleEnablePush()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <BellRing className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span>Enable Push Alerts</span>
          </button>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllNotificationsRead(items)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
            >
              <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Mark all read</span>
            </button>
          )}
        </div>
      </section>

      {pushFeedback && (
        <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-2xl px-4 py-3 text-xs text-blue-900 dark:text-blue-200">
          {pushFeedback}
        </div>
      )}

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {items.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Bell className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">You are all caught up</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Interactions on your posts, videos, and messages will show up here immediately.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((n) => (
              <li
                key={n.id}
                className={`p-4 flex items-start justify-between gap-3 transition-colors ${
                  n.read ? 'bg-white dark:bg-slate-900' : 'bg-blue-50/40 dark:bg-blue-950/30'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!n.read) void markNotificationRead(n.id);
                    if (n.linkPath) navigate(n.linkPath);
                  }}
                  className="flex items-start gap-3 text-left flex-1 min-w-0"
                >
                  <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center shrink-0 mt-0.5">
                    {getNotifIcon(n.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${n.read ? 'font-medium text-slate-800 dark:text-slate-200' : 'font-bold text-slate-900 dark:text-slate-100'}`}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
                    )}
                    <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                      {formatNotifTime(n.createdAt)}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void deleteNotification(n.id)}
                  aria-label="Delete notification"
                  className="p-1.5 text-slate-400 hover:text-red-600 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
