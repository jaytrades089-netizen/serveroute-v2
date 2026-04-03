import React from 'react';
import { Sun, Moon, Calendar, AlertTriangle } from 'lucide-react';

const qualifierPhases = [
  { id: 'am', label: 'AM', icon: Sun, time: '8am–12pm' },
  { id: 'pm', label: 'PM', icon: Moon, time: '5pm–9pm' },
  { id: 'weekend', label: 'Wknd', icon: Calendar, time: 'Sat/Sun' },
];

export default function WorkPhaseBlocks({ currentPhase }) {
  const isNtcActive = currentPhase === 'ntc';

  return (
    <div className="mb-6" style={{ position: 'relative' }}>
      {/* AM / PM / Weekend row */}
      <div className="grid grid-cols-3 gap-2">
        {qualifierPhases.map((phase) => {
          const Icon = phase.icon;
          const isActive = currentPhase === phase.id;
          return (
            <div
              key={phase.id}
              className="frosted-glass rounded-xl p-3 text-center transition-all"
              style={isActive ? { borderBottom: '2px solid #e9c349' } : {}}
            >
              <Icon
                className="w-5 h-5 mx-auto mb-1"
                style={{ color: isActive ? '#E6E1E4' : '#6B7280' }}
              />
              <div
                className="font-bold text-sm"
                style={{ color: isActive ? '#E6E1E4' : '#9CA3AF' }}
              >
                {phase.label}
              </div>
              <div
                className="text-xs"
                style={{ color: isActive ? '#E6E1E4' : '#4B5563' }}
              >
                {phase.time}
              </div>
            </div>
          );
        })}
      </div>

      {/* NTC overlay bar — only shown when currentPhase === 'ntc' */}
      {isNtcActive && (
        <div
          className="frosted-glass rounded-xl px-3 py-2 flex items-center justify-center gap-2"
          style={{
            position: 'absolute',
            bottom: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '60%',
            background: 'rgba(229,179,58,0.15)',
            border: '1px solid rgba(229,179,58,0.35)',
          }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#e9c349' }} />
          <span className="font-bold text-sm" style={{ color: '#e9c349' }}>NTC</span>
          <span className="text-xs" style={{ color: '#e9c349' }}>— No Time Covered</span>
        </div>
      )}
    </div>
  );
}