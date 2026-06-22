// src/MigraineTracker.tsx
//
// Migraine tracker for Adam. Tabs: Log Entry, History, Annual Summary.
// Pulls from / saves to Supabase `migraine_log` table.

import { useCallback, useEffect, useState } from 'react';
import { Plus, Save, X, ChevronDown, ChevronUp, Brain, Edit3, Trash2 } from 'lucide-react';
import { supabase, hasSupabase } from './lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

type Severity = 'none' | 'very_mild' | 'mild' | 'moderate' | 'strong' | 'severe' | 'unbearable';
type PainType = 'throbbing' | 'sharp' | 'dull' | 'pressure' | 'burning' | 'shooting' | 'cramping' | 'radiating';
type SleepQuality = 'poor' | 'fair' | 'good' | 'excellent';
// Pain location zones matching the head diagram
type PainZone = 'forehead' | 'right_temple' | 'left_temple' | 'top_of_head' | 'back_of_head' | 'behind_eyes' | 'jaw_neck' | 'full_head';

interface MigraineEntry {
  id: string;
  entry_date: string;
  severity: Severity;
  wong_baker_score: number | null;   // 0,2,4,6,8,10
  pain_zones: PainZone[];
  pain_types: PainType[];
  onset_time: string | null;
  duration_hours: number | null;
  nausea: number; vomiting: number; light_sensitivity: number;
  noise_sensitivity: number; aura: number; dizziness: number;
  neck_pain: number; fatigue: number;
  water_oz: number | null; caffeine_cups: number | null;
  sleep_hours: number | null; sleep_quality: SleepQuality | null;
  stress_level: number | null; energy_level: number | null;
  medications: string; possible_triggers: string;
  prodrome_notes: string; aura_notes: string;
  headache_notes: string; postdrome_notes: string;
  notes: string; logged_by: string | null;
}

type EntryForm = Omit<MigraineEntry, 'id' | 'logged_by'>;

// ─── Constants ───────────────────────────────────────────────────────────────

const SEVERITIES: { value: Severity; label: string; color: string; bg: string; wbScore: number }[] = [
  { value: 'none',       label: 'None',       color: '#aaa',    bg: '#f5f5f7', wbScore: 0  },
  { value: 'very_mild',  label: 'Very Mild',  color: '#b8a000', bg: '#fffde0', wbScore: 2  },
  { value: 'mild',       label: 'Mild',       color: '#c8800a', bg: '#fdf0d0', wbScore: 4  },
  { value: 'moderate',   label: 'Moderate',   color: '#c05820', bg: '#fde0cc', wbScore: 6  },
  { value: 'strong',     label: 'Strong',     color: '#b83040', bg: '#fdd0d8', wbScore: 8  },
  { value: 'severe',     label: 'Severe',     color: '#a01830', bg: '#fbbbc8', wbScore: 8  },
  { value: 'unbearable', label: 'Unbearable', color: '#7a0010', bg: '#f8a0aa', wbScore: 10 },
];

const WB_FACES: { score: number; label: string; sublabel: string; face: string }[] = [
  { score: 0,  label: '0',  sublabel: 'No Hurt',       face: 'happy'     },
  { score: 2,  label: '2',  sublabel: 'Hurts Little Bit',  face: 'smile'  },
  { score: 4,  label: '4',  sublabel: 'Hurts Little More', face: 'neutral' },
  { score: 6,  label: '6',  sublabel: 'Hurts Even More',   face: 'sad'    },
  { score: 8,  label: '8',  sublabel: 'Hurts Whole Lot',   face: 'cry'    },
  { score: 10, label: '10', sublabel: 'Hurts Worst',       face: 'tears'  },
];

