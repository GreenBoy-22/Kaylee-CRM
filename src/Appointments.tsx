// src/Appointments.tsx
//
// Annual appointment tracker for Kaylee, Adam, and Jules — physicals, eye
// exams, dermatologist, dental cleanings, OBGYN, and vet visits. Each
// category resets on its own 365-day cycle once its target visit count
// is met. Can auto-fill from Google Calendar (Kaylee's and Adam's named
// calendars, plus a broader search for Jules' vet visits).

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import {
  Stethoscope, Eye, Sparkles, Smile, HeartPulse, Dog,
  MapPin, RefreshCw, Plus, Trash2, Calendar, CheckCircle2, Clock, AlertTriangle, X,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────

type Person = 'kaylee' | 'adam' | 'jules';
type VisitStatus = 'scheduled' | 'completed';

interface Visit {
  date: string;
  status: VisitStatus;
  google_event_id?: string | null;
  google_event_summary?: string | null;
  source?: 'manual' | 'google';
  location?: string | null;
  provider_name?: string | null;
  notes?: string | null;
}

interface HistoryCycle {
  cycle_start: string;
  due_date: string;
  visits: Visit[];
}

interface AppointmentRow {
  id: string;
  person: Person;
  category: string;
  label: string;
  target_count: number;
  cycle_start_date: string;
  due_date: string;
  location: string | null;
  provider_name: string | null;
  notes: string | null;
  visits: Visit[];
  history: HistoryCycle[];
  created_at: string;
  updated_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────

const PEOPLE: { key: Person; label: string; color: string; bg: string; emoji: string }[] = [
  { key: 'kaylee', label: 'Kaylee', color: '#8b5cf6', bg: '#ede9fe', emoji: '👩' },
  { key: 'adam',   label: 'Adam',   color: '#0891b2', bg: '#e0f2fe', emoji: '👨' },
  { key: 'jules',  label: 'Jules',  color: '#d97706', bg: '#fef3c7', emoji: '🐩' },
];

const CATEGORY_ICON: Record<string, any> = {
  physical: Stethoscope,
  eye: Eye,
  dermatology: Sparkles,
  dental: Smile,
  obgyn: HeartPulse,
  vet_wellness: Dog,
  vet_dental: Smile,
  vet_vaccines: HeartPulse,
};

function pad(n: number) { return String(n).padStart(2, '0'); }
function toKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toKey(d);
}
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function daysUntil(iso: string) {
  const today = new Date(toKey(new Date()) + 'T00:00:00');
  const target = new Date(iso + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

type Status = 'completed' | 'scheduled' | 'overdue' | 'needed';

function getStatus(row: AppointmentRow): Status {
  const completedCount = row.visits.filter(v => v.status === 'completed').length;
  if (completedCount >= row.target_count) return 'completed';
  const hasScheduled = row.visits.some(v => v.status === 'scheduled');
  if (hasScheduled) return 'scheduled';
  if (daysUntil(row.due_date) < 0) return 'overdue';
  return 'needed';
}

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string; icon: any }> = {
  completed: { label: 'Done for this cycle', color: '#16a34a', bg: '#dcfce7', icon: CheckCircle2 },
  scheduled: { label: 'Scheduled',           color: '#0ea5e9', bg: '#e0f2fe', icon: Clock },
  overdue:   { label: 'Overdue',             color: '#dc2626', bg: '#fee2e2', icon: AlertTriangle },
  needed:    { label: 'Needed this year',    color: '#71717a', bg: '#f4f4f5', icon: Calendar },
};

// A lot of these (dermatologist, dentist, OBGYN, etc.) need to be booked
// months out, so it's not enough to know the current cycle is covered —
// we also want to see something already on the books within 45 days
// either side of the cycle's due date, so the next renewal doesn't sneak
// up with no appointment booked.
const NEXT_APPT_WINDOW_DAYS = 45;

function findNextAppointment(row: AppointmentRow): Visit | null {
  const windowStart = addDays(row.due_date, -NEXT_APPT_WINDOW_DAYS);
  const windowEnd = addDays(row.due_date, NEXT_APPT_WINDOW_DAYS);
  const candidates = row.visits.filter(v => v.date >= windowStart && v.date <= windowEnd);
  if (candidates.length === 0) return null;
  // Prefer the one closest to (or latest before/after) the due date.
  return candidates.sort((a, b) => b.date.localeCompare(a.date))[0];
}

// ── Main Component ───────────────────────────────────────────────────────

export default function Appointments() {
  const [activePerson, setActivePerson] = useState<Person>('kaylee');
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddVisit, setShowAddVisit] = useState<string | null>(null);
  const [visitDate, setVisitDate] = useState(toKey(new Date()));
  const [visitStatus, setVisitStatus] = useState<VisitStatus>('completed');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newTargetCount, setNewTargetCount] = useState(1);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.from('appointment_tracker').select('*').order('label', { ascending: true });
    setRows((data as AppointmentRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const personInfo = PEOPLE.find(p => p.key === activePerson)!;
  const personRows = rows.filter(r => r.person === activePerson);

  const countsByPerson = (p: Person) => {
    const prows = rows.filter(r => r.person === p);
    const needsAttention = prows.filter(r => {
      const s = getStatus(r);
      return s === 'needed' || s === 'overdue';
    }).length;
    return { total: prows.length, needsAttention };
  };

  async function scanCalendar() {
    if (!supabase) return;
    setScanning(true);
    setScanMsg('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setScanning(false); return; }
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      });
      const data = await resp.json();
      setScanMsg(data.error ? `⚠️ ${data.error}` : `✅ ${data.message}`);
      await load();
    } catch {
      setScanMsg('Error scanning calendar. Try again.');
    }
    setScanning(false);
  }

  async function updateRow(id: string, updates: Partial<AppointmentRow>) {
    if (!supabase) return;
    await supabase.from('appointment_tracker').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    await load();
  }

  async function addVisit(row: AppointmentRow) {
    const visit: Visit = { date: visitDate, status: visitStatus, source: 'manual' };
    await updateRow(row.id, { visits: [...row.visits, visit] });
    setShowAddVisit(null);
    setVisitDate(toKey(new Date()));
    setVisitStatus('completed');
  }

  async function deleteVisit(row: AppointmentRow, index: number) {
    const updated = row.visits.filter((_, i) => i !== index);
    await updateRow(row.id, { visits: updated });
  }

  async function startNewCycle(row: AppointmentRow) {
    if (!supabase || !confirm(`Start a new 365-day cycle for ${row.label}? This archives the current visits into history.`)) return;
    const today = toKey(new Date());
    const newHistory = [...row.history, { cycle_start: row.cycle_start_date, due_date: row.due_date, visits: row.visits }];
    await updateRow(row.id, {
      cycle_start_date: today,
      due_date: addDays(today, 365),
      visits: [],
      history: newHistory,
    });
  }

  async function deleteCategory(id: string) {
    if (!supabase || !confirm('Delete this appointment type? This cannot be undone.')) return;
    await supabase.from('appointment_tracker').delete().eq('id', id);
    await load();
  }

  async function addCategory() {
    if (!supabase || !newLabel.trim()) return;
    const category = newLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    await supabase.from('appointment_tracker').insert({
      person: activePerson,
      category: category || `custom_${Date.now()}`,
      label: newLabel.trim(),
      target_count: newTargetCount,
    });
    setNewLabel('');
    setNewTargetCount(1);
    setShowAddCategory(false);
    await load();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Appointments</h1>
          <p>Annual health appointments for Kaylee, Adam, and Jules — resets every 365 days</p>
        </div>
        <button className="btn ghost" onClick={scanCalendar} disabled={scanning} style={{ color: '#059669', borderColor: '#059669' }}>
          {scanning ? <RefreshCw size={15} className="spin" /> : <Calendar size={15} />}
          {scanning ? 'Scanning…' : 'Scan Calendar'}
        </button>
      </div>

      {scanMsg && (
        <section className="panel" style={{ borderLeft: '3px solid #059669', fontSize: 13, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{scanMsg}</span>
            <button onClick={() => setScanMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={14} /></button>
          </div>
        </section>
      )}

      {/* Person Toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {PEOPLE.map(p => {
          const counts = countsByPerson(p.key);
          return (
            <button
              key={p.key}
              onClick={() => setActivePerson(p.key)}
              style={{
                flex: 1, padding: '10px 16px', borderRadius: 10,
                border: `2px solid ${activePerson === p.key ? p.color : 'var(--border)'}`,
                background: activePerson === p.key ? p.bg : 'transparent',
                color: activePerson === p.key ? p.color : 'var(--muted)',
                fontWeight: activePerson === p.key ? 700 : 400,
                cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 18 }}>{p.emoji}</span>
              {p.label}
              {counts.needsAttention > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, background: '#dc2626', color: '#fff', borderRadius: 999, padding: '1px 7px' }}>
                  {counts.needsAttention}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading && (
        <section className="panel">
          <div style={{ display: 'flex', gap: 8, color: 'var(--muted)' }}><RefreshCw size={14} className="spin" /> Loading appointments…</div>
        </section>
      )}

      {!loading && personRows.length === 0 && (
        <section className="panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <Calendar size={40} style={{ color: 'var(--muted)', opacity: 0.4, marginBottom: 12 }} />
          <h3 style={{ margin: '0 0 8px', color: 'var(--muted)' }}>No appointment types yet</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>Add one below to start tracking.</p>
        </section>
      )}

      {!loading && personRows.map(row => {
        const status = getStatus(row);
        const sc = STATUS_CONFIG[status];
        const StatusIcon = sc.icon;
        const Icon = CATEGORY_ICON[row.category] ?? Calendar;
        const isExpanded = expandedId === row.id;
        const completedCount = row.visits.filter(v => v.status === 'completed').length;
        const remaining = Math.max(0, row.target_count - completedCount);
        const dLeft = daysUntil(row.due_date);
        const nextAppt = findNextAppointment(row);

        return (
          <section key={row.id} className="panel" style={{ borderLeft: `3px solid ${sc.color}`, padding: 0, overflow: 'hidden', marginBottom: 10 }}>
            <div
              style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}
              onClick={() => setExpandedId(isExpanded ? null : row.id)}
            >
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `${sc.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={17} style={{ color: sc.color }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: 15 }}>{row.label}</h3>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: sc.bg, color: sc.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <StatusIcon size={10} /> {sc.label}
                  </span>
                  {row.target_count > 1 && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{completedCount} of {row.target_count} done this year</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>Due {fmtDate(row.due_date)}{status !== 'completed' ? (dLeft >= 0 ? ` (${dLeft} days)` : ` (${Math.abs(dLeft)} days overdue)`) : ''}</span>
                  {row.location && <span><MapPin size={10} style={{ marginRight: 2 }} />{row.location}</span>}
                </div>
              </div>

              {/* Next-cycle appointment booked? — a lot of these need to be
                  scheduled months out, so this flags whether something is
                  already on the books within 45 days of the renewal date. */}
              <div
                style={{
                  flexShrink: 0, width: 132, textAlign: 'center', borderRadius: 8, padding: '6px 8px',
                  background: nextAppt ? '#dcfce7' : '#fff7ed',
                  border: `1px solid ${nextAppt ? '#16a34a' : '#f97316'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: nextAppt ? '#16a34a' : '#f97316' }}>
                  {nextAppt ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                  {nextAppt ? 'NEXT ONE BOOKED' : 'NOT BOOKED YET'}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2, color: nextAppt ? '#16a34a' : '#f97316' }}>
                  {nextAppt ? fmtDate(nextAppt.date) : `Book by ${fmtDate(addDays(row.due_date, NEXT_APPT_WINDOW_DAYS))}`}
                </div>
              </div>

              <button onClick={e => { e.stopPropagation(); deleteCategory(row.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, flexShrink: 0 }} title="Delete this appointment type">
                <Trash2 size={13} />
              </button>
            </div>

            {isExpanded && (
              <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                {/* Location / provider */}
                <div className="form-grid" style={{ margin: '14px 0' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                    Location / Practice
                    <input
                      type="text"
                      defaultValue={row.location ?? ''}
                      onBlur={e => { if (e.target.value !== (row.location ?? '')) updateRow(row.id, { location: e.target.value || null }); }}
                      placeholder="e.g. Northside Dermatology"
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                    Provider / Phone
                    <input
                      type="text"
                      defaultValue={row.provider_name ?? ''}
                      onBlur={e => { if (e.target.value !== (row.provider_name ?? '')) updateRow(row.id, { provider_name: e.target.value || null }); }}
                      placeholder="e.g. Dr. Smith — (555) 123-4567"
                    />
                  </label>
                </div>

                {/* Visits */}
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
                  {row.target_count > 1 ? `VISITS (${remaining} still needed this year)` : 'VISIT'}
                </div>
                {row.visits.length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>No visits logged yet for this cycle.</div>
                )}
                {row.visits.map((v, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 8, marginBottom: 6 }}>
                    {v.status === 'completed' ? <CheckCircle2 size={14} style={{ color: '#16a34a', flexShrink: 0 }} /> : <Clock size={14} style={{ color: '#0ea5e9', flexShrink: 0 }} />}
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(v.date)}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>{v.status}</span>
                    {v.source === 'google' && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#0ea5e9', background: '#e0f2fe', padding: '1px 6px', borderRadius: 999 }}>
                        📅 {v.google_event_summary ?? 'From Calendar'}
                      </span>
                    )}
                    <button onClick={() => deleteVisit(row, i)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 2 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}

                {showAddVisit === row.id ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
                      Date
                      <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
                      Status
                      <select value={visitStatus} onChange={e => setVisitStatus(e.target.value as VisitStatus)}>
                        <option value="completed">Completed</option>
                        <option value="scheduled">Scheduled (upcoming)</option>
                      </select>
                    </label>
                    <button className="btn primary" onClick={() => addVisit(row)}>Save Visit</button>
                    <button className="btn ghost" onClick={() => setShowAddVisit(null)}>Cancel</button>
                  </div>
                ) : (
                  <button className="btn ghost" onClick={() => setShowAddVisit(row.id)} style={{ marginTop: 4 }}>
                    <Plus size={13} /> Log a Visit
                  </button>
                )}

                {/* Cycle reset */}
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Current cycle: {fmtDate(row.cycle_start_date)} → {fmtDate(row.due_date)}
                    {row.history.length > 0 ? ` · ${row.history.length} past cycle${row.history.length !== 1 ? 's' : ''}` : ''}
                  </span>
                  {status === 'completed' && (
                    <button className="btn ghost" onClick={() => startNewCycle(row)} style={{ fontSize: 12 }}>
                      Start Next Year's Cycle Now
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        );
      })}

      {/* Add custom appointment type */}
      {showAddCategory ? (
        <section className="panel" style={{ borderLeft: `3px solid ${personInfo.color}` }}>
          <div className="form-grid">
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Appointment name
              <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Chiropractor" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Times needed per year
              <input type="number" min={1} max={12} value={newTargetCount} onChange={e => setNewTargetCount(Number(e.target.value) || 1)} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn primary" onClick={addCategory} disabled={!newLabel.trim()}>
              <Plus size={13} /> Add for {personInfo.label}
            </button>
            <button className="btn ghost" onClick={() => { setShowAddCategory(false); setNewLabel(''); setNewTargetCount(1); }}>Cancel</button>
          </div>
        </section>
      ) : (
        <button className="btn ghost" onClick={() => setShowAddCategory(true)}>
          <Plus size={14} /> Add Appointment Type for {personInfo.label}
        </button>
      )}
    </>
  );
}
