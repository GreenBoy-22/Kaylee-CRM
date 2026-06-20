// src/components/GoogleCalendarPanel.tsx
//
// Home-dashboard panel showing upcoming Google Calendar events.
// Mirrors the visual conventions of the "Today's Scheduled Calls" panel
// and CompactTaskRow styling already used elsewhere in the Hub.

import { useEffect, useState, useCallback } from "react";
import { Calendar, ExternalLink, RefreshCw, AlertCircle } from "lucide-react";
import { supabase, hasSupabase } from "./lib/supabase";

interface GCalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  htmlLink: string;
}

interface EventsResponse {
  connected: boolean;
  needsReconnect?: boolean;
  googleEmail?: string;
  events: GCalEvent[];
  error?: string;
}

function formatEventTime(event: GCalEvent): string {
  if (event.allDay) {
    return new Date(event.start).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
  const start = new Date(event.start);
  const today = new Date();
  const isToday = start.toDateString() === today.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const isTomorrow = start.toDateString() === tomorrow.toDateString();

  const time = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isToday) return `Today, ${time}`;
  if (isTomorrow) return `Tomorrow, ${time}`;
  return start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }) + `, ${time}`;
}

export default function GoogleCalendarPanel() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EventsResponse | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEvents = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    if (!hasSupabase || !supabase) {
      setData({ connected: false, events: [], error: "Supabase isn't configured" });
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setData({ connected: false, events: [] });
        return;
      }

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-events`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const json: EventsResponse = await resp.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch Google Calendar events:", err);
      setData({ connected: false, events: [], error: "Couldn't load calendar" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // After redirect back from Google, the URL has ?google_calendar=connected
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_calendar") === "connected") {
      fetchEvents();
      // Clean the URL so refresh doesn't re-trigger this.
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [fetchEvents]);

  const handleConnect = async () => {
    if (!hasSupabase || !supabase) return;
    setConnecting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return;

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-auth`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const { url } = await resp.json();
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      console.error("Failed to start Google Calendar connection:", err);
      setConnecting(false);
    }
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-neutral-500" />
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Upcoming on Google Calendar
          </h3>
        </div>
        {data?.connected && (
          <button
            onClick={() => fetchEvents(true)}
            disabled={refreshing}
            className="text-neutral-400 hover:text-neutral-600 disabled:opacity-50 dark:hover:text-neutral-300"
            aria-label="Refresh calendar events"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      <div className="p-4">
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800"
              />
            ))}
          </div>
        )}

        {!loading && data && !data.connected && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Calendar className="h-8 w-8 text-neutral-300 dark:text-neutral-700" />
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {data.needsReconnect
                ? "Your Google Calendar connection expired. Reconnect to keep seeing events here."
                : "Connect Google Calendar to see upcoming events on your dashboard."}
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
            >
              {connecting ? "Connecting…" : "Connect Google Calendar"}
            </button>
          </div>
        )}

        {!loading && data?.connected && data.events.length === 0 && (
          <p className="py-6 text-center text-sm text-neutral-400">
            No events in the next 14 days.
          </p>
        )}

        {!loading && data?.connected && data.events.length > 0 && (
          <ul className="space-y-1">
            {data.events.map((event) => (
              <li key={event.id}>
                <a
                  href={event.htmlLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between rounded-lg px-2 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">
                      {event.title}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {formatEventTime(event)}
                      {event.location ? ` · ${event.location}` : ""}
                    </p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-neutral-300 opacity-0 group-hover:opacity-100" />
                </a>
              </li>
            ))}
          </ul>
        )}

        {!loading && data?.error && (
          <div className="mt-2 flex items-center gap-2 text-xs text-amber-600">
            <AlertCircle className="h-3.5 w-3.5" />
            {data.error}
          </div>
        )}
      </div>
    </div>
  );
}
