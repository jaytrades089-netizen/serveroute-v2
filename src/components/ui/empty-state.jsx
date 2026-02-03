import React from 'react';
import { Button } from '@/components/ui/button';
import { 
  FileText, 
  Camera, 
  MessageCircle, 
  Users, 
  MapPin, 
  Bell,
  Receipt,
  Search
} from 'lucide-react';

const EMPTY_CONFIGS = {
  routes: {
    icon: FileText,
    emoji: '📋',
    title: 'No routes yet',
    description: 'Create your first route by scanning documents.',
    action: 'Create Route'
  },
  addresses: {
    icon: MapPin,
    emoji: '📍',
    title: 'No addresses',
    description: 'Add addresses to this route to get started.'
  },
  receipts: {
    icon: Receipt,
    emoji: '📸',
    title: 'No receipts to review',
    description: "When workers submit receipts, they'll appear here."
  },
  messages: {
    icon: MessageCircle,
    emoji: '💬',
    title: 'No messages yet',
    description: 'Start a conversation with your team.',
    action: 'Send Message'
  },
  scanned: {
    icon: Camera,
    emoji: '📷',
    title: 'No addresses scanned',
    description: 'Point camera at document and tap Capture.'
  },
  workers: {
    icon: Users,
    emoji: '👥',
    title: 'No workers yet',
    description: 'Invite workers to join your team.',
    action: 'Invite Worker'
  },
  notifications: {
    icon: Bell,
    emoji: '🔔',
    title: 'No notifications',
    description: "You're all caught up!"
  },
  search: {
    icon: Search,
    emoji: '🔍',
    title: 'No results found',
    description: 'Try adjusting your search or filters.'
  },
  activity: {
    icon: FileText,
    emoji: '📜',
    title: 'No activity yet',
    description: 'Activity will appear here as your team works.'
  }
};

export default function EmptyState({ 
  type, 
  onAction, 
  title: customTitle, 
  description: customDescription,
  actionLabel: customAction,
  className = ''
}) {
  const config = EMPTY_CONFIGS[type] || EMPTY_CONFIGS.routes;
  const Icon = config.icon;
  
  return (
    <div className={`text-center py-12 px-4 ${className}`}>
      <div className="text-5xl mb-4">{config.emoji}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {customTitle || config.title}
      </h3>
      <p className="text-gray-600 mb-4 max-w-sm mx-auto">
        {customDescription || config.description}
      </p>
      {(customAction || config.action) && onAction && (
        <Button onClick={onAction} className="bg-orange-500 hover:bg-orange-600">
          {customAction || config.action}
        </Button>
      )}
    </div>
  );
}

export function EmptyStateInline({ message, icon: Icon = FileText }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
      <Icon className="w-5 h-5" />
      <span>{message}</span>
    </div>
  );
}