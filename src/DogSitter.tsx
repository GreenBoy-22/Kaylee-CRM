import { useState, useEffect, useMemo } from 'react';
import { PawPrint, Calendar, MapPin, Clock, Send, RefreshCw, Check, X } from 'lucide-react';
import { supabase } from './lib/supabase';

const ARMY_GREEN = '#4B5320';
const ORANGE = '#ffad46';

interface CoverageEvent {
  id: string;
  calendar_event_id: string;
  event_title: string;
  event_start: string;
  event_end: string;
  all_day: boolean;
  location: string | null;
  status: string;
  sitter_name: string | null;
  sitter_phone: string | null;
}

interface GCalEvent {
  id: string;
  start: string;
  end: string;
  title: string;
  allDay: boolean;
  location: string | null;
  calendarName: string;
}

function fmtRange(startIso: string, endIso: string, allDay: boolean): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateOpts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
  if (allDay) return start.toLocaleDateString('en-US', dateOpts);
  const timeOpts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  return `${start.toLocaleDateString('en-US', dateOpts)}, ${start.toLocaleTimeString('en-US', timeOpts)} \u2013 ${end.toLocaleTimeString('en-US', timeOpts)}`;
}

function durationLabel(startIso: string, endIso: string, allDay: boolean): string {
  if (allDay) return 'All day';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const hours = ms / 3600000;
  if (hours < 1) return `${Math.round(ms / 60000)} min`;
  if (hours % 1 === 0) return `${hours} hr${hours !== 1 ? 's' : ''}`;
  return `${hours.toFixed(1)} hrs`;
}

