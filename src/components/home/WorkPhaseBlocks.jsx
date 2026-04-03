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

      {/* AM / PM / WKND blocks */}
      <div className="grid grid-cols-3 gap-2">
        {qualifierPhases.map((phase) => {
          const Icon = phase.icon;
          const isActive = currentPhase === phase.id;
          return (
            <div
              key={phase.id}
              className="frosted-glass rounded-xl py-5 px-3 text-center transition-all"
              style={isActive ? { borderBottom: '2px solid #e9c349' } : {}}
            >
              <Icon
                className="w-5 h-5 mx-auto mb-2"
                style={{ color: isActive ? '#E6E1E4' : '#6B7280' }}
              />
              <div
                className="font-semibold text-sm"
                style={{ color: isActive ? '#E6E1E4' : '#9CA3AF' }}
              >
                {phase.label}
              </div>
              <div
                className="text-xs mt-0.5"
                style={{ color: isActive ? '#9CA3AF' : '#4B5563' }}
              >
                {phase.time}
              </div>
            </div>
          );
        })}
      </div>

      {/* NTC band — full width horizontal stripe through vertical center */}
      {isNtcActive && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            left: 0,
            right: 0,
            zIndex: 10,
            background: 'rgba(233, 195, 73, 0.18)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            borderTop: '1px solid rgba(233,195,73,0.45)',
            borderBottom: '1px solid rgba(233,195,73,0.45)',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            pointerEvents: 'none'
          }}
        >
          <AlertTriangle
            style={{ width: '15px', height: '15px', color: '#e9c349', flexShrink: 0 }}
          />
          <span style={{ fontWeight: 700, fontSize: '13px', color: '#e9c349', whiteSpace: 'nowrap' }}>
            NTC
          </span>
          <span style={{ fontSize: '11px', color: '#c9a030', whiteSpace: 'nowrap' }}>
            — No Time Covered
          </span>
        </div>
      )}

    </div>
  );
}