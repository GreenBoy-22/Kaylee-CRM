// src/WorkCalendar.tsx
//
// Work-mode calendar: shows daily call load from student next_appointment_date.
//
// Busy thresholds:
//   0      → no color (white/default)
//   1–14   → low    (green)
//   15–24  → moderate (amber)
//   25+    → high   (red)
//
// Each day cell shows a large call count number front and center.

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Phone } from 'lucide-react';

export interface WorkCalendarStudent {
  id: string;
  display_name: string;
  next_appointment_date: string | null; // YYYY-MM-DD
  archived: boolean;
}

type BusyLevel = 'none' | 'low' | 'moderate' | 'high';

function callBusyLevel(count: number): BusyLevel {
  if (count === 0) return 'none';
  if (count >= 25) return 'high';
  if (count >= 15) return 'moderate';
  return 'low';
}

const BUSY_LABEL: Record<BusyLevel, string> = {
  none: 'No calls',
  low: 'Light day',
  moderate: 'Moderate day',
  high: 'Busy day',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return toKey(a) === toKey(b);
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function buildMonthGrid(anchor: Date): Date[] {
  const first = startOfMonth(anchor);
  const gridStart = startOfWeek(first);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) days.push(addDays(gridStart, i));
  return days;
}

function buildWeekGrid(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type ViewMode = 'month' | 'week';

interface Props {
  students: WorkCalendarStudent[];
}

// Busy level → background color mapping (inline styles to guarantee rendering)
const LEVEL_BG: Record<BusyLevel, string> = {
  none: 'white',
  low: 'var(--green-bg)',
  moderate: 'var(--amber-bg)',
  high: 'var(--red-bg)',
};

const LEVEL_TEXT: Record<BusyLevel, string> = {
  none: 'var(--muted)',
  low: 'var(--green)',
  moderate: 'var(--amber)',
  high: 'var(--red)',
};

const LEVEL_BORDER: Record<BusyLevel, string> = {
  none: 'var(--border)',
  low: 'var(--green)',
  moderate: 'var(--amber)',
  high: 'var(--red)',
};

export default function WorkCalendar({ students }: Props) {
  const [view, setView] = useState<ViewMode>('month');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [selectedKey, setSelectedKey] = useState<string>(toKey(new Date()));

  const today = new Date();

  // Build a map: dateKey -> list of students with a call that day
  const callsByDay = useMemo(() => {
    const map = new Map<string, WorkCalendarStudent[]>();
    for (const student of students) {
      if (student.archived || !student.next_appointment_date) continue;
      const key = student.next_appointment_date.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(student);
      map.set(key, arr);
    }
    return map;
  }, [students]);

  const gridDays = useMemo(
    () => (view === 'month' ? buildMonthGrid(anchor) : buildWeekGrid(anchor)),
    [view, anchor]
  );

  const headerLabel =
    view === 'month'
      ? `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`
      : (() => {
          const days = buildWeekGrid(anchor);
          const first = days[0];
          const last = days[6];
          const sameMonth = first.getMonth() === last.getMonth();
          return sameMonth
            ? `${MONTH_NAMES[first.getMonth()]} ${first.getDate()}–${last.getDate()}, ${first.getFullYear()}`
            : `${MONTH_NAMES[first.getMonth()]} ${first.getDate()} – ${MONTH_NAMES[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;
        })();

  const goPrev = () =>
    setAnchor(view === 'month' ? addMonths(anchor, -1) : addDays(anchor, -7));
  const goNext = () =>
    setAnchor(view === 'month' ? addMonths(anchor, 1) : addDays(anchor, 7));
  const goToday = () => {
    setAnchor(new Date());
    setSelectedKey(toKey(new Date()));
  };

  const selectedCalls = callsByDay.get(selectedKey) ?? [];
  const selectedDate = new Date(selectedKey + 'T00:00:00');
  const selectedCount = selectedCalls.length;
  const selectedLevel = callBusyLevel(selectedCount);

  // Month stats
  const monthDays = buildMonthGrid(anchor).filter(
    (d) => d.getMonth() === anchor.getMonth()
  );
  const monthCallTotal = monthDays.reduce(
    (sum, d) => sum + (callsByDay.get(toKey(d))?.length ?? 0),
    0
  );
  const monthHighDays = monthDays.filter(
    (d) => callBusyLevel(callsByDay.get(toKey(d))?.length ?? 0) === 'high'
  ).length;

  return (
    <div className="gcal-shell">
      {/* Toolbar */}
      <div className="gcal-toolbar">
        <div className="gcal-toolbar-left">
          <button className="gcal-nav-btn" onClick={goPrev} aria-label="Previous">
            <ChevronLeft size={16} />
          </button>
          <button className="gcal-nav-btn" onClick={goNext} aria-label="Next">
            <ChevronRight size={16} />
          </button>
          <h2>{headerLabel}</h2>
          <button className="gcal-today-btn" onClick={goToday}>Today</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="gcal-view-toggle">
            <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Week</button>
            <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</button>
          </div>
        </div>
      </div>

      {/* Month summary bar */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="gcal-today-busy-pill low" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>
          <Phone size={12} /> {monthCallTotal} calls this month
        </div>
        {monthHighDays > 0 && (
          <div className="gcal-today-busy-pill high" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>
            {monthHighDays} high-load day{monthHighDays !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Month view */}
      {view === 'month' ? (
        <>
          <div className="gcal-month-dow">
            {DOW.map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="gcal-month-grid">
            {gridDays.map((d) => {
              const key = toKey(d);
              const count = callsByDay.get(key)?.length ?? 0;
              const level = callBusyLevel(count);
              const inMonth = d.getMonth() === anchor.getMonth();
              const isToday = isSameDay(d, today);
              const isSelected = key === selectedKey;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  style={{
                    // inline styles guarantee the color shows regardless of CSS specificity
                    background: isSelected ? 'var(--purple-bg)' : LEVEL_BG[level],
                    borderColor: isSelected ? 'var(--purple)' : isToday ? 'var(--purple)' : LEVEL_BORDER[level],
                    borderWidth: isToday || isSelected ? 2 : 1,
                    opacity: inMonth ? 1 : 0.4,
                    aspectRatio: '1',
                    minHeight: 64,
                    minWidth: 0,
                    borderStyle: 'solid',
                    borderRadius: 10,
                    padding: 6,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    font: 'inherit',
                    color: 'inherit',
                    gap: 2,
                  }}
                >
                  {/* Day number — small, top left */}
                  <span style={{
                    position: 'absolute',
                    top: 5,
                    left: 7,
                    fontSize: 11,
                    fontWeight: 600,
                    color: isToday ? 'white' : 'var(--muted)',
                    background: isToday ? 'var(--purple)' : 'transparent',
                    borderRadius: isToday ? '50%' : 0,
                    width: isToday ? 18 : 'auto',
                    height: isToday ? 18 : 'auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {d.getDate()}
                  </span>

                  {/* Big call count number */}
                  {count > 0 && (
                    <span style={{
                      fontSize: 26,
                      fontWeight: 800,
                      lineHeight: 1,
                      color: LEVEL_TEXT[level],
                    }}>
                      {count}
                    </span>
                  )}

                  {/* Subtle label under the number */}
                  {count > 0 && (
                    <span style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: LEVEL_TEXT[level],
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      opacity: 0.8,
                    }}>
                      calls
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        /* Week view */
        <div className="gcal-week-grid">
          {gridDays.map((d) => {
            const key = toKey(d);
            const calls = callsByDay.get(key) ?? [];
            const count = calls.length;
            const level = callBusyLevel(count);
            const isToday = isSameDay(d, today);
            const isSelected = key === selectedKey;

            return (
              <div
                key={key}
                onClick={() => setSelectedKey(key)}
                style={{
                  background: isSelected ? 'var(--purple-bg)' : LEVEL_BG[level],
                  border: `${isToday || isSelected ? 2 : 1}px solid ${isSelected ? 'var(--purple)' : isToday ? 'var(--purple)' : LEVEL_BORDER[level]}`,
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 160,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {/* Day header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>
                      {DOW[d.getDay()]}
                    </div>
                    <div style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: isToday ? 'var(--purple-dark)' : 'var(--text)',
                    }}>
                      {d.getDate()}
                    </div>
                  </div>
                  {count > 0 && (
                    <div style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: LEVEL_TEXT[level],
                    }} />
                  )}
                </div>

                {/* Big call number */}
                {count > 0 && (
                  <div style={{ textAlign: 'center', marginTop: 'auto', marginBottom: 'auto' }}>
                    <div style={{
                      fontSize: 42,
                      fontWeight: 800,
                      lineHeight: 1,
                      color: LEVEL_TEXT[level],
                    }}>
                      {count}
                    </div>
                    <div style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: LEVEL_TEXT[level],
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginTop: 2,
                    }}>
                      {BUSY_LABEL[level]}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="gcal-legend" style={{ marginTop: 12 }}>
        <span className="gcal-legend-item">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
          Light (1–14 calls)
        </span>
        <span className="gcal-legend-item">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block' }} />
          Moderate (15–24 calls)
        </span>
        <span className="gcal-legend-item">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />
          Busy (25+ calls)
        </span>
      </div>

      {/* Day detail */}
      <div className="gcal-day-detail">
        <div className="gcal-day-detail-head">
          <h3>
            {selectedDate.toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            })}
          </h3>
          {selectedCount > 0 && (
            <span
              className="gcal-today-busy-pill"
              style={{ background: LEVEL_BG[selectedLevel], color: LEVEL_TEXT[selectedLevel] }}
            >
              <Phone size={12} /> {selectedCount} call{selectedCount !== 1 ? 's' : ''} — {BUSY_LABEL[selectedLevel]}
            </span>
          )}
        </div>

        {selectedCount === 0 ? (
          <div className="gcal-today-empty">No calls scheduled this day.</div>
        ) : (
          selectedCalls.map((student) => (
            <div
              key={student.id}
              className="gcal-today-item"
              style={{ borderLeftColor: 'var(--purple)' }}
            >
              <div className="gcal-today-item-time">
                <Phone size={13} style={{ color: 'var(--purple-dark)' }} />
              </div>
              <div className="gcal-today-item-body">
                <div className="gcal-today-item-title">{student.display_name}</div>
                <div className="gcal-today-item-loc">Next appointment</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
