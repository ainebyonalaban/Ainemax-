import React from 'react';
import {
  Bell,
  CircleDot,
  Clapperboard,
  Compass,
  Home,
  LogIn,
  MessageCircle,
  PlaySquare,
  Radio,
  Settings,
  Shield,
  User,
  Users,
} from 'lucide-react';
import { NavRouteId } from '../../types/navigation';

interface NavIconProps {
  id: NavRouteId;
  className?: string;
}

export function NavIcon({ id, className = 'w-5 h-5' }: NavIconProps) {
  switch (id) {
    case 'home':
      return <Home className={className} aria-hidden="true" />;
    case 'videos':
      return <PlaySquare className={className} aria-hidden="true" />;
    case 'movies':
      return <Clapperboard className={className} aria-hidden="true" />;
    case 'explore':
      return <Compass className={className} aria-hidden="true" />;
    case 'messages':
      return <MessageCircle className={className} aria-hidden="true" />;
    case 'notifications':
      return <Bell className={className} aria-hidden="true" />;
    case 'stories':
      return <CircleDot className={className} aria-hidden="true" />;
    case 'groups':
      return <Users className={className} aria-hidden="true" />;
    case 'live':
      return <Radio className={className} aria-hidden="true" />;
    case 'profile':
      return <User className={className} aria-hidden="true" />;
    case 'settings':
      return <Settings className={className} aria-hidden="true" />;
    case 'admin':
      return <Shield className={className} aria-hidden="true" />;
    case 'auth':
      return <LogIn className={className} aria-hidden="true" />;
  }
}
