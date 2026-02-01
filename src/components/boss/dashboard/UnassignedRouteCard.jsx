import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Folder, Clock, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export default function UnassignedRouteCard({ route, workers, onAssign }) {
  const [selectedWorker, setSelectedWorker] = useState('');
  const [assigning, setAssigning] = useState(false);

  const handleAssign = async () => {
    if (!selectedWorker) return;
    setAssigning(true);
    await onAssign(route.id, selectedWorker);
    setAssigning(false);
    setSelectedWorker('');
  };

  const estimatedHours = route.estimated_time_minutes 
    ? (route.estimated_time_minutes / 60).toFixed(1) 
    : ((route.total_addresses || 0) * 12 / 60).toFixed(1);

  return (
    <Card className="bg-white">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Folder className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{route.folder_name}</h3>
              <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                <span>{route.total_addresses || 0} addresses</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Est. {estimatedHours} hrs
                </span>
                {route.due_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Due: {format(new Date(route.due_date), 'MMM d')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <Select value={selectedWorker} onValueChange={setSelectedWorker}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Assign to worker..." />
            </SelectTrigger>
            <SelectContent>
              {workers.map((worker) => (
                <SelectItem key={worker.id} value={worker.id}>
                  {worker.full_name} 
                  {worker.worker_status === 'active' && ' (Active)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            onClick={handleAssign} 
            disabled={!selectedWorker || assigning}
            size="sm"
          >
            {assigning ? 'Assigning...' : 'Assign'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}