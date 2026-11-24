import React, { useState } from 'react';
import { Compass, Home, MessageCircle, Plus, User } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UploadCategoryTab, UploadHubModal } from '../social/UploadHubModal';

export function MobileBottomNav({ darkOverlay = false }: { darkOverlay?: boolean }) {
  const [uploadHubOpen, setUploadHubOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { firebaseUser, profile } = useAuth();

  const defaultUploadCategory: UploadCategoryTab = location.pathname.startsWith('/movies')
    ? 'long'
    : location.pathname.startsWith('/stories')
      ? 'story'
      : location.pathname.startsWith('/videos')
        ? 'short'
        : 'photo';

  const handleOpenCreate = () => {
    if (!firebaseUser) {
      navigate('/auth');
      return;
    }
    if (!profile?.onboardingComplete) {
      navigate('/onboarding');
      return;
    }
    setUploadHubOpen(true);
  };

  const tabClass = (isActive: boolean) =>
    `flex flex-col items-center justify-center min-h-[44px] min-w-[44px] gap-0.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
      isActive
        ? darkOverlay
          ? 'text-blue-400 font-semibold'
          : 'text-blue-600 dark:text-blue-400 font-semibold'
        : darkOverlay
          ? 'text-slate-400 hover:text-white'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
    }`;

  return (
    <>
      <nav
        aria-label="Mobile bottom navigation"
        className={`md:hidden fixed bottom-0 left-0 right-0 z-40 pb-safe border-t ${
          darkOverlay
            ? 'bg-slate-950/90 border-slate-800 text-slate-200 backdrop-blur-md'
            : 'bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 backdrop-blur-md'
        }`}
      >
        <div className="grid grid-cols-5 h-14 items-center px-1">
          <NavLink to="/" end className={({ isActive }) => tabClass(isActive)}>
            <Home className="w-5 h-5" aria-hidden="true" />
            <span className="leading-none">Home</span>
          </NavLink>

          <NavLink to="/explore" className={({ isActive }) => tabClass(isActive)}>
            <Compass className="w-5 h-5" aria-hidden="true" />
            <span className="leading-none">Discover</span>
          </NavLink>

          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={handleOpenCreate}
              aria-label="Create post, short video, movie, or story"
              className="w-12 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-md shadow-blue-600/25 flex items-center justify-center transition-all"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
            </button>
          </div>

          <NavLink to="/messages" className={({ isActive }) => tabClass(isActive)}>
            <MessageCircle className="w-5 h-5" aria-hidden="true" />
            <span className="leading-none">Inbox</span>
          </NavLink>

          <NavLink to="/profile" className={({ isActive }) => tabClass(isActive)}>
            <User className="w-5 h-5" aria-hidden="true" />
            <span className="leading-none">Profile</span>
          </NavLink>
        </div>
      </nav>

      {uploadHubOpen && (
        <UploadHubModal
          initialCategory={defaultUploadCategory}
          onClose={() => setUploadHubOpen(false)}
          onSuccess={(cat) => {
            if (cat === 'short') navigate('/videos');
            else if (cat === 'long') navigate('/movies');
            else if (cat === 'story') navigate('/stories');
            else navigate('/');
          }}
        />
      )}
    </>
  );
}
