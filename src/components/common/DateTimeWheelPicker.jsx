import React, { useRef, useEffect, useCallback } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';

const ITEM_H = 44;
const HOURS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const MINUTES = ['00','15','30','45'];
const AMPM = ['AM','PM'];
const REPEAT = 20; // repeat items this many times for infinite feel

function WheelColumn({ items, selectedIndex, onChange, label, circular = false }) {
  const ref = useRef(null);
  const debounce = useRef(null);
  const isSyncing = useRef(false);

  const count = items.length;
  // For circular: render items × REPEAT, start in middle block
  const listItems = circular ? Array.from({ length: count * REPEAT }, (_, i) => items[i % count]) : items;
  const startBlock = circular ? Math.floor(REPEAT / 2) : 0;

  // Convert a logical index to scroll position (for circular, target middle block)
  const toScrollTop = useCallback((logicalIdx) => {
    const idx = circular ? startBlock * count + logicalIdx : logicalIdx;
    return idx * ITEM_H;
  }, [circular, count, startBlock]);

  // Scroll without animation (instant)
  const scrollToInstant = useCallback((logicalIdx) => {
    if (!ref.current) return;
    ref.current.scrollTop = toScrollTop(logicalIdx);
  }, [toScrollTop]);

  // Initialize scroll position
  useEffect(() => {
    scrollToInstant(selectedIndex);
  }, []); // only on mount

  // When selectedIndex changes externally, update scroll
  useEffect(() => {
    if (!ref.current) return;
    const expected = toScrollTop(selectedIndex);
    const current = ref.current.scrollTop;
    // Only re-sync if meaningfully different (avoid fighting user scroll)
    const currentLogical = circular
      ? Math.round(current / ITEM_H) % count
      : Math.round(current / ITEM_H);
    if (currentLogical !== selectedIndex) {
      isSyncing.current = true;
      ref.current.scrollTop = expected;
      setTimeout(() => { isSyncing.current = false; }, 50);
    }
  }, [selectedIndex]);

  const handleScroll = () => {
    if (isSyncing.current) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      if (!ref.current) return;
      const rawIndex = Math.round(ref.current.scrollTop / ITEM_H);
      
      if (circular) {
        const logicalIdx = ((rawIndex % count) + count) % count;
        // Re-center to middle block to allow infinite scroll in both directions
        const centeredScrollTop = (startBlock * count + logicalIdx) * ITEM_H;
        isSyncing.current = true;
        ref.current.scrollTop = centeredScrollTop;
        setTimeout(() => { isSyncing.current = false; }, 50);
        onChange(logicalIdx);
      } else {
        const clamped = Math.max(0, Math.min(rawIndex, items.length - 1));
        ref.current.scrollTop = clamped * ITEM_H;
        onChange(clamped);
      }
    }, 80);
  };

  const handleItemClick = (logicalIdx) => {
    if (!ref.current) return;
    isSyncing.current = true;
    if (circular) {
      ref.current.scrollTop = (startBlock * count + logicalIdx) * ITEM_H;
    } else {
      ref.current.scrollTop = logicalIdx * ITEM_H;
    }
    setTimeout(() => { isSyncing.current = false; }, 100);
    onChange(logicalIdx);
  };

  const handleStep = (direction) => {
    // direction: +1 = next item (scroll down), -1 = prev item (scroll up)
    const next = circular
      ? ((selectedIndex + direction) + count) % count
      : Math.max(0, Math.min(selectedIndex + direction, count - 1));
    handleItemClick(next);
    onChange(next);
  };

  const stepBtnStyle = {
    width: '100%',
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.35)',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1,
    userSelect: 'none',
    WebkitUserSelect: 'none',
    padding: 0,
  };

  return (
    <div className="flex flex-col items-center flex-1">
      {/* Fixed-height label area so all columns align */}
      <div className="h-5 flex items-center justify-center">
        {label ? <p className="text-[9px] font-bold text-white/50 uppercase tracking-wider">{label}</p> : null}
      </div>

      {/* + button above the bracket */}
      <button
        style={stepBtnStyle}
        onMouseEnter={e => { e.currentTarget.style.color = 'rgba(233,195,73,0.9)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
        onTouchStart={e => { e.currentTarget.style.color = 'rgba(233,195,73,0.9)'; }}
        onTouchEnd={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
        onClick={() => handleStep(-1)}
      >+</button>

      {/* overflow:hidden clips items that scroll past the visible window edges */}
      <div className="relative" style={{ height: ITEM_H * 3, overflow: 'hidden' }}>
        {/* Selection highlight — gold bracket at center row */}
        <div
          className="absolute inset-x-0 pointer-events-none z-10 rounded"
          style={{
            top: ITEM_H,
            height: ITEM_H,
            borderTop: '2px solid rgba(233,195,73,0.8)',
            borderBottom: '2px solid rgba(233,195,73,0.8)',
            background: 'rgba(233,195,73,0.10)'
          }}
        />
        <div
          ref={ref}
          onScroll={handleScroll}
          style={{
            height: ITEM_H * 3,
            overflowY: 'scroll',
            scrollSnapType: 'y mandatory',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            paddingTop: ITEM_H,
            paddingBottom: ITEM_H,
            boxSizing: 'content-box',
          }}
          className="wheel-col"
        >
          <style>{`.wheel-col::-webkit-scrollbar { display: none; }`}</style>
          {listItems.map((item, i) => {
            const logicalIdx = circular ? i % count : i;
            return (
              <div
                key={i}
                style={{ height: ITEM_H, scrollSnapAlign: 'center', flexShrink: 0 }}
                className={`flex items-center justify-center text-base font-semibold transition-all cursor-pointer select-none
                  ${logicalIdx === selectedIndex ? 'text-white font-bold' : 'text-white/40'}`}
                onClick={() => handleItemClick(logicalIdx)}
              >
                {item}
              </div>
            );
          })}
        </div>
      </div>

      {/* - button below the bracket */}
      <button
        style={stepBtnStyle}
        onMouseEnter={e => { e.currentTarget.style.color = 'rgba(233,195,73,0.9)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
        onTouchStart={e => { e.currentTarget.style.color = 'rgba(233,195,73,0.9)'; }}
        onTouchEnd={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
        onClick={() => handleStep(+1)}
      >−</button>
    </div>
  );
}

export default function DateTimeWheelPicker({
  date, onDateChange,
  startHourIndex, startMinuteIndex, startAmPmIndex, onStartChange,
  endHourIndex, endMinuteIndex, endAmPmIndex, onEndChange,
  showEnd = true
}) {
  const handleStartChange = (hIdx, mIdx, apIdx) => {
    onStartChange(hIdx, mIdx, apIdx);
    if (onEndChange) {
      let h24 = parseInt(HOURS[hIdx]);
      if (AMPM[apIdx] === 'PM' && h24 !== 12) h24 += 12;
      if (AMPM[apIdx] === 'AM' && h24 === 12) h24 = 0;
      const endH24 = (h24 + 1) % 24;
      const endApIdx = endH24 >= 12 ? 1 : 0;
      let endH12 = endH24 % 12;
      if (endH12 === 0) endH12 = 12;
      const endHIdx = HOURS.indexOf(String(endH12));
      onEndChange(endHIdx >= 0 ? endHIdx : 0, mIdx, endApIdx);
    }
  };

  return (
    <div>
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
            head_cell: "flex-1 text-center text-xs font-medium text-white/60 py-1",
            row: "flex w-full justify-between mt-0.5",
            cell: "flex-1 flex items-center justify-center p-0",
            day: "h-9 w-9 rounded-full text-sm flex items-center justify-center mx-auto hover:bg-white/20 transition-colors text-white",
            day_selected: "!ring-2 !ring-white !ring-offset-1 !font-bold !text-white",
            day_today: "bg-white/20 font-bold text-white",
            nav: "flex items-center justify-between px-2 pb-1",
            nav_button: "h-8 w-8 rounded-full hover:bg-white/20 flex items-center justify-center",
            caption: "text-sm font-semibold text-center py-1 text-white"
          }}
        />
        {date && (
          <p className="text-center text-sm font-semibold mt-1" style={{ color: '#e9c349' }}>
            {format(date, 'EEEE, MMMM d, yyyy')}
          </p>
        )}
      </div>

      <div className="border-t border-white/10 mb-3" />

      <p className="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1">FROM</p>
      <div className="flex items-start gap-1 rounded-2xl px-3 py-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <WheelColumn
          items={HOURS}
          selectedIndex={startHourIndex}
          onChange={(i) => handleStartChange(i, startMinuteIndex, startAmPmIndex)}
          label="HR"
          circular
        />
        {/* Colon — offset by label height (h-5 = 20px) + center of picker */}
        <div
          className="flex items-center text-white/20 text-xl font-light flex-shrink-0"
          style={{ paddingTop: `${20 + 44}px`, height: `${20 + 44 * 3}px` }}
        >
          :
        </div>
        <WheelColumn
          items={MINUTES}
          selectedIndex={startMinuteIndex}
          onChange={(i) => handleStartChange(startHourIndex, i, startAmPmIndex)}
          label="MIN"
          circular
        />
        <WheelColumn
          items={AMPM}
          selectedIndex={startAmPmIndex}
          onChange={(i) => handleStartChange(startHourIndex, startMinuteIndex, i)}
          label=""
          circular
        />
      </div>

      {showEnd && (
        <>
          <p className="text-[11px] font-bold text-white/40 uppercase tracking-wider mt-3 mb-1">
            TO <span className="font-normal text-white/25">(optional)</span>
          </p>
          <div className="flex items-start gap-1 rounded-2xl px-3 py-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <WheelColumn
              items={HOURS}
              selectedIndex={endHourIndex}
              onChange={(i) => onEndChange(i, endMinuteIndex, endAmPmIndex)}
              label="HR"
              circular
            />
            <div
              className="flex items-center text-white/20 text-xl font-light flex-shrink-0"
              style={{ paddingTop: `${20 + 44}px`, height: `${20 + 44 * 3}px` }}
            >
              :
            </div>
            <WheelColumn
              items={MINUTES}
              selectedIndex={endMinuteIndex}
              onChange={(i) => onEndChange(endHourIndex, i, endAmPmIndex)}
              label="MIN"
              circular
            />
            <WheelColumn
              items={AMPM}
              selectedIndex={endAmPmIndex}
              onChange={(i) => onEndChange(endHourIndex, endMinuteIndex, i)}
              label=""
              circular
            />
          </div>
        </>
      )}
    </div>
  );
}
