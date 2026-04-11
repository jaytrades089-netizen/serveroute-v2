import React from 'react';
import ReactDOM from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
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
  X,
  ChevronDown,
  ChevronUp
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
  draft: { label: 'DRAFT', color: 'text-[#8a7f87] border-[#363436] bg-[#1c1b1d]' },
  ready: { label: 'READY', color: 'text-[#e9c349] border-[#363436] bg-[#201f21]' },
  assigned: { label: 'ASSIGNED', color: 'text-[#e5b9e1] border-[#363436] bg-[#201f21]' },
  active: { label: 'ACTIVE', color: 'bg-green-100 text-green-700 border-green-200' },
  stalled: { label: 'STALLED', color: 'bg-red-100 text-red-700 border-red-200' },
  completed: { label: 'COMPLETED', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  archived: { label: 'ARCHIVED', color: 'text-[#8a7f87] border-[#363436] bg-[#1c1b1d]' }
};

function ProgressBar({ served, total }) {
  const percent = total > 0 ? Math.round((served / total) * 100) : 0;
  return (
    <div style={{ background: '#363436' }} className="w-full rounded-full h-2.5 overflow-hidden">
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
  if (!onDelete && !onArchive && !onEdit && !onScheduleRunDate) {
    return <MoreHorizontal className="w-5 h-5 text-gray-400" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full hover:bg-white/10"
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
  noClick = false,
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
  const queryClient = useQueryClient();

  const initialRuns = Array.isArray(route.scheduled_runs) ? route.scheduled_runs : [];

  const [showRunDatePicker, setShowRunDatePicker] = React.useState(false);
  const [scheduledRuns, setScheduledRuns] = React.useState(initialRuns);
  const [showScheduleQueue, setShowScheduleQueue] = React.useState(initialRuns.length > 0);
  const [showQueueCalendar, setShowQueueCalendar] = React.useState(false);
  const [pendingQueueDate, setPendingQueueDate] = React.useState(null);
  const [pendingQueueQualifiers, setPendingQueueQualifiers] = React.useState([]);
  const [savingQueue, setSavingQueue] = React.useState(false);
  const [editingQueueIndex, setEditingQueueIndex] = React.useState(null);
  const [editQueueDate, setEditQueueDate] = React.useState(null);
  const [editQueueQualifiers, setEditQueueQualifiers] = React.useState([]);
  const [pendingQualifiers, setPendingQualifiers] = React.useState(route.run_qualifiers || []);
  const [pendingDate, setPendingDate] = React.useState(route.run_date ? parseISO(route.run_date) : undefined);

  React.useEffect(() => {
    setPendingQualifiers(route.run_qualifiers || []);
    setPendingDate(route.run_date ? parseISO(route.run_date) : undefined);
  }, [route.run_qualifiers, route.run_date]);

  const toggleQualifier = (q) => {
    setPendingQualifiers(prev => prev.includes(q) ? prev.filter(x => x !== q) : [...prev, q]);
  };

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

  const handleAddToQueue = async () => {
    if (!pendingQueueDate) return;
    setSavingQueue(true);
    const newEntry = { date: format(pendingQueueDate, 'yyyy-MM-dd'), qualifiers: pendingQueueQualifiers };
    const newQueue = [...scheduledRuns, newEntry];
    setScheduledRuns(newQueue);
    setPendingQueueDate(null);
    setPendingQueueQualifiers([]);
    setShowQueueCalendar(false);
    try {
      await base44.entities.Route.update(route.id, { scheduled_runs: newQueue });
      queryClient.refetchQueries({ queryKey: ['workerRoutes'] });
      queryClient.refetchQueries({ queryKey: ['route', route.id] });
    } catch (err) {
      console.error('Failed to save queue entry:', err);
    } finally {
      setSavingQueue(false);
    }
  };

  const handleRemoveFromQueue = async (index) => {
    setSavingQueue(true);
    const newQueue = scheduledRuns.filter((_, i) => i !== index);
    setScheduledRuns(newQueue);
    try {
      await base44.entities.Route.update(route.id, { scheduled_runs: newQueue });
      queryClient.refetchQueries({ queryKey: ['workerRoutes'] });
      queryClient.refetchQueries({ queryKey: ['route', route.id] });
    } catch (err) {
      console.error('Failed to remove queue entry:', err);
    } finally {
      setSavingQueue(false);
    }
  };

  const closeQueueCalendar = () => {
    setShowQueueCalendar(false);
    setPendingQueueDate(null);
    setPendingQueueQualifiers([]);
    setEditingQueueIndex(null);
    setEditQueueDate(null);
    setEditQueueQualifiers([]);
  };

  const togglePendingQualifier = (q) => {
    setPendingQueueQualifiers(prev => prev.includes(q) ? prev.filter(x => x !== q) : [...prev, q]);
  };

  const handleUpdateQueueItem = async () => {
    if (editQueueDate === null || editingQueueIndex === null) return;
    setSavingQueue(true);
    const newQueue = scheduledRuns.map((item, i) =>
      i === editingQueueIndex
        ? { date: format(editQueueDate, 'yyyy-MM-dd'), qualifiers: editQueueQualifiers }
        : item
    );
    setScheduledRuns(newQueue);
    setEditingQueueIndex(null);
    setEditQueueDate(null);
    setEditQueueQualifiers([]);
    try {
      await base44.entities.Route.update(route.id, { scheduled_runs: newQueue });
      queryClient.invalidateQueries({ queryKey: ['workerRoutes'] });
      queryClient.invalidateQueries({ queryKey: ['route', route.id] });
      queryClient.invalidateQueries({ queryKey: ['allRoutes'] });
      queryClient.invalidateQueries({ queryKey: ['comboRoutes'] });
    } catch (err) {
      console.error('Failed to update queue entry:', err);
    } finally {
      setSavingQueue(false);
    }
  };

  const handleCardClick = () => {
    if (noClick) return;
    if (onClick) {
      onClick(route);
    } else if (linkTo) {
      navigate(createPageUrl(linkTo));
    } else if (isBossView) {
      navigate(createPageUrl(`BossRouteDetail?id=${route.id}`));
    } else {
      navigate(createPageUrl(`WorkerRouteDetail?id=${route.id}`));
    }
  };

  const isActiveRoute = route.status === 'active';
  
  const totalAddresses = route.total_addresses || 0;
  const servedCount = route.served_count || 0;
  const pendingCount = totalAddresses - servedCount;
  
  const routeAddressList = (addresses || []).filter(a => a.route_id === route.id);
  const servedAddressIds = new Set();
  routeAddressList.forEach(addr => {
    if (addr.served || addr.status === 'served') {
      servedAddressIds.add(addr.id);
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
  
  const spreadDays = route.minimum_days_spread || route.spread_type || 14;

  const estTotalMinutes = (() => {
    if (!route.total_drive_time_minutes || route.total_drive_time_minutes <= 0) return null;
    const dwell = (route.time_at_address_minutes || 2) * (route.total_addresses || 0);
    return route.total_drive_time_minutes + dwell;
  })();

  const estTimeLabel = (() => {
    if (!estTotalMinutes) return null;
    const h = Math.floor(estTotalMinutes / 60);
    const m = estTotalMinutes % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  })();
  
  const allAddressesComplete = (() => {
    if (!addresses || addresses.length === 0) return false;
    const routeAddresses = addresses.filter(a => a.route_id === route.id && !a.served && a.status !== 'served');
    if (routeAddresses.length === 0) {
      return route.served_count > 0 && route.served_count === route.total_addresses;
    }
    const requiredAttempts = route.required_attempts || 3;
    const minimumDaysSpread = route.minimum_days_spread || 10;
    for (const addr of routeAddresses) {
      const addressAttempts = (attempts || []).filter(a => a.address_id === addr.id && a.status === 'completed');
      const qualifierStatus = getNeededQualifiers(addressAttempts);
      if (!qualifierStatus.isComplete) return false;
      if (addressAttempts.length < requiredAttempts) return false;
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
        return false;
      }
    }
    return true;
  })();

  // Calendar modifier class names — single definition used by all three calendar instances below
  const calDue = 'rc-cal-due';
  const calSpread = 'rc-cal-spread';

  return (
    <>
    {/* Single shared calendar CSS — one injection, three calendars share it */}
    <style>{`
      .rc-cal-due{position:relative}
      .rc-cal-due::after{content:'';position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:18px;height:3px;border-radius:2px;background-color:#ef4444}
      .rc-cal-spread{position:relative}
      .rc-cal-spread::after{content:'';position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:18px;height:3px;border-radius:2px;background-color:#22c55e}
    `}</style>
    <div
      style={{
        background: 'rgba(14, 20, 44, 0.55)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1.5px solid rgba(229,179,225,0.35)',
        boxShadow: '0 0 10px rgba(229,179,225,0.12), inset 0 0 0 1px rgba(229,179,225,0.08)',
        borderRadius: '1rem',
        marginBottom: '12px'
      }}
      onClick={handleCardClick}
      className={`transition-all duration-200 ${noClick ? '' : 'cursor-pointer hover:opacity-90 active:scale-[0.99]'}`}
    >
      {/* All Complete Banner */}
      {allAddressesComplete && (
        <div className="px-4 py-2 rounded-t-2xl" style={{ background: 'rgba(34,197,94,0.20)', borderBottom: '1px solid rgba(34,197,94,0.30)' }}>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" style={{ color: '#22c55e' }} />
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#22c55e' }}>ALL REQUIREMENTS MET — Ready to Archive</span>
          </div>
        </div>
      )}

      {/* Overdue Banner */}
      {isOverdue && !isCompleted && !allAddressesComplete && (
        <div className="px-4 py-2 rounded-t-2xl" style={{ background: 'rgba(239,68,68,0.20)', borderBottom: '1px solid rgba(239,68,68,0.30)' }}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" style={{ color: '#ef4444' }} />
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#ef4444' }}>OVERDUE — Past Due Date</span>
          </div>
        </div>
      )}

      {/* Worker Edit Mode Banner */}
      {workerCanEdit && !isOverdue && (
        <div className="px-4 py-2 rounded-t-2xl" style={{ background: 'rgba(233,195,73,0.15)', borderBottom: '1px solid rgba(233,195,73,0.25)' }}>
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4" style={{ color: '#e9c349' }} />
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#e9c349' }}>Worker Can Edit</span>
          </div>
        </div>
      )}

      {/* Active Route Indicator */}
      {isActiveRoute && !workerCanEdit && !isOverdue && (
        <div className="px-4 py-2 rounded-t-2xl" style={{ background: 'rgba(229,179,225,0.15)', borderBottom: '1px solid rgba(229,179,225,0.20)' }}>
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#e5b9e1' }}></span>
              <span className="relative inline-flex rounded-full h-3 w-3" style={{ background: '#e5b9e1' }}></span>
            </span>
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#e5b9e1' }}>Active Route</span>
          </div>
        </div>
      )}

      {/* Header: Route Name + Badges */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold leading-tight" style={{ color: '#e6e1e4' }}>
              {route.folder_name}
            </h3>
            {showWorker && workerName && (
              <p className="text-sm flex items-center gap-1 mt-0.5" style={{ color: '#8a7f87' }}>
                <User className="w-3 h-3" /> {workerName}
              </p>
            )}
          </div>
          <div className="flex-shrink-0 ml-3 flex items-center gap-2">
            {estTimeLabel && (
              <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ color: '#8a7f87', background: '#363436' }}>
                {estTimeLabel}
              </span>
            )}
            <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ color: '#8a7f87', background: '#363436' }}>
              {spreadDays}d
            </span>
            {(() => {
              const requiredAttempts = route.required_attempts || 3;
              if (!requiredAttempts || requiredAttempts <= 0) return null;
              const routeAddressIds = new Set(routeAddressList.map(a => a.id));
              const attemptsByAddress = {};
              (attempts || []).forEach(att => {
                if (att.status === 'completed' && !servedAddressIds.has(att.address_id) && routeAddressIds.has(att.address_id)) {
                  attemptsByAddress[att.address_id] = (attemptsByAddress[att.address_id] || 0) + 1;
                }
              });
              const counts = Object.values(attemptsByAddress);
              const minAttempts = counts.length > 0 ? Math.min(...counts) : 0;
              return (
                <span className="text-xs px-2 py-1 rounded-full" style={{ color: '#8a7f87', background: '#363436' }}>
                  {minAttempts}/{requiredAttempts}
                </span>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-3 gap-3">
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12 }} className="rounded-xl p-3 text-center">
            <p className="text-sm font-bold" style={{ color: '#E6E1E4' }}>{totalAddresses}</p>
            <p className="text-xs font-medium mt-0.5" style={{ color: '#6B7280' }}>Total</p>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12 }} className="rounded-xl p-3 text-center">
            <p className="text-sm font-bold" style={{ color: '#E6E1E4' }}>{servedCount}</p>
            <p className="text-xs font-medium mt-0.5" style={{ color: '#6B7280' }}>Served</p>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12 }} className="rounded-xl p-3 text-center">
            <p className="text-sm font-bold" style={{ color: '#E6E1E4' }}>{pendingCount}</p>
            <p className="text-xs font-medium mt-0.5" style={{ color: '#6B7280' }}>Pending</p>
          </div>
        </div>
      </div>

      {/* HAS / DUE / NEEDS Row */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-3 gap-3 items-stretch">
          <div className="text-center flex flex-col">
            <p className="text-xs font-semibold mb-1.5" style={{ color: '#8a7f87' }}>Has</p>
            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12 }} className="rounded-xl p-2.5 h-full flex flex-col items-center justify-center gap-1">
              {earnedBadges.length > 0 ? (
                <div className="flex flex-wrap gap-1 justify-center">
                  <QualifierBadges badges={earnedBadges} size="small" />
                </div>
              ) : (
                <span className="text-sm" style={{ color: '#8a7f87' }}>None</span>
              )}
            </div>
          </div>
          <div className="text-center flex flex-col">
            <p className="text-xs font-semibold mb-1.5" style={{ color: '#8a7f87' }}>Due</p>
            <div className="rounded-xl p-2.5 h-full flex flex-col items-center justify-center gap-1" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <span className="text-sm font-medium" style={isOverdue ? { color: '#ef4444' } : { color: '#8a7f87' }}>
                {route.due_date ? format(new Date(route.due_date), 'MMM d') : 'No date'}
              </span>
              {route.first_attempt_date && (
                <span className="text-[10px] mt-0.5" style={isOverdue ? { color: '#ef4444' } : { color: '#8a7f87' }}>
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
          <div className="text-center flex flex-col">
            <p className="text-xs font-semibold mb-1.5" style={{ color: '#8a7f87' }}>Needs</p>
            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12 }} className="rounded-xl p-2.5 h-full flex flex-col items-center justify-center gap-1">
              {neededBadges.length > 0 ? (
                <div className="flex flex-wrap gap-1 justify-center">
                  <QualifierBadges badges={neededBadges} size="small" />
                </div>
              ) : null}
              {route.first_attempt_date && pendingCount > 0 ? (
                <span className="inline-flex items-center whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-300">
                  3rd by: {format((() => {
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
      <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {onScheduleRunDate && !isBossView && (
          <div className="mb-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center">
              <button 
                className="flex-1 flex items-center gap-1.5 text-xs font-semibold transition-colors px-2 py-1.5 rounded-lg"
                style={{ color: '#e9c349' }}
                onClick={(e) => { e.stopPropagation(); setShowRunDatePicker(true); }}
              >
                {route.run_date ? (
                  <>
                    📅 Run: {format(parseISO(route.run_date), 'EEE, MMM d')}
                    {route.run_qualifiers && route.run_qualifiers.length > 0 && (
                      <span className="ml-1"><QualifierBadges badges={route.run_qualifiers} size="small" /></span>
                    )}
                    {onScheduleRunDate && (
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); onScheduleRunDate(route.id, null, []); }}
                        className="ml-1 p-0.5 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </>
                ) : '+ Schedule'}
              </button>
              {route.run_date && (
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowScheduleQueue(prev => !prev); }}
                    className="p-1.5 rounded-lg text-yellow-500 hover:text-yellow-300 transition-colors ml-1"
                    title="Schedule queue"
                  >
                    {showScheduleQueue ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {scheduledRuns.length > 0 && !showScheduleQueue && (
                      <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                        {scheduledRuns.length}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>

            {showScheduleQueue && route.run_date && (
              <div className="mt-2 ml-2 border-l-2 border-yellow-600/30 pl-3 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                {scheduledRuns.length === 0 && !showQueueCalendar && (
                  <p className="text-[10px] italic px-1" style={{ color: '#8a7f87' }}>No additional runs queued</p>
                )}

                {(showQueueCalendar || editingQueueIndex !== null) && (
                  <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); closeQueueCalendar(); }} />
                )}

                {scheduledRuns.map((item, idx) => (
                  <div key={idx}>
                    <div
                      className="flex items-center gap-2 py-1 cursor-pointer hover:bg-blue-50 rounded-lg px-1 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingQueueIndex(idx);
                        setEditQueueDate(parseISO(item.date));
                        setEditQueueQualifiers(item.qualifiers || []);
                        setShowQueueCalendar(false);
                      }}
                    >
                      <span className="text-xs font-medium" style={{ color: '#e9c349' }}>
                        📅 {format(parseISO(item.date), 'EEE, MMM d')}
                      </span>
                      {item.qualifiers && item.qualifiers.length > 0 && (
                        <QualifierBadges badges={item.qualifiers} size="small" />
                      )}
                      <Pencil className="w-3 h-3 text-blue-300 ml-auto flex-shrink-0" />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveFromQueue(idx); }}
                        className="p-0.5 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors"
                        disabled={savingQueue}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                {editingQueueIndex !== null && (() => {
                  const qDueDateObj = route.due_date ? parseISO(route.due_date) : null;
                  let qSpreadDueDateObj = null;
                  if (route.first_attempt_date) {
                    const d = parseISO(route.first_attempt_date);
                    qSpreadDueDateObj = new Date(d);
                    qSpreadDueDateObj.setDate(qSpreadDueDateObj.getDate() + (route.minimum_days_spread || 14));
                  } else if (qDueDateObj) {
                    qSpreadDueDateObj = new Date(qDueDateObj);
                    qSpreadDueDateObj.setDate(qSpreadDueDateObj.getDate() - (route.minimum_days_spread || 14));
                  }
                  const qCalMod = {};
                  const qCalModCN = {};
                  if (qDueDateObj) { qCalMod.dueDate = qDueDateObj; qCalModCN.dueDate = calDue; }
                  if (qSpreadDueDateObj) { qCalMod.spreadDate = qSpreadDueDateObj; qCalModCN.spreadDate = calSpread; }
                  return ReactDOM.createPortal(
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={(e) => { e.stopPropagation(); closeQueueCalendar(); }}>
                      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <CalendarPicker
                          mode="single"
                          selected={editQueueDate}
                          onSelect={(date) => setEditQueueDate(date)}
                          disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                          className="w-full mx-auto"
                          modifiers={qCalMod}
                          modifiersClassNames={qCalModCN}
                          classNames={{
                            months: "w-full flex justify-center",
                            month: "w-full",
                            table: "w-full border-collapse",
                            head_row: "flex w-full justify-between",
                            head_cell: "flex-1 text-center text-sm font-medium text-gray-500 py-2",
                            row: "flex w-full justify-between mt-1",
                            cell: "flex-1 flex items-center justify-center p-0",
                            day: "h-10 w-10 rounded-full text-sm font-medium flex items-center justify-center mx-auto hover:bg-gray-100 transition-colors overflow-visible relative",
                            day_selected: "!bg-transparent !text-gray-900 !font-bold !ring-2 !ring-black !ring-offset-1",
                            day_today: "bg-gray-100 font-bold",
                            nav: "flex items-center justify-between px-2 pb-2",
                            nav_button: "h-9 w-9 rounded-full hover:bg-gray-100 flex items-center justify-center",
                            caption: "text-base font-semibold text-center py-2"
                          }}
                        />
                        {(qDueDateObj || qSpreadDueDateObj) && (
                          <div className="flex items-center justify-center gap-6 px-3 pb-1">
                            {qDueDateObj && <div className="flex items-center gap-1.5"><span className="inline-block w-4 h-1 rounded bg-red-500" /><span className="text-xs text-gray-500">D. Date</span></div>}
                            {qSpreadDueDateObj && <div className="flex items-center gap-1.5"><span className="inline-block w-4 h-1 rounded bg-green-500" /><span className="text-xs text-gray-500">Spread D. Date</span></div>}
                          </div>
                        )}
                        <div className="px-3 pb-2 pt-1">
                          <p className="text-[10px] font-semibold text-gray-500 mb-1.5 uppercase">Qualifier</p>
                          <div className="flex gap-2">
                            {['AM', 'PM', 'WEEKEND'].map(q => (
                              <button key={q}
                                onClick={(e) => { e.stopPropagation(); setEditQueueQualifiers(prev => prev.includes(q) ? prev.filter(x => x !== q) : [...prev, q]); }}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                  editQueueQualifiers.includes(q)
                                    ? q === 'AM' ? 'bg-amber-500 text-white border-amber-500'
                                      : q === 'PM' ? 'bg-blue-500 text-white border-blue-500'
                                      : 'bg-purple-500 text-white border-purple-500'
                                    : 'bg-white text-gray-500 border-gray-200'
                                }`}
                              >{q}</button>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2 px-3 pb-3">
                          <button onClick={(e) => { e.stopPropagation(); closeQueueCalendar(); }} className="flex-1 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
                          <button onClick={(e) => { e.stopPropagation(); handleUpdateQueueItem(); }} disabled={!editQueueDate || savingQueue} className="flex-1 py-1.5 text-xs rounded-lg bg-blue-500 text-white font-semibold hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed">{savingQueue ? 'Saving...' : 'Update'}</button>
                        </div>
                      </div>
                    </div>,
                    document.body
                  );
                })()}

                {!showQueueCalendar && (
                  <button
                    onClick={() => { setShowQueueCalendar(true); setEditingQueueIndex(null); setEditQueueDate(null); setEditQueueQualifiers([]); }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 px-2 py-1.5 rounded-lg hover:bg-blue-900/20 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add next run
                  </button>
                )}

                {showQueueCalendar && ReactDOM.createPortal(
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={(e) => { e.stopPropagation(); setShowQueueCalendar(false); setPendingQueueDate(null); setPendingQueueQualifiers([]); }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const qDueDateObj = route.due_date ? parseISO(route.due_date) : null;
                        let qSpreadDueDateObj = null;
                        if (route.first_attempt_date) {
                          const d = parseISO(route.first_attempt_date);
                          qSpreadDueDateObj = new Date(d);
                          qSpreadDueDateObj.setDate(qSpreadDueDateObj.getDate() + (route.minimum_days_spread || 14));
                        } else if (qDueDateObj) {
                          qSpreadDueDateObj = new Date(qDueDateObj);
                          qSpreadDueDateObj.setDate(qSpreadDueDateObj.getDate() - (route.minimum_days_spread || 14));
                        }
                        const qCalendarModifiers = {};
                        const qCalendarModifiersClassNames = {};
                        if (qDueDateObj) { qCalendarModifiers.dueDate = qDueDateObj; qCalendarModifiersClassNames.dueDate = calDue; }
                        if (qSpreadDueDateObj) { qCalendarModifiers.spreadDate = qSpreadDueDateObj; qCalendarModifiersClassNames.spreadDate = calSpread; }
                        return (
                          <>
                            <CalendarPicker
                              mode="single"
                              selected={pendingQueueDate}
                              onSelect={(date) => setPendingQueueDate(date)}
                              disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                              className="w-full mx-auto"
                              modifiers={qCalendarModifiers}
                              modifiersClassNames={qCalendarModifiersClassNames}
                              classNames={{
                                months: "w-full flex justify-center",
                                month: "w-full",
                                table: "w-full border-collapse",
                                head_row: "flex w-full justify-between",
                                head_cell: "flex-1 text-center text-sm font-medium text-gray-500 py-2",
                                row: "flex w-full justify-between mt-1",
                                cell: "flex-1 flex items-center justify-center p-0",
                                day: "h-10 w-10 rounded-full text-sm font-medium flex items-center justify-center mx-auto hover:bg-gray-100 transition-colors overflow-visible relative",
                                day_selected: "!bg-transparent !text-gray-900 !font-bold !ring-2 !ring-black !ring-offset-1",
                                day_today: "bg-gray-100 font-bold",
                                nav: "flex items-center justify-between px-2 pb-2",
                                nav_button: "h-9 w-9 rounded-full hover:bg-gray-100 flex items-center justify-center",
                                caption: "text-base font-semibold text-center py-2"
                              }}
                            />
                            {(qDueDateObj || qSpreadDueDateObj) && (
                              <div className="flex items-center justify-center gap-6 px-3 pb-2 pt-1">
                                {qDueDateObj && <div className="flex items-center gap-1.5"><span className="inline-block w-4 h-1 rounded bg-red-500"></span><span className="text-xs text-gray-500">D. Date</span></div>}
                                {qSpreadDueDateObj && <div className="flex items-center gap-1.5"><span className="inline-block w-4 h-1 rounded bg-green-500"></span><span className="text-xs text-gray-500">Spread D. Date</span></div>}
                              </div>
                            )}
                          </>
                        );
                      })()}
                      <div className="px-3 pb-2">
                        <p className="text-[10px] font-semibold text-gray-500 mb-1.5 uppercase">Qualifier</p>
                        <div className="flex gap-2">
                          {['AM', 'PM', 'WEEKEND'].map(q => (
                            <button key={q} onClick={() => togglePendingQualifier(q)}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                pendingQueueQualifiers.includes(q)
                                  ? q === 'AM' ? 'bg-amber-500 text-white border-amber-500'
                                    : q === 'PM' ? 'bg-blue-500 text-white border-blue-500'
                                    : 'bg-purple-500 text-white border-purple-500'
                                  : 'bg-white text-gray-500 border-gray-200'
                              }`}
                            >{q}</button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 px-3 pb-3">
                        <button onClick={() => { setShowQueueCalendar(false); setPendingQueueDate(null); setPendingQueueQualifiers([]); }} className="flex-1 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
                        <button onClick={handleAddToQueue} disabled={!pendingQueueDate || savingQueue} className="flex-1 py-1.5 text-xs rounded-lg bg-blue-500 text-white font-semibold hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed">{savingQueue ? 'Saving...' : 'Add to Queue'}</button>
                      </div>
                    </div>
                  </div>,
                  document.body
                )}
              </div>
            )}
          </div>
        )}

        {/* Full-screen run date picker */}
        {showRunDatePicker && (() => {
          const dueDateObj = route.due_date ? new Date(route.due_date) : null;
          let spreadDueDateObj = null;
          if (route.first_attempt_date) {
            spreadDueDateObj = new Date(route.first_attempt_date);
            spreadDueDateObj.setDate(spreadDueDateObj.getDate() + (route.minimum_days_spread || 14));
          } else if (dueDateObj) {
            spreadDueDateObj = new Date(dueDateObj);
            spreadDueDateObj.setDate(spreadDueDateObj.getDate() - (route.minimum_days_spread || 14));
          }
          const calendarModifiers = {};
          const calendarModifiersClassNames = {};
          if (dueDateObj) { calendarModifiers.dueDate = dueDateObj; calendarModifiersClassNames.dueDate = calDue; }
          if (spreadDueDateObj) { calendarModifiers.spreadDate = spreadDueDateObj; calendarModifiersClassNames.spreadDate = calSpread; }
          const originalDate = route.run_date ? parseISO(route.run_date) : undefined;
          const originalQualifiers = route.run_qualifiers || [];
          const dateChanged = pendingDate?.toDateString() !== originalDate?.toDateString();
          const qualifiersChanged = JSON.stringify([...pendingQualifiers].sort()) !== JSON.stringify([...originalQualifiers].sort());
          // Also treat clearing the date as a valid change (delete-all case)
          const dateClear = !pendingDate && !!originalDate;
          const hasChanges = dateChanged || qualifiersChanged || dateClear;
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
              onClick={(e) => { e.stopPropagation(); setShowRunDatePicker(false); setPendingDate(originalDate); setPendingQualifiers(originalQualifiers); }}
            >
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="p-4">
                  <CalendarPicker
                    mode="single"
                    selected={pendingDate}
                    onSelect={(date) => setPendingDate(date)}
                    modifiers={calendarModifiers}
                    modifiersClassNames={calendarModifiersClassNames}
                    className="w-full mx-auto"
                    classNames={{
                      months: "w-full flex justify-center",
                      month: "w-full",
                      table: "w-full border-collapse",
                      head_row: "flex w-full justify-between",
                      head_cell: "flex-1 text-center text-sm font-medium text-gray-500 py-2",
                      row: "flex w-full justify-between mt-1",
                      cell: "flex-1 flex items-center justify-center p-0",
                      day: "h-11 w-11 rounded-full text-sm font-medium flex items-center justify-center mx-auto hover:bg-gray-100 transition-colors",
                      day_selected: "!bg-transparent !text-gray-900 !font-bold !ring-2 !ring-black !ring-offset-1",
                      day_today: "bg-gray-100 font-bold",
                      nav: "flex items-center justify-between px-2 pb-2",
                      nav_button: "h-9 w-9 rounded-full hover:bg-gray-100 flex items-center justify-center",
                      caption: "text-base font-semibold text-center py-2"
                    }}
                  />
                  <div className="flex items-center justify-center gap-6 mt-2 pb-1">
                    {dueDateObj && <div className="flex items-center gap-1.5"><span className="inline-block w-4 h-1 rounded bg-red-500"></span><span className="text-xs text-gray-500">D. Date</span></div>}
                    {spreadDueDateObj && <div className="flex items-center gap-1.5"><span className="inline-block w-4 h-1 rounded bg-green-500"></span><span className="text-xs text-gray-500">Spread D. Date</span></div>}
                  </div>
                </div>
                <div className="px-4 py-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-2">QUALIFIER FOR THIS RUN</p>
                  <div className="flex gap-2">
                    {['AM', 'PM', 'WEEKEND'].map(q => (
                      <button key={q} onClick={() => toggleQualifier(q)}
                        className={`px-4 py-2 rounded-full text-sm font-bold border transition-all ${
                          pendingQualifiers.includes(q)
                            ? q === 'AM' ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : q === 'PM' ? 'bg-blue-100 text-blue-800 border-blue-300'
                              : 'bg-purple-100 text-purple-800 border-purple-300'
                            : 'bg-gray-100 text-gray-400 border-gray-200'
                        }`}
                      >{q}</button>
                    ))}
                  </div>
                </div>
                <div className="px-4 pb-4 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setPendingDate(originalDate); setPendingQualifiers(originalQualifiers); setShowRunDatePicker(false); }}>Cancel</Button>
                  <Button size="sm" disabled={!hasChanges}
                    className={`flex-1 font-semibold transition-all ${hasChanges ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                    onClick={() => { onScheduleRunDate(route.id, pendingDate || null, pendingQualifiers); setShowRunDatePicker(false); }}
                  >Save</Button>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="flex items-center">
          <div className="mr-2">
            <RouteCardMenu 
              route={route} 
              onEdit={onEdit} 
              onArchive={onArchive} 
              onDelete={onDelete}
              onScheduleRunDate={handleScheduleRunDate}
            />
          </div>
          <button 
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-colors"
            style={{ border: '1px solid #363436' }}
            onClick={(e) => {
              e.stopPropagation();
              if (isBossView) {
                navigate(createPageUrl(`BossRouteDetail?id=${route.id}`));
              } else {
                navigate(createPageUrl(`WorkerRouteDetail?id=${route.id}`));
              }
            }}
          >
            <Eye className="w-5 h-5" style={{ color: '#e9c349' }} />
            <span style={{ color: '#e9c349' }} className="font-semibold">View</span>
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
