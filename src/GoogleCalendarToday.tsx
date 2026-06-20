// src/GoogleCalendarToday.tsx
//
// Fast-glance "today" card, styled like the Daily Briefing panel.
// Shows today's Google Calendar events plus a busy-level pill computed
// from combined scheduled hours (events + household chores).

import { Calendar } from 'lucide-react';
import { useGoogleCalendarData, busyLevelFromHours, type BusyLevel } from './useGoogleCalendarData';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const BUSY_LABEL: Record<BusyLevel, string> = {
  low: 'Light day',
  medium: 'Moderate day',
  high: 'Busy day',
};

export default function GoogleCalendarToday() {
  const { loading, data, daySummaries, dateKeyOf } = useGoogleCalendarData({ daysForward: 1, daysBack: 0 });

  const todayKey = dateKeyOf(new Date());
  const today = daySummaries.get(todayKey);
  const todayEvents = (today?.events ?? []).slice().sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });
  const busyLevel = today ? busyLevelFromHours(today.busyHours) : 'low';

  if (loading) {
    return (
      <div className="gcal-today-card">
        <div className="gcal-today-head"><h2>Today</h2></div>
        <div className="gcal-today-empty">Loading...</div>
      </div>
    );
  }

  if (!data?.connected) {
    return null; // The full Calendar page owns the connect prompt; keep dashboard quiet.
  }

  return (
    <div className="gcal-today-card">
      <div className="gcal-today-head">
        <h2>Today</h2>
        <span className={`gcal-today-busy-pill ${busyLevel}`}>
          <Calendar size={12} /> {BUSY_LABEL[busyLevel]}
        </span>
      </div>

      {todayEvents.length === 0 && (
        <div className="gcal-today-empty">Nothing on the calendar today.</div>
      )}

      {todayEvents.map((event) => (
        <div className={`gcal-today-item ${event.allDay ? 'all-day' : ''}`} key={event.id}>
          <div className="gcal-today-item-time">{event.allDay ? 'All day' : formatTime(event.start)}</div>
          <div className="gcal-today-item-body">
            <div className="gcal-today-item-title">{event.title}</div>
            {event.location && <div className="gcal-today-item-loc">{event.location}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
