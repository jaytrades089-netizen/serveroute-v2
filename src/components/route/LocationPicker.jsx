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
      style={{ ...dropdownStyle, background: 'rgba(11,15,30,0.96)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)' }}
      className="rounded-md shadow-lg overflow-hidden"
    >
      {locations.map(loc => (
        <div
          key={loc.id}
          className={`px-3 py-2 cursor-pointer transition-colors ${value === loc.id ? '' : ''}`}
          style={{ background: value === loc.id ? 'rgba(233,195,73,0.12)' : 'transparent' }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onChange(loc.id); setOpen(false); }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          onMouseLeave={(e) => e.currentTarget.style.background = value === loc.id ? 'rgba(233,195,73,0.12)' : 'transparent'}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0" style={{ color: '#E6E1E4' }}>
              {getLocationIcon(loc.label)}
              <span className="font-medium text-sm truncate">{loc.label}</span>
            </div>
            <button
              className="p-0.5 rounded-full flex-shrink-0 hover:bg-red-900/30"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onDelete(loc.id); setOpen(false); }}
            >
              <X className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />
            </button>
          </div>
          <p className="text-xs truncate mt-0.5 pl-5" style={{ color: '#6B7280' }}>{loc.address}</p>
        </div>
      ))}
      {extraOption && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(false)}>
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
        className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm shadow-sm transition-colors"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#E6E1E4' }}
      >
        {selected ? (
          <span className="flex items-center gap-2" style={{ color: '#E6E1E4' }}>
            {getLocationIcon(selected.label)}
            <span className="font-medium">{selected.label}</span>
          </span>
        ) : (
          <span style={{ color: '#6B7280' }}>{placeholder}</span>
        )}
        <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#6B7280' }} />
      </button>
      {dropdown}
    </div>
  );
}