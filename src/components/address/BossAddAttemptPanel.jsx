import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const OUTCOME_OPTIONS = [
  { value: 'no_answer', label: 'No Answer', color: 'bg-gray-100 hover:bg-gray-200 text-gray-700' },
  { value: 'left_with_cohabitant', label: 'Left w/ Cohabitant', color: 'bg-blue-100 hover:bg-blue-200 text-blue-700' },
  { value: 'posted', label: 'Posted', color: 'bg-purple-100 hover:bg-purple-200 text-purple-700' },
  { value: 'refused', label: 'Refused', color: 'bg-red-100 hover:bg-red-200 text-red-700' },
  { value: 'door_tag', label: 'Door Tag', color: 'bg-yellow-100 hover:bg-yellow-200 text-yellow-700' },
  { value: 'other', label: 'Other', color: 'bg-orange-100 hover:bg-orange-200 text-orange-700' }
];

export default function BossAddAttemptPanel({ onClose, onCreate }) {
  const [time, setTime] = useState(new Date().toISOString().slice(0, 16));
  const [outcome, setOutcome] = useState(null);
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!outcome || !time) return;
    setCreating(true);
    try {
      await onCreate({ time, outcome, notes });
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="px-4 pb-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-amber-800 mb-3">Add Attempt</h4>
        
        <div className="mb-3">
          <label className="text-xs font-semibold text-gray-600 block mb-1">DATE & TIME</label>
          <input
            type="datetime-local"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        <div className="mb-3">
          <label className="text-xs font-semibold text-gray-600 block mb-1">OUTCOME</label>
          <div className="grid grid-cols-3 gap-2">
            {OUTCOME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={(e) => { e.stopPropagation(); setOutcome(opt.value); }}
                className={`p-2 rounded-lg text-xs font-semibold transition-all ${
                  outcome === opt.value 
                    ? 'ring-2 ring-amber-500 ' + opt.color
                    : opt.color + ' opacity-60'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <label className="text-xs font-semibold text-gray-600 block mb-1">NOTES</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
            rows={2}
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={(e) => { e.stopPropagation(); handleCreate(); }}
            disabled={!outcome || !time || creating}
            className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Save Attempt
          </Button>
        </div>
      </div>
    </div>
  );
}