const PAIN_ZONE_DEFS: { value: PainZone; label: string }[] = [
  { value: 'forehead',      label: 'Forehead' },
  { value: 'right_temple',  label: 'Right Temple' },
  { value: 'left_temple',   label: 'Left Temple' },
  { value: 'top_of_head',   label: 'Top of Head' },
  { value: 'back_of_head',  label: 'Back of Head' },
  { value: 'behind_eyes',   label: 'Behind Eyes / Sinuses' },
  { value: 'jaw_neck',      label: 'Jaw / Neck' },
  { value: 'full_head',     label: 'Full Head / Diffuse' },
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
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function severityFor(value: Severity) {
  return SEVERITIES.find((s) => s.value === value) ?? SEVERITIES[0];
}

function wbScoreToSeverity(score: number): Severity {
  if (score === 0)  return 'none';
  if (score === 2)  return 'very_mild';
  if (score === 4)  return 'mild';
  if (score === 6)  return 'moderate';
  if (score === 8)  return 'strong';
  if (score === 10) return 'unbearable';
  return 'none';
}

function blankForm(): EntryForm {
  return {
    entry_date: new Date().toISOString().slice(0, 10),
    severity: 'none', wong_baker_score: null, pain_zones: [],
    pain_types: [], onset_time: null, duration_hours: null,
    nausea: 0, vomiting: 0, light_sensitivity: 0, noise_sensitivity: 0,
    aura: 0, dizziness: 0, neck_pain: 0, fatigue: 0,
    water_oz: null, caffeine_cups: null, sleep_hours: null, sleep_quality: null,
    stress_level: null, energy_level: null,
    medications: '', possible_triggers: '',
    prodrome_notes: '', aura_notes: '', headache_notes: '', postdrome_notes: '', notes: '',
  };
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function fetchEntries(): Promise<MigraineEntry[]> {
  if (!hasSupabase || !supabase) return DEMO_ENTRIES;
  const { data, error } = await supabase.from('migraine_log').select('*').order('entry_date', { ascending: false });
  if (error || !data) return DEMO_ENTRIES;
  return data as MigraineEntry[];
}

async function saveEntry(form: EntryForm, userId: string | null): Promise<boolean> {
  if (!hasSupabase || !supabase) return false;
  const { error } = await supabase.from('migraine_log').insert({ ...form, logged_by: userId });
  return !error;
}

async function updateEntry(id: string, form: EntryForm): Promise<boolean> {
  if (!hasSupabase || !supabase) return false;
  const { error } = await supabase.from('migraine_log').update(form).eq('id', id);
  return !error;
}

async function deleteEntry(id: string): Promise<boolean> {
  if (!hasSupabase || !supabase) return false;
  const { error } = await supabase.from('migraine_log').delete().eq('id', id);
  return !error;
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_ENTRIES: MigraineEntry[] = [
  { id: 'd1', entry_date: '2026-06-18', severity: 'moderate', wong_baker_score: 6, pain_zones: ['right_temple','forehead'], pain_types: ['throbbing','pressure'], onset_time: '09:00', duration_hours: 6, nausea: 2, vomiting: 0, light_sensitivity: 3, noise_sensitivity: 2, aura: 1, dizziness: 1, neck_pain: 2, fatigue: 2, water_oz: 48, caffeine_cups: 1, sleep_hours: 6, sleep_quality: 'poor', stress_level: 7, energy_level: 3, medications: 'Ibuprofen 400mg', possible_triggers: 'Poor sleep, stress', prodrome_notes: 'Felt off the night before', aura_notes: '', headache_notes: 'Throbbing right side', postdrome_notes: 'Very tired after', notes: '', logged_by: null },
  { id: 'd2', entry_date: '2026-06-12', severity: 'mild', wong_baker_score: 4, pain_zones: ['forehead','behind_eyes'], pain_types: ['dull'], onset_time: '14:00', duration_hours: 3, nausea: 1, vomiting: 0, light_sensitivity: 1, noise_sensitivity: 1, aura: 0, dizziness: 0, neck_pain: 1, fatigue: 1, water_oz: 64, caffeine_cups: 2, sleep_hours: 7, sleep_quality: 'fair', stress_level: 5, energy_level: 5, medications: 'Tylenol', possible_triggers: 'Too much screen time', prodrome_notes: '', aura_notes: '', headache_notes: 'Dull, both sides', postdrome_notes: '', notes: '', logged_by: null },
  { id: 'd3', entry_date: '2026-06-05', severity: 'strong', wong_baker_score: 8, pain_zones: ['right_temple','top_of_head','neck_pain' as PainZone], pain_types: ['throbbing','sharp'], onset_time: '07:00', duration_hours: 12, nausea: 3, vomiting: 1, light_sensitivity: 3, noise_sensitivity: 3, aura: 2, dizziness: 2, neck_pain: 3, fatigue: 3, water_oz: 32, caffeine_cups: 0, sleep_hours: 5, sleep_quality: 'poor', stress_level: 9, energy_level: 2, medications: 'Sumatriptan 50mg', possible_triggers: 'Lack of sleep, skipped meals', prodrome_notes: 'Craving sweets the day before', aura_notes: 'Zigzag lines in vision', headache_notes: "Severe throbbing, right side, couldn't function", postdrome_notes: 'Slept most of next day', notes: '', logged_by: null },
  { id: 'd4', entry_date: '2026-05-28', severity: 'very_mild', wong_baker_score: 2, pain_zones: ['forehead'], pain_types: ['dull'], onset_time: '16:00', duration_hours: 2, nausea: 0, vomiting: 0, light_sensitivity: 1, noise_sensitivity: 0, aura: 0, dizziness: 0, neck_pain: 0, fatigue: 1, water_oz: 80, caffeine_cups: 1, sleep_hours: 8, sleep_quality: 'good', stress_level: 3, energy_level: 7, medications: '', possible_triggers: 'Weather change', prodrome_notes: '', aura_notes: '', headache_notes: 'Very minor, went away on its own', postdrome_notes: '', notes: '', logged_by: null },
  { id: 'd5', entry_date: '2026-05-14', severity: 'severe', wong_baker_score: 8, pain_zones: ['full_head','jaw_neck'], pain_types: ['throbbing','shooting'], onset_time: '08:00', duration_hours: 18, nausea: 3, vomiting: 2, light_sensitivity: 3, noise_sensitivity: 3, aura: 3, dizziness: 3, neck_pain: 3, fatigue: 3, water_oz: 24, caffeine_cups: 0, sleep_hours: 4, sleep_quality: 'poor', stress_level: 10, energy_level: 1, medications: 'Sumatriptan 100mg, Zofran', possible_triggers: 'Hormonal shift, extreme stress, dehydration', prodrome_notes: 'Mood crash 2 days prior', aura_notes: 'Full blind spot, tingling left arm', headache_notes: 'Worst in months, ER-level pain', postdrome_notes: 'Brain fog for 2 days', notes: '', logged_by: null },
];

// ─── Wong-Baker Face SVG ──────────────────────────────────────────────────────

function WBFace({ type, size = 48, color = '#534AB7' }: { type: string; size?: number; color?: string }) {
  const s = { stroke: color, fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      {/* Head circle */}
      <circle cx="24" cy="24" r="20" stroke={color} strokeWidth="1.8" fill="none" />
      {/* Eyes */}
      {type === 'tears' ? (
        <>
          <ellipse cx="16" cy="19" rx="2" ry="2.5" fill={color} />
          <ellipse cx="32" cy="19" rx="2" ry="2.5" fill={color} />
          <path d="M14 22 Q14 26 16 26 Q18 26 18 22" stroke={color} strokeWidth="1.5" fill={`${color}44`} />
          <path d="M30 22 Q30 26 32 26 Q34 26 34 22" stroke={color} strokeWidth="1.5" fill={`${color}44`} />
        </>
      ) : type === 'cry' ? (
        <>
          <path d="M14 17 Q16 15 18 17" {...s} />
          <path d="M30 17 Q32 15 34 17" {...s} />
          <circle cx="16" cy="20" r="1.5" fill={color} />
          <circle cx="32" cy="20" r="1.5" fill={color} />
        </>
      ) : (
        <>
          <circle cx="16" cy="20" r="2" fill={color} />
          <circle cx="32" cy="20" r="2" fill={color} />
        </>
      )}
      {/* Mouth */}
      {type === 'happy'   && <path d="M15 30 Q24 38 33 30" {...s} />}
      {type === 'smile'   && <path d="M16 31 Q24 36 32 31" {...s} />}
      {type === 'neutral' && <path d="M16 32 L32 32" {...s} />}
      {type === 'sad'     && <path d="M16 33 Q24 27 32 33" {...s} />}
      {type === 'cry'     && <path d="M15 34 Q24 27 33 34" {...s} />}
      {type === 'tears'   && <path d="M14 35 Q24 27 34 35" {...s} />}
      {/* Brow furrows for sad/cry/tears */}
      {(type === 'sad' || type === 'cry' || type === 'tears') && (
        <>
          <path d="M13 16 Q16 14 19 16" {...s} strokeWidth="1.5" />
          <path d="M29 16 Q32 14 35 16" {...s} strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

// ─── Head Zone Map ────────────────────────────────────────────────────────────

function HeadZoneMap({ selected, onChange }: { selected: PainZone[]; onChange: (z: PainZone[]) => void }) {
  const toggle = (z: PainZone) =>
    onChange(selected.includes(z) ? selected.filter((s) => s !== z) : [...selected, z]);

  const zoneStyle = (z: PainZone): React.CSSProperties => ({
    position: 'absolute',
    borderRadius: '50%',
    cursor: 'pointer',
    background: selected.includes(z) ? 'rgba(183,48,64,0.55)' : 'rgba(200,200,220,0.18)',
    border: selected.includes(z) ? '2px solid #b83040' : '2px solid rgba(180,180,200,0.4)',
    transition: 'all 0.15s',
  });

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 10 }}>
        Pain Location <span style={{ fontWeight: 400 }}>— click zones on the head</span>
      </div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* SVG Head diagram */}
        <div style={{ position: 'relative', width: 200, height: 220, flexShrink: 0 }}>
          {/* Front-facing head SVG */}
          <svg width="200" height="220" viewBox="0 0 200 220" style={{ position: 'absolute', top: 0, left: 0 }}>
            {/* Neck */}
            <rect x="82" y="172" width="36" height="32" rx="8" fill="#f0f0f0" stroke="#ccc" strokeWidth="1.5" />
            {/* Head shape */}
            <ellipse cx="100" cy="100" rx="72" ry="82" fill="#f8f7f5" stroke="#ccc" strokeWidth="1.8" />
            {/* Ears */}
            <ellipse cx="27" cy="108" rx="9" ry="14" fill="#f0f0f0" stroke="#ccc" strokeWidth="1.5" />
            <ellipse cx="173" cy="108" rx="9" ry="14" fill="#f0f0f0" stroke="#ccc" strokeWidth="1.5" />
            {/* Eyes */}
            <ellipse cx="78" cy="105" rx="13" ry="9" fill="white" stroke="#bbb" strokeWidth="1.2" />
            <ellipse cx="122" cy="105" rx="13" ry="9" fill="white" stroke="#bbb" strokeWidth="1.2" />
            <circle cx="78" cy="105" r="5" fill="#888" />
            <circle cx="122" cy="105" r="5" fill="#888" />
            <circle cx="80" cy="103" r="2" fill="white" />
            <circle cx="124" cy="103" r="2" fill="white" />
            {/* Eyebrows */}
            <path d="M67 93 Q78 88 89 93" stroke="#aaa" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <path d="M111 93 Q122 88 133 93" stroke="#aaa" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            {/* Nose */}
            <path d="M97 112 Q93 128 88 132 Q96 136 100 136 Q104 136 112 132 Q107 128 103 112" stroke="#bbb" strokeWidth="1.3" fill="none" />
            {/* Mouth */}
            <path d="M84 150 Q100 160 116 150" stroke="#bbb" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            {/* Hair */}
            <path d="M30 88 Q32 30 100 22 Q168 30 170 88" fill="#d4c4a8" stroke="#c4b090" strokeWidth="1.2" />
          </svg>

          {/* Clickable zones overlaid */}
          {/* Forehead */}
          <div onClick={() => toggle('forehead')} title="Forehead"
            style={{ ...zoneStyle('forehead'), top: 32, left: 62, width: 76, height: 34 }} />
          {/* Behind eyes / sinuses */}
          <div onClick={() => toggle('behind_eyes')} title="Behind Eyes / Sinuses"
            style={{ ...zoneStyle('behind_eyes'), top: 90, left: 54, width: 92, height: 30 }} />
          {/* Left temple */}
          <div onClick={() => toggle('left_temple')} title="Left Temple"
            style={{ ...zoneStyle('left_temple'), top: 60, left: 24, width: 38, height: 44 }} />
          {/* Right temple */}
          <div onClick={() => toggle('right_temple')} title="Right Temple"
            style={{ ...zoneStyle('right_temple'), top: 60, right: 24, width: 38, height: 44 }} />
          {/* Top of head */}
          <div onClick={() => toggle('top_of_head')} title="Top of Head"
            style={{ ...zoneStyle('top_of_head'), top: 10, left: 56, width: 88, height: 28 }} />
          {/* Back of head — show as lower arc hint */}
          <div onClick={() => toggle('back_of_head')} title="Back of Head"
            style={{ ...zoneStyle('back_of_head'), bottom: 44, left: 56, width: 88, height: 30 }} />
          {/* Jaw / Neck */}
          <div onClick={() => toggle('jaw_neck')} title="Jaw / Neck"
            style={{ ...zoneStyle('jaw_neck'), bottom: 4, left: 70, width: 60, height: 42 }} />
          {/* Full head */}
          <div onClick={() => toggle('full_head')} title="Full Head"
            style={{ ...zoneStyle('full_head'), top: 10, left: 28, width: 144, height: 162, background: selected.includes('full_head') ? 'rgba(183,48,64,0.18)' : 'transparent', border: selected.includes('full_head') ? '2px dashed #b83040' : '2px dashed transparent', borderRadius: 80 }} />
        </div>

        {/* Zone chip list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Click zones or tap here:</div>
          {PAIN_ZONE_DEFS.map((z) => {
            const active = selected.includes(z.value);
            return (
              <button key={z.value} type="button" onClick={() => toggle(z.value)}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, textAlign: 'left',
                  border: `1.5px solid ${active ? '#b83040' : 'var(--border)'}`,
                  background: active ? '#fdd0d8' : 'white',
                  color: active ? '#b83040' : 'var(--text)',
                  fontWeight: active ? 600 : 400, cursor: 'pointer',
                }}>
                {active ? '✓ ' : ''}{z.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Wong-Baker Selector ──────────────────────────────────────────────────────

function WongBakerSelector({ value, onChange }: { value: number | null; onChange: (score: number) => void }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 10 }}>
        Wong-Baker FACES® Pain Rating
        <span style={{ fontWeight: 400 }}> — tap the face that matches</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {WB_FACES.map((f) => {
          const active = value === f.score;
          const sev = wbScoreToSeverity(f.score);
          const col = severityFor(sev);
          return (
            <button key={f.score} type="button" onClick={() => onChange(f.score)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '10px 8px', borderRadius: 12, cursor: 'pointer',
                border: `2px solid ${active ? col.color : 'var(--border)'}`,
                background: active ? col.bg : 'white',
                minWidth: 64,
                boxShadow: active ? `0 0 0 3px ${col.color}22` : 'none',
                transition: 'all 0.15s',
              }}>
              <WBFace type={f.face} size={44} color={active ? col.color : '#aaa'} />
              <span style={{ fontSize: 18, fontWeight: 800, color: active ? col.color : 'var(--muted)' }}>{f.label}</span>
              <span style={{ fontSize: 10, color: active ? col.color : 'var(--muted)', textAlign: 'center', lineHeight: 1.2, maxWidth: 60 }}>{f.sublabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Severity + WB combined panel ────────────────────────────────────────────

function SeverityDot({ severity, size = 12 }: { severity: Severity; size?: number }) {
  const s = severityFor(severity);
  return <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: s.color, flexShrink: 0 }} />;
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const s = severityFor(severity);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 999, padding: '3px 10px', background: s.bg, color: s.color, fontSize: 12, fontWeight: 600 }}>
      <SeverityDot severity={severity} size={8} />{s.label}
    </span>
  );
}

function SymptomScale({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[0,1,2,3].map((n) => (
        <button key={n} type="button" onClick={() => onChange(value === n ? 0 : n)}
          style={{
            width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
            background: value >= n && n > 0 ? (n === 3 ? 'var(--red)' : n === 2 ? 'var(--amber)' : 'var(--purple)') : 'white',
            color: value >= n && n > 0 ? 'white' : 'var(--muted)',
            cursor: 'pointer', fontWeight: 700, fontSize: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          {n === 0 ? '—' : n}
        </button>
      ))}
    </div>
  );
}

// ─── Annual Summary ───────────────────────────────────────────────────────────

function AnnualSummary({ entries, onSelectDate }: { entries: MigraineEntry[]; onSelectDate: (date: string) => void }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const byDate = new Map<string, Severity>();
  for (const e of entries) byDate.set(e.entry_date, e.severity);

  const yearEntries = entries.filter((e) => e.entry_date.startsWith(String(year)));
  const totalMigraines = yearEntries.filter((e) => e.severity !== 'none').length;
  const severeCounts = yearEntries.filter((e) => e.severity === 'severe' || e.severity === 'unbearable').length;

  function daysInMonth(m: number) { return new Date(year, m + 1, 0).getDate(); }
  function firstDow(m: number) { return new Date(year, m, 1).getDay(); }

  return (
    <div>
      {/* Year navigator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="gcal-nav-btn" onClick={() => setYear(y => y - 1)}>‹</button>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{year}</h2>
        <button className="gcal-nav-btn" onClick={() => setYear(y => y + 1)}>›</button>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Annual Summary</span>
        {year !== currentYear && (
          <button className="btn ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setYear(currentYear)}>Back to {currentYear}</button>
        )}
      </div>

      {/* Stats */}
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
            {yearEntries[0] ? new Date(yearEntries[0].entry_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
          </div>
          <small>{yearEntries[0] ? severityFor(yearEntries[0].severity).label : 'No entries'}</small>
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
        <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>— click any highlighted day to view entry</span>
      </div>

      {/* 12-month grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 20 }}>
        {MONTH_FULL.map((monthName, mi) => {
          const days = daysInMonth(mi);
          const startDay = firstDow(mi);
          const cells: (number | null)[] = [...Array(startDay).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
          while (cells.length % 7 !== 0) cells.push(null);

          return (
            <div key={mi}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{monthName}</div>
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
                  const hasEntry = byDate.has(dateStr) && sev !== 'none';
                  return (
                    <div
                      key={ci}
                      onClick={() => hasEntry && onSelectDate(dateStr)}
                      title={hasEntry ? `${monthName} ${day}: ${s.label} — click to view` : `${monthName} ${day}`}
                      style={{
                        aspectRatio: '1', borderRadius: 3,
                        background: s.bg,
                        border: isToday ? '1.5px solid var(--purple)' : `1px solid ${sev === 'none' ? 'var(--border)' : s.color + '55'}`,
                        cursor: hasEntry ? 'pointer' : 'default',
                        transition: 'transform 0.1s',
                        position: 'relative',
                      }}
                      onMouseEnter={e => { if (hasEntry) (e.currentTarget as HTMLElement).style.transform = 'scale(1.3)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {year !== currentYear && yearEntries.length === 0 && (
        <div className="gcal-today-empty" style={{ marginTop: 20 }}>No migraine entries logged for {year}.</div>
      )}
    </div>
  );
}

// ─── Log Form ─────────────────────────────────────────────────────────────────

function LogForm({ onSaved, editEntry, onCancelEdit }: { onSaved: () => void; editEntry?: MigraineEntry | null; onCancelEdit?: () => void }) {
  const [form, setForm] = useState<EntryForm>(editEntry ? (() => {
    const { id, logged_by, ...rest } = editEntry; return rest;
  })() : blankForm());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPhases, setShowPhases] = useState(false);
  const [showContext, setShowContext] = useState(true);

  const set = <K extends keyof EntryForm>(key: K, value: EntryForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const togglePainType = (pt: PainType) =>
    set('pain_types', form.pain_types.includes(pt) ? form.pain_types.filter((p) => p !== pt) : [...form.pain_types, pt]);

  const handleWBSelect = (score: number) => {
    set('wong_baker_score', score);
    // Auto-sync severity to closest WB match
    set('severity', wbScoreToSeverity(score));
  };

  const handleSave = async () => {
    setSaving(true);
    let userId: string | null = null;
    if (hasSupabase && supabase) {
      const { data: s } = await supabase.auth.getSession();
      userId = s.session?.user?.id ?? null;
    }
    const ok = editEntry ? await updateEntry(editEntry.id, form) : await saveEntry(form, userId);
    setSaving(false);
    if (ok) {
      setSaved(true);
      if (!editEntry) setForm(blankForm());
      setTimeout(() => { setSaved(false); onSaved(); if (onCancelEdit) onCancelEdit(); }, 1200);
    }
  };

  const currentSev = severityFor(form.severity);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {editEntry && (
        <div style={{ padding: '10px 14px', background: 'var(--purple-bg)', borderRadius: 10, fontSize: 13, color: 'var(--purple-dark)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✏️ Editing entry for {new Date(editEntry.entry_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          <button className="btn ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={onCancelEdit}><X size={13} /> Cancel</button>
        </div>
      )}

      {/* Date + severity hero */}
      <div className="panel" style={{ background: currentSev.bg, borderColor: currentSev.color + '55' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Date</label>
            <input type="date" value={form.entry_date} onChange={(e) => set('entry_date', e.target.value)} style={{ width: 160 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Onset Time</label>
            <input type="time" value={form.onset_time ?? ''} onChange={(e) => set('onset_time', e.target.value || null)} style={{ width: 130 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Duration (hrs)</label>
            <input type="number" min={0} max={72} step={0.5} value={form.duration_hours ?? ''} onChange={(e) => set('duration_hours', e.target.value ? Number(e.target.value) : null)} style={{ width: 100 }} />
          </div>
        </div>

        {/* Severity selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 8 }}>Severity Scale</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {SEVERITIES.map((s) => (
              <button key={s.value} type="button" onClick={() => { set('severity', s.value); set('wong_baker_score', s.wbScore); }}
                style={{
                  padding: '7px 14px', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${form.severity === s.value ? s.color : 'transparent'}`,
                  background: s.bg, color: s.color,
                  fontWeight: form.severity === s.value ? 700 : 500, fontSize: 13,
                  display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: form.severity === s.value ? `0 0 0 3px ${s.color}22` : 'none',
                }}>
                <SeverityDot severity={s.value} size={9} />{s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Wong-Baker faces */}
        <WongBakerSelector value={form.wong_baker_score} onChange={handleWBSelect} />
      </div>

      {/* Head pain location */}
      <div className="panel">
        <HeadZoneMap selected={form.pain_zones} onChange={(z) => set('pain_zones', z)} />
      </div>

      {/* Pain type */}
      <div className="panel">
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Pain Type</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {PAIN_TYPES.map((pt) => {
            const active = form.pain_types.includes(pt.value);
            return (
              <button key={pt.value} type="button" onClick={() => togglePainType(pt.value)}
                style={{
                  padding: '8px 12px', borderRadius: 10, textAlign: 'left', fontSize: 13,
                  border: `1.5px solid ${active ? 'var(--purple)' : 'var(--border)'}`,
                  background: active ? 'var(--purple-bg)' : 'white',
                  color: active ? 'var(--purple-dark)' : 'var(--text)',
                  fontWeight: active ? 600 : 400, cursor: 'pointer',
                }}>
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
              <SymptomScale value={form[key] as number} onChange={(v) => set(key, v as any)} />
            </div>
          ))}
        </div>
      </div>

      {/* Context */}
      <div className="panel">
        <button type="button" onClick={() => setShowContext(!showContext)}
          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 0, marginBottom: showContext ? 14 : 0 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Context & Triggers</h3>
          {showContext ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
        </button>
        {showContext && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            <div><label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Water (oz)</label><input type="number" min={0} max={256} value={form.water_oz ?? ''} onChange={(e) => set('water_oz', e.target.value ? Number(e.target.value) : null)} /></div>
            <div><label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Caffeine (cups)</label><input type="number" min={0} max={20} step={0.5} value={form.caffeine_cups ?? ''} onChange={(e) => set('caffeine_cups', e.target.value ? Number(e.target.value) : null)} /></div>
            <div><label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Sleep (hrs)</label><input type="number" min={0} max={24} step={0.5} value={form.sleep_hours ?? ''} onChange={(e) => set('sleep_hours', e.target.value ? Number(e.target.value) : null)} /></div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Sleep Quality</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SLEEP_QUALITIES.map((q) => (
                  <button key={q} type="button" onClick={() => set('sleep_quality', form.sleep_quality === q ? null : q)}
                    style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer', textTransform: 'capitalize', border: `1.5px solid ${form.sleep_quality === q ? 'var(--purple)' : 'var(--border)'}`, background: form.sleep_quality === q ? 'var(--purple-bg)' : 'white', color: form.sleep_quality === q ? 'var(--purple-dark)' : 'var(--muted)' }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
            <div><label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Stress (1–10)</label><input type="number" min={1} max={10} value={form.stress_level ?? ''} onChange={(e) => set('stress_level', e.target.value ? Number(e.target.value) : null)} /></div>
            <div><label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Energy (1–10)</label><input type="number" min={1} max={10} value={form.energy_level ?? ''} onChange={(e) => set('energy_level', e.target.value ? Number(e.target.value) : null)} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Medications / Supplements taken</label><input type="text" placeholder="e.g. Ibuprofen 400mg, Sumatriptan 50mg" value={form.medications} onChange={(e) => set('medications', e.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Possible Triggers</label><input type="text" placeholder="e.g. Poor sleep, stress, weather change" value={form.possible_triggers} onChange={(e) => set('possible_triggers', e.target.value)} /></div>
          </div>
        )}
      </div>

      {/* Phases */}
      <div className="panel">
        <button type="button" onClick={() => setShowPhases(!showPhases)}
          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 0, marginBottom: showPhases ? 14 : 0 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Migraine Phases <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>— optional</span></h3>
          {showPhases ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
        </button>
        {showPhases && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { key: 'prodrome_notes' as keyof EntryForm, label: 'Prodrome', sub: 'Early warning signs' },
              { key: 'aura_notes' as keyof EntryForm, label: 'Aura', sub: 'Visual/sensory changes' },
              { key: 'headache_notes' as keyof EntryForm, label: 'Headache Phase', sub: 'Main pain description' },
              { key: 'postdrome_notes' as keyof EntryForm, label: 'Postdrome', sub: 'After-effects / recovery' },
            ].map(({ key, label, sub }) => (
              <div key={key}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 2 }}>{label} <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{sub}</span></label>
                <textarea style={{ minHeight: 64, marginBottom: 0 }} value={form[key] as string} onChange={(e) => set(key, e.target.value)} placeholder={`Notes about ${label.toLowerCase()}...`} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        {editEntry && <button type="button" className="btn ghost" onClick={onCancelEdit}><X size={15} /> Cancel</button>}
        <button type="button" className="btn ghost" onClick={() => setForm(blankForm())}><X size={15} /> Clear</button>
        <button type="button" className="btn primary" onClick={handleSave} disabled={saving} style={saved ? { background: 'var(--green)' } : {}}>
          <Save size={15} /> {saved ? 'Saved!' : saving ? 'Saving...' : editEntry ? 'Save Changes' : 'Save Entry'}
        </button>
      </div>
    </div>
  );
}

// ─── History list ─────────────────────────────────────────────────────────────

function HistoryList({ entries, highlightDate, onEdit, onDelete }: {
  entries: MigraineEntry[];
  highlightDate?: string | null;
  onEdit: (e: MigraineEntry) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(highlightDate
    ? entries.find((e) => e.entry_date === highlightDate)?.id ?? null
    : null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Auto-scroll to highlighted entry
  useEffect(() => {
    if (highlightDate) {
      const entry = entries.find((e) => e.entry_date === highlightDate);
      if (entry) {
        setExpanded(entry.id);
        setTimeout(() => {
          document.getElementById(`migraine-entry-${entry.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    }
  }, [highlightDate, entries]);

  if (entries.length === 0) {
    return <div className="gcal-today-empty">No migraine entries logged yet.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map((e) => {
        const isOpen = expanded === e.id;
        const isHighlighted = e.entry_date === highlightDate;
        const date = new Date(e.entry_date + 'T00:00:00');
        const sev = severityFor(e.severity);

        return (
          <div key={e.id} id={`migraine-entry-${e.id}`}
            style={{
              background: 'white',
              border: `1px solid ${isOpen || isHighlighted ? sev.color : 'var(--border)'}`,
              borderLeft: `4px solid ${sev.color}`,
              borderRadius: 12, overflow: 'hidden',
              boxShadow: isHighlighted ? `0 0 0 3px ${sev.color}33` : 'none',
            }}>
            {/* Row header */}
            <div style={{ display: 'flex', alignItems: 'center', background: isOpen ? sev.bg : 'white' }}>
              <button type="button" onClick={() => setExpanded(isOpen ? null : e.id)}
                style={{ flex: 1, background: 'transparent', border: 'none', cursor: 'pointer', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
                <SeverityDot severity={e.severity} size={12} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                    <SeverityBadge severity={e.severity} />
                    {e.wong_baker_score !== null && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <WBFace type={WB_FACES.find(f => f.score === e.wong_baker_score)?.face ?? 'neutral'} size={18} color={sev.color} />
                        WB: {e.wong_baker_score}/10
                      </span>
                    )}
                    {e.duration_hours ? <span>⏱ {e.duration_hours}h</span> : null}
                    {e.medications ? <span>💊 {e.medications.slice(0, 36)}{e.medications.length > 36 ? '…' : ''}</span> : null}
                  </div>
                </div>
                {isOpen ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
              </button>
              {/* Edit / Delete buttons */}
              <div style={{ display: 'flex', gap: 4, paddingRight: 10, flexShrink: 0 }}>
                <button type="button" className="qty-button" title="Edit entry" onClick={() => onEdit(e)}>
                  <Edit3 size={13} color="var(--purple)" />
                </button>
                {confirmDelete === e.id ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--red)' }}>Delete?</span>
                    <button type="button" className="qty-button" title="Confirm delete" onClick={() => { onDelete(e.id); setConfirmDelete(null); }} style={{ borderColor: 'var(--red)' }}>
                      <Trash2 size={13} color="var(--red)" />
                    </button>
                    <button type="button" className="qty-button" title="Cancel" onClick={() => setConfirmDelete(null)}>
                      <X size={13} color="var(--muted)" />
                    </button>
                  </div>
                ) : (
                  <button type="button" className="qty-button" title="Delete entry" onClick={() => setConfirmDelete(e.id)}>
                    <Trash2 size={13} color="var(--muted)" />
                  </button>
                )}
              </div>
            </div>

            {/* Expanded detail */}
            {isOpen && (
              <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${sev.color}33` }}>
                {/* Wong-Baker face display */}
                {e.wong_baker_score !== null && (
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: sev.bg, borderRadius: 8 }}>
                    <WBFace type={WB_FACES.find(f => f.score === e.wong_baker_score)?.face ?? 'neutral'} size={36} color={sev.color} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: sev.color }}>Wong-Baker Score: {e.wong_baker_score}/10</div>
                      <div style={{ fontSize: 12, color: sev.color }}>{WB_FACES.find(f => f.score === e.wong_baker_score)?.sublabel}</div>
                    </div>
                  </div>
                )}

                {/* Pain zones */}
                {e.pain_zones && e.pain_zones.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Pain Locations</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {e.pain_zones.map((z) => (
                        <span key={z} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, background: '#fdd0d8', color: '#b83040', fontWeight: 600 }}>
                          {PAIN_ZONE_DEFS.find((d) => d.value === z)?.label ?? z}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

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
                    {SYMPTOMS.every(({ key }) => (e[key as keyof MigraineEntry] as number) === 0) && <span style={{ fontSize: 12, color: 'var(--muted)' }}>None recorded</span>}
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
                  {e.pain_types.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Pain Type</div>
                      {e.pain_types.map((pt) => (
                        <div key={pt} style={{ fontSize: 12, padding: '3px 0', borderBottom: '1px solid var(--border)' }}>{PAIN_TYPES.find((p) => p.value === pt)?.label ?? pt}</div>
                      ))}
                    </div>
                  )}
                </div>
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
  const [editEntry, setEditEntry] = useState<MigraineEntry | null>(null);
  const [highlightDate, setHighlightDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchEntries();
    setEntries(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleEdit = (e: MigraineEntry) => {
    setEditEntry(e);
    setTab('log');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    // Optimistically remove from local state immediately so the UI responds
    // regardless of whether Supabase is connected or in demo mode.
    setEntries((prev) => prev.filter((e) => e.id !== id));
    // If Supabase is live, also delete from the database.
    if (hasSupabase && supabase) {
      await deleteEntry(id);
    }
  };

  const handleCalendarDateClick = (date: string) => {
    setHighlightDate(date);
    setTab('history');
    setTimeout(() => setHighlightDate(null), 4000); // clear highlight after 4s
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Brain size={22} style={{ color: 'var(--purple)' }} />
            Migraine Tracker
          </h1>
          <p>Adam's migraine log — severity, symptoms, triggers, and patterns.</p>
        </div>
        {tab !== 'log' && (
          <button className="btn primary" onClick={() => { setEditEntry(null); setTab('log'); }}>
            <Plus size={15} /> Log Entry
          </button>
        )}
      </div>

      <div className="gcal-view-toggle" style={{ marginBottom: 20, display: 'inline-flex' }}>
        <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>
          {editEntry ? '✏️ Editing' : 'Log Entry'}
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          History {entries.length > 0 && `(${entries.length})`}
        </button>
        <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>Annual Summary</button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 24 }}>Loading...</div>
      ) : (
        <>
          {tab === 'log' && <LogForm onSaved={load} editEntry={editEntry} onCancelEdit={() => setEditEntry(null)} />}
          {tab === 'history' && <HistoryList entries={entries} highlightDate={highlightDate} onEdit={handleEdit} onDelete={handleDelete} />}
          {tab === 'summary' && <AnnualSummary entries={entries} onSelectDate={handleCalendarDateClick} />}
        </>
      )}
    </div>
  );
}
