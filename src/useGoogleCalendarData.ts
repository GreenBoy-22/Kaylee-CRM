// src/useGoogleCalendarData.ts
//
// Shared data layer for the Today card and full Calendar view.
// Fetches Google Calendar events + household chores for a date window,
// and computes a per-day "busy" rating from combined scheduled hours.
//
// Busy thresholds (timed Google events + chore estimated_minutes,
// Kaylee + Adam combined; all-day Google events excluded from the math):
//   < 2 hrs  -> low
//   2-4 hrs  -> medium
//   4+ hrs   -> high

import { useCallback, useEffect, useState } from 'react';
import { supabase, hasSupabase } from './lib/supabase';

export interface GCalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  htmlLink: string;
  calendarId?: string;
  calendarName?: string;
  calendarColor?: string | null;
}

export interface GCalChore {
  id: string;
  name: string;
  dueDate: string | null;
  estimatedMinutes: number;
  assignedTo: string | null;
  isCompleted: boolean;
}

export interface GCalCalendarMeta {
  id: string;
  name: string;
  color: string | null;
}

export interface CalendarFetchResult {
  connected: boolean;
  needsReconnect?: boolean;
  googleEmail?: string;
  calendars?: GCalCalendarMeta[];
  events: GCalEvent[];
  chores: GCalChore[];
  error?: string | null;
}

export type BusyLevel = 'low' | 'medium' | 'high';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Hours between two ISO timestamps, floored at 0. */
function hoursBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (isNaN(start) || isNaN(end) || end <= start) return 0;
  return (end - start) / (1000 * 60 * 60);
}

export function busyLevelFromHours(hours: number): BusyLevel {
  if (hours >= 4) return 'high';
  if (hours >= 2) return 'medium';
  return 'low';
}

/**
 * Returns all date keys an event occupies.
 * - Timed events: just the start date.
 * - All-day events: every day from start up to (but not including) end,
 *   because Google Calendar all-day events use an exclusive end date
 *   (e.g. a 3-day event Jun 19–21 has end = "2026-06-22").
 *   We cap expansion at 366 days to guard against malformed data.
 */
function eventDateKeys(event: GCalEvent): string[] {
  if (!event.allDay) {
    return [dateKey(new Date(event.start))];
  }
  const keys: string[] = [];
  const start = new Date(event.start + (event.start.length === 10 ? 'T00:00:00' : ''));
  const end = new Date(event.end + (event.end.length === 10 ? 'T00:00:00' : ''));
  const cursor = new Date(start);
  let guard = 0;
  while (cursor < end && guard < 366) {
    keys.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  if (keys.length === 0) keys.push(dateKey(start));
  return keys;
}

function choreDateKey(chore: GCalChore): string | null {
  if (!chore.dueDate) return null;
  return dateKey(new Date(chore.dueDate));
}

export interface DaySummary {
  key: string; // YYYY-MM-DD
  events: GCalEvent[];
  chores: GCalChore[];
  busyHours: number;
  busyLevel: BusyLevel;
}

export function summarizeByDay(
  events: GCalEvent[],
  chores: GCalChore[]
): Map<string, DaySummary> {
  const map = new Map<string, DaySummary>();

  const ensure = (key: string): DaySummary => {
    let entry = map.get(key);
    if (!entry) {
      entry = { key, events: [], chores: [], busyHours: 0, busyLevel: 'low' };
      map.set(key, entry);
    }
    return entry;
  };

  for (const event of events) {
    const keys = eventDateKeys(event);
    for (const key of keys) {
      const entry = ensure(key);
      entry.events.push(event);
      if (!event.allDay) {
        entry.busyHours += hoursBetween(event.start, event.end);
      }
    }
  }

  for (const chore of chores) {
    if (chore.isCompleted) continue;
    const key = choreDateKey(chore);
    if (!key) continue;
    const entry = ensure(key);
    entry.chores.push(chore);
    entry.busyHours += (chore.estimatedMinutes ?? 0) / 60;
  }

  for (const entry of map.values()) {
    entry.busyLevel = busyLevelFromHours(entry.busyHours);
  }

  return map;
}

interface UseGoogleCalendarDataOptions {
  daysForward?: number;
  daysBack?: number;
}

const AUTO_REFRESH_MS = 6 * 60 * 60 * 1000; // 6 hours

export function useGoogleCalendarData(options: UseGoogleCalendarDataOptions = {}) {
  const { daysForward = 180, daysBack = 35 } = options;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<CalendarFetchResult | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  // Reads the background-synced snapshot from google_calendar_cache.
  // Falls back to any household member's cache if the current user has none
  // (e.g. Adam viewing Kaylee's calendar data).
  const fetchFromCache = useCallback(async (): Promise<boolean> => {
    if (!hasSupabase || !supabase) return false;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return false;

    // First try the current user's own cache
    const { data: ownCache } = await supabase
      .from('google_calendar_cache')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // Fall back to any household member's cache (Adam sees Kaylee's calendar)
    let cacheRow = ownCache;
    if (!cacheRow) {
      const { data: householdCache } = await supabase
        .from('google_calendar_cache')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      cacheRow = householdCache;
    }

    if (!cacheRow) return false;
    if (cacheRow.sync_status === 'never') return false;

    setData({
      connected: true,
      googleEmail: cacheRow.google_email,
      calendars: cacheRow.calendars ?? [],
      events: cacheRow.events ?? [],
      chores: cacheRow.chores ?? [],
      error: cacheRow.sync_status === 'error' ? cacheRow.sync_error : null,
    });
    setSyncedAt(cacheRow.synced_at);
    return true;
  }, []);

  const fetchLive = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      if (!hasSupabase || !supabase) {
        setData({ connected: false, events: [], chores: [], error: "Supabase isn't configured" });
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          setData({ connected: false, events: [], chores: [] });
          return;
        }

        const params = new URLSearchParams({
          days: String(daysForward),
          daysBack: String(daysBack),
        });

        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-events?${params.toString()}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const json: CalendarFetchResult = await resp.json();
        setData(json);
        setSyncedAt(new Date().toISOString());
      } catch (err) {
        console.error('Failed to fetch Google Calendar data:', err);
        setData({ connected: false, events: [], chores: [], error: "Couldn't load calendar" });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [daysForward, daysBack]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const hadCache = await fetchFromCache();
      if (!cancelled && !hadCache) {
        await fetchLive(false);
      } else if (!cancelled) {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_calendar') === 'connected') {
      fetchLive(false);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [fetchLive]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchFromCache();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchFromCache]);

  const connect = useCallback(async () => {
    if (!hasSupabase || !supabase) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return;

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-auth`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const { url } = await resp.json();
      if (url) window.location.href = url;
    } catch (err) {
      console.error('Failed to start Google Calendar connection:', err);
    }
  }, []);

  const daySummaries = data ? summarizeByDay(data.events, data.chores) : new Map<string, DaySummary>();

  return {
    loading,
    refreshing,
    data,
    daySummaries,
    syncedAt,
    refresh: () => fetchLive(true),
    connect,
    dateKeyOf: dateKey,
  };
}
