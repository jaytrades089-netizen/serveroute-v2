import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Download, Trophy, Medal, Award } from 'lucide-react';

export default function WorkerPerformanceTable({ workers, addresses, routes, onExport }) {
  const [sortBy, setSortBy] = useState('served');

  // Calculate performance for each worker
  const workerPerformance = workers.map(worker => {
    const workerAddresses = addresses.filter(a => 
      a.served_by === worker.id || a.scanned_by === worker.id
    );
    const workerRoutes = routes.filter(r => r.worker_id === worker.id);
    
    // Calculate completion rate
    const totalAssigned = workerAddresses.length + 
      addresses.filter(a => !a.served && a.route_id && 
        routes.some(r => r.id === a.route_id && r.worker_id === worker.id)
      ).length;
    
    const rate = totalAssigned > 0 ? Math.round((workerAddresses.length / totalAssigned) * 100) : 0;

    return {
      id: worker.id,
      name: worker.full_name || 'Unknown',
      served: workerAddresses.length,
      routes: workerRoutes.length,
      rate: rate,
      avgTime: worker.avg_completion_time_minutes || 0,
      score: worker.reliability_score || 0
    };
  });

  // Sort workers
  const sortedWorkers = [...workerPerformance].sort((a, b) => {
    switch (sortBy) {
      case 'served':
        return b.served - a.served;
      case 'routes':
        return b.routes - a.routes;
      case 'rate':
        return b.rate - a.rate;
      case 'avgTime':
        return a.avgTime - b.avgTime; // Lower is better
      case 'score':
        return b.score - a.score;
      default:
        return b.served - a.served;
    }
  });

  const getRankIcon = (index) => {
    if (index === 0) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (index === 1) return <Medal className="w-5 h-5 text-gray-400" />;
    if (index === 2) return <Award className="w-5 h-5 text-amber-600" />;
    return <span className="w-5 h-5 flex items-center justify-center text-gray-500">{index + 1}</span>;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Worker Performance</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="served">Served</SelectItem>
                <SelectItem value="routes">Routes</SelectItem>
                <SelectItem value="rate">Rate</SelectItem>
                <SelectItem value="avgTime">Avg Time</SelectItem>
                <SelectItem value="score">Score</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={onExport}>
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sortedWorkers.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No workers found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 font-medium text-gray-600">#</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-600">Worker</th>
                  <th className="text-center py-2 px-2 font-medium text-gray-600">Served</th>
                  <th className="text-center py-2 px-2 font-medium text-gray-600">Routes</th>
                  <th className="text-center py-2 px-2 font-medium text-gray-600">Rate</th>
                  <th className="text-center py-2 px-2 font-medium text-gray-600">Avg Time</th>
                  <th className="text-center py-2 px-2 font-medium text-gray-600">Score</th>
                </tr>
              </thead>
              <tbody>
                {sortedWorkers.map((worker, index) => (
                  <tr 
                    key={worker.id} 
                    className={`border-b border-gray-100 ${index < 3 ? 'bg-gray-50' : ''}`}
                  >
                    <td className="py-3 px-2">{getRankIcon(index)}</td>
                    <td className="py-3 px-2 font-medium text-gray-900">{worker.name}</td>
                    <td className="py-3 px-2 text-center">
                      <span className="font-semibold text-blue-600">{worker.served}</span>
                    </td>
                    <td className="py-3 px-2 text-center">{worker.routes}</td>
                    <td className="py-3 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        worker.rate >= 90 ? 'bg-green-100 text-green-700' :
                        worker.rate >= 75 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {worker.rate}%
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center text-gray-600">
                      {worker.avgTime > 0 ? `${worker.avgTime.toFixed(1)} min` : '-'}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={`font-medium ${
                        worker.score >= 90 ? 'text-green-600' :
                        worker.score >= 75 ? 'text-yellow-600' :
                        'text-gray-600'
                      }`}>
                        {worker.score > 0 ? `${worker.score}%` : '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}