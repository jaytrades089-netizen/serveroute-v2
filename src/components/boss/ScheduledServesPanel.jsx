import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Clock, Phone, MapPin, User, Loader2, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function ScheduledServesPanel({ companyId, workers = [] }) {
  const [workerFilter, setWorkerFilter] = useState('all');

  const { data: serves = [], isLoading } = useQuery({
    queryKey: ['allScheduledServes', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      return base44.entities.ScheduledServe.filter({ company_id: companyId });
    },
    enabled: !!companyId,
    refetchInterval: 30000
  });

  const filtered = workerFilter === 'all' 
    ? serves 
    : serves.filter(s => s.worker_id === workerFilter);

  const sorted = [...filtered].sort((a, b) => {
    // Open first, then by date
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return new Date(a.scheduled_datetime) - new Date(b.scheduled_datetime);
  });

  const workerMap = {};
  workers.forEach(w => { workerMap[w.id] = w.full_name; });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div>
      {/* Filter */}
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-gray-400" />
        <Select value={workerFilter} onValueChange={setWorkerFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Workers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Workers</SelectItem>
            {workers.map(w => (
              <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-500 ml-auto">
          {sorted.filter(s => s.status === 'open').length} open / {sorted.length} total
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Clock className="w-10 h-10 mx-auto text-gray-300 mb-2" />
          <p className="text-sm">No scheduled serves</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((serve) => {
            const dt = new Date(serve.scheduled_datetime);
            const isCompleted = serve.status === 'completed';
            
            return (
              <Card key={serve.id} className={isCompleted ? 'opacity-60' : 'border-blue-200'}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <User className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-sm font-semibold text-gray-700">
                          {workerMap[serve.worker_id] || 'Unknown'}
                        </span>
                      </div>
                      {serve.defendant_name && (
                        <p className="font-bold text-gray-900">{serve.defendant_name}</p>
                      )}
                    </div>
                    <Badge className={isCompleted 
                      ? 'bg-green-100 text-green-700'
                      : 'bg-blue-100 text-blue-700'
                    }>
                      {isCompleted ? 'Completed' : 'Open'}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-blue-700 font-semibold mb-1">
                    <Clock className="w-4 h-4" />
                    {format(dt, "EEE, MMM d 'at' h:mm a")}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {serve.location_type === 'meeting' ? 'Meeting Place' : 'Place of Posting'}
                    </span>
                    {serve.phone_number && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" /> {serve.phone_number}
                      </span>
                    )}
                  </div>

                  {serve.notes && (
                    <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 mt-2 border border-gray-100">
                      {serve.notes}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}