import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, AlertTriangle, Pause, FileText, User, MapPin } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const activityIcons = {
  route_completed: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' },
  address_served: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
  worker_paused: { icon: Pause, color: 'text-amber-600', bg: 'bg-amber-100' },
  worker_resumed: { icon: User, color: 'text-blue-600', bg: 'bg-blue-100' },
  route_created: { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-100' },
  route_assigned: { icon: MapPin, color: 'text-purple-600', bg: 'bg-purple-100' },
  address_flagged: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100' },
  default: { icon: FileText, color: 'text-gray-600', bg: 'bg-gray-100' }
};

function getActivityMessage(activity) {
  const details = activity.details || {};
  
  switch (activity.action_type) {
    case 'route_completed':
      return `${details.worker_name || 'Worker'} completed ${details.route_name || 'route'}`;
    case 'address_served':
      return `${details.worker_name || 'Worker'} served ${details.address || 'address'}`;
    case 'worker_paused':
      return `${details.worker_name || 'Worker'} paused work`;
    case 'worker_resumed':
      return `${details.worker_name || 'Worker'} resumed work`;
    case 'route_created':
      return `New route created: ${details.route_name || 'route'}`;
    case 'route_assigned':
      return `Route assigned to ${details.worker_name || 'worker'}`;
    case 'address_flagged':
      return `Address flagged: ${details.reason || 'Issue reported'}`;
    default:
      return activity.action_type?.replace(/_/g, ' ') || 'Activity';
  }
}

export default function RecentActivityFeed({ activities = [] }) {
  return (
    <Card className="bg-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activities.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No recent activity</p>
        ) : (
          activities.slice(0, 10).map((activity) => {
            const config = activityIcons[activity.action_type] || activityIcons.default;
            const Icon = config.icon;
            
            return (
              <div key={activity.id} className="flex items-start gap-3">
                <div className={`p-1.5 rounded-full ${config.bg}`}>
                  <Icon className={`w-3 h-3 ${config.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">
                    {getActivityMessage(activity)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {activity.timestamp 
                      ? formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })
                      : 'Just now'}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}