// src/GoogleCalendar.tsx
//
// Full calendar view for the Calendar page: month/week toggle, day
// drill-down, and a busy-color system (green/amber/red dots) driven by
// combined scheduled hours from Google events + household chores.

import { useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react';
import {
  useGoogleCalendarData,
  type GCalEvent,
  type DaySummary,
} from './useGoogleCalendarData';

type ViewMode = 'month' | 'week';

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - day);
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

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return toKey(a) === toKey(b);
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) days.push(addDays(start, i));
  return days;
}

export default function GoogleCalendar() {
  const { loading, refreshing, data, daySummaries, syncedAt, refresh, connect, dateKeyOf } =
    useGoogleCalendarData({ daysForward: 60, daysBack: 35 });

  const [view, setView] = useState<ViewMode>('month');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [selectedKey, setSelectedKey] = useState<string>(toKey(new Date()));

  const today = new Date();

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
            ? `${MONTH_NAMES[first.getMonth()]} ${first.getDate()}-${last.getDate()}, ${first.getFullYear()}`
            : `${MONTH_NAMES[first.getMonth()]} ${first.getDate()} - ${MONTH_NAMES[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;
        })();

  const goPrev = () => setAnchor(view === 'month' ? addMonths(anchor, -1) : addDays(anchor, -7));
  const goNext = () => setAnchor(view === 'month' ? addMonths(anchor, 1) : addDays(anchor, 7));
  const goToday = () => {
    setAnchor(new Date());
    setSelectedKey(toKey(new Date()));
  };

  const selectedSummary: DaySummary | undefined = daySummaries.get(selectedKey);
  const selectedDate = new Date(selectedKey + 'T00:00:00');
  const selectedEvents = (selectedSummary?.events ?? []).slice().sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });

  if (loading) {
    return (
      <div className="gcal-shell">
        <div className="gcal-toolbar">
          <div className="gcal-toolbar-left"><h2>Calendar</h2></div>
        </div>
        <p style={{ color: 'var(--muted)' }}>Loading your calendar...</p>
      </div>
    );
  }

  if (!data?.connected) {
    return (
      <div className="gcal-shell">
        <div className="gcal-toolbar">
          <div className="gcal-toolbar-left"><h2>Calendar</h2></div>
        </div>
        <div className="gcal-today-empty" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <Calendar size={28} style={{ marginBottom: 10, color: 'var(--muted)' }} />
          <p style={{ margin: '0 0 12px' }}>
            {data?.needsReconnect
              ? 'Your Google Calendar connection expired. Reconnect to see your events here.'
              : 'Connect Google Calendar to see your events here.'}
          </p>
          <button className="btn primary" onClick={connect}>Connect Google Calendar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="gcal-shell">
      <div className="gcal-toolbar">
        <div className="gcal-toolbar-left">
          <button className="gcal-nav-btn" onClick={goPrev} aria-label="Previous"><ChevronLeft size={16} /></button>
          <button className="gcal-nav-btn" onClick={goNext} aria-label="Next"><ChevronRight size={16} /></button>
          <h2>{headerLabel}</h2>
          <button className="gcal-today-btn" onClick={goToday}>Today</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {syncedAt && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              Updated {new Date(syncedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <button className="gcal-nav-btn" onClick={refresh} aria-label="Refresh" disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          </button>
          <div className="gcal-view-toggle">
            <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Week</button>
            <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</button>
          </div>
        </div>
      </div>

      {data.error && (
        <p style={{ color: 'var(--amber)', fontSize: 12.5, marginTop: -6, marginBottom: 10 }}>{data.error}</p>
      )}

      {view === 'month' ? (
        <>
          <div className="gcal-month-dow">
            {DOW.map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="gcal-month-grid">
            {gridDays.map((d) => {
              const key = toKey(d);
              const summary = daySummaries.get(key);
              const inMonth = d.getMonth() === anchor.getMonth();
              const isToday = isSameDay(d, today);
              const isSelected = key === selectedKey;
              const timedEvents = (summary?.events ?? []).filter((e) => !e.allDay);
              const allDayEvents = (summary?.events ?? []).filter((e) => e.allDay);
              const visibleChips = [...allDayEvents, ...timedEvents].slice(0, 2);
              const extraCount = (summary?.events.length ?? 0) - visibleChips.length;

              return (
                <button
                  key={key}
                  type="button"
                  className={[
                    'gcal-day-cell',
                    !inMonth ? 'outside-month' : '',
                    `busy-${summary ? summary.busyLevel : 'low'}`,
                    isToday ? 'is-today' : '',
                    isSelected ? 'selected' : '',
                  ].join(' ').trim()}
                  onClick={() => setSelectedKey(key)}
                >
                  <span className="gcal-day-num">{d.getDate()}</span>
                  {visibleChips.map((e) => (
                    <span
                      className="gcal-day-event-chip"
                      key={e.id}
                      style={e.calendarColor ? { background: `${e.calendarColor}33`, color: e.calendarColor } : undefined}
                    >
                      {e.title}
                    </span>
                  ))}
                  {extraCount > 0 && <span className="gcal-day-event-more">+{extraCount} more</span>}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="gcal-week-grid">
          {gridDays.map((d) => {
            const key = toKey(d);
            const summary = daySummaries.get(key);
            const isToday = isSameDay(d, today);
            const isSelected = key === selectedKey;
            const sortedEvents = (summary?.events ?? []).slice().sort((a, b) => {
              if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
              return new Date(a.start).getTime() - new Date(b.start).getTime();
            });

            return (
              <div
                key={key}
                className={[
                  'gcal-week-day',
                  `busy-${summary ? summary.busyLevel : 'low'}`,
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
                  {summary && summary.busyHours > 0 && (
                    <span className={`gcal-busy-dot ${summary.busyLevel}`} style={{ position: 'static' }} />
                  )}
                </div>
                {sortedEvents.map((e) => (
                  <span
                    className={`gcal-week-event-chip ${e.allDay ? 'all-day' : ''}`}
                    key={e.id}
                    style={!e.allDay && e.calendarColor ? { background: `${e.calendarColor}33`, color: e.calendarColor } : undefined}
                  >
                    {e.allDay ? e.title : `${formatTime(e.start)} ${e.title}`}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {data.calendars && data.calendars.length > 1 && (
        <div className="gcal-legend" style={{ marginTop: 10, marginBottom: 0 }}>
          {data.calendars.map((cal) => (
            <span className="gcal-legend-item" key={cal.id}>
              <span className="gcal-legend-dot" style={{ background: cal.color ?? 'var(--purple)' }} />
              {cal.name}
            </span>
          ))}
        </div>
      )}

      <div className="gcal-legend">
        <span className="gcal-legend-item"><span className="gcal-legend-dot low" /> Light (under 2 hrs)</span>
        <span className="gcal-legend-item"><span className="gcal-legend-dot medium" /> Moderate (2-4 hrs)</span>
        <span className="gcal-legend-item"><span className="gcal-legend-dot high" /> Busy (4+ hrs)</span>
      </div>

      <div className="gcal-day-detail">
        <div className="gcal-day-detail-head">
          <h3>{selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
          {selectedSummary && selectedSummary.busyHours > 0 && (
            <span className={`gcal-today-busy-pill ${selectedSummary.busyLevel}`}>
              {selectedSummary.busyHours.toFixed(1)} hrs scheduled
            </span>
          )}
        </div>
        {selectedEvents.length === 0 && (
          <div className="gcal-today-empty">No events this day.</div>
        )}
        {selectedEvents.map((event: GCalEvent) => (
          <a
            key={event.id}
            href={event.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className={`gcal-today-item ${event.allDay ? 'all-day' : ''}`}
            style={{
              textDecoration: 'none',
              borderLeftColor: event.allDay ? undefined : (event.calendarColor ?? undefined),
            }}
          >
            <div className="gcal-today-item-time">{event.allDay ? 'All day' : formatTime(event.start)}</div>
            <div className="gcal-today-item-body">
              <div className="gcal-today-item-title">{event.title}</div>
              {event.calendarName && <div className="gcal-today-item-loc">{event.calendarName}{event.location ? ` \u00b7 ${event.location}` : ''}</div>}
              {!event.calendarName && event.location && <div className="gcal-today-item-loc">{event.location}</div>}
            </div>
            <ExternalLink size={13} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
          </a>
        ))}
      </div>
    </div>
  );
}
