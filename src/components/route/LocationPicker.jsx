import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';

export default function LocationPicker({ locations, value, onChange, placeholder, onDelete, getLocationIcon, className = '', extraOption }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = locations.find(l => l.id === value);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 border border-input rounded-md bg-background text-sm shadow-sm hover:bg-accent/30 transition-colors"
      >
        {selected ? (
          <span className="flex items-center gap-2">
            {getLocationIcon(selected.label)}
            <span className="font-medium">{selected.label}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <ChevronDown className="w-4 h-4 opacity-50 flex-shrink-0" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md overflow-hidden">
          {locations.map(loc => (
            <div
              key={loc.id}
              className={`px-3 py-2 cursor-pointer hover:bg-accent ${value === loc.id ? 'bg-accent/50' : ''}`}
              onClick={() => { onChange(loc.id); setOpen(false); }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {getLocationIcon(loc.label)}
                  <span className="font-medium text-sm truncate">{loc.label}</span>
                </div>
                <button
                  className="p-0.5 rounded-full hover:bg-red-100 flex-shrink-0"
                  onClick={(e) => { e.stopPropagation(); onDelete(loc.id); setOpen(false); }}
                >
                  <X className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                </button>
              </div>
              <p className="text-xs text-gray-400 truncate mt-0.5 pl-5">{loc.address}</p>
            </div>
          ))}
          {extraOption}
        </div>
      )}
    </div>
  );
}