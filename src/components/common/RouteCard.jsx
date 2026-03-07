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
  Eye,
  Plus,
  CalendarPlus,
  X
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { parseISO } from 'date-fns';
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

function RouteCardMenu({ route, onEdit, onArchive, onDelete, onScheduleRunDate }) {
  // If no handlers provided, just show three-dot icon
  if (!onDelete && !onArchive && !onEdit && !onScheduleRunDate) {
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
        {onScheduleRunDate && (
          <DropdownMenuItem 
            onClick={(e) => { e.stopPropagation(); onScheduleRunDate(route.id, '__open_picker__'); }}
            className="cursor-pointer"
          >
            <CalendarPlus className="w-4 h-4 mr-2 text-blue-500" />
            <span>Schedule Run Date</span>
          </DropdownMenuItem>
        )}
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
        {(onEdit || onArchive || onScheduleRunDate) && onDelete && (
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
  onScheduleRunDate,
  isBossView = false,
  className = '',
  attempts = [],
  workerCanEdit = false,
  isOverdue: isOverdueFromProps,
  addresses = []
}) {
  const navigate = useNavigate();
  const [showRunDatePicker, setShowRunDatePicker] = React.useState(false);
  const [pendingQualifiers, setPendingQualifiers] = React.useState(route.run_qualifiers || []);

  // Sync pending qualifiers when route data changes
  React.useEffect(() => {
    setPendingQualifiers(route.run_qualifiers || []);
  }, [route.run_qualifiers]);

  const toggleQualifier = (q) => {
    setPendingQualifiers(prev => prev.includes(q) ? prev.filter(x => x !== q) : [...prev, q]);
  };

  // Wrapper that intercepts the special '__open_picker__' signal from the menu
  const handleScheduleRunDate = onScheduleRunDate 
    ? (routeId, dateOrSignal) => {
        if (dateOrSignal === '__open_picker__') {
          setShowRunDatePicker(true);
        } else {
          onScheduleRunDate(routeId, dateOrSignal);
        }
      }
    : undefined;
  const progress = route.total_addresses > 0 
    ? Math.round((route.served_count / route.total_addresses) * 100) 
    : 0;

  const isCompleted = route.status === 'completed';
  const isActive = route.status === 'active' || route.status === 'assigned';
  const isDueSoon = route.due_date && differenceInDays(new Date(route.due_date), new Date()) <= 3 && !isCompleted;
  const isOverdue = isOverdueFromProps !== undefined ? isOverdueFromProps : (route.due_date && new Date(route.due_date) < new Date() && !isCompleted);

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
  
  // Check if ALL addresses have met requirements (ready for turn-in)
  const allAddressesComplete = (() => {
    if (!addresses || addresses.length === 0) return false;
    
    const routeAddresses = addresses.filter(a => a.route_id === route.id && !a.served && a.status !== 'served');
    if (routeAddresses.length === 0) {
      // All addresses served or no unserved addresses
      return route.served_count > 0 && route.served_count === route.total_addresses;
    }
    
    const requiredAttempts = route.required_attempts || 3;
    const minimumDaysSpread = route.minimum_days_spread || 10;
    
    // Check each unserved address
    for (const addr of routeAddresses) {
      const addressAttempts = (attempts || []).filter(a => a.address_id === addr.id && a.status === 'completed');
      
      // Check qualifiers
      const qualifierStatus = getNeededQualifiers(addressAttempts);
      if (!qualifierStatus.isComplete) return false;
      
      // Check attempt count
      if (addressAttempts.length < requiredAttempts) return false;
      
      // Check spread (calendar days)
      if (addressAttempts.length >= 2) {
        const attemptDates = addressAttempts.map(a => {
          const d = new Date(a.attempt_time);
          return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        });
        const firstDate = Math.min(...attemptDates);
        const lastDate = Math.max(...attemptDates);
        const daysDiff = (lastDate - firstDate) / (1000 * 60 * 60 * 24);
        if (daysDiff < minimumDaysSpread) return false;
      } else {
        return false; // Need at least 2 attempts for spread
      }
    }
    
    return true;
  })();

  return (
    <div
      onClick={handleCardClick}
      className={`rounded-2xl shadow-sm overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] ${
        allAddressesComplete
          ? 'bg-green-50 border-2 border-green-400 ring-2 ring-green-300 ring-offset-1'
          : isOverdue
            ? 'bg-red-50 border-2 border-red-400 ring-2 ring-red-300 ring-offset-1'
            : workerCanEdit
              ? 'ring-2 ring-orange-400 ring-offset-2 border-2 border-orange-400 bg-orange-50'
              : isActiveRoute 
                ? 'ring-2 ring-orange-500 ring-offset-2 shadow-lg shadow-orange-500/30 bg-white border border-gray-200' 
                : 'bg-white border border-gray-200'
      } ${className}`}
    >
      {/* All Complete Banner */}
      {allAddressesComplete && (
        <div className="px-4 py-2 bg-green-500 border-b border-green-600">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-white" />
            <span className="text-xs font-bold text-white uppercase tracking-wide">ALL REQUIREMENTS MET - Ready to Archive</span>
          </div>
        </div>
      )}

      {/* Overdue Banner */}
      {isOverdue && !isCompleted && !allAddressesComplete && (
        <div className="px-4 py-2 bg-red-500 border-b border-red-600">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-white" />
            <span className="text-xs font-bold text-white uppercase tracking-wide">OVERDUE - Past Due Date</span>
          </div>
        </div>
      )}

      {/* Worker Edit Mode Banner */}
      {workerCanEdit && !isOverdue && (
        <div className="px-4 py-2 bg-orange-100 border-b border-orange-300">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-orange-600" />
            <span className="text-xs font-bold text-orange-700 uppercase tracking-wide">Worker Can Edit</span>
          </div>
        </div>
      )}

      {/* Active Route Indicator */}
      {isActiveRoute && !workerCanEdit && !isOverdue && (
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
            {route.run_date && (
              <p className="text-xs text-blue-600 font-medium mt-0.5 flex items-center gap-1">
                📅 Run: {format(parseISO(route.run_date), 'EEE, MMM d')}
                {route.run_qualifiers && route.run_qualifiers.length > 0 && (
                  <span className="ml-1"><QualifierBadges badges={route.run_qualifiers} size="small" /></span>
                )}
                {onScheduleRunDate && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onScheduleRunDate(route.id, null, []);
                    }}
                    className="ml-1 p-0.5 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </p>
            )}
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

      {/* HAS / DUE / NEEDS Row */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-3 gap-3">
          {/* HAS */}
          <div className="text-center">
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Has</p>
            <div className="bg-green-50 rounded-xl p-2.5 border border-green-200 min-h-[60px] flex items-center justify-center">
              {earnedBadges.length > 0 ? (
                <div className="flex flex-wrap gap-1 justify-center">
                  <QualifierBadges badges={earnedBadges} size="small" />
                </div>
              ) : (
                <span className="text-sm text-gray-400">None</span>
              )}
            </div>
          </div>
          
          {/* DUE */}
          <div className="text-center">
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Due</p>
            <div className={`rounded-xl p-2.5 border min-h-[60px] flex flex-col items-center justify-center ${
              isOverdue 
                ? 'bg-red-50 border-red-200' 
                : 'bg-purple-50 border-purple-200'
            }`}>
              <span className={`text-sm font-medium ${
                isOverdue ? 'text-red-600' : 'text-purple-600'
              }`}>
                {route.due_date ? format(new Date(route.due_date), 'MMM d') : 'No date'}
              </span>
              {route.first_attempt_date && (
                <span className={`text-[10px] mt-0.5 ${
                  isOverdue ? 'text-red-500' : 'text-purple-500'
                }`}>
                  {(() => {
                    const firstAttempt = new Date(route.first_attempt_date);
                    const spreadDueDate = new Date(firstAttempt);
                    spreadDueDate.setDate(spreadDueDate.getDate() + (route.minimum_days_spread || 14));
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    spreadDueDate.setHours(0, 0, 0, 0);
                    const daysLeft = Math.ceil((spreadDueDate - today) / (1000 * 60 * 60 * 24));
                    return `Spread: ${daysLeft} Days`;
                  })()}
                </span>
              )}
            </div>
          </div>
          
          {/* NEEDS */}
          <div className="text-center">
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Needs</p>
            <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-200 min-h-[60px] flex flex-col items-center justify-center gap-1">
              {neededBadges.length > 0 ? (
                <div className="flex flex-wrap gap-1 justify-center">
                  <QualifierBadges badges={neededBadges} size="small" />
                </div>
              ) : null}
              {/* Show 3rd attempt deadline based on spread */}
              {route.first_attempt_date && pendingCount > 0 ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700 border border-red-300">
                  3rd: {format((() => {
                    const firstAttempt = new Date(route.first_attempt_date);
                    const spreadDueDate = new Date(firstAttempt);
                    spreadDueDate.setDate(spreadDueDate.getDate() + (route.minimum_days_spread || spreadDays || 14));
                    return spreadDueDate;
                  })(), 'M/d')}
                </span>
              ) : pendingCount === 0 ? (
                <span className="text-sm text-green-600 font-semibold">✓ Done</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="px-4 py-3 border-t border-gray-100">
        {/* + Schedule button row */}
        {onScheduleRunDate && !isBossView && (
          <div className="mb-2" onClick={(e) => e.stopPropagation()}>
            <Popover open={showRunDatePicker} onOpenChange={setShowRunDatePicker}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors px-2 py-1.5 rounded-lg hover:bg-blue-50">
                  {route.run_date ? `📅 Run: ${format(parseISO(route.run_date), 'EEE, MMM d')}` : '+ Schedule'}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker
                  mode="single"
                  selected={route.run_date ? parseISO(route.run_date) : undefined}
                  onSelect={(date) => {
                    onScheduleRunDate(route.id, date, pendingQualifiers);
                    setShowRunDatePicker(false);
                  }}
                />
                {/* Qualifier selector */}
                <div className="px-3 py-2 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-2">QUALIFIER FOR THIS RUN</p>
                  <div className="flex gap-2">
                    {['AM', 'PM', 'WEEKEND'].map(q => (
                      <button
                        key={q}
                        onClick={() => toggleQualifier(q)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                          pendingQualifiers.includes(q)
                            ? q === 'AM' ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : q === 'PM' ? 'bg-blue-100 text-blue-800 border-blue-300'
                              : 'bg-purple-100 text-purple-800 border-purple-300'
                            : 'bg-gray-100 text-gray-400 border-gray-200'
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
                {route.run_date && (
                  <div className="px-3 pb-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-red-500"
                      onClick={() => {
                        onScheduleRunDate(route.id, null, []);
                        setShowRunDatePicker(false);
                      }}
                    >
                      Clear Date
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        )}

        <div className="flex items-center">
          {/* View Button */}
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
          
          {/* 3-dot menu */}
          <div className="ml-2">
            <RouteCardMenu 
              route={route} 
              onEdit={onEdit} 
              onArchive={onArchive} 
              onDelete={onDelete}
              onScheduleRunDate={handleScheduleRunDate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}