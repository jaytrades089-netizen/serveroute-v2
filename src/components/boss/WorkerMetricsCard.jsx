import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Star
} from 'lucide-react';

export default function WorkerMetricsCard({ worker, metrics }) {
  if (!metrics) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-gray-500 text-sm">
          No metrics available
        </CardContent>
      </Card>
    );
  }

  const getReliabilityColor = (score) => {
    if (score >= 90) return 'text-green-600 bg-green-100';
    if (score >= 75) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getPerformerBadge = (score) => {
    if (score >= 95) return { label: 'Top Performer', icon: Star, color: 'bg-yellow-100 text-yellow-700' };
    if (score >= 85) return { label: 'Reliable', icon: CheckCircle, color: 'bg-green-100 text-green-700' };
    if (score >= 70) return { label: 'Average', icon: TrendingUp, color: 'bg-gray-100 text-gray-700' };
    return { label: 'Needs Improvement', icon: AlertTriangle, color: 'bg-red-100 text-red-700' };
  };

  const badge = getPerformerBadge(metrics.reliability_score || 0);
  const BadgeIcon = badge.icon;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>{worker.full_name}</span>
          <Badge className={`${badge.color} border-0`}>
            <BadgeIcon className="w-3 h-3 mr-1" />
            {badge.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Reliability Score */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-600">Reliability Score</span>
            <span className={`text-lg font-bold ${getReliabilityColor(metrics.reliability_score || 0).split(' ')[0]}`}>
              {metrics.reliability_score || 0}%
            </span>
          </div>
          <Progress 
            value={metrics.reliability_score || 0} 
            className="h-2"
          />
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-xs text-gray-500">On-Time Rate</span>
            </div>
            <p className="text-xl font-bold">{metrics.on_time_rate || 0}%</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-gray-500">Completion</span>
            </div>
            <p className="text-xl font-bold">{metrics.completion_rate || 0}%</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-purple-600" />
              <span className="text-xs text-gray-500">Avg Time/Addr</span>
            </div>
            <p className="text-xl font-bold">
              {metrics.avg_completion_time ? `${metrics.avg_completion_time}m` : '-'}
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-orange-600" />
              <span className="text-xs text-gray-500">Issue Rate</span>
            </div>
            <p className="text-xl font-bold">{metrics.issue_rate || 0}%</p>
          </div>
        </div>

        {/* Totals */}
        <div className="pt-3 border-t text-sm text-gray-500">
          <div className="flex justify-between">
            <span>Routes (30d)</span>
            <span className="font-medium text-gray-900">{metrics.totals?.routes_30d || 0}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Addresses (30d)</span>
            <span className="font-medium text-gray-900">{metrics.totals?.addresses_30d || 0}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}