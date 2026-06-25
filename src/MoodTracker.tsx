// src/MoodTracker.tsx
//
// Household Mood Log -- tracks bad days with severity, behaviors, and triggers.
// Severity: low (yellow), medium (orange), high (red)
// Calendar heatmap matches migraine tracker style.

import { useCallback, useEffect, useState, useMemo } from 'react';
import { supabase } from './lib/supabase';

// __ Types _______________________________________________________________

type Severity = 'low' | 'medium' | 'high';

interface MoodEntry {
  id: string;
  entry_date: string;
  severity: Severity;
  behaviors: string[];
  trigger_notes: string | null;
  additional_notes: string | null;
}

// __ Constants ___________________________________________________________

const SEVERITY_LABELS: Record<Severity, string> = {
  low:    'Low -- Grumpy / Cold',
  medium: 'Medium -- Yelling / Hostile',
  high:   'High -- Full Blowup',
};

const SEVERITY_COLORS: Record<Severity, string> = {
  low:    '#eab308',  // yellow
  medium: '#f97316',  // orange
  high:   '#ef4444',  // red
};

const SEVERITY_BG: Record<Severity, string> = {
  low:    '#fef9c3',
  medium: '#ffedd5',
  high:   '#fee2e2',
};

const BEHAVIOR_OPTIONS = [
  'Swearing',
  'Yelling',
  'Yelling at the top of his lungs',
  'Ranting / Lecturing',
  'Silent treatment / Ignoring everyone',
  'Slamming things',
  'Threatening',
  'Blaming others',
  'Storming out',
  'Crying / Emotional breakdown',
];

function pad(n: number) { return String(n).padStart(2, '0'); }
function toKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// __ Main Component ______________________________________________________

