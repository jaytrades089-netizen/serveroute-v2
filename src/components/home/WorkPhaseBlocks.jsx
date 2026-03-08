import React from 'react';
import { Sun, Moon, Calendar, Clock } from 'lucide-react';

const qualifierPhases = [
  { id: 'am', label: 'AM', icon: Sun, time: '8am–12pm' },
  { id: 'pm', label: 'PM', icon: Moon, time: '5pm–9pm' },
  { id: 'weekend', label: 'Wknd', icon: Calendar, time: 'Sat/Sun' },
];

const ntcPhase = { id: 'ntc', label: 'NTC', icon: Clock, time: 'No Time Covered' };

export default function WorkPhaseBlocks({ currentPhase }) {
  const isNtcActive = currentPhase === 'ntc';

  return (
    <div className="mb-6">
      {/* AM / PM / Weekend row */}
      <div className="grid grid-cols-3 gap-2">
        {qualifierPhases.map((phase) => {
          const Icon = phase.icon;
          const isActive = currentPhase === phase.id;
          return (
            <div
              key={phase.id}
              className={`rounded-t-xl p-3 text-center transition-all ${
                isActive
                  ? 'bg-orange-500 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              <Icon className={`w-5 h-5 mx-auto mb-1 ${isActive ? 'text-white' : 'text-gray-500'}`} />
              <div className={`font-semibold text-sm ${isActive ? 'text-white' : 'text-gray-800'}`}>
                {phase.label}
              </div>
              <div className={`text-xs ${isActive ? 'text-orange-100' : 'text-gray-500'}`}>
                {phase.time}
              </div>
            </div>
          );
        })}
      </div>

      {/* NTC bar underneath */}
      <div
        className={`rounded-b-xl px-4 py-2.5 flex items-center justify-center gap-2 transition-all ${
          isNtcActive
            ? 'bg-orange-500 text-white shadow-lg'
            : 'bg-amber-100 text-amber-700'
        }`}
      >
        <Clock className={`w-4 h-4 ${isNtcActive ? 'text-white' : 'text-amber-600'}`} />
        <span className={`font-semibold text-sm ${isNtcActive ? 'text-white' : 'text-amber-800'}`}>
          NTC
        </span>
        <span className={`text-xs ${isNtcActive ? 'text-orange-100' : 'text-amber-600'}`}>
          — {ntcPhase.time}
        </span>
      </div>

      <p className="text-sm text-gray-500 mt-2">
        Current Phase: <span className="font-semibold text-orange-500 uppercase">{currentPhase}</span>
      </p>
    </div>
  );
}