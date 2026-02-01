import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { User, MessageSquare, Pause, Play, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const statusConfig = {
  active: { color: 'text-green-600', bg: 'bg-green-100', label: '● Active' },
  paused: { color: 'text-amber-600', bg: 'bg-amber-100', label: '○ Paused' },
  offline: { color: 'text-gray-500', bg: 'bg-gray-100', label: '○ Offline' }
};

export default function WorkerCard({ worker, route, progress, onMessage, onPauseResume, onAssign }) {
  const status = worker.worker_status || 'offline';
  const config = statusConfig[status] || statusConfig.offline;
  const progressPercent = progress?.total > 0 ? Math.round((progress.served / progress.total) * 100) : 0;

  return (
    <Card className="bg-white hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{worker.full_name}</h3>
              <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
            </div>
          </div>
        </div>

        {route ? (
          <div className="mb-3">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <MapPin className="w-4 h-4" />
              <span className="font-medium">{route.folder_name}</span>
            </div>
            <Progress value={progressPercent} className="h-2 mb-1" />
            <div className="flex justify-between text-xs text-gray-500">
              <span>{progress?.served || 0}/{progress?.total || 0} addresses</span>
              <span>{progressPercent}%</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-3">No active route</p>
        )}

        <div className="flex gap-2">
          <Link to={createPageUrl(`WorkerDetail?id=${worker.id}`)}>
            <Button variant="outline" size="sm">View</Button>
          </Link>
          
          {status === 'active' && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onMessage(worker)}
              >
                <MessageSquare className="w-3 h-3 mr-1" />
                Message
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => onPauseResume(worker, 'pause')}
              >
                <Pause className="w-3 h-3 mr-1" />
                Pause
              </Button>
            </>
          )}
          
          {status === 'paused' && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => onPauseResume(worker, 'resume')}
            >
              <Play className="w-3 h-3 mr-1" />
              Resume
            </Button>
          )}
          
          {status === 'offline' && !route && onAssign && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => onAssign(worker)}
            >
              Assign
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}