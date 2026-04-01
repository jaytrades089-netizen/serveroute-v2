import React, { useRef, useEffect, useCallback } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';

const ITEM_H = 48;

function WheelColumn({ items, selectedIndex, onChange, label }) {
  const ref = useRef(null);
  const isScrolling = useRef(false);
  const debounce = useRef(null);

  // Scroll to selected index without triggering onChange
  const scrollTo = useCallback((index, behavior = 'smooth') => {
    if (!ref.current) return;
    ref.current.scrollTo({ top: index * ITEM_H, behavior });
  }, []);

  useEffect(() => {
    scrollTo(selectedIndex, 'instant');
  }, [selectedIndex, scrollTo]);

  const handleScroll = () => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      if (!ref.current) return;
      const index = Math.round(ref.current.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(index, items.length - 1));
      scrollTo(clamped);
      onChange(clamped);
    }, 80);
  };

  return (
    <div className="flex flex-col items-center flex-1">
      {label && <p className="text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">{label}</p>}
      <div className="relative">
        {/* Selection highlight */}
        <div className="absolute inset-x-0 pointer-events-none z-10"
          style={{ top: ITEM_H, height: ITEM_H }}>
          <div className="h-full border-t-2 border-b-2 border-blue-500 bg-blue-50/60 rounded" />
        </div>
        <div
          ref={ref}
          onScroll={handleScroll}
          className="overflow-y-scroll scrollbar-none"
          style={{
            height: ITEM_H * 3,
            scrollSnapType: 'y mandatory',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* Top padding item */}
          <div style={{ height: ITEM_H, scrollSnapAlign: 'center', flexShrink: 0 }} />
          {items.map((item, i) => (
            <div
              key={i}
              style={{ height: ITEM_H, scrollSnapAlign: 'center', flexShrink: 0 }}
              className={`flex items-center justify-center text-xl font-semibold transition-all cursor-pointer
                ${i === selectedIndex ? 'text-blue-600 scale-110' : 'text-gray-400 scale-95'}`}
              onClick={() => { onChange(i); scrollTo(i); }}
            >
              {item}
            </div>
          ))}
          {/* Bottom padding item */}
          <div style={{ height: ITEM_H, scrollSnapAlign: 'center', flexShrink: 0 }} />
        </div>
      </div>
    </div>
  );
}

const HOURS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MINUTES = ['00', '15', '30', '45'];
const AMPM = ['AM', 'PM'];

export default function DateTimeWheelPicker({
  date, onDateChange,
  startHourIndex, startMinuteIndex, startAmPmIndex,
  onStartChange,
  endHourIndex, endMinuteIndex, endAmPmIndex,
  onEndChange,
  showEnd = true
}) {
  return (
    <div>
      {/* Calendar */}
      <div className="mb-4">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onDateChange}
          disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
          classNames={{
            months: "w-full flex justify-center",
            month: "w-full",
            table: "w-full border-collapse",
            head_row: "flex w-full justify-between",
            head_cell: "flex-1 text-center text-xs font-medium text-gray-500 py-1",
            row: "flex w-full justify-between mt-0.5",
            cell: "flex-1 flex items-center justify-center p-0",
            day: "h-9 w-9 rounded-full text-sm flex items-center justify-center mx-auto hover:bg-gray-100 transition-colors",
            day_selected: "!ring-2 !ring-black !ring-offset-1 !font-bold",
            day_today: "bg-gray-100 font-bold",
            nav: "flex items-center justify-between px-2 pb-1",
            nav_button: "h-8 w-8 rounded-full hover:bg-gray-100 flex items-center justify-center",
            caption: "text-sm font-semibold text-center py-1"
          }}
        />
        {date && (
          <p className="text-center text-sm font-semibold text-blue-600 mt-1">
            {format(date, 'EEEE, MMMM d, yyyy')}
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100 mb-4" />

      {/* Start time wheel */}
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">FROM</p>
      <div className="flex items-stretch gap-1 bg-gray-50 rounded-2xl px-3 py-2">
        <WheelColumn items={HOURS} selectedIndex={startHourIndex} onChange={(i) => onStartChange(i, startMinuteIndex, startAmPmIndex)} label="HR" />
        <div className="flex items-center text-gray-300 text-2xl font-light pb-1 pt-5">:</div>
        <WheelColumn items={MINUTES} selectedIndex={startMinuteIndex} onChange={(i) => onStartChange(startHourIndex, i, startAmPmIndex)} label="MIN" />
        <WheelColumn items={AMPM} selectedIndex={startAmPmIndex} onChange={(i) => onStartChange(startHourIndex, startMinuteIndex, i)} label="" />
      </div>

      {/* End time wheel */}
      {showEnd && (
        <>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mt-4 mb-2">
            TO <span className="font-normal text-gray-300">(optional)</span>
          </p>
          <div className="flex items-stretch gap-1 bg-gray-50 rounded-2xl px-3 py-2">
            <WheelColumn items={HOURS} selectedIndex={endHourIndex} onChange={(i) => onEndChange(i, endMinuteIndex, endAmPmIndex)} label="HR" />
            <div className="flex items-center text-gray-300 text-2xl font-light pb-1 pt-5">:</div>
            <WheelColumn items={MINUTES} selectedIndex={endMinuteIndex} onChange={(i) => onEndChange(endHourIndex, i, endAmPmIndex)} label="MIN" />
            <WheelColumn items={AMPM} selectedIndex={endAmPmIndex} onChange={(i) => onEndChange(endHourIndex, endMinuteIndex, i)} label="" />
          </div>
        </>
      )}
    </div>
  );
}