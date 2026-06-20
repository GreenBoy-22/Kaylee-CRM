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

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
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
 * Groups events by the local calendar date they fall on (using each event's
 * own start date, not UTC slicing, so day boundaries feel right to the user).
 */
function eventDateKey(event: GCalEvent): string {
  const d = new Date(event.start);
  return dateKey(d);
}

function choreDateKey(chore: GCalChore): string | null {
  if (!chore.dueDate) return null;
  return new Date(chore.dueDate).toISOString().slice(0, 10);
}

export interface DaySummary {
  key: string; // YYYY-MM-DD
  events: GCalEvent[];
  chores: GCalChore[];
  busyHours: number;
  busyLevel: BusyLevel;
}

/**
 * Builds a map of date-key -> DaySummary for every day that has at least
 * one event or chore in the provided data.
 */
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
    const key = eventDateKey(event);
    const entry = ensure(key);
    entry.events.push(event);
    // All-day events are reminders, not scheduled time - excluded from busy math.
    if (!event.allDay) {
      entry.busyHours += hoursBetween(event.start, event.end);
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

const AUTO_REFRESH_MS = 6 * 60 * 60 * 1000; // 6 hours - matches the 4x/day background sync

export function useGoogleCalendarData(options: UseGoogleCalendarDataOptions = {}) {
  const { daysForward = 60, daysBack = 14 } = options;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<CalendarFetchResult | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  // Reads the background-synced snapshot from google_calendar_cache.
  // This is fast (no live Google API call) and reflects whatever the
  // 4x/day cron sync last fetched.
  const fetchFromCache = useCallback(async (): Promise<boolean> => {
    if (!hasSupabase || !supabase) return false;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return false;

    const { data: cacheRow, error } = await supabase
      .from('google_calendar_cache')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !cacheRow) return false;

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

  // Live fetch via the edge function - used as a fallback when there's no
  // cache yet (first-ever connect, before the cron has run) and as the
  // explicit manual "refresh" action so the button always feels responsive.
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

  // Initial load: try the cache first (fast), fall back to a live fetch if
  // nothing's been synced yet.
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
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_calendar') === 'connected') {
      fetchLive(false);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [fetchLive]);

  // Auto-refresh every 6 hours while the tab is open, matching the
  // background sync cadence (4x/day) so an open tab never drifts far
  // from what's been cached.
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
    refresh: () => fetchLive(true), // manual refresh button forces a live Google fetch
    connect,
    dateKeyOf: dateKey,
  };
}
