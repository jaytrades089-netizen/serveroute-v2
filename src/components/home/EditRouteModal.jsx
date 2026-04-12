import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Check, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

export default function EditRouteModal({ route, onClose }) {
  const queryClient = useQueryClient();
  const [folderName, setFolderName] = useState(route.folder_name || '');
  const [dueDate, setDueDate] = useState(route.due_date || '');
  const [spreadType, setSpreadType] = useState(route.spread_type || route.minimum_days_spread?.toString() || '14');
  const [requiredAttempts, setRequiredAttempts] = useState(route.required_attempts ?? 3);
  const [amRequired, setAmRequired] = useState(route.am_required !== false);
  const [pmRequired, setPmRequired] = useState(route.pm_required !== false);
  const [weekendRequired, setWeekendRequired] = useState(route.weekend_required !== false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!folderName.trim()) { toast.error('Route name is required'); return; }
    setSaving(true);
    try {
      const updates = {
        folder_name: folderName.trim(),
        due_date: dueDate || null,
        spread_type: spreadType,
        minimum_days_spread: parseInt(spreadType),
        required_attempts: requiredAttempts,
        am_required: amRequired,
        pm_required: pmRequired,
        weekend_required: weekendRequired,
      };
      // Recalculate first_attempt_deadline if due_date set
      if (dueDate) {
        const due = new Date(dueDate + 'T12:00:00');
        due.setDate(due.getDate() - parseInt(spreadType));
        updates.first_attempt_deadline = due.toISOString().split('T')[0];
      }
      await base44.entities.Route.update(route.id, updates);
      // Use refetchQueries so RouteCard re-renders immediately with the new due date
      queryClient.refetchQueries({ queryKey: ['workerRoutes'] });
      queryClient.refetchQueries({ queryKey: ['route', route.id] });
      toast.success('Route updated');
      onClose();
    } catch (e) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const field = (label, children) => (
    <div className="mb-4">
      <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#6B7280' }}>{label}</label>
      {children}
    </div>
  );

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 8, padding: '8px 12px', color: '#e6e1e4', fontSize: 14, outline: 'none'
  };

  const toggleBtn = (active, onClick, label) => (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-bold rounded px-3 py-1.5 uppercase transition-colors"
      style={active
        ? { background: 'rgba(233,195,73,0.25)', color: '#e9c349', border: '1px solid rgba(233,195,73,0.5)' }
        : { background: 'rgba(255,255,255,0.05)', color: '#4B5563', border: '1px solid rgba(255,255,255,0.10)' }
      }
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.65)' }} />
      <div
        className="relative w-full max-w-md rounded-2xl p-5"
        style={{ background: '#0F1A2E', border: '1px solid rgba(255,255,255,0.12)', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4" style={{ color: '#e9c349' }} />
            <h2 className="font-bold text-base" style={{ color: '#e6e1e4' }}>Edit Route</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" style={{ color: '#6B7280' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {field('Route Name',
          <input
            style={inputStyle}
            value={folderName}
            onChange={e => setFolderName(e.target.value)}
            placeholder="e.g. Route A"
          />
        )}

        {field('Due Date',
          <input
            type="date"
            style={inputStyle}
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
          />
        )}

        {field('Spread (days)',
          <div className="flex gap-2">
            {['10', '14'].map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setSpreadType(v)}
                className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors"
                style={spreadType === v
                  ? { background: 'rgba(233,195,73,0.25)', color: '#e9c349', border: '1px solid rgba(233,195,73,0.5)' }
                  : { background: 'rgba(255,255,255,0.05)', color: '#4B5563', border: '1px solid rgba(255,255,255,0.10)' }
                }
              >
                {v} days
              </button>
            ))}
          </div>
        )}

        {field('Required Attempts',
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setRequiredAttempts(n)}
                className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors"
                style={requiredAttempts === n
                  ? { background: 'rgba(233,195,73,0.25)', color: '#e9c349', border: '1px solid rgba(233,195,73,0.5)' }
                  : { background: 'rgba(255,255,255,0.05)', color: '#4B5563', border: '1px solid rgba(255,255,255,0.10)' }
                }
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {field('Required Qualifiers',
          <div className="flex gap-2">
            {toggleBtn(amRequired, () => setAmRequired(v => !v), 'AM')}
            {toggleBtn(pmRequired, () => setPmRequired(v => !v), 'PM')}
            {toggleBtn(weekendRequired, () => setWeekendRequired(v => !v), 'WKND')}
          </div>
        )}

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full font-bold mt-2"
          style={{ background: '#e9c349', color: '#0F0B10' }}
        >
          {saving ? 'Saving…' : <><Check className="w-4 h-4 mr-1" /> Save Changes</>}
        </Button>
      </div>
    </div>
  );
}
