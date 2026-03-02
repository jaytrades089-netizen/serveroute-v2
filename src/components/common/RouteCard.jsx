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
  MoreHorizontal,
  Trash2,
  Archive,
  Pencil,
  Eye
} from 'lucide-react';
import * as DropdownMenuPrimitives from "@/components/ui/dropdown-menu";
const {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} = DropdownMenuPrimitives;
import { getNeededQualifiers, calculateSpreadDate } from '@/components/services/QualifierService';
import { QualifierBadges } from '@/components/qualifier/QualifierBadge';

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
  // If no handlers provided, just show three-dot icon
  if (!onDelete && !onArchive && !onEdit) {
    return <MoreHorizontal className="w-5 h-5 text-gray-400" />;
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
          <MoreHorizontal className="w-5 h-5 text-gray-400" />
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
      const url = linkTo.includes('?') ? linkTo : linkTo;
      navigate(createPageUrl(url));
    } else if (isBossView) {
      navigate(createPageUrl(`BossRouteDetail?id=${route.id}`));
    } else {
      navigate(createPageUrl(`WorkerRouteDetail?id=${route.id}`));
    }
  };

  const isActiveRoute = route.status === 'active';
  
  // Calculate stats
  const totalAddresses = route.total_addresses || 0;
  const servedCount = route.served_count || 0;
  const pendingCount = totalAddresses - servedCount;
  
  // Calculate HAS/NEEDS qualifiers
  const servedAddressIds = new Set();
  (attempts || []).forEach(att => {
    if (att.outcome === 'served') {
      servedAddressIds.add(att.address_id);
    }
  });
  
  const unservedAttemptsByAddress = {};
  (attempts || []).forEach(att => {
    if (!servedAddressIds.has(att.address_id)) {
      if (!unservedAttemptsByAddress[att.address_id]) {
        unservedAttemptsByAddress[att.address_id] = [];
      }
      unservedAttemptsByAddress[att.address_id].push(att);
    }
  });
  
  const routeHas = { AM: false, PM: false, WEEKEND: false };
  Object.values(unservedAttemptsByAddress).forEach(addressAttempts => {
    addressAttempts.forEach(att => {
      if (att.has_am) routeHas.AM = true;
      if (att.has_pm) routeHas.PM = true;
      if (att.has_weekend) routeHas.WEEKEND = true;
    });
  });
  
  const unservedCount = totalAddresses - servedCount;
  let routeNeeds = { AM: false, PM: false, WEEKEND: false };
  if (unservedCount > 0) {
    routeNeeds.AM = !routeHas.AM;
    routeNeeds.PM = !routeHas.PM;
    routeNeeds.WEEKEND = !routeHas.WEEKEND;
  }
  
  const earnedBadges = Object.keys(routeHas).filter(k => routeHas[k]);
  const neededBadges = Object.keys(routeNeeds).filter(k => routeNeeds[k]);
  
  // Spread days from route
  const spreadDays = route.minimum_days_spread || route.spread_type || 14;

  return (
    <div
      onClick={handleCardClick}
      className={`rounded-2xl shadow-sm overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] bg-white border border-gray-200 ${
        workerCanEdit
          ? 'ring-2 ring-orange-400 ring-offset-2 border-2 border-orange-400 bg-orange-50'
          : isActiveRoute 
            ? 'ring-2 ring-orange-500 ring-offset-2 shadow-lg shadow-orange-500/30' 
            : ''
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

      {/* Header: Route Name + Address Count + Spread Badge */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-gray-900 leading-tight">
              {route.folder_name}
            </h3>
            {showWorker && workerName && (
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                <User className="w-3 h-3" /> {workerName}
              </p>
            )}
          </div>
          <div className="flex-shrink-0 ml-3 flex items-center gap-2">
            <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-teal-500 text-white text-sm font-bold">
              {spreadDays}d
            </span>
            {(() => {
              const requiredAttempts = route.required_attempts || 3;
              if (!requiredAttempts || requiredAttempts <= 0) return null;
              
              const attemptsByAddress = {};
              (attempts || []).forEach(att => {
                if (att.status === 'completed') {
                  attemptsByAddress[att.address_id] = (attemptsByAddress[att.address_id] || 0) + 1;
                }
              });
              
              const counts = Object.values(attemptsByAddress);
              const completedRound = counts.length > 0 ? Math.min(...counts) : 0;
              const currentAttempt = Math.min(completedRound + 1, requiredAttempts);
              
              return (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  {currentAttempt}/{requiredAttempts}
                </span>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Stats Row: Total / Served / Pending */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-3 gap-3">
          {/* Total */}
          <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
            <p className="text-3xl font-bold text-blue-600">{totalAddresses}</p>
            <p className="text-xs text-gray-500 font-medium mt-0.5">Total</p>
          </div>
          
          {/* Served */}
          <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
            <p className="text-3xl font-bold text-green-600">{servedCount}</p>
            <p className="text-xs text-gray-500 font-medium mt-0.5">Served</p>
          </div>
          
          {/* Pending */}
          <div className="bg-orange-50 rounded-xl p-3 text-center border border-orange-100">
            <p className="text-3xl font-bold text-orange-500">{pendingCount}</p>
            <p className="text-xs text-gray-500 font-medium mt-0.5">Pending</p>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex items-center">
          {/* View Button - Full width with Eye icon */}
          <button 
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              if (isBossView) {
                navigate(createPageUrl(`BossRouteDetail?id=${route.id}`));
              } else {
                navigate(createPageUrl(`WorkerRouteDetail?id=${route.id}`));
              }
            }}
          >
            <Eye className="w-5 h-5 text-blue-600" />
            <span className="text-blue-600 font-semibold">View</span>
          </button>
          
          {/* 3-dot menu (MoreHorizontal) */}
          <div className="ml-2">
            <RouteCardMenu 
              route={route} 
              onEdit={onEdit} 
              onArchive={onArchive} 
              onDelete={onDelete} 
            />
          </div>
        </div>
      </div>
    </div>
  );
}