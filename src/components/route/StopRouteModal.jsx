import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { X, Clock, MapPin, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';

const QUALIFIER_OPTIONS = [
  { id: 'AM', label: 'AM', colors: 'bg-white text-amber-700 border-amber-300', activeColors: 'bg-amber-500 text-white border-amber-500' },
  { id: 'PM', label: 'PM', colors: 'bg-white text-blue-700 border-blue-300', activeColors: 'bg-blue-500 text-white border-blue-500' },
  { id: 'WEEKEND', label: 'WEEKEND', colors: 'bg-white text-purple-700 border-purple-300', activeColors: 'bg-purple-500 text-white border-purple-500' },
];

export default function StopRouteModal({ route, addresses, onClose, attempts = [] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const allScheduledRuns = Array.isArray(route.scheduled_runs) ? route.scheduled_runs : [];

  // Filter out any queue entries that are today or in the past — only future dates are valid next runs
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const scheduledRuns = allScheduledRuns.filter(r => {
    if (!r?.date) return false;
    const d = parseISO(r.date);
    d.setHours(0, 0, 0, 0);
    return d > today;
  });

  const hasQueuedRun = scheduledRuns.length > 0;
  const nextQueued = hasQueuedRun ? scheduledRuns[0] : null;

  const [nextRunDate, setNextRunDate] = useState(
    nextQueued?.date ? parseISO(nextQueued.date) : null
  );
  const [selectedQualifiers, setSelectedQualifiers] = useState(
    nextQueued?.qualifiers || []
  );
  const [autoFilledFromQueue, setAutoFilledFromQueue] = useState(hasQueuedRun);

  const pendingAddresses = addresses.filter(a => !a.served);
  const servedAddresses = addresses.filter(a => a.served);

  const startedAt = route.started_at ? new Date(route.started_at) : null;
  const now = new Date();
  const elapsedMs = startedAt ? now - startedAt : 0;
  const elapsedHours = Math.floor(elapsedMs / 3600000);
  const elapsedMinutes = Math.floor((elapsedMs % 3600000) / 60000);
  const durationStr = elapsedHours > 0 ? `${elapsedHours}h ${elapsedMinutes}m` : `${elapsedMinutes}m`;

  const startTimeStr = startedAt
    ? startedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : '—';

  const toggleQualifier = (id) => {
    setSelectedQualifiers(prev =>
      prev.includes(id) ? prev.filter(q => q !== id) : [...prev, id]
    );
  };

  const handleConfirmStop = async () => {
    setSaving(true);
    try {
      // Remove the consumed next-run entry from the queue (use allScheduledRuns to preserve past entries slice correctly)
      const updatedQueue = autoFilledFromQueue ? allScheduledRuns.filter(r => {
        if (!r?.date) return true;
        const d = parseISO(r.date);
        d.setHours(0, 0, 0, 0);
        return d > today;
      }).slice(1) : allScheduledRuns;

      await base44.entities.Route.update(route.id, {
        run_date: nextRunDate ? format(nextRunDate, 'yyyy-MM-dd') : null,
        run_qualifiers: selectedQualifiers,
        scheduled_runs: updatedQueue,
        status: 'ready',
        started_at: null
      });

      // Use refetchQueries so the card updates immediately with the new run_date
      queryClient.refetchQueries({ queryKey: ['route', route.id] });
      queryClient.refetchQueries({ queryKey: ['workerRoutes'] });
      toast.success('Route stopped');
      navigate(createPageUrl('WorkerRoutes'));
    } catch (error) {
      console.error('Failed to stop route:', error);
      toast.error('Failed to stop route — try again');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-gray-900/60 flex items-center justify-center p-3">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[95vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-lg font-bold text-gray-900">Stop Route</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-4 pb-4 space-y-3">
          {/* CARD 1: Run Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <h3 className="text-xs font-bold text-blue-700 mb-2 uppercase tracking-wide">Run Summary</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500 text-xs">Started</span>
                <p className="font-semibold text-gray-900">{startTimeStr}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Duration</span>
                <p className="font-semibold text-gray-900">{durationStr}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Completed</span>
                <p className="font-semibold text-green-600">{servedAddresses.length} of {addresses.length}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Remaining</span>
                <p className="font-semibold text-orange-600">{pendingAddresses.length} addresses</p>
              </div>
            </div>
          </div>

          {/* CARD 2: Next Run Estimate */}
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
            <h3 className="text-xs font-bold text-purple-700 mb-2 uppercase tracking-wide">Next Run Estimate</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500 text-xs">Addresses</span>
                <p className="font-semibold text-gray-900">{pendingAddresses.length} stops</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Est. Miles</span>
                <p className="font-semibold text-gray-900">
                  {route.total_miles ? `${route.total_miles.toFixed(1)} mi` : '—'}
                </p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Est. Drive Time</span>
                <p className="font-semibold text-gray-900">
                  {route.total_drive_time_minutes ? `${route.total_drive_time_minutes} min` : '—'}
                </p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Route</span>
                <p className="font-semibold text-gray-900 text-xs truncate">
                  {route.starting_point?.address && route.ending_point?.address
                    ? `${route.starting_point.address.split(',')[0]} → ${route.ending_point.address.split(',')[0]}`
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* CARD 3: Schedule Next Run */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <h3 className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Schedule Next Run</h3>
            {autoFilledFromQueue && (
              <div className="flex items-center gap-1.5 mb-2 px-2 py-1 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-[10px] text-blue-600 font-medium">✓ Auto-filled from your scheduled queue</span>
                <button
                  onClick={() => { setNextRunDate(null); setSelectedQualifiers([]); setAutoFilledFromQueue(false); }}
                  className="ml-auto text-[10px] text-blue-400 hover:text-blue-600 underline"
                >
                  Clear
                </button>
              </div>
            )}
            
            {/* Date Picker Button */}
            <button
              onClick={() => setShowCalendar(!showCalendar)}
              className="w-full flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:bg-gray-50 mb-2"
            >
              <CalendarIcon className="w-4 h-4 text-gray-400" />
              {nextRunDate ? format(nextRunDate, 'EEE, MMM d') : 'Pick a date (optional)'}
              {nextRunDate && (
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); setNextRunDate(null); setShowCalendar(false); }}
                  className="ml-auto p-0.5 rounded-full hover:bg-gray-200"
                >
                  <X className="w-3 h-3 text-gray-400" />
                </span>
              )}
            </button>

            {/* Transparent overlay — tapping outside the calendar closes just the calendar */}
            {showCalendar && (
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowCalendar(false)}
              />
            )}

            {showCalendar && (() => {
              const dueDateObj = route.due_date ? new Date(route.due_date) : null;
              let spreadDueDateObj = null;
              if (route.first_attempt_date) {
                spreadDueDateObj = new Date(route.first_attempt_date);
                spreadDueDateObj.setDate(spreadDueDateObj.getDate() + (route.minimum_days_spread || 14));
              }
              const calendarModifiers = {};
              const calendarModifiersClassNames = {};
              if (dueDateObj) {
                calendarModifiers.dueDate = dueDateObj;
                calendarModifiersClassNames.dueDate = 'stop-cal-due-date';
              }
              if (spreadDueDateObj) {
                calendarModifiers.spreadDate = spreadDueDateObj;
                calendarModifiersClassNames.spreadDate = 'stop-cal-spread-date';
              }
              return (
                <div className="relative z-20 mb-2 bg-white border border-gray-200 rounded-lg shadow-md">
                  <style>{`
                    .stop-cal-due-date { position: relative; }
                    .stop-cal-due-date::after { content: ''; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); width: 18px; height: 3px; border-radius: 2px; background-color: #ef4444; }
                    .stop-cal-spread-date { position: relative; }
                    .stop-cal-spread-date::after { content: ''; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); width: 18px; height: 3px; border-radius: 2px; background-color: #22c55e; }
                  `}</style>
                  <Calendar
                    mode="single"
                    selected={nextRunDate}
                    onSelect={(date) => { setNextRunDate(date); setShowCalendar(false); }}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    modifiers={calendarModifiers}
                    modifiersClassNames={calendarModifiersClassNames}
                  />
                  {(dueDateObj || spreadDueDateObj) && (
                    <div className="flex items-center justify-center gap-6 px-3 pb-3">
                      {dueDateObj && (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-4 h-1 rounded bg-red-500"></span>
                          <span className="text-xs text-gray-500">D. Date</span>
                        </div>
                      )}
                      {spreadDueDateObj && (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-4 h-1 rounded bg-green-500"></span>
                          <span className="text-xs text-gray-500">Spread D. Date</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Qualifier Toggles */}
            <div className="flex gap-2">
              {QUALIFIER_OPTIONS.map(q => {
                const isActive = selectedQualifiers.includes(q.id);
                return (
                  <button
                    key={q.id}
                    onClick={() => toggleQualifier(q.id)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                      isActive ? q.activeColors : q.colors
                    }`}
                  >
                    {q.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom Buttons */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmStop}
              disabled={saving}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Clock className="w-4 h-4 mr-2" />
              )}
              Confirm & Stop
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
