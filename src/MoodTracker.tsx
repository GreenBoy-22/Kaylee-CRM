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
  is_holiday: boolean;
  is_special_event: boolean;
  event_name: string | null;
  targets: string[];
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

const TARGET_OPTIONS = [
  'Me (Kaylee)',
  'Adam',
  'Mom',
  'Everyone in the house',
  'The dogs',
  'Extended family',
  'Strangers / other drivers',
  'Himself',
  'Nobody specific -- just in a mood',
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
  const [targets, setTargets] = useState<string[]>([]);
  const [isHoliday, setIsHoliday] = useState(false);
  const [isSpecialEvent, setIsSpecialEvent] = useState(false);
  const [eventName, setEventName] = useState('');
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

  function toggleTarget(t: string) {
    setTargets(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

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
      targets,
      is_holiday: isHoliday,
      is_special_event: isSpecialEvent,
      event_name: (isHoliday || isSpecialEvent) ? (eventName.trim() || null) : null,
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
    setTargets([]);
    setIsHoliday(false);
    setIsSpecialEvent(false);
    setEventName('');
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Total logged', value: totalEntries, color: 'var(--text)', sub: 'all time' },
          { label: 'Low days', value: lowCount, color: SEVERITY_COLORS.low, sub: 'yellow' },
          { label: 'Medium days', value: medCount, color: SEVERITY_COLORS.medium, sub: 'orange' },
          { label: 'High days', value: highCount, color: SEVERITY_COLORS.high, sub: 'red' },
        { label: 'Ruined events', value: entries.filter(e => e.is_holiday || e.is_special_event).length, color: '#854d0e', sub: 'holiday/special' },
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

          {/* Who is he mad at */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>Who is he mad at? (check all that apply)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {TARGET_OPTIONS.map(t => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '6px 8px', borderRadius: 6, background: targets.includes(t) ? '#fee2e2' : 'transparent', border: `1px solid ${targets.includes(t) ? '#ef4444' : 'var(--border)'}`, color: targets.includes(t) ? '#7f1d1d' : 'var(--text)', fontWeight: targets.includes(t) ? 600 : 400 }}>
                  <input
                    type="checkbox"
                    checked={targets.includes(t)}
                    onChange={() => toggleTarget(t)}
                    style={{ accentColor: '#ef4444' }}
                  />
                  {t}
                </label>
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

          {/* Holiday / Special Event */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>Did this happen on a special occasion?</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '8px 14px', borderRadius: 8, background: isHoliday ? '#fef9c3' : 'transparent', border: `2px solid ${isHoliday ? '#eab308' : 'var(--border)'}`, fontWeight: isHoliday ? 700 : 400, color: isHoliday ? '#854d0e' : 'var(--text)' }}>
                <input type="checkbox" checked={isHoliday} onChange={e => setIsHoliday(e.target.checked)} style={{ accentColor: '#eab308' }} />
                Holiday
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '8px 14px', borderRadius: 8, background: isSpecialEvent ? '#ede9fe' : 'transparent', border: `2px solid ${isSpecialEvent ? 'var(--purple)' : 'var(--border)'}`, fontWeight: isSpecialEvent ? 700 : 400, color: isSpecialEvent ? 'var(--purple)' : 'var(--text)' }}>
                <input type="checkbox" checked={isSpecialEvent} onChange={e => setIsSpecialEvent(e.target.checked)} style={{ accentColor: 'var(--purple)' }} />
                Special Event
              </label>
            </div>
            {(isHoliday || isSpecialEvent) && (
              <input
                type="text"
                value={eventName}
                onChange={e => setEventName(e.target.value)}
                placeholder={isHoliday ? 'e.g. Christmas, Thanksgiving, Birthday...' : 'e.g. Graduation, Wedding, Family dinner...'}
                style={{ width: '100%' }}
              />
            )}
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
                  {e.is_holiday && (
                    <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#854d0e', background: '#fef9c3', padding: '2px 8px', borderRadius: 999 }}>
                      Holiday
                    </span>
                  )}
                  {e.is_special_event && (
                    <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: 'var(--purple)', background: '#ede9fe', padding: '2px 8px', borderRadius: 999 }}>
                      Special Event
                    </span>
                  )}
                  {e.event_name && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--muted)' }}>({e.event_name})</span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{e.behaviors.length} behavior{e.behaviors.length !== 1 ? 's' : ''}</span>
              </div>
              {e.targets && e.targets.length > 0 && (
                <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 3, fontWeight: 600 }}>
                  Mad at: {e.targets.join(', ')}
                </div>
              )}
              {e.trigger_notes && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Trigger: {e.trigger_notes.slice(0, 80)}{e.trigger_notes.length > 80 ? '...' : ''}
                </div>
              )}

              {/* Expanded detail */}
              {selectedEntry?.id === e.id && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  {e.targets && e.targets.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>MAD AT</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {e.targets.map(t => (
                          <span key={t} style={{ fontSize: 11, background: '#fee2e2', color: '#7f1d1d', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
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

      {/* CALENDAR TAB - Annual view */}
      {tab === 'calendar' && (
        <div>
          {/* Year nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button className="btn ghost" onClick={() => setCalYear(y => y - 1)}>Previous Year</button>
            <span style={{ fontWeight: 800, fontSize: 18 }}>{calYear}</span>
            <button className="btn ghost" onClick={() => setCalYear(y => y + 1)}>Next Year</button>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
            {(['low', 'medium', 'high'] as Severity[]).map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: SEVERITY_BG[s], border: `2px solid ${SEVERITY_COLORS[s]}` }} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{SEVERITY_LABELS[s]}</span>
              </div>
            ))}
          </div>

          {/* 12 months grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {Array.from({ length: 12 }).map((_, monthIdx) => {
              const mName = new Date(calYear, monthIdx, 1).toLocaleDateString('en-US', { month: 'short' });
              const firstDay = new Date(calYear, monthIdx, 1).getDay();
              const daysInMonth = new Date(calYear, monthIdx + 1, 0).getDate();
              const hasEntries = Array.from({ length: daysInMonth }).some((_, d) => {
                const k = `${calYear}-${pad(monthIdx + 1)}-${pad(d + 1)}`;
                return !!entryMap[k];
              });
              return (
                <section key={monthIdx} className="panel" style={{ padding: '10px 8px' }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: hasEntries ? 'var(--text)' : 'var(--muted)', textAlign: 'center' }}>
                    {mName}
                  </div>
                  {/* Day headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 2 }}>
                    {['S','M','T','W','T','F','S'].map((d, i) => (
                      <div key={i} style={{ textAlign: 'center', fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>{d}</div>
                    ))}
                  </div>
                  {/* Day cells */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
                    {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const dayNum = i + 1;
                      const key = `${calYear}-${pad(monthIdx + 1)}-${pad(dayNum)}`;
                      const sev = entryMap[key];
                      const isToday = key === today;
                      const entry = entries.find(e => e.entry_date === key);
                      const hasEvent = entry && (entry.is_holiday || entry.is_special_event);
                      return (
                        <div
                          key={key}
                          title={sev ? `${dayNum}: ${SEVERITY_LABELS[sev]}${entry?.event_name ? ' - ' + entry.event_name : ''}` : String(dayNum)}
                          onClick={() => {
                            if (entry) { setSelectedEntry(entry); setTab('history'); }
                          }}
                          style={{
                            aspectRatio: '1',
                            borderRadius: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 7,
                            fontWeight: isToday ? 800 : 400,
                            background: sev ? SEVERITY_BG[sev] : isToday ? 'var(--surface-2)' : 'transparent',
                            border: isToday ? '1px solid var(--purple)' : sev ? `1px solid ${SEVERITY_COLORS[sev]}` : '1px solid transparent',
                            color: sev ? SEVERITY_COLORS[sev] : isToday ? 'var(--purple)' : 'var(--muted)',
                            cursor: sev ? 'pointer' : 'default',
                            position: 'relative',
                            outline: hasEvent ? '2px solid #eab308' : 'none',
                            outlineOffset: '-1px',
                          }}
                        >
                          {dayNum}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
            Tip: Click any colored day to view that entry. Yellow outline = holiday or special event.
          </div>
        </div>
      )}
    </>
  );
}
