import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const QUALIFIER_OPTIONS = [
  { value: 'AM', label: 'AM', desc: 'Before noon', bg: 'bg-sky-100 text-sky-700 border-sky-300' },
  { value: 'PM', label: 'PM', desc: '5 PM - 9 PM', bg: 'bg-indigo-100 text-indigo-700 border-indigo-300' },
  { value: 'WEEKEND', label: 'WKND', desc: 'Sat or Sun', bg: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'ANYTIME', label: 'ANY', desc: 'Any time', bg: 'bg-gray-100 text-gray-700 border-gray-300' },
];

export default function BossRequestAttemptPanel({ onClose, onCreateRequest }) {
  const [qualifiers, setQualifiers] = useState([]);
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (qualifiers.length === 0) return;
    setCreating(true);
    try {
      await onCreateRequest({ qualifiers, note });
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="px-4 pb-4">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-red-800 mb-3">Request New Attempt</h4>
        <p className="text-xs text-red-600 mb-3">
          Worker will see this request highlighted on their route
        </p>
        
        <div className="mb-3">
          <label className="text-xs font-semibold text-gray-600 block mb-2">
            REQUIRED TIME FRAME (tap all that apply)
          </label>
          <div className="grid grid-cols-4 gap-2">
            {QUALIFIER_OPTIONS.map(q => {
              const isSelected = qualifiers.includes(q.value);
              const isAnytime = q.value === 'ANYTIME';
              
              return (
                <button
                  key={q.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isAnytime) {
                      setQualifiers(['ANYTIME']);
                    } else {
                      setQualifiers(prev => {
                        const filtered = prev.filter(v => v !== 'ANYTIME');
                        return filtered.includes(q.value)
                          ? filtered.filter(v => v !== q.value)
                          : [...filtered, q.value];
                      });
                    }
                  }}
                  className={`p-3 rounded-xl text-center border-2 transition-all ${
                    isSelected 
                      ? `${q.bg} border-current ring-2 ring-offset-1` 
                      : 'bg-gray-50 text-gray-400 border-gray-200'
                  }`}
                >
                  <span className="block text-sm font-bold">{q.label}</span>
                  <span className="block text-[10px] mt-0.5">{q.desc}</span>
                </button>
              );
            })}
          </div>
          
          <div className="flex gap-2 mt-2">
            <button
              onClick={(e) => { e.stopPropagation(); setQualifiers(['WEEKEND', 'PM']); }}
              className="text-[10px] px-2 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
            >
              WKND + PM
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setQualifiers(['WEEKEND', 'AM']); }}
              className="text-[10px] px-2 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
            >
              WKND + AM
            </button>
          </div>
        </div>

        <div className="mb-3">
          <label className="text-xs font-semibold text-gray-600 block mb-1">NOTE TO WORKER</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Law office requires another attempt because..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
            rows={2}
            maxLength={500}
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
            disabled={qualifiers.length === 0 || creating}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Send Request
          </Button>
        </div>
      </div>
    </div>
  );
}