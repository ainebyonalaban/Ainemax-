import React, { useEffect, useState } from 'react';
import { Loader2, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchFollowList } from '../../services/socialService';
import { FollowRecord } from '../../types/social';

interface FollowListModalProps {
  userId: string;
  direction: 'followers' | 'following';
  onClose: () => void;
}

export function FollowListModal({
  userId,
  direction,
  onClose,
}: FollowListModalProps) {
  const [items, setItems] = useState<FollowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchFollowList(userId, direction)
      .then((res) => {
        if (active) setItems(res);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, direction]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={direction === 'followers' ? 'Followers' : 'Following'}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 capitalize">{direction}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close list"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="py-10 flex items-center justify-center text-slate-500 dark:text-slate-400 gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" aria-hidden="true" />
              <span>Loading...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No {direction} yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item) => {
                const username =
                  direction === 'followers' ? item.followerUsername : item.followingUsername;
                const displayName =
                  direction === 'followers' ? item.followerDisplayName : item.followingDisplayName;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        navigate(`/u/${username}`);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-display font-bold text-xs flex items-center justify-center shrink-0">
                        {displayName.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {displayName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">@{username}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