export default function MoodTracker() {
  const [tab, setTab] = useState<'log' | 'history' | 'calendar'>('log');
  const [entries, setEntries] = useState<MoodEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const today = toKey(new Date());
  const [date, setDate] = useState(today);
  const [severity, setSeverity] = useState<Severity>('low');
  const [behaviors, setBehaviors] = useState<string[]>([]);
  const [triggerNotes, setTriggerNotes] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Calendar state
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  // Selected entry for history detail
  const [selectedEntry, setSelectedEntry] = useState<MoodEntry | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from('mood_log')
      .select('*')
      .order('entry_date', { ascending: false });
    setEntries((data as MoodEntry[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Check if today already has an entry
  const todayEntry = entries.find(e => e.entry_date === today);

  function toggleBehavior(b: string) {
    setBehaviors(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]);
  }

  async function handleSave() {
    if (!supabase) return;
    setSaving(true);
    const payload = {
      entry_date: date,
      severity,
      behaviors,
      trigger_notes: triggerNotes.trim() || null,
      additional_notes: additionalNotes.trim() || null,
    };
    // Upsert by date
    const existing = entries.find(e => e.entry_date === date);
    if (existing) {
      await supabase.from('mood_log').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('mood_log').insert(payload);
    }
    await load();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setSaving(false);
    // Reset form
    setBehaviors([]);
    setTriggerNotes('');
    setAdditionalNotes('');
    setSeverity('low');
  }

  async function handleDelete(id: string) {
    if (!supabase || !confirm('Delete this entry?')) return;
    await supabase.from('mood_log').delete().eq('id', id);
    setSelectedEntry(null);
    await load();
  }

  // Build calendar data
  const entryMap = useMemo(() => {
    const m: Record<string, Severity> = {};
    for (const e of entries) m[e.entry_date] = e.severity;
    return m;
  }, [entries]);

  const calDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    return { firstDay, daysInMonth };
  }, [calYear, calMonth]);

  const monthName = new Date(calYear, calMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Stats
  const totalEntries = entries.length;
  const highCount  = entries.filter(e => e.severity === 'high').length;
  const medCount   = entries.filter(e => e.severity === 'medium').length;
  const lowCount   = entries.filter(e => e.severity === 'low').length;

  // Last 30 days
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentEntries = entries.filter(e => new Date(e.entry_date) >= thirtyDaysAgo);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Mood Log</h1>
          <p>Household behavior tracker -- severity, behaviors, and triggers</p>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Total logged', value: totalEntries, color: 'var(--text)', sub: 'all time' },
          { label: 'Low days', value: lowCount, color: SEVERITY_COLORS.low, sub: 'yellow' },
          { label: 'Medium days', value: medCount, color: SEVERITY_COLORS.medium, sub: 'orange' },
          { label: 'High days', value: highCount, color: SEVERITY_COLORS.high, sub: 'red' },
        ].map(s => (
          <section key={s.label} className="panel" style={{ textAlign: 'center', padding: '12px 8px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.sub}</div>
          </section>
        ))}
      </div>

      {/* Last 30 days mini-alert */}
      {recentEntries.length > 0 && (
        <div className="brief-item" style={{
          borderLeft: `4px solid ${recentEntries.filter(e => e.severity === 'high').length >= 3 ? SEVERITY_COLORS.high : SEVERITY_COLORS.medium}`,
          marginBottom: 12
        }}>
          <span style={{ fontSize: 13 }}>
            <strong>Last 30 days:</strong> {recentEntries.length} incident{recentEntries.length !== 1 ? 's' : ''} --
            {' '}{recentEntries.filter(e => e.severity === 'high').length} high,
            {' '}{recentEntries.filter(e => e.severity === 'medium').length} medium,
            {' '}{recentEntries.filter(e => e.severity === 'low').length} low
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        {(['log', 'history', 'calendar'] as const).map(t => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'log' ? 'Log Entry' : t === 'history' ? 'History' : 'Calendar'}
          </button>
        ))}
      </div>

      {/* LOG ENTRY TAB */}
      {tab === 'log' && (
        <section className="panel">
          {todayEntry && (
            <div className="brief-item" style={{ borderLeft: `4px solid ${SEVERITY_COLORS[todayEntry.severity]}`, marginBottom: 12 }}>
              <span style={{ fontSize: 13 }}>
                Today is already logged as <strong style={{ color: SEVERITY_COLORS[todayEntry.severity] }}>{todayEntry.severity.toUpperCase()}</strong>. Saving again will update it.
              </span>
            </div>
          )}

          {/* Date */}
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Date
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </label>
          </div>

          {/* Severity */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>Severity Level</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['low', 'medium', 'high'] as Severity[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSeverity(s)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: `2px solid ${severity === s ? SEVERITY_COLORS[s] : 'var(--border)'}`,
                    background: severity === s ? SEVERITY_BG[s] : 'transparent',
                    color: severity === s ? SEVERITY_COLORS[s] : 'var(--muted)',
                    fontWeight: severity === s ? 700 : 400,
                    cursor: 'pointer',
                    fontSize: 13,
                    transition: 'all 0.15s',
                  }}
                >
                  {SEVERITY_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Behaviors */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>Behaviors (check all that apply)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {BEHAVIOR_OPTIONS.map(b => (
                <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '6px 8px', borderRadius: 6, background: behaviors.includes(b) ? 'var(--purple-bg)' : 'transparent', border: `1px solid ${behaviors.includes(b) ? 'var(--purple)' : 'var(--border)'}` }}>
                  <input
                    type="checkbox"
                    checked={behaviors.includes(b)}
                    onChange={() => toggleBehavior(b)}
                    style={{ accentColor: 'var(--purple)' }}
                  />
                  {b}
                </label>
              ))}
            </div>
          </div>

          {/* What set him off */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
              What set him off this time?
              <textarea
                value={triggerNotes}
                onChange={e => setTriggerNotes(e.target.value)}
                placeholder="Describe what triggered the behavior..."
                style={{ minHeight: 80, fontFamily: 'inherit' }}
              />
            </label>
          </div>

          {/* Additional notes */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
              Additional notes
              <textarea
                value={additionalNotes}
                onChange={e => setAdditionalNotes(e.target.value)}
                placeholder="Anything else worth noting..."
                style={{ minHeight: 60, fontFamily: 'inherit' }}
              />
            </label>
          </div>

          <button className="btn primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Entry'}
          </button>
        </section>
      )}

      {/* HISTORY TAB */}
      {tab === 'history' && (
        <section className="panel">
          <div className="panel-head">
            <h2>All Entries</h2>
            <span className="readonly-pill">{entries.length} total</span>
          </div>
          {loading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading...</div>}
          {!loading && entries.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>No entries yet. Log an incident on the Log Entry tab.</div>
          )}
          {entries.map(e => (
            <div
              key={e.id}
              onClick={() => setSelectedEntry(selectedEntry?.id === e.id ? null : e)}
              style={{
                borderLeft: `4px solid ${SEVERITY_COLORS[e.severity]}`,
                padding: '10px 12px',
                marginBottom: 8,
                borderRadius: 8,
                background: selectedEntry?.id === e.id ? 'var(--surface-1)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{fmtDate(e.entry_date)}</span>
                  <span style={{
                    marginLeft: 10, fontSize: 11, fontWeight: 700,
                    color: SEVERITY_COLORS[e.severity],
                    background: SEVERITY_BG[e.severity],
                    padding: '2px 8px', borderRadius: 999,
                  }}>
                    {e.severity.toUpperCase()}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{e.behaviors.length} behavior{e.behaviors.length !== 1 ? 's' : ''}</span>
              </div>
              {e.trigger_notes && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Trigger: {e.trigger_notes.slice(0, 80)}{e.trigger_notes.length > 80 ? '...' : ''}
                </div>
              )}

              {/* Expanded detail */}
              {selectedEntry?.id === e.id && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  {e.behaviors.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>BEHAVIORS</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {e.behaviors.map(b => (
                          <span key={b} style={{ fontSize: 11, background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 999 }}>{b}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {e.trigger_notes && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>TRIGGER</div>
                      <div style={{ fontSize: 13 }}>{e.trigger_notes}</div>
                    </div>
                  )}
                  {e.additional_notes && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>NOTES</div>
                      <div style={{ fontSize: 13 }}>{e.additional_notes}</div>
                    </div>
                  )}
                  <button
                    className="btn ghost"
                    onClick={ev => { ev.stopPropagation(); handleDelete(e.id); }}
                    style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}
                  >
                    Delete entry
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* CALENDAR TAB */}
      {tab === 'calendar' && (
        <section className="panel">
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button className="btn ghost" onClick={() => {
              if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
              else setCalMonth(m => m - 1);
            }}>Previous</button>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{monthName}</span>
            <button className="btn ghost" onClick={() => {
              if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
              else setCalMonth(m => m + 1);
            }}>Next</button>
          </div>

          {/* Day labels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {/* Empty cells for start of month */}
            {Array.from({ length: calDays.firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {/* Day cells */}
            {Array.from({ length: calDays.daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const key = `${calYear}-${pad(calMonth + 1)}-${pad(dayNum)}`;
              const sev = entryMap[key];
              const isToday = key === today;
              return (
                <div
                  key={key}
                  title={sev ? SEVERITY_LABELS[sev] : undefined}
                  style={{
                    aspectRatio: '1',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: isToday ? 800 : 400,
                    background: sev ? SEVERITY_BG[sev] : isToday ? 'var(--surface-2)' : 'transparent',
                    border: isToday ? '2px solid var(--purple)' : sev ? `2px solid ${SEVERITY_COLORS[sev]}` : '1px solid var(--border)',
                    color: sev ? SEVERITY_COLORS[sev] : isToday ? 'var(--purple)' : 'var(--text)',
                    cursor: sev ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (sev) {
                      const entry = entries.find(e => e.entry_date === key);
                      if (entry) { setSelectedEntry(entry); setTab('history'); }
                    }
                  }}
                >
                  {dayNum}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
            {(['low', 'medium', 'high'] as Severity[]).map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: SEVERITY_BG[s], border: `2px solid ${SEVERITY_COLORS[s]}` }} />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{SEVERITY_LABELS[s]}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
