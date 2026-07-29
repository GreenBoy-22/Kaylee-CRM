import { useState, useEffect } from 'react';
import { PawPrint, Calendar, Clock, MapPin } from 'lucide-react';
import { supabase } from './lib/supabase';

const ARMY_GREEN = '#4B5320';

interface RequestRow {
  id: string;
  coverage_id: string;
  sitter_name: string;
  status: string;
}

interface CoverageRow {
  id: string;
  event_title: string;
  event_start: string;
  event_end: string;
  all_day: boolean;
  location: string | null;
}

function fmtRange(startIso: string, endIso: string, allDay: boolean): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateOpts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
  if (allDay) return `${start.toLocaleDateString('en-US', dateOpts)} \u2013 ${end.toLocaleDateString('en-US', dateOpts)}`;
  const timeOpts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' };
  return `${start.toLocaleDateString('en-US', dateOpts)}, ${start.toLocaleTimeString('en-US', timeOpts)} \u2013 ${end.toLocaleTimeString('en-US', timeOpts)}`;
}

function durationLabel(startIso: string, endIso: string, allDay: boolean): string {
  if (allDay) return 'Multi-day';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const hours = ms / 3600000;
  if (hours < 1) return `${Math.round(ms / 60000)} minutes`;
  if (hours % 1 === 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  return `${hours.toFixed(1)} hours`;
}

export default function SitJules({ requestId }: { requestId: string }) {
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [coverage, setCoverage] = useState<CoverageRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [responded, setResponded] = useState<'accepted' | 'declined' | 'tentative' | null>(null);

  useEffect(() => {
    document.title = 'Can you dog sit for Jules? \ud83d\udc3e';
    load();
  }, []);

  async function load() {
    if (!supabase) { setLoading(false); setNotFound(true); return; }
    const { data: reqData } = await supabase.from('dog_sitter_requests').select('*').eq('id', requestId).maybeSingle();
    if (!reqData) { setNotFound(true); setLoading(false); return; }
    setRequest(reqData as RequestRow);
    const st = (reqData as RequestRow).status;
    if (st === 'accepted' || st === 'declined' || st === 'tentative') setResponded(st);
    const { data: covData } = await supabase.from('dog_sitter_coverage').select('*').eq('id', (reqData as RequestRow).coverage_id).maybeSingle();
    setCoverage(covData as CoverageRow);
    setLoading(false);
  }

  async function respond(status: 'accepted' | 'declined' | 'tentative') {
    if (!supabase || !request || !coverage) return;
    setSubmitting(true);
    const coverageStatus = status === 'accepted' ? 'covered' : status === 'tentative' ? 'tentative' : 'declined';
    await supabase.from('dog_sitter_requests').update({ status, responded_at: new Date().toISOString() }).eq('id', request.id);
    await supabase.from('dog_sitter_coverage').update({ status: coverageStatus }).eq('id', coverage.id);
    setResponded(status);
    setSubmitting(false);
  }

  const wrap: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#f4f5f0', padding: '1.5rem', fontFamily: 'system-ui, sans-serif',
  };
  const card: React.CSSProperties = {
    background: 'white', borderRadius: 16, overflow: 'hidden', maxWidth: 420, width: '100%',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center',
  };
  const julesPhoto = (
    <img
      src="/jules.jpg"
      alt="Jules"
      style={{ width: '100%', height: 240, objectFit: 'cover', objectPosition: 'center 15%', display: 'block' }}
    />
  );

  if (loading) return <div style={wrap}><p>Loading...</p></div>;

  if (notFound || !coverage || !request) {
    return (
      <div style={wrap}>
        <div style={{ ...card, padding: '2rem' }}>
          <PawPrint size={32} color={ARMY_GREEN} />
          <p style={{ marginTop: 12 }}>This link doesn't look right — double-check with Kaylee.</p>
        </div>
      </div>
    );
  }

  if (responded === 'accepted') {
    return (
      <div style={wrap}>
        <div style={card}>
          {julesPhoto}
          <div style={{ padding: '1.75rem' }}>
            <div style={{ fontSize: '2.2rem' }}>🐾</div>
            <h2 style={{ color: ARMY_GREEN, margin: '0.5rem 0' }}>Thanks, {request.sitter_name.split(' ')[0]}!</h2>
            <p style={{ color: '#666' }}>Jules is all set for {fmtRange(coverage.event_start, coverage.event_end, coverage.all_day)}. Kaylee's been notified you're covering it.</p>
          </div>
        </div>
      </div>
    );
  }

  if (responded === 'tentative') {
    return (
      <div style={wrap}>
        <div style={card}>
          {julesPhoto}
          <div style={{ padding: '1.75rem' }}>
            <div style={{ fontSize: '2.2rem' }}>🤔</div>
            <h2 style={{ color: ARMY_GREEN, margin: '0.5rem 0' }}>Got it, {request.sitter_name.split(' ')[0]}!</h2>
            <p style={{ color: '#666' }}>Kaylee knows it's a maybe for now — she'll likely follow up to confirm.</p>
          </div>
        </div>
      </div>
    );
  }

  if (responded === 'declined') {
    return (
      <div style={wrap}>
        <div style={{ ...card, padding: '2rem' }}>
          <PawPrint size={28} color="#999" />
          <p style={{ marginTop: 12, color: '#666' }}>No worries — Kaylee's been let know you can't make it this time.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={card}>
        {julesPhoto}
        <div style={{ padding: '1.75rem' }}>
          <p style={{ color: '#888', fontSize: '0.85rem', margin: '0 0 2px' }}>Hi {request.sitter_name.split(' ')[0]}!</p>
          <h1 style={{ color: ARMY_GREEN, fontSize: '1.4rem', margin: '0 0 1.25rem' }}>Can you dog sit? 🐶</h1>

          <div style={{ background: '#f4f5f0', borderRadius: 10, padding: '1rem', marginBottom: '1.25rem', textAlign: 'left' }}>
            <p style={{ margin: '0 0 6px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={14} /> {fmtRange(coverage.event_start, coverage.event_end, coverage.all_day)}
            </p>
            <p style={{ margin: '0 0 6px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={14} /> {durationLabel(coverage.event_start, coverage.event_end, coverage.all_day)}
            </p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#777', display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={14} /> {coverage.event_title}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => respond('accepted')}
              disabled={submitting}
              style={{ background: ARMY_GREEN, color: 'white', border: 'none', borderRadius: 8, padding: '0.75rem', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}
            >
              Yes, I can! 🐾
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => respond('tentative')}
                disabled={submitting}
                style={{ flex: 1, background: 'white', color: '#a67c00', border: '1px solid #e0c060', borderRadius: 8, padding: '0.65rem', fontSize: '0.88rem', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}
              >
                Maybe
              </button>
              <button
                onClick={() => respond('declined')}
                disabled={submitting}
                style={{ flex: 1, background: 'white', color: '#999', border: '1px solid #ccc', borderRadius: 8, padding: '0.65rem', fontSize: '0.88rem', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}
              >
                Can't this time
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