export default function DogSitter() {
  const [coverage, setCoverage] = useState<CoverageEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [requestingFor, setRequestingFor] = useState<CoverageEvent | null>(null);
  const [sitterName, setSitterName] = useState('');
  const [sitterPhone, setSitterPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [linkResult, setLinkResult] = useState<{ url: string; message: string } | null>(null);

  useEffect(() => {
    loadCoverage();
  }, []);

  async function loadCoverage() {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from('dog_sitter_coverage')
      .select('*')
      .order('event_start', { ascending: true });
    setCoverage((data as CoverageEvent[]) || []);
    setLoading(false);
  }

  async function scanCalendar() {
    if (!supabase) return;
    setScanning(true);
    setScanMessage('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData?.session?.user?.id;
      if (!uid) { setScanMessage('Could not confirm your login.'); setScanning(false); return; }

      const { data: cache } = await supabase
        .from('google_calendar_cache')
        .select('events')
        .eq('user_id', uid)
        .maybeSingle();

      const events: GCalEvent[] = (cache?.events as GCalEvent[]) || [];
      const now = new Date();
      const sixMonthsOut = new Date();
      sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);

      const qualifying = events.filter((e) => {
        if (e.calendarName !== 'Places To Be/To Do' && e.calendarName !== 'Vacation') return false;
        // Events like "Watch Maple & Leela" or "Watch Sean's Doggos" are the
        // reverse direction — Kaylee/Adam are the ones pet-sitting, so Jules
        // doesn't need separate coverage for those.
        if (/^watch\s/i.test(e.title.trim())) return false;
        const start = new Date(e.start);
        return start >= now && start <= sixMonthsOut;
      });

      if (qualifying.length === 0) {
        setScanMessage('No events found in "Places To Be/To Do" over the next 6 months.');
        setScanning(false);
        return;
      }

      const rows = qualifying.map((e) => ({
        user_id: uid,
        calendar_event_id: e.id,
        event_title: e.title,
        event_start: e.allDay ? `${e.start}T00:00:00` : e.start,
        event_end: e.allDay ? `${e.end}T23:59:59` : e.end,
        all_day: e.allDay,
        location: e.location || null,
      }));

      const { error } = await supabase
        .from('dog_sitter_coverage')
        .upsert(rows, { onConflict: 'user_id,calendar_event_id', ignoreDuplicates: true });

      if (error) { setScanMessage(`Scan failed: ${error.message}`); setScanning(false); return; }

      setScanMessage(`Found ${qualifying.length} event${qualifying.length !== 1 ? 's' : ''} \u2014 new ones were added below.`);
      await loadCoverage();
    } catch {
      setScanMessage('Something went wrong pulling your calendar.');
    }
    setScanning(false);
  }

  function openRequestForm(event: CoverageEvent) {
    setRequestingFor(event);
    setSitterName('');
    setSitterPhone('');
    setLinkResult(null);
  }

  async function sendRequest() {
    if (!supabase || !requestingFor || !sitterName.trim()) return;
    setSending(true);
    const { data: reqRow, error } = await supabase
      .from('dog_sitter_requests')
      .insert({ coverage_id: requestingFor.id, sitter_name: sitterName.trim(), sitter_phone: sitterPhone.trim() || null })
      .select()
      .single();
    if (error || !reqRow) { setSending(false); return; }

    await supabase.from('dog_sitter_coverage').update({ status: 'requested', sitter_name: sitterName.trim(), sitter_phone: sitterPhone.trim() || null }).eq('id', requestingFor.id);

    const url = `https://kaylee-crm.vercel.app/sit/${reqRow.id}`;
    const range = fmtRange(requestingFor.event_start, requestingFor.event_end, requestingFor.all_day);
    const duration = durationLabel(requestingFor.event_start, requestingFor.event_end, requestingFor.all_day);
    const message = `Hi ${sitterName.trim()}! Would you be able to watch Jules on ${range} (${duration})? Tap here to let us know: ${url}`;
    setLinkResult({ url, message });
    setSending(false);
    setCoverage((cur) => cur.map((c) => (c.id === requestingFor.id ? { ...c, status: 'requested', sitter_name: sitterName.trim(), sitter_phone: sitterPhone.trim() || null } : c)));
  }

  const needsCoverage = useMemo(() => coverage.filter((c) => c.status === 'needs_coverage' || c.status === 'requested' || c.status === 'declined'), [coverage]);
  const covered = useMemo(() => coverage.filter((c) => c.status === 'covered'), [coverage]);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ color: ARMY_GREEN, fontSize: '1.5rem', margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <PawPrint size={22} /> Jules Coverage
          </h1>
          <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>
            Pulls anything on "Places To Be/To Do" or "Vacation" over the next 6 months (skipping times you're already the one pet-sitting for someone else), so nothing slips through without a sitter lined up for Jules.
          </p>
        </div>
        <button
          onClick={scanCalendar}
          disabled={scanning}
          style={{ background: ARMY_GREEN, color: 'white', border: 'none', borderRadius: 8, padding: '0.55rem 1rem', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
        >
          <RefreshCw size={14} /> {scanning ? 'Scanning...' : 'Scan Calendar'}
        </button>
      </div>

      {scanMessage && <p style={{ fontSize: '0.85rem', color: ARMY_GREEN, marginTop: 10 }}>{scanMessage}</p>}

      {loading && <p style={{ marginTop: 20 }}>Loading...</p>}

      {!loading && (
        <>
          <h2 style={{ fontSize: '1rem', color: ARMY_GREEN, marginTop: '1.5rem', marginBottom: '0.75rem' }}>
            Needs attention ({needsCoverage.length})
          </h2>
          {needsCoverage.length === 0 && <p style={{ color: '#999', fontSize: '0.9rem' }}>Nothing pending \u2014 either fully covered or nothing scanned yet.</p>}
          {needsCoverage.map((event) => (
            <div key={event.id} style={{ border: '1px solid #eee', borderLeft: `4px solid ${event.status === 'declined' ? '#c0392b' : ORANGE}`, borderRadius: 8, padding: '0.9rem 1rem', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong style={{ fontSize: '0.95rem' }}>{event.event_title}</strong>
                  <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#666', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Calendar size={12} /> {fmtRange(event.event_start, event.event_end, event.all_day)}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#666', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Clock size={12} /> {durationLabel(event.event_start, event.event_end, event.all_day)}
                    {event.location && <><MapPin size={12} style={{ marginLeft: 8 }} /> {event.location}</>}
                  </p>
                  {event.status === 'requested' && (
                    <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#a66' }}>Waiting to hear back from {event.sitter_name}</p>
                  )}
                  {event.status === 'declined' && (
                    <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#c0392b' }}>{event.sitter_name} said they can't \u2014 needs a new sitter</p>
                  )}
                </div>
                <button
                  onClick={() => openRequestForm(event)}
                  style={{ background: 'white', border: `1px solid ${ARMY_GREEN}`, color: ARMY_GREEN, borderRadius: 6, padding: '0.4rem 0.8rem', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {event.status === 'needs_coverage' ? 'Ask a Sitter' : 'Ask Someone Else'}
                </button>
              </div>
            </div>
          ))}

          {covered.length > 0 && (
            <>
              <h2 style={{ fontSize: '1rem', color: ARMY_GREEN, marginTop: '1.75rem', marginBottom: '0.75rem' }}>
                Covered ({covered.length})
              </h2>
              {covered.map((event) => (
                <div key={event.id} style={{ border: '1px solid #eee', borderLeft: `4px solid #6b9c5e`, borderRadius: 8, padding: '0.8rem 1rem', marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ fontSize: '0.9rem' }}>{event.event_title}</strong>
                    <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#666' }}>{fmtRange(event.event_start, event.event_end, event.all_day)}</p>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#6b9c5e', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={14} /> {event.sitter_name}</span>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {requestingFor && (
        <div onClick={() => setRequestingFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1.5rem' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 12, maxWidth: 440, width: '100%', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h2 style={{ margin: '0 0 0.5rem', color: ARMY_GREEN, fontSize: '1.1rem' }}>Ask a Sitter</h2>
              <button onClick={() => setRequestingFor(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 1rem' }}>
              {requestingFor.event_title} \u2014 {fmtRange(requestingFor.event_start, requestingFor.event_end, requestingFor.all_day)}
            </p>

            {!linkResult ? (
              <>
                <input
                  placeholder="Sitter's name"
                  value={sitterName}
                  onChange={(e) => setSitterName(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box', marginBottom: 8, fontSize: '0.95rem' }}
                />
                <input
                  placeholder="Phone number (optional)"
                  value={sitterPhone}
                  onChange={(e) => setSitterPhone(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box', marginBottom: 12, fontSize: '0.95rem' }}
                />
                <button
                  onClick={sendRequest}
                  disabled={sending || !sitterName.trim()}
                  style={{ width: '100%', background: ARMY_GREEN, color: 'white', border: 'none', borderRadius: 8, padding: '0.7rem', fontSize: '0.95rem', cursor: 'pointer', opacity: sending || !sitterName.trim() ? 0.5 : 1 }}
                >
                  {sending ? 'Creating link...' : 'Generate Request Link'}
                </button>
              </>
            ) : (
              <>
                <textarea
                  readOnly
                  value={linkResult.message}
                  rows={4}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box', fontSize: '0.85rem', fontFamily: 'inherit', marginBottom: 10 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <a
                    href={`sms:?body=${encodeURIComponent(linkResult.message)}`}
                    style={{ flex: 1, textAlign: 'center', background: '#25D366', color: 'white', border: 'none', borderRadius: 8, padding: '0.65rem', fontSize: '0.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <Send size={14} /> Open in Messages
                  </a>
                  <button
                    onClick={() => navigator.clipboard.writeText(linkResult.message)}
                    style={{ flex: 1, background: 'white', border: `1px solid ${ARMY_GREEN}`, color: ARMY_GREEN, borderRadius: 8, padding: '0.65rem', fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    Copy text
                  </button>
                </div>
                <button onClick={() => setRequestingFor(null)} style={{ marginTop: 10, width: '100%', background: 'none', border: 'none', color: '#999', fontSize: '0.8rem', cursor: 'pointer' }}>Done</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
