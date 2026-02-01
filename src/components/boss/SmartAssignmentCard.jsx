import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  ChevronDown, 
  ChevronUp, 
  MapPin, 
  Clock, 
  Star, 
  AlertTriangle,
  CheckCircle,
  User
} from 'lucide-react';

export default function SmartAssignmentCard({ 
  route, 
  suggestions = [], 
  onAssign, 
  isLoading 
}) {
  const [expanded, setExpanded] = useState(false);

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBg = (score) => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        {/* Route Info */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span className="font-semibold">{route.folder_name}</span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              <span>{route.total_addresses || 0} addresses</span>
              {route.estimated_time_minutes && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {Math.round(route.estimated_time_minutes / 60 * 10) / 10} hrs
                </span>
              )}
              {route.due_date && (
                <span>Due: {new Date(route.due_date).toLocaleDateString()}</span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <>
                <span className="mr-1">Suggestions</span>
                <ChevronDown className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>

        {/* Suggestions */}
        {expanded && (
          <div className="space-y-3 pt-3 border-t">
            {isLoading ? (
              <div className="text-center py-4 text-gray-500">
                Loading suggestions...
              </div>
            ) : suggestions.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                No available workers found
              </div>
            ) : (
              suggestions.map((suggestion, index) => (
                <div 
                  key={suggestion.worker_id}
                  className="flex items-start justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                        {index + 1}
                      </div>
                      <span className="font-medium">{suggestion.worker_name}</span>
                      <Badge className={`${getScoreBg(suggestion.fit_score)} ${getScoreColor(suggestion.fit_score)} border-0`}>
                        {Math.round(suggestion.fit_score)}/100
                      </Badge>
                    </div>
                    
                    {/* Reasons */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {suggestion.reasons?.slice(0, 3).map((reason, i) => (
                        <span key={i} className="text-xs text-gray-600">
                          {reason}
                        </span>
                      ))}
                    </div>

                    {/* Capacity bar */}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-gray-500">Capacity:</span>
                      <Progress 
                        value={100 - (suggestion.capacity_remaining / 50 * 100)} 
                        className="h-1.5 flex-1 max-w-24"
                      />
                      <span className="text-xs text-gray-600">
                        {suggestion.capacity_remaining} left
                      </span>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => onAssign(route.id, suggestion.worker_id)}
                    className="ml-3"
                  >
                    Assign
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}