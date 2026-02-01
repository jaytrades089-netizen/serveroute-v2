import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Users, CheckCircle, Clock } from 'lucide-react';

export default function DashboardOverview({ stats }) {
  const items = [
    {
      label: 'Routes',
      value: stats.totalRoutes || 0,
      sub: `${stats.completedRoutes || 0} done`,
      icon: MapPin,
      color: 'bg-blue-500'
    },
    {
      label: 'Addresses',
      value: stats.totalAddresses || 0,
      sub: `${stats.servedAddresses || 0} served`,
      icon: CheckCircle,
      color: 'bg-green-500'
    },
    {
      label: 'Workers',
      value: `${stats.activeWorkers || 0}/${stats.totalWorkers || 0}`,
      sub: 'active',
      icon: Users,
      color: 'bg-purple-500'
    },
    {
      label: 'On Time',
      value: `${stats.onTimeRate || 0}%`,
      sub: 'completion',
      icon: Clock,
      color: 'bg-amber-500'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className="bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`${item.color} p-2 rounded-lg`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{item.value}</p>
                  <p className="text-xs text-gray-500">{item.sub}</p>
                </div>
              </div>
              <p className="text-xs text-gray-600 mt-2 font-medium">{item.label}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}