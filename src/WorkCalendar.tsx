// src/WorkCalendar.tsx
//
// Work-mode calendar: shows how busy each day is based on the number of
// student calls scheduled (next_appointment_date from the Students module).
//
// Busy thresholds (calls per day):
//   0–14   → low      (green)
//   15–24  → moderate (amber)
//   25+    → high     (red)
//
// No Google Calendar data is shown in Work mode — this is intentionally
// call-load only so it stays FERPA-safe and work-focused.

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Phone } from 'lucide-react';

export interface WorkCalendarStudent {
  id: string;
  display_name: string;
  next_appointment_date: string | null; // YYYY-MM-DD
  archived: boolean;
}

type BusyLevel = 'low' | 'moderate' | 'high';

function callBusyLevel(count: number): BusyLevel {
  if (count >= 25) return 'high';
  if (count >= 15) return 'moderate';
  return 'low';
}

const BUSY_LABEL: Record<BusyLevel, string> = {
  low: 'Light day',
  moderate: 'Moderate day',
  high: 'Busy day',
};

const BUSY_THRESHOLD_LABEL: Record<BusyLevel, string> = {
  low: '0–14 calls',
  moderate: '15–24 calls',
  high: '25+ calls',
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

  // Stats for the current month
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
        <div className="gcal-today-busy-pill low">
          <Phone size={12} /> {monthCallTotal} calls this month
        </div>
        {monthHighDays > 0 && (
          <div className="gcal-today-busy-pill high">
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
              const calls = callsByDay.get(key) ?? [];
              const count = calls.length;
              const level = callBusyLevel(count);
              const inMonth = d.getMonth() === anchor.getMonth();
              const isToday = isSameDay(d, today);
              const isSelected = key === selectedKey;

              return (
                <button
                  key={key}
                  type="button"
                  className={[
                    'gcal-day-cell',
                    !inMonth ? 'outside-month' : '',
                    count > 0 ? `busy-${level}` : 'busy-low',
                    isToday ? 'is-today' : '',
                    isSelected ? 'selected' : '',
                  ].join(' ').trim()}
                  onClick={() => setSelectedKey(key)}
                >
                  <span className="gcal-day-num">{d.getDate()}</span>
                  {count > 0 && (
                    <span
                      className="gcal-day-event-chip"
                      style={{ display: 'flex', alignItems: 'center', gap: 3 }}
                    >
                      <Phone size={9} /> {count} call{count !== 1 ? 's' : ''}
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
                className={[
                  'gcal-week-day',
                  count > 0 ? `busy-${level}` : 'busy-low',
                  isToday ? 'is-today' : '',
                  isSelected ? 'selected' : '',
                ].join(' ').trim()}
                onClick={() => setSelectedKey(key)}
              >
                <div className="gcal-week-day-head">
                  <div>
                    <div className="gcal-week-day-label">{DOW[d.getDay()]}</div>
                    <div className="gcal-week-day-num">{d.getDate()}</div>
                  </div>
                  {count > 0 && (
                    <span className={`gcal-busy-dot ${level}`} style={{ position: 'static' }} />
                  )}
                </div>
                {count > 0 && (
                  <span className="gcal-week-event-chip">
                    <Phone size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                    {count} call{count !== 1 ? 's' : ''} — {BUSY_LABEL[level]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="gcal-legend" style={{ marginTop: 12 }}>
        {(['low', 'moderate', 'high'] as BusyLevel[]).map((lvl) => (
          <span className="gcal-legend-item" key={lvl}>
            <span className={`gcal-legend-dot ${lvl}`} />
            {BUSY_LABEL[lvl]} ({BUSY_THRESHOLD_LABEL[lvl]})
          </span>
        ))}
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
            <span className={`gcal-today-busy-pill ${selectedLevel}`}>
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
