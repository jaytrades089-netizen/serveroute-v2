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
  MoreVertical,
  Trash2,
  Archive,
  Pencil
} from 'lucide-react';
import * as DropdownMenuPrimitive from "@/components/ui/dropdown-menu";
import { getNeededQualifiers, calculateSpreadDate } from '@/components/services/QualifierService';
import { QualifierBadges } from '@/components/qualifier/QualifierBadge';

// Extract dropdown components to ensure they're not tree-shaken
const {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} = DropdownMenuPrimitive;

const STATUS_CONFIG = {
  draft: { label: 'DRAFT', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  ready: { label: 'READY', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  assigned: { label: 'ASSIGNED', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  active: { label: 'ACTIVE', color: 'bg-green-100 text-green-700 border-green-200' },
  stalled: { label: 'STALLED', color: 'bg-red-100 text-red-700 border-red-200' },
  completed: { label: 'COMPLETED', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  archived: { label: 'ARCHIVED', color: 'bg-gray-200 text-gray-500 border-gray-300' }
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

function RouteCardMenu({ route, onEdit, onArchive, onDelete }) {
  // If no handlers provided, just show chevron
  if (!onDelete && !onArchive && !onEdit) {
    return <ChevronRight className="w-5 h-5 text-gray-300" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full hover:bg-gray-100"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="w-5 h-5 text-gray-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-48">
        {onEdit && (
          <DropdownMenuItem 
            onClick={(e) => { e.stopPropagation(); onEdit(route); }}
            className="cursor-pointer"
          >
            <Pencil className="w-4 h-4 mr-2 text-blue-500" />
            <span>Edit Route</span>
          </DropdownMenuItem>
        )}
        {onArchive && (
          <DropdownMenuItem 
            onClick={(e) => { e.stopPropagation(); onArchive(route); }}
            className="cursor-pointer"
          >
            <Archive className="w-4 h-4 mr-2 text-amber-500" />
            <span>{route.status === 'archived' ? 'Unarchive Route' : 'Archive Route'}</span>
          </DropdownMenuItem>
        )}
        {(onEdit || onArchive) && onDelete && (
          <DropdownMenuSeparator />
        )}
        {onDelete && (
          <DropdownMenuItem 
            onClick={(e) => { e.stopPropagation(); onDelete(route); }}
            className="cursor-pointer text-red-600 focus:text-red-600"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            <span>Delete Route</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
  onDelete,
  onArchive,
  onEdit,
  isBossView = false,
  className = '',
  attempts = [],
  workerCanEdit = false
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
      className={`rounded-2xl shadow-sm overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] ${
        workerCanEdit
          ? 'ring-2 ring-orange-400 ring-offset-2 border-2 border-orange-400 bg-orange-50'
          : isActiveRoute 
            ? 'ring-2 ring-orange-500 ring-offset-2 shadow-lg shadow-orange-500/30 bg-orange-50 border-orange-200' 
            : 'bg-white border border-gray-100'
      } ${className}`}
    >
      {/* Worker Edit Mode Banner */}
      {workerCanEdit && (
        <div className="px-4 py-2 bg-orange-100 border-b border-orange-300">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-orange-600" />
            <span className="text-xs font-bold text-orange-700 uppercase tracking-wide">Worker Can Edit</span>
          </div>
        </div>
      )}

      {/* Active Route Indicator */}
      {isActiveRoute && !workerCanEdit && (
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

        {/* HAS / DUE / NEEDS Boxes - ALWAYS VISIBLE */}
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

        {/* OPTIMIZATION METRICS - SHOW IF ROUTE HAS BEEN OPTIMIZED */}
        {route.total_miles != null && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            {/* Start Time (if started) or Total Miles (if not started) */}
            {route.started_at ? (
              <div className="bg-blue-50 rounded-lg p-2 text-center border border-blue-200">
                <p className="text-lg font-bold text-blue-600">
                  {new Date(route.started_at).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </p>
                <p className="text-[10px] text-blue-500 font-medium">Started</p>
              </div>
            ) : (
              <div className="bg-blue-50 rounded-lg p-2 text-center border border-blue-200">
                <p className="text-lg font-bold text-blue-600">
                  {route.total_miles?.toFixed(1)}
                </p>
                <p className="text-[10px] text-blue-500 font-medium">Total Mi</p>
              </div>
            )}
            
            {/* Miles Remaining + Duration (SPLIT BOX) */}
            <div className="bg-purple-50 rounded-lg overflow-hidden border border-purple-200">
              <div className="p-1.5 text-center border-b border-purple-200">
                <p className="text-lg font-bold text-purple-600">
                  {(() => {
                    if (!route.started_at) return route.total_miles?.toFixed(1) || '0';
                    const totalAddresses = route.total_addresses || 0;
                    const completedCount = route.served_count || 0;
                    if (totalAddresses === 0) return route.total_miles?.toFixed(1) || '0';
                    const remainingPercentage = (totalAddresses - completedCount) / totalAddresses;
                    return (route.total_miles * remainingPercentage).toFixed(1);
                  })()}
                  <span className="text-xs ml-0.5">mi</span>
                </p>
                {route.started_at && (
                  <p className="text-[9px] text-purple-400">remaining</p>
                )}
              </div>
              <div className="p-1 text-center bg-purple-100/50">
                <p className="text-sm font-semibold text-purple-700">
                  {(() => {
                    const totalMinutes = route.est_total_minutes || route.total_drive_time_minutes || 0;
                    if (!totalMinutes) return '--';
                    const hours = Math.floor(totalMinutes / 60);
                    const minutes = totalMinutes % 60;
                    if (hours === 0) return `${minutes}m`;
                    if (minutes === 0) return `${hours}h`;
                    return `${hours}h ${minutes}m`;
                  })()}
                </p>
              </div>
            </div>
            
            {/* Est Completion */}
            <div className="bg-green-50 rounded-lg p-2 text-center border border-green-200">
              <p className="text-lg font-bold text-green-600">
                {route.est_completion_time 
                  ? new Date(route.est_completion_time).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    })
                  : '--:--'
                }
              </p>
              <p className="text-[10px] text-green-500 font-medium">
                {route.started_at ? 'Est. Done' : 'Est. Time'}
              </p>
            </div>
          </div>
        )}

        {/* ACTIVE ROUTE EXTRA PROGRESS INFO */}
        {isActiveRoute && route.total_miles != null && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{progress}% complete</span>
              <span className="text-purple-600 font-medium">
                {(() => {
                  const totalAddresses = route.total_addresses || 0;
                  const completedCount = route.served_count || 0;
                  if (totalAddresses === 0) return route.total_miles?.toFixed(1) || '0';
                  const remainingPercentage = (totalAddresses - completedCount) / totalAddresses;
                  return (route.total_miles * remainingPercentage).toFixed(1);
                })()} mi left
              </span>
            </div>
            {route.est_completion_time && (
              <p className="text-xs text-gray-400 text-right">
                {(() => {
                  const now = new Date();
                  const end = new Date(route.est_completion_time);
                  const remainingMinutes = Math.max(0, Math.round((end - now) / 60000));
                  const hours = Math.floor(remainingMinutes / 60);
                  const minutes = remainingMinutes % 60;
                  if (hours === 0) return `${minutes}m remaining`;
                  return `${hours}h ${minutes}m remaining`;
                })()}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bottom Action Bar */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
        {/* Left: Continue button for active routes */}
        {isActive && !isBossView ? (
          <Button 
            className="flex-1 mr-3 h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl"
            onClick={(e) => {
              e.stopPropagation();
              navigate(createPageUrl(`WorkerRouteDetail?id=${route.id}`));
            }}
          >
            <Play className="w-4 h-4 mr-2" />
            CONTINUE ROUTE
          </Button>
        ) : (
          <div className="flex-1" />
        )}

        {/* Right: 3-dot menu - only render if handlers are provided */}
        <RouteCardMenu 
          route={route} 
          onEdit={onEdit} 
          onArchive={onArchive} 
          onDelete={onDelete} 
        />
      </div>
    </div>
  );
}