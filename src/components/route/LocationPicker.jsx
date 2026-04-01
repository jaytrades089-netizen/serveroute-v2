import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, X } from 'lucide-react';

export default function LocationPicker({ locations, value, onChange, placeholder, onDelete, getLocationIcon, className = '', extraOption }) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const triggerRef = useRef(null);

  const selected = locations.find(l => l.id === value);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target)) {
        // Check if click is inside the portal dropdown
        const portal = document.getElementById('location-picker-portal');
        if (portal && portal.contains(e.target)) return;
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    }
    setOpen(o => !o);
  };

  const dropdown = open ? ReactDOM.createPortal(
    <div
      id="location-picker-portal"
      style={dropdownStyle}
      className="bg-white border border-border rounded-md shadow-lg overflow-hidden"
    >
      {locations.map(loc => (
        <div
          key={loc.id}
          className={`px-3 py-2 cursor-pointer hover:bg-accent ${value === loc.id ? 'bg-accent/50' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onChange(loc.id); setOpen(false); }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {getLocationIcon(loc.label)}
              <span className="font-medium text-sm truncate">{loc.label}</span>
            </div>
            <button
              className="p-0.5 rounded-full hover:bg-red-100 flex-shrink-0"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onDelete(loc.id); setOpen(false); }}
            >
              <X className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
            </button>
          </div>
          <p className="text-xs text-gray-400 truncate mt-0.5 pl-5">{loc.address}</p>
        </div>
      ))}
      {extraOption && (
        <div onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(false)}>
          {extraOption}
        </div>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={triggerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
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
      {dropdown}
    </div>
  );
}