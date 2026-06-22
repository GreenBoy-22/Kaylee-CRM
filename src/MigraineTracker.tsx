// src/MigraineTracker.tsx
//
// Migraine tracker for Adam. Tabs: Log Entry, History, Annual Summary.
// Pulls from / saves to Supabase `migraine_log` table.
// Severity scale mirrors the bullet journal reference:
//   none | very_mild | mild | moderate | strong | severe | unbearable

import { useCallback, useEffect, useState } from 'react';
import { Plus, Save, X, ChevronDown, ChevronUp, Brain } from 'lucide-react';
import { supabase, hasSupabase } from './lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

type Severity = 'none' | 'very_mild' | 'mild' | 'moderate' | 'strong' | 'severe' | 'unbearable';
type PainType = 'throbbing' | 'sharp' | 'dull' | 'pressure' | 'burning' | 'shooting' | 'cramping' | 'radiating';
type SleepQuality = 'poor' | 'fair' | 'good' | 'excellent';

interface MigraineEntry {
  id: string;
  entry_date: string;           // YYYY-MM-DD
  severity: Severity;
  pain_types: PainType[];
  onset_time: string | null;    // HH:MM
  duration_hours: number | null;
  // Symptoms (1-3 scale, 0 = not present)
  nausea: number;
  vomiting: number;
  light_sensitivity: number;
  noise_sensitivity: number;
  aura: number;
  dizziness: number;
  neck_pain: number;
  fatigue: number;
  // Context
  water_oz: number | null;
  caffeine_cups: number | null;
  sleep_hours: number | null;
  sleep_quality: SleepQuality | null;
  stress_level: number | null;  // 1-10
  energy_level: number | null;  // 1-10
  // Medications taken (freeform)
  medications: string;
  // Triggers noted
  possible_triggers: string;
  // Phase notes
  prodrome_notes: string;
  aura_notes: string;
  headache_notes: string;
  postdrome_notes: string;
  // General
  notes: string;
  logged_by: string | null;
}

type EntryForm = Omit<MigraineEntry, 'id' | 'logged_by'>;

// ─── Constants ───────────────────────────────────────────────────────────────

const SEVERITIES: { value: Severity; label: string; color: string; bg: string }[] = [
  { value: 'none',       label: 'None',       color: '#aaa',    bg: '#f5f5f7' },
  { value: 'very_mild',  label: 'Very Mild',  color: '#b8a000', bg: '#fffde0' },
  { value: 'mild',       label: 'Mild',       color: '#c8800a', bg: '#fdf0d0' },
  { value: 'moderate',   label: 'Moderate',   color: '#c05820', bg: '#fde0cc' },
  { value: 'strong',     label: 'Strong',     color: '#b83040', bg: '#fdd0d8' },
  { value: 'severe',     label: 'Severe',     color: '#a01830', bg: '#fbbbc8' },
  { value: 'unbearable', label: 'Unbearable', color: '#7a0010', bg: '#f8a0aa' },
];

const PAIN_TYPES: { value: PainType; label: string }[] = [
  { value: 'throbbing', label: 'Throbbing / Pulsating' },
  { value: 'sharp',     label: 'Sharp / Stabbing' },
  { value: 'dull',      label: 'Dull / Aching' },
  { value: 'pressure',  label: 'Pressure / Tightness' },
  { value: 'burning',   label: 'Burning' },
  { value: 'shooting',  label: 'Shooting' },
  { value: 'cramping',  label: 'Cramping' },
  { value: 'radiating', label: 'Radiating' },
];

const SYMPTOMS: { key: keyof EntryForm; label: string }[] = [
  { key: 'nausea',            label: 'Nausea' },
  { key: 'vomiting',          label: 'Vomiting' },
  { key: 'light_sensitivity', label: 'Light Sensitivity' },
  { key: 'noise_sensitivity', label: 'Noise Sensitivity' },
  { key: 'aura',              label: 'Aura (visual/sensory)' },
  { key: 'dizziness',         label: 'Dizziness / Lightheadedness' },
  { key: 'neck_pain',         label: 'Neck Pain / Stiffness' },
  { key: 'fatigue',           label: 'Fatigue / Weakness' },
];

const SLEEP_QUALITIES: SleepQuality[] = ['poor', 'fair', 'good', 'excellent'];

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function severityFor(value: Severity) {
  return SEVERITIES.find((s) => s.value === value) ?? SEVERITIES[0];
}

