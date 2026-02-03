import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, isToday, isYesterday } from 'date-fns';
import { 
  ArrowLeft, 
  Loader2, 
  CheckCircle, 
  Car, 
  Flag, 
  Circle, 
  Camera,
  Check,
  X,
  MessageCircle,
  FileText,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import BossBottomNav from '@/components/boss/BossBottomNav';

const ACTIVITY_CONFIG = {
  address_served: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100' },
  route_started: { icon: Car, color: 'text-blue-500', bg: 'bg-blue-100' },
  route_completed: { icon: Flag, color: 'text-green-500', bg: 'bg-green-100' },
  worker_online: { icon: Circle, color: 'text-green-500', bg: 'bg-green-100' },
  worker_offline: { icon: Circle, color: 'text-gray-500', bg: 'bg-gray-100' },
  receipt_submitted: { icon: Camera, color: 'text-blue-500', bg: 'bg-blue-100' },
  receipt_approved: { icon: Check, color: 'text-green-500', bg: 'bg-green-100' },
  receipt_rejected: { icon: X, color: 'text-red-500', bg: 'bg-red-100' },
  question_asked: { icon: MessageCircle, color: 'text-blue-500', bg: 'bg-blue-100' },
  route_assigned: { icon: FileText, color: 'text-purple-500', bg: 'bg-purple-100' },
  route_reassigned: { icon: Users, color: 'text-orange-500', bg: 'bg-orange-100' },
  // Phase 3 scanning
  scan_session_started: { icon: Camera, color: 'text-blue-500', bg: 'bg-blue-100' },
  document_scanned: { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-100' },
  route_created_from_scan: { icon: FileText, color: 'text-green-500', bg: 'bg-green-100' }
};

const ACTIVITY_TYPES = [
  { value: 'all', label: 'All Activity' },
  { value: 'address_served', label: 'Addresses Served' },
  { value: 'route_started', label: 'Routes Started' },
  { value: 'route_completed', label: 'Routes Completed' },
  { value: 'worker_status_changed', label: 'Status Changes' },
  { value: 'receipt_submitted', label: 'Receipts' },
  { value: 'message_sent', label: 'Messages' },
  { value: 'route_assigned', label: 'Assignments' }
];

export default function ActivityLog() {
  const [typeFilter, setTypeFilter] = useState('all');
  const [workerFilter, setWorkerFilter] = useState('all');
  const [limit, setLimit] = useState(50);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const companyId = user?.company_id;

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['activityLog', companyId, typeFilter, workerFilter, limit],
    queryFn: async () => {
      if (!companyId) return [];
      
      const query = { company_id: companyId };
      if (typeFilter !== 'all') {
        query.action_type = typeFilter;
      }
      if (workerFilter !== 'all') {
        query.actor_id = workerFilter;
      }
      
      const logs = await base44.entities.AuditLog.filter(query, '-timestamp', limit);
      return logs;
    },
    enabled: !!companyId
  });

  const { data: workers = [] } = useQuery({
    queryKey: ['activityWorkers', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const users = await base44.entities.User.list();
      return users.filter(u => u.company_id === companyId);
    },
    enabled: !!companyId
  });

  // Group activities by date
  const groupedActivities = activities.reduce((groups, activity) => {
    const date = new Date(activity.timestamp || activity.created_date);
    let label;
    
    if (isToday(date)) {
      label = 'Today';
    } else if (isYesterday(date)) {
      label = 'Yesterday';
    } else {
      label = format(date, 'MMMM d, yyyy');
    }
    
    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(activity);
    return groups;
  }, {});

  const getActivityIcon = (actionType) => {
    const config = ACTIVITY_CONFIG[actionType] || { icon: Circle, color: 'text-gray-500', bg: 'bg-gray-100' };
    return config;
  };

  const getActorName = (actorId) => {
    if (actorId === 'system') return 'System';
    const worker = workers.find(w => w.id === actorId);
    return worker?.full_name || 'Unknown';
  };

  const formatActivityMessage = (activity) => {
    const actor = getActorName(activity.actor_id);
    const details = activity.details || {};
    
    switch (activity.action_type) {
      case 'address_served':
        return `${actor} served ${details.address || 'an address'}`;
      case 'route_started':
        return `${actor} started route: ${details.route_name || 'Unknown'}`;
      case 'route_completed':
        return `${actor} completed route: ${details.route_name || 'Unknown'} (${details.served_count || 0}/${details.total_count || 0})`;
      case 'worker_status_changed':
        return `${actor} ${details.new_status === 'active' ? 'came online' : 'went offline'}`;
      case 'receipt_submitted':
        return `${actor} submitted receipt for ${details.address || 'an address'}`;
      case 'receipt_approved':
        return `Receipt approved for ${details.address || 'an address'}`;
      case 'receipt_rejected':
        return `Receipt rejected: ${details.reason || 'No reason'}`;
      case 'question_asked':
        return `${actor} asked about ${details.address || 'an address'}`;
      case 'route_assigned':
        return `${details.route_name || 'Route'} assigned to ${details.worker_name || 'worker'}`;
      case 'route_reassigned':
        return `${details.route_name || 'Route'} reassigned from ${details.from_worker || 'worker'} to ${details.to_worker || 'worker'}`;
      case 'scan_session_started':
        return `${actor} started scanning session`;
      case 'document_scanned':
        return `${actor} scanned a ${details.document_type || 'document'}`;
      case 'route_created_from_scan':
        return `${actor} created route "${details.route_name || 'New Route'}" from scan`;
      default:
        return `${actor} performed ${activity.action_type?.replace(/_/g, ' ') || 'action'}`;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl('BossDashboard')}>
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h1 className="font-bold text-lg">📜 Activity Log</h1>
      </header>

      <main className="px-4 py-4 max-w-4xl mx-auto">
        {/* Filters */}
        <div className="flex gap-2 mb-4">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Filter type" />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_TYPES.map(type => (
                <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={workerFilter} onValueChange={setWorkerFilter}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="All workers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Workers</SelectItem>
              {workers.map(w => (
                <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : Object.keys(groupedActivities).length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Circle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No activity found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedActivities).map(([date, dateActivities]) => (
              <div key={date}>
                <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase">{date}</h2>
                <div className="space-y-2">
                  {dateActivities.map((activity, index) => {
                    const config = getActivityIcon(activity.action_type);
                    const Icon = config.icon;
                    const time = format(new Date(activity.timestamp || activity.created_date), 'h:mm a');
                    
                    return (
                      <Card key={activity.id || index}>
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 text-sm text-gray-500 w-16">
                              {time}
                            </div>
                            <div className={`w-8 h-8 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0`}>
                              <Icon className={`w-4 h-4 ${config.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900">
                                {formatActivityMessage(activity)}
                              </p>
                              {activity.details?.route_name && activity.action_type !== 'route_started' && activity.action_type !== 'route_completed' && (
                                <p className="text-xs text-gray-500 mt-1">
                                  Route: {activity.details.route_name}
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}

            {activities.length >= limit && (
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => setLimit(limit + 50)}
              >
                Load More
              </Button>
            )}
          </div>
        )}
      </main>

      <BossBottomNav currentPage="ActivityLog" />
    </div>
  );
}