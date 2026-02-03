import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { MapPin, Calendar, Clock, ChevronRight } from 'lucide-react';

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-700',
  ready: 'bg-blue-100 text-blue-700',
  assigned: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  stalled: 'bg-red-100 text-red-700',
  completed: 'bg-emerald-100 text-emerald-700'
};

function QualifierBadge({ type, done }) {
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
      done ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
    }`}>
      {type} {done && '✓'}
    </span>
  );
}

export default function RouteCard({ 
  route, 
  onClick,
  linkTo,
  showWorker = false,
  workerName,
  className = ''
}) {
  const progress = route.total_addresses > 0 
    ? Math.round((route.served_count / route.total_addresses) * 100) 
    : 0;

  const cardContent = (
    <Card className={`
      bg-white rounded-lg shadow-sm border cursor-pointer
      transition-all duration-200 ease-out
      hover:shadow-md hover:scale-[1.01]
      active:scale-[0.99]
      ${className}
    `}>
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{route.folder_name}</h3>
            {showWorker && workerName && (
              <p className="text-sm text-gray-500">{workerName}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge className={STATUS_STYLES[route.status] || STATUS_STYLES.draft}>
              {route.status}
            </Badge>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
          <span className="flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            {route.total_addresses || 0} addresses
          </span>
          {route.due_date && (
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              Due {format(new Date(route.due_date), 'MMM d')}
            </span>
          )}
        </div>

        <Progress value={progress} className="h-2 mb-3" />

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <QualifierBadge type="AM" done={route.am_completed} />
            <QualifierBadge type="PM" done={route.pm_completed} />
            <QualifierBadge type="Wknd" done={route.weekend_completed} />
          </div>
          <span className="text-sm font-medium text-gray-700">
            {route.served_count || 0}/{route.total_addresses || 0}
          </span>
        </div>
      </CardContent>
    </Card>
  );

  if (linkTo) {
    return (
      <Link to={createPageUrl(linkTo)}>
        {cardContent}
      </Link>
    );
  }

  if (onClick) {
    return (
      <div onClick={() => onClick(route)}>
        {cardContent}
      </div>
    );
  }

  return cardContent;
}