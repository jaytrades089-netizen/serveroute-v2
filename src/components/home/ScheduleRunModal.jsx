import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { X, Plus, Trash2, CalendarDays, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

const QUALIFIERS = [
  { key: 'am', label: 'AM' },
  { key: 'pm', label: 'PM' },
  { key: 'weekend', label: 'WKND' },
];

function RunRow({ run, index, onChange, onRemove }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <input
        type="date"
        value={run.date}
        onChange={e => onChange(index, { ...run, date: e.target.value })}
        className="flex-1 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none"
        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#e6e1e4' }}
      />
      <div className="flex gap-1">
        {QUALIFIERS.map(q => {
          const active = run.qualifiers?.includes(q.key);
          return (
            <button
              key={q.key}
              onClick={() => {
                const qs = run.qualifiers || [];
                const next = active ? qs.filter(x => x !== q.key) : [...qs, q.key];
                onChange(index, { ...run, qualifiers: next });
              }}
              className="text-[10px] font-bold rounded px-2 py-1 uppercase transition-colors"
              style={active
                ? { background: 'rgba(233,195,73,0.25)', color: '#e9c349', border: '1px solid rgba(233,195,73,0.5)' }
                : { background: 'rgba(255,255,255,0.05)', color: '#4B5563', border: '1px solid rgba(255,255,255,0.10)' }
              }
            >
              {q.label}
            </button>
          );
        })}
      </div>
      <button onClick={() => onRemove(index)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" style={{ color: '#6B7280' }}>
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function ScheduleRunModal({ route, onClose, onSaved }) {
  const requiredAttempts = route.required_attempts || 3;

  // Compute due date and spread date
  const dueDate = route.due_date ? new Date(route.due_date + 'T12:00:00') : null;
  const spreadDate = (() => {
    if (route.spread_due_date) return new Date(route.spread_due_date);
    if (route.first_attempt_date) {
      const spreadDays = route.minimum_days_spread || (route.spread_type === '10' ? 10 : 14);
      const d = new Date(route.first_attempt_date);
      d.setDate(d.getDate() + spreadDays);
      return d;
    }
    return null;
  })();

  const initRuns = () => {
    if (route.scheduled_runs?.length > 0) return route.scheduled_runs.map(r => ({ ...r }));
    if (route.run_date) return [{ date: route.run_date, qualifiers: route.run_qualifiers || [] }];
    return Array.from({ length: requiredAttempts }, () => ({ date: '', qualifiers: [] }));
  };

  const [runs, setRuns] = useState(initRuns);
  const [saving, setSaving] = useState(false);

  const handleChange = (i, updated) => setRuns(prev => prev.map((r, idx) => idx === i ? updated : r));
  const handleRemove = (i) => setRuns(prev => prev.filter((_, idx) => idx !== i));
  const handleAdd = () => setRuns(prev => [...prev, { date: '', qualifiers: [] }]);

  const handleSave = async () => {
    const validRuns = runs.filter(r => r.date).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (validRuns.length === 0) {
      toast.error('Add at least one run date');
      return;
    }
    setSaving(true);
    try {
      const first = validRuns[0];
      await base44.entities.Route.update(route.id, {
        run_date: first.date,
        run_qualifiers: first.qualifiers || [],
        scheduled_runs: validRuns,
        status: route.status,
      });
      toast.success('Runs scheduled!');
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Calendar: highlight selected run dates
  const selectedDates = runs.filter(r => r.date).map(r => new Date(r.date + 'T12:00:00'));

  const modifiers = {};
  if (dueDate) modifiers.dueDate = [dueDate];
  if (spreadDate) modifiers.spreadDate = [spreadDate];

  const modifiersStyles = {
    dueDate: { color: '#ef4444', textDecoration: 'underline', fontWeight: 700 },
    spreadDate: { color: '#22c55e', textDecoration: 'underline', fontWeight: 700 },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.65)' }} />
      <div
        className="relative w-full max-w-sm rounded-2xl p-5"
        style={{ background: '#0F1A2E', border: '1px solid rgba(255,255,255,0.12)', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5" style={{ color: '#e9c349' }} />
            <div>
              <h2 className="font-bold text-base" style={{ color: '#e6e1e4' }}>Schedule Runs</h2>
              <p className="text-xs" style={{ color: '#6B7280' }}>{route.folder_name} · {requiredAttempts} attempts required</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" style={{ color: '#6B7280' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Calendar legend */}
        {(dueDate || spreadDate) && (
          <div className="flex gap-4 mb-1 text-xs font-semibold px-1">
            {dueDate && <span style={{ color: '#ef4444' }}>● Due: <span style={{ textDecoration: 'underline' }}>{format(dueDate, 'EEE M/d')}</span></span>}
            {spreadDate && <span style={{ color: '#22c55e' }}>● Spread: <span style={{ textDecoration: 'underline' }}>{format(spreadDate, 'EEE M/d')}</span></span>}
          </div>
        )}

        {/* Mini calendar — for reference only, showing due/spread markers */}
        <div className="flex justify-center mb-3 rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <DayPicker
            mode="multiple"
            selected={selectedDates}
            modifiers={modifiers}
            modifiersStyles={modifiersStyles}
            styles={{
              root: { margin: 0, color: '#e6e1e4' },
              caption: { color: '#e6e1e4' },
              head_cell: { color: '#6B7280', fontSize: 11 },
              day: { color: '#e6e1e4', borderRadius: 8 },
            }}
            onDayClick={() => {}}
          />
        </div>

        {/* Run rows legend */}
        <div className="flex gap-2 mb-2 text-[10px] font-semibold uppercase" style={{ color: '#6B7280' }}>
          <span className="flex-1">Date</span>
          <span>Qualifiers</span>
          <span className="w-8" />
        </div>

        {runs.map((run, i) => (
          <RunRow key={i} run={run} index={i} onChange={handleChange} onRemove={handleRemove} />
        ))}

        <button
          onClick={handleAdd}
          className="flex items-center gap-2 text-sm font-semibold mt-2 mb-4 px-3 py-2 rounded-lg w-full transition-colors hover:bg-white/10"
          style={{ color: '#e9c349', border: '1px dashed rgba(233,195,73,0.35)' }}
        >
          <Plus className="w-4 h-4" /> Add Run
        </button>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full font-bold"
          style={{ background: '#e9c349', color: '#0F0B10' }}
        >
          {saving ? 'Saving…' : <><Check className="w-4 h-4 mr-1" /> Save Schedule</>}
        </Button>
      </div>
    </div>
  );
}