function blankForm(): EntryForm {
  return {
    entry_date: new Date().toISOString().slice(0, 10),
    severity: 'none',
    pain_types: [],
    onset_time: null,
    duration_hours: null,
    nausea: 0, vomiting: 0, light_sensitivity: 0, noise_sensitivity: 0,
    aura: 0, dizziness: 0, neck_pain: 0, fatigue: 0,
    water_oz: null,
    caffeine_cups: null,
    sleep_hours: null,
    sleep_quality: null,
    stress_level: null,
    energy_level: null,
    medications: '',
    possible_triggers: '',
    prodrome_notes: '',
    aura_notes: '',
    headache_notes: '',
    postdrome_notes: '',
    notes: '',
  };
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function fetchEntries(): Promise<MigraineEntry[]> {
  if (!hasSupabase || !supabase) return DEMO_ENTRIES;
  const { data, error } = await supabase
    .from('migraine_log')
    .select('*')
    .order('entry_date', { ascending: false });
  if (error || !data) return DEMO_ENTRIES;
  return data as MigraineEntry[];
}

async function saveEntry(form: EntryForm, userId: string | null): Promise<boolean> {
  if (!hasSupabase || !supabase) return false;
  const { error } = await supabase.from('migraine_log').insert({ ...form, logged_by: userId });
  return !error;
}

// ─── Demo data (shown when Supabase not configured) ──────────────────────────

const DEMO_ENTRIES: MigraineEntry[] = [
  { id: 'd1', entry_date: '2026-06-18', severity: 'moderate', pain_types: ['throbbing','pressure'], onset_time: '09:00', duration_hours: 6, nausea: 2, vomiting: 0, light_sensitivity: 3, noise_sensitivity: 2, aura: 1, dizziness: 1, neck_pain: 2, fatigue: 2, water_oz: 48, caffeine_cups: 1, sleep_hours: 6, sleep_quality: 'poor', stress_level: 7, energy_level: 3, medications: 'Ibuprofen 400mg', possible_triggers: 'Poor sleep, stress', prodrome_notes: 'Felt off the night before', aura_notes: '', headache_notes: 'Throbbing right side', postdrome_notes: 'Very tired after', notes: '', logged_by: null },
  { id: 'd2', entry_date: '2026-06-12', severity: 'mild', pain_types: ['dull'], onset_time: '14:00', duration_hours: 3, nausea: 1, vomiting: 0, light_sensitivity: 1, noise_sensitivity: 1, aura: 0, dizziness: 0, neck_pain: 1, fatigue: 1, water_oz: 64, caffeine_cups: 2, sleep_hours: 7, sleep_quality: 'fair', stress_level: 5, energy_level: 5, medications: 'Tylenol', possible_triggers: 'Too much screen time', prodrome_notes: '', aura_notes: '', headache_notes: 'Dull, both sides', postdrome_notes: '', notes: '', logged_by: null },
  { id: 'd3', entry_date: '2026-06-05', severity: 'strong', pain_types: ['throbbing','sharp'], onset_time: '07:00', duration_hours: 12, nausea: 3, vomiting: 1, light_sensitivity: 3, noise_sensitivity: 3, aura: 2, dizziness: 2, neck_pain: 3, fatigue: 3, water_oz: 32, caffeine_cups: 0, sleep_hours: 5, sleep_quality: 'poor', stress_level: 9, energy_level: 2, medications: 'Sumatriptan 50mg', possible_triggers: 'Lack of sleep, skipped meals', prodrome_notes: 'Craving sweets the day before', aura_notes: 'Zigzag lines in vision', headache_notes: 'Severe throbbing, right side, couldn\'t function', postdrome_notes: 'Slept most of next day', notes: '', logged_by: null },
  { id: 'd4', entry_date: '2026-05-28', severity: 'very_mild', pain_types: ['dull'], onset_time: '16:00', duration_hours: 2, nausea: 0, vomiting: 0, light_sensitivity: 1, noise_sensitivity: 0, aura: 0, dizziness: 0, neck_pain: 0, fatigue: 1, water_oz: 80, caffeine_cups: 1, sleep_hours: 8, sleep_quality: 'good', stress_level: 3, energy_level: 7, medications: '', possible_triggers: 'Weather change', prodrome_notes: '', aura_notes: '', headache_notes: 'Very minor, went away on its own', postdrome_notes: '', notes: '', logged_by: null },
  { id: 'd5', entry_date: '2026-05-14', severity: 'severe', pain_types: ['throbbing','shooting'], onset_time: '08:00', duration_hours: 18, nausea: 3, vomiting: 2, light_sensitivity: 3, noise_sensitivity: 3, aura: 3, dizziness: 3, neck_pain: 3, fatigue: 3, water_oz: 24, caffeine_cups: 0, sleep_hours: 4, sleep_quality: 'poor', stress_level: 10, energy_level: 1, medications: 'Sumatriptan 100mg, Zofran', possible_triggers: 'Hormonal shift, extreme stress, dehydration', prodrome_notes: 'Mood crash 2 days prior', aura_notes: 'Full blind spot, tingling left arm', headache_notes: 'Worst in months, ER-level pain', postdrome_notes: 'Brain fog for 2 days', notes: '', logged_by: null },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SeverityDot({ severity, size = 12 }: { severity: Severity; size?: number }) {
  const s = severityFor(severity);
  return (
    <span style={{
      display: 'inline-block',
      width: size, height: size,
      borderRadius: '50%',
      background: s.color,
      flexShrink: 0,
    }} />
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const s = severityFor(severity);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      borderRadius: 999, padding: '3px 10px',
      background: s.bg, color: s.color,
      fontSize: 12, fontWeight: 600,
    }}>
      <SeverityDot severity={severity} size={8} />
      {s.label}
    </span>
  );
}

