import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format, differenceInDays } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  MapPin, 
  Calendar, 
  ChevronRight, 
  User, 
  Clock,
  CheckCircle,
  AlertTriangle,
  Zap,
  Play,
  MoreVertical
} from 'lucide-react';
import { getNeededQualifiers, calculateSpreadDate } from '@/components/services/QualifierService';
import { QualifierBadges } from '@/components/qualifier/QualifierBadge';

const STATUS_CONFIG = {
  draft: { label: 'DRAFT', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  ready: { label: 'READY', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  assigned: { label: 'ASSIGNED', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  active: { label: 'ACTIVE', color: 'bg-green-100 text-green-700 border-green-200' },
  stalled: { label: 'STALLED', color: 'bg-red-100 text-red-700 border-red-200' },
  completed: { label: 'COMPLETED', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
};

function ProgressBar({ served, total }) {
  const percent = total > 0 ? Math.round((served / total) * 100) : 0;
  return (
    <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
      <div 
        className={`h-full rounded-full transition-all duration-500 ${
          percent === 100 ? 'bg-green-500' : 'bg-indigo-500'
        }`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function QualifierBadge({ type, done }) {
  return (
    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
      done 
        ? 'bg-green-100 text-green-700 border border-green-200' 
        : 'bg-gray-100 text-gray-500 border border-gray-200'
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
  showActions = false,
  onMenuClick,
  isBossView = false,
  className = '',
  attempts = []
}) {
  const navigate = useNavigate();
  const progress = route.total_addresses > 0 
    ? Math.round((route.served_count / route.total_addresses) * 100) 
    : 0;

  const isCompleted = route.status === 'completed';
  const isActive = route.status === 'active' || route.status === 'assigned';
  const isDueSoon = route.due_date && differenceInDays(new Date(route.due_date), new Date()) <= 3 && !isCompleted;
  const isOverdue = route.due_date && new Date(route.due_date) < new Date() && !isCompleted;

  const statusConfig = STATUS_CONFIG[route.status] || STATUS_CONFIG.draft;

  const handleCardClick = () => {
    if (onClick) {
      onClick(route);
    } else if (linkTo) {
      // Check if linkTo already has query params
      const url = linkTo.includes('?') ? linkTo : linkTo;
      navigate(createPageUrl(url));
    } else if (isBossView) {
      navigate(createPageUrl(`BossRouteDetail?id=${route.id}`));
    } else {
      navigate(createPageUrl(`WorkerRouteDetail?id=${route.id}`));
    }
  };

  const isActiveRoute = route.status === 'active';

  return (
    <div
      onClick={handleCardClick}
      className={`rounded-2xl shadow-sm border overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] ${
        isActiveRoute 
          ? 'ring-2 ring-orange-500 ring-offset-2 shadow-lg shadow-orange-500/30 bg-orange-50 border-orange-200' 
          : 'bg-white border-gray-100'
      } ${className}`}
    >
      {/* Active Route Indicator */}
      {isActiveRoute && (
        <div className="px-4 py-2 bg-orange-100 border-b border-orange-200">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
            </span>
            <span className="text-xs font-bold text-orange-600 uppercase tracking-wide">Active Route</span>
          </div>
        </div>
      )}

      {/* Header Section with Gradient */}
      <div className={`px-4 py-4 ${
        isCompleted ? 'bg-gradient-to-r from-green-50 to-emerald-50' :
        isOverdue ? 'bg-gradient-to-r from-red-50 to-orange-50' :
        isDueSoon ? 'bg-gradient-to-r from-orange-50 to-yellow-50' :
        'bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50'
      }`}>
        <div className="flex items-start gap-3">
          {/* Route Icon */}
          <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
            isCompleted ? 'bg-green-100' :
            isOverdue ? 'bg-red-100' :
            isDueSoon ? 'bg-orange-100' :
            'bg-indigo-100'
          }`}>
            {isCompleted ? (
              <CheckCircle className="w-6 h-6 text-green-600" />
            ) : isOverdue || isDueSoon ? (
              <AlertTriangle className="w-6 h-6 text-orange-600" />
            ) : (
              <MapPin className="w-6 h-6 text-indigo-600" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            {/* Route Name */}
            <p className={`text-lg font-bold leading-tight ${
              isCompleted ? 'text-gray-500' : 'text-gray-900'
            }`}>
              {route.folder_name}
            </p>
            {/* Worker name or description */}
            {showWorker && workerName ? (
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <User className="w-3 h-3" /> {workerName}
              </p>
            ) : route.description ? (
              <p className="text-sm text-gray-500 truncate">{route.description}</p>
            ) : null}
          </div>

          {/* Status Badge */}
          <div className="flex-shrink-0 flex items-center gap-2">
            <div className={`px-3 py-1.5 rounded-lg border-2 text-center ${
              isCompleted ? 'border-green-300 bg-green-50' :
              isOverdue ? 'border-red-300 bg-red-50' :
              isDueSoon ? 'border-orange-300 bg-orange-50' :
              'border-indigo-300 bg-white'
            }`}>
              <div className={`text-[10px] font-bold ${
                isCompleted ? 'text-green-600' :
                isOverdue ? 'text-red-600' :
                isDueSoon ? 'text-orange-600' :
                'text-indigo-600'
              }`}>
                {statusConfig.label}
              </div>
            </div>
            {showActions && onMenuClick && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => { e.stopPropagation(); onMenuClick(route); }}
              >
                <MoreVertical className="w-4 h-4 text-gray-400" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Progress Section */}
      <div className="px-4 py-3 border-t border-gray-100">
        {/* Progress Stats */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-gray-700 tracking-wide">
            PROGRESS
          </span>
          <span className="text-sm font-bold text-gray-900">
            {route.served_count || 0} / {route.total_addresses || 0}
          </span>
        </div>

        {/* Progress Bar */}
        <ProgressBar served={route.served_count || 0} total={route.total_addresses || 0} />

        {/* HAS / DUE / NEEDS Boxes */}
        {(() => {
          const qualifierInfo = getNeededQualifiers(attempts);
          const spreadDate = route.first_attempt_date 
            ? calculateSpreadDate(route.first_attempt_date, route.spread_type || '14')
            : null;
          const isSpreadPassed = spreadDate && new Date() > spreadDate;
          
          return (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {/* HAS Box */}
              <div className="bg-green-50 rounded-lg p-2 border border-green-200">
                <p className="text-[10px] font-semibold text-green-700 mb-1">HAS</p>
                {qualifierInfo.earnedBadges.length > 0 ? (
                  <QualifierBadges badges={qualifierInfo.earnedBadges} size="small" />
                ) : (
                  <p className="text-[10px] text-gray-400">None yet</p>
                )}
              </div>
              
              {/* DUE Box */}
              <div className={`rounded-lg p-2 border ${
                isOverdue 
                  ? 'bg-red-50 border-red-300' 
                  : 'bg-blue-50 border-blue-200'
              }`}>
                <p className={`text-[10px] font-semibold mb-1 ${
                  isOverdue ? 'text-red-700' : 'text-blue-700'
                }`}>DUE</p>
                <p className={`text-xs font-bold ${
                  isOverdue ? 'text-red-600' : 'text-blue-600'
                }`}>
                  {route.due_date ? format(new Date(route.due_date), 'MMM d') : 'N/A'}
                </p>
              </div>
              
              {/* NEEDS Box */}
              <div className="bg-amber-50 rounded-lg p-2 border border-amber-200">
                <p className="text-[10px] font-semibold text-amber-700 mb-1">NEEDS</p>
                {qualifierInfo.needed.length > 0 ? (
                  <QualifierBadges badges={qualifierInfo.needed} size="small" />
                ) : (
                  <p className="text-[10px] text-green-600 font-semibold">✓ Done</p>
                )}
                {spreadDate && (
                  <p className={`text-[9px] mt-1 ${isSpreadPassed ? 'text-green-600' : 'text-amber-600'}`}>
                    Spread: {format(spreadDate, 'MMM d')}
                  </p>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Action Button (for active routes) */}
      {isActive && !isBossView && (
        <div className="px-4 py-3 border-t border-gray-100">
          <Button 
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl"
            onClick={(e) => {
              e.stopPropagation();
              navigate(createPageUrl(`WorkerRouteDetail?id=${route.id}`));
            }}
          >
            <Play className="w-4 h-4 mr-2" />
            CONTINUE ROUTE
          </Button>
        </div>
      )}

      {/* Chevron for navigation hint */}
      {!isActive && (
        <div className="px-4 py-2 border-t border-gray-100 flex justify-end">
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </div>
      )}
    </div>
  );
}