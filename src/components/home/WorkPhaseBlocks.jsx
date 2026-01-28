import React from 'react';
import { Sun, Moon, Calendar, Clock } from 'lucide-react';

const phases = [
  { id: 'am', label: 'AM', icon: Sun, time: '8am-12pm' },
  { id: 'pm', label: 'PM', icon: Moon, time: '5pm-9pm' },
  { id: 'weekend', label: 'Wknd', icon: Calendar, time: 'Sat/Sun' },
  { id: 'ntc', label: 'NTC', icon: Clock, time: 'No Time' }
];

export default function WorkPhaseBlocks({ currentPhase }) {
  return (
    <div className="mb-6">
      <div className="grid grid-cols-4 gap-2">
        {phases.map((phase) => {
          const Icon = phase.icon;
          const isActive = currentPhase === phase.id;
          
          return (
            <div
              key={phase.id}
              className={`rounded-xl p-3 text-center transition-all ${
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
      <p className="text-sm text-gray-500 mt-2">
        Current Phase: <span className="font-semibold text-orange-500 uppercase">{currentPhase}</span>
      </p>
    </div>
  );
}