function SymptomScale({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[0, 1, 2, 3].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? 0 : n)}
          style={{
            width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
            background: value >= n && n > 0 ? (n === 3 ? 'var(--red)' : n === 2 ? 'var(--amber)' : 'var(--purple)') : 'white',
            color: value >= n && n > 0 ? 'white' : 'var(--muted)',
            cursor: 'pointer', fontWeight: 700, fontSize: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {n === 0 ? '—' : n}
        </button>
      ))}
    </div>
  );
}

// ─── Annual Summary ───────────────────────────────────────────────────────────

function AnnualSummary({ entries }: { entries: MigraineEntry[] }) {
  const year = new Date().getFullYear();

  // Build a map: YYYY-MM-DD -> severity
  const byDate = new Map<string, Severity>();
  for (const e of entries) {
    byDate.set(e.entry_date, e.severity);
  }

  function daysInMonth(month: number): number {
    return new Date(year, month + 1, 0).getDate();
  }

  function firstDayOfWeek(month: number): number {
    return new Date(year, month, 1).getDay();
  }

  const totalMigraines = entries.filter(
    (e) => e.severity !== 'none' && e.entry_date.startsWith(String(year))
  ).length;

  const severeCounts = entries.filter(
    (e) => (e.severity === 'severe' || e.severity === 'unbearable') && e.entry_date.startsWith(String(year))
  ).length;

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ flex: '1 1 140px' }}>
          <div className="stat-label" style={{ fontSize: 12 }}>Total {year}</div>
          <div className="stat-val">{totalMigraines}</div>
          <small>migraine days</small>
        </div>
        <div className="stat-card" style={{ flex: '1 1 140px' }}>
          <div className="stat-label" style={{ fontSize: 12 }}>Severe / Unbearable</div>
          <div className="stat-val" style={{ color: 'var(--red)' }}>{severeCounts}</div>
          <small>high-impact days</small>
        </div>
        <div className="stat-card" style={{ flex: '1 1 140px' }}>
          <div className="stat-label" style={{ fontSize: 12 }}>Most Recent</div>
          <div className="stat-val" style={{ fontSize: 16, paddingTop: 6 }}>
            {entries[0] ? new Date(entries[0].entry_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
          </div>
          <small>{entries[0] ? severityFor(entries[0].severity).label : '—'}</small>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Severity:</span>
        {SEVERITIES.map((s) => (
          <span key={s.value} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: s.color }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: s.bg, border: `1.5px solid ${s.color}`, display: 'inline-block' }} />
            {s.label}
          </span>
        ))}
      </div>

      {/* 12-month heatmap grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 20 }}>
        {MONTH_FULL.map((monthName, mi) => {
          const days = daysInMonth(mi);
          const startDay = firstDayOfWeek(mi);
          const cells: (number | null)[] = [...Array(startDay).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
          // Pad to full 6 rows
          while (cells.length % 7 !== 0) cells.push(null);

          return (
            <div key={mi}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>{monthName}</div>
              {/* DOW headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
                {['S','M','T','W','T','F','S'].map((d, i) => (
                  <div key={i} style={{ fontSize: 9, textAlign: 'center', color: 'var(--muted)', fontWeight: 600 }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {cells.map((day, ci) => {
                  if (!day) return <div key={ci} />;
                  const dateStr = `${year}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const sev = byDate.get(dateStr) ?? 'none';
                  const s = severityFor(sev);
                  const isToday = dateStr === new Date().toISOString().slice(0, 10);
                  return (
                    <div
                      key={ci}
                      title={`${monthName} ${day}: ${s.label}`}
                      style={{
                        aspectRatio: '1',
                        borderRadius: 3,
                        background: s.bg,
                        border: isToday ? '1.5px solid var(--purple)' : `1px solid ${sev === 'none' ? 'var(--border)' : s.color + '55'}`,
                        cursor: 'default',
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Log Form ─────────────────────────────────────────────────────────────────

function LogForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState<EntryForm>(blankForm());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPhases, setShowPhases] = useState(false);
  const [showContext, setShowContext] = useState(true);

  const set = <K extends keyof EntryForm>(key: K, value: EntryForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const togglePainType = (pt: PainType) =>
    set('pain_types', form.pain_types.includes(pt)
      ? form.pain_types.filter((p) => p !== pt)
      : [...form.pain_types, pt]);

  const handleSave = async () => {
    setSaving(true);
    let userId: string | null = null;
    if (hasSupabase && supabase) {
      const { data: s } = await supabase.auth.getSession();
      userId = s.session?.user?.id ?? null;
    }
    const ok = await saveEntry(form, userId);
    setSaving(false);
    if (ok) {
      setSaved(true);
      setForm(blankForm());
      setTimeout(() => { setSaved(false); onSaved(); }, 1200);
    }
  };

  const currentSev = severityFor(form.severity);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Date + severity hero */}
      <div className="panel" style={{ background: currentSev.bg, borderColor: currentSev.color + '55' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '0 0 auto' }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Date</label>
            <input
              type="date"
              value={form.entry_date}
              onChange={(e) => set('entry_date', e.target.value)}
              style={{ width: 160 }}
            />
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Onset Time</label>
            <input
              type="time"
              value={form.onset_time ?? ''}
              onChange={(e) => set('onset_time', e.target.value || null)}
              style={{ width: 130 }}
            />
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Duration (hrs)</label>
            <input
              type="number" min={0} max={72} step={0.5}
              value={form.duration_hours ?? ''}
              onChange={(e) => set('duration_hours', e.target.value ? Number(e.target.value) : null)}
              style={{ width: 100 }}
            />
          </div>
        </div>

        {/* Severity selector */}
        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 8 }}>Severity</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {SEVERITIES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => set('severity', s.value)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 10,
                  border: `2px solid ${form.severity === s.value ? s.color : 'transparent'}`,
                  background: s.bg,
                  color: s.color,
                  fontWeight: form.severity === s.value ? 700 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: form.severity === s.value ? `0 0 0 3px ${s.color}22` : 'none',
                }}
              >
                <SeverityDot severity={s.value} size={9} />
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pain type */}
      <div className="panel">
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Pain Type</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {PAIN_TYPES.map((pt) => {
            const active = form.pain_types.includes(pt.value);
            return (
              <button
                key={pt.value}
                type="button"
                onClick={() => togglePainType(pt.value)}
                style={{
                  padding: '8px 12px', borderRadius: 10, textAlign: 'left', fontSize: 13,
                  border: `1.5px solid ${active ? 'var(--purple)' : 'var(--border)'}`,
                  background: active ? 'var(--purple-bg)' : 'white',
                  color: active ? 'var(--purple-dark)' : 'var(--text)',
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {pt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Symptoms */}
      <div className="panel">
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Symptoms <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>— 1 mild · 2 moderate · 3 severe</span></h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {SYMPTOMS.map(({ key, label }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 13 }}>{label}</span>
              <SymptomScale
                value={form[key] as number}
                onChange={(v) => set(key, v as any)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Context section */}
      <div className="panel">
        <button
          type="button"
          onClick={() => setShowContext(!showContext)}
          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 0, marginBottom: showContext ? 14 : 0 }}
        >
          <h3 style={{ margin: 0, fontSize: 14 }}>Context & Triggers</h3>
          {showContext ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
        </button>

        {showContext && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Water (oz)</label>
              <input type="number" min={0} max={256} value={form.water_oz ?? ''} onChange={(e) => set('water_oz', e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Caffeine (cups)</label>
              <input type="number" min={0} max={20} step={0.5} value={form.caffeine_cups ?? ''} onChange={(e) => set('caffeine_cups', e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Sleep (hrs)</label>
              <input type="number" min={0} max={24} step={0.5} value={form.sleep_hours ?? ''} onChange={(e) => set('sleep_hours', e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Sleep Quality</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SLEEP_QUALITIES.map((q) => (
                  <button key={q} type="button" onClick={() => set('sleep_quality', form.sleep_quality === q ? null : q)}
                    style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, border: `1.5px solid ${form.sleep_quality === q ? 'var(--purple)' : 'var(--border)'}`, background: form.sleep_quality === q ? 'var(--purple-bg)' : 'white', color: form.sleep_quality === q ? 'var(--purple-dark)' : 'var(--muted)', cursor: 'pointer', textTransform: 'capitalize' }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Stress (1–10)</label>
              <input type="number" min={1} max={10} value={form.stress_level ?? ''} onChange={(e) => set('stress_level', e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Energy (1–10)</label>
              <input type="number" min={1} max={10} value={form.energy_level ?? ''} onChange={(e) => set('energy_level', e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Medications / Supplements taken</label>
              <input type="text" placeholder="e.g. Ibuprofen 400mg, Sumatriptan 50mg" value={form.medications} onChange={(e) => set('medications', e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Possible Triggers</label>
              <input type="text" placeholder="e.g. Poor sleep, stress, weather change, skipped meals" value={form.possible_triggers} onChange={(e) => set('possible_triggers', e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {/* Migraine phases */}
      <div className="panel">
        <button
          type="button"
          onClick={() => setShowPhases(!showPhases)}
          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 0, marginBottom: showPhases ? 14 : 0 }}
        >
          <h3 style={{ margin: 0, fontSize: 14 }}>Migraine Phases <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>— optional</span></h3>
          {showPhases ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
        </button>

        {showPhases && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { key: 'prodrome_notes' as keyof EntryForm, label: 'Prodrome', sub: 'Early warning signs (hours/days before)' },
              { key: 'aura_notes' as keyof EntryForm, label: 'Aura', sub: 'Visual/sensory changes before headache' },
              { key: 'headache_notes' as keyof EntryForm, label: 'Headache Phase', sub: 'Main pain — description, location, what helped' },
              { key: 'postdrome_notes' as keyof EntryForm, label: 'Postdrome', sub: 'After-effects / recovery period' },
            ].map(({ key, label, sub }) => (
              <div key={key}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 2 }}>{label} <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{sub}</span></label>
                <textarea
                  style={{ minHeight: 64, marginBottom: 0 }}
                  value={form[key] as string}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder={`Notes about ${label.toLowerCase()}...`}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button type="button" className="btn ghost" onClick={() => setForm(blankForm())}>
          <X size={15} /> Clear
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={handleSave}
          disabled={saving}
          style={saved ? { background: 'var(--green)' } : {}}
        >
          <Save size={15} /> {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Entry'}
        </button>
      </div>
    </div>
  );
}

// ─── History list ─────────────────────────────────────────────────────────────

function HistoryList({ entries }: { entries: MigraineEntry[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (entries.length === 0) {
    return <div className="gcal-today-empty">No migraine entries logged yet.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map((e) => {
        const isOpen = expanded === e.id;
        const date = new Date(e.entry_date + 'T00:00:00');
        const sev = severityFor(e.severity);

        return (
          <div
            key={e.id}
            style={{
              background: 'white',
              border: `1px solid ${isOpen ? sev.color : 'var(--border)'}`,
              borderLeft: `4px solid ${sev.color}`,
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {/* Row header */}
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : e.id)}
              style={{
                width: '100%', background: isOpen ? sev.bg : 'white',
                border: 'none', cursor: 'pointer', padding: '12px 14px',
                display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
              }}
            >
              <SeverityDot severity={e.severity} size={12} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                  <SeverityBadge severity={e.severity} />
                  {e.duration_hours ? <span>⏱ {e.duration_hours}h</span> : null}
                  {e.medications ? <span>💊 {e.medications.slice(0, 40)}{e.medications.length > 40 ? '…' : ''}</span> : null}
                </div>
              </div>
              {isOpen ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
            </button>

            {/* Expanded detail */}
            {isOpen && (
              <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${sev.color}33` }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
                  {/* Symptoms */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Symptoms</div>
                    {SYMPTOMS.filter(({ key }) => (e[key as keyof MigraineEntry] as number) > 0).map(({ key, label }) => (
                      <div key={key} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                        <span>{label}</span>
                        <span style={{ fontWeight: 700, color: (e[key as keyof MigraineEntry] as number) === 3 ? 'var(--red)' : (e[key as keyof MigraineEntry] as number) === 2 ? 'var(--amber)' : 'var(--purple)' }}>
                          {'●'.repeat(e[key as keyof MigraineEntry] as number)}
                        </span>
                      </div>
                    ))}
                    {SYMPTOMS.every(({ key }) => (e[key as keyof MigraineEntry] as number) === 0) && (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>None recorded</span>
                    )}
                  </div>

                  {/* Context */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Context</div>
                    {[
                      e.water_oz      ? `💧 ${e.water_oz} oz water` : null,
                      e.caffeine_cups !== null ? `☕ ${e.caffeine_cups} cup${e.caffeine_cups !== 1 ? 's' : ''} caffeine` : null,
                      e.sleep_hours   ? `😴 ${e.sleep_hours}h sleep${e.sleep_quality ? ` (${e.sleep_quality})` : ''}` : null,
                      e.stress_level  ? `😓 Stress: ${e.stress_level}/10` : null,
                      e.energy_level  ? `⚡ Energy: ${e.energy_level}/10` : null,
                    ].filter(Boolean).map((line, i) => (
                      <div key={i} style={{ fontSize: 12, padding: '3px 0', borderBottom: '1px solid var(--border)' }}>{line}</div>
                    ))}
                  </div>

                  {/* Pain types */}
                  {e.pain_types.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Pain Type</div>
                      {e.pain_types.map((pt) => (
                        <div key={pt} style={{ fontSize: 12, padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                          {PAIN_TYPES.find((p) => p.value === pt)?.label ?? pt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Triggers + phases */}
                {e.possible_triggers && (
                  <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--amber-bg)', borderRadius: 8, fontSize: 12 }}>
                    <strong style={{ color: 'var(--amber)' }}>Possible triggers:</strong> {e.possible_triggers}
                  </div>
                )}
                {[
                  { label: 'Prodrome', val: e.prodrome_notes },
                  { label: 'Aura', val: e.aura_notes },
                  { label: 'Headache phase', val: e.headache_notes },
                  { label: 'Postdrome', val: e.postdrome_notes },
                  { label: 'Notes', val: e.notes },
                ].filter((x) => x.val).map(({ label, val }) => (
                  <div key={label} style={{ marginTop: 8, fontSize: 13 }}>
                    <strong style={{ color: 'var(--muted)', fontSize: 12 }}>{label}: </strong>{val}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = 'log' | 'history' | 'summary';

export default function MigraineTracker() {
  const [tab, setTab] = useState<Tab>('log');
  const [entries, setEntries] = useState<MigraineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchEntries();
    setEntries(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Brain size={22} style={{ color: 'var(--purple)' }} />
            Migraine Tracker
          </h1>
          <p>Adam's migraine log — severity, symptoms, triggers, and patterns.</p>
        </div>
        {tab !== 'log' && (
          <button className="btn primary" onClick={() => setTab('log')}>
            <Plus size={15} /> Log Entry
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="gcal-view-toggle" style={{ marginBottom: 20, display: 'inline-flex' }}>
        <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>Log Entry</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          History {entries.length > 0 && `(${entries.length})`}
        </button>
        <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>Annual Summary</button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 24 }}>Loading...</div>
      ) : (
        <>
          {tab === 'log'     && <LogForm onSaved={load} />}
          {tab === 'history' && <HistoryList entries={entries} />}
          {tab === 'summary' && <AnnualSummary entries={entries} />}
        </>
      )}
    </div>
  );
}
