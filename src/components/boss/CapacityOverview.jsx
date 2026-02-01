import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle, AlertCircle, User } from 'lucide-react';

const CAPACITY_CONFIG = {
  warning: 0.85,
  critical: 0.95,
  block: 1.0
};

export default function CapacityOverview({ workers = [], addressCounts = {} }) {
  const getCapacityStatus = (used, limit) => {
    const ratio = used / limit;
    if (ratio >= CAPACITY_CONFIG.critical) {
      return { level: 'critical', color: 'bg-red-500', textColor: 'text-red-600', icon: AlertCircle, label: 'At Capacity' };
    }
    if (ratio >= CAPACITY_CONFIG.warning) {
      return { level: 'warning', color: 'bg-yellow-500', textColor: 'text-yellow-600', icon: AlertTriangle, label: 'Near Capacity' };
    }
    return { level: 'good', color: 'bg-green-500', textColor: 'text-green-600', icon: CheckCircle, label: 'Available' };
  };

  const getWorkerCapacity = (worker) => {
    const used = addressCounts[worker.id] || 0;
    const limit = worker.capacity_limit || 50;
    const remaining = limit - used;
    const percentage = Math.round((used / limit) * 100);
    const status = getCapacityStatus(used, limit);
    
    return { used, limit, remaining, percentage, status };
  };

  // Sort workers by capacity usage (most used first)
  const sortedWorkers = [...workers].sort((a, b) => {
    const capA = getWorkerCapacity(a);
    const capB = getWorkerCapacity(b);
    return capB.percentage - capA.percentage;
  });

  // Count by status
  const statusCounts = {
    critical: workers.filter(w => getWorkerCapacity(w).status.level === 'critical').length,
    warning: workers.filter(w => getWorkerCapacity(w).status.level === 'warning').length,
    good: workers.filter(w => getWorkerCapacity(w).status.level === 'good').length
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Worker Capacity</span>
          <div className="flex items-center gap-3 text-xs font-normal">
            {statusCounts.critical > 0 && (
              <span className="flex items-center gap-1 text-red-600">
                <AlertCircle className="w-3 h-3" />
                {statusCounts.critical}
              </span>
            )}
            {statusCounts.warning > 0 && (
              <span className="flex items-center gap-1 text-yellow-600">
                <AlertTriangle className="w-3 h-3" />
                {statusCounts.warning}
              </span>
            )}
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle className="w-3 h-3" />
              {statusCounts.good}
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedWorkers.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No workers</p>
        ) : (
          sortedWorkers.map(worker => {
            const cap = getWorkerCapacity(worker);
            const StatusIcon = cap.status.icon;

            return (
              <div key={worker.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium ${
                      worker.worker_status === 'active' ? 'bg-blue-500' : 
                      worker.worker_status === 'paused' ? 'bg-yellow-500' : 'bg-gray-400'
                    }`}>
                      {worker.full_name?.charAt(0) || '?'}
                    </div>
                    <span className="text-sm font-medium">{worker.full_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusIcon className={`w-4 h-4 ${cap.status.textColor}`} />
                    <span className={`text-xs ${cap.status.textColor}`}>
                      {cap.status.label}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Progress 
                    value={cap.percentage} 
                    className={`h-2 flex-1 ${cap.status.level === 'critical' ? '[&>div]:bg-red-500' : cap.status.level === 'warning' ? '[&>div]:bg-yellow-500' : ''}`}
                  />
                  <span className="text-xs text-gray-500 w-16 text-right">
                    {cap.used}/{cap.limit}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}