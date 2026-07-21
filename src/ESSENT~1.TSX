// src/EssentialActions.tsx
//
// Essential Actions (EA) tracker, matched to Kaylee's real Text Blaze
// snippet library. Two EA types (no contact, not academically engaged)
// are auto-detected live from student data already in the Hub. Everything
// else — passed/failed assessments, task returns, new students, term
// registration, pacing checkpoints — has to be logged manually, since the
// Hub has no API access to WGU's Learner Care Dashboard and can't detect
// those events on its own.
//
// For every active EA, this shows: the matching snippet shortcut(s) from
// Kaylee's real library, the SLA window, and a personalization panel
// pulled from the student's actual recent touchpoint notes (last stated
// goal, last call recap, any named struggle) — so nothing sent out reads
// as generic.

import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Plus, Check, ChevronDown, ChevronRight, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from './lib/supabase';

interface StudentRow {
  id: string;
  display_name: string;
  momentum: string | null;
  last_contact_date: string | null;
  last_academic_activity_date: string | null;
  course: string | null;
  risk: string | null;
  on_term_break?: boolean | null;
  missed_call_count: number | null;
  term_start_date?: string | null;
}

interface TouchpointRow {
  id: string;
  student_id: string;
  touchpoint_date: string;
  touchpoint_type: string;
  note: string | null;
}

interface EaLogRow {
  id: string;
  student_id: string;
  ea_type: string;
  momentum_at_fire: string | null;
  fired_at: string;
  sla_hours: number | null;
  status: string;
  snippet_used: string | null;
  notes: string | null;
  created_at: string;
  closed_at: string | null;
}

// ── EA reference table — matched to Kaylee's real Text Blaze shortcuts ──
type EaDef = {
  label: string;
  snippets: { shortcut: string; name: string }[];
  slaHours: number | { low: number; high: number }; // some SLAs depend on momentum tier
  autoDetect: boolean;
  description: string;
};

const EA_DEFS: Record<string, EaDef> = {
  no_contact: {
    label: 'No PM Contact (16/21 Days)',
    snippets: [{ shortcut: '/oops', name: 'No Mentor Contact in 16 Days' }],
    slaHours: 72,
    autoDetect: false,
    description: "Last contact >16 days ago (Low/Med Low/Med momentum) or >21 days (High/Med High momentum).",
  },
  not_engaged: {
    label: 'Not Academically Engaged (10/15 Days)',
    snippets: [
      { shortcut: '/789', name: 'NO AA Notice' },
      { shortcut: '/NOAA1', name: 'No AA — First Try' },
      { shortcut: '/NOAA2', name: 'No AA — 2nd Try' },
      { shortcut: '/NOAAWD', name: 'No AA — WD Pending' },
    ],
    slaHours: 24,
    autoDetect: false,
    description: 'No recorded academic activity in 10 days (Low/Med Low momentum) or 15 days (High/Med High/Med momentum).',
  },
  passed_oa: {
    label: 'Passed Objective Assessment',
    snippets: [{ shortcut: '/poa', name: 'Passed OA' }],
    slaHours: { low: 24, high: 72 },
    autoDetect: false,
    description: 'Student passed an objective assessment — celebrate + revisit term plan.',
  },
  passed_pa: {
    label: 'Passed Performance Task',
    snippets: [{ shortcut: '/ppa', name: 'Passed PA' }],
    slaHours: { low: 24, high: 72 },
    autoDetect: false,
    description: 'Student passed a performance task — celebrate + revisit term plan.',
  },
  passed_preoa: {
    label: 'Passed Preassessment',
    snippets: [{ shortcut: '/ppoa', name: 'Passed Pre-OA' }],
    slaHours: 24,
    autoDetect: false,
    description: 'Low/Med Low/Med momentum student passed a preassessment.',
  },
  failed_oa: {
    label: 'Failed Objective Assessment',
    snippets: [{ shortcut: '/FOA', name: 'Failed OA' }],
    slaHours: 24,
    autoDetect: false,
    description: 'Student failed an objective assessment — offer encouragement + resources.',
  },
  failed_preoa: {
    label: 'Failed Preassessment',
    snippets: [{ shortcut: '/fpoa', name: 'Failed Pre-OA' }],
    slaHours: 24,
    autoDetect: false,
    description: 'Student failed a preassessment.',
  },
  task_returned: {
    label: 'Performance Task Returned',
    snippets: [{ shortcut: '/TASKRETURN', name: 'PA Task Returned' }],
    slaHours: 24,
    autoDetect: false,
    description: 'A performance task was returned for revision (any attempt).',
  },
  no_cus_45: {
    label: 'No CUs Completed at 45 Days',
    snippets: [{ shortcut: '/45', name: "45 Critical Action - No CUs" }],
    slaHours: 72,
    autoDetect: false,
    description: 'Student has reached day 45 in term with zero CUs completed.',
  },
  hundred_days: {
    label: '100 Days, Less Than 2 Courses',
    snippets: [{ shortcut: '/100', name: '100 Days With Less Than 2 Courses' }],
    slaHours: 72,
    autoDetect: false,
    description: 'Student reached day 100 without completing 2 courses.',
  },
  new_student: {
    label: 'New Student Added to Caseload',
    snippets: [
      { shortcut: '/welcome', name: 'New Student' },
      { shortcut: '/recap', name: 'Welcome Call recap' },
      { shortcut: '/readmit', name: 'Readmission Student' },
    ],
    slaHours: 48,
    autoDetect: false,
    description: 'Newly assigned student — reach out within 48 hours.',
  },
  term_reg_not_set: {
    label: 'Term Registration Not Set',
    snippets: [
      { shortcut: '/start', name: 'New Term' },
      { shortcut: '/NoAppt', name: 'New Term, No Appt' },
    ],
    slaHours: 24,
    autoDetect: false,
    description: 'Student has reached day 10 of term without accepting registration.',
  },
  first_term_critical_30: {
    label: 'First-Term Critical Action: Day 30',
    snippets: [{ shortcut: '/missed', name: 'Missed Welcome Call' }],
    slaHours: 72,
    autoDetect: false,
    description: 'First-term student has not completed a critical action by day 30.',
  },
  first_term_critical_40: {
    label: 'First-Term Critical Action: Day 40',
    snippets: [{ shortcut: '/missed', name: 'Missed Welcome Call' }],
    slaHours: 24,
    autoDetect: false,
    description: 'First-term student has not completed a critical action by day 40.',
  },
  pacing_2m: {
    label: '2-Month Pacing Check-In',
    snippets: [{ shortcut: '/2mpace', name: '2-Month Pacing Check-In' }],
    slaHours: 72,
    autoDetect: true,
    description: "Student is at the 2-month mark of their term — no official EA for this, tracked here since it matters for pacing. Auto-creates a draft check-in email once per term.",
  },
  pacing_4m: {
    label: '4-Month Pacing Check-In',
    snippets: [{ shortcut: '/4mpace', name: '4-Month Pacing Check-In' }],
    slaHours: 72,
    autoDetect: true,
    description: "Student is at the 4-month mark of their term — no official EA for this, tracked here since it matters for pacing. Auto-creates a draft check-in email once per term.",
  },
};

const MANUAL_EA_TYPES = Object.entries(EA_DEFS).filter(([, def]) => !def.autoDetect).map(([key]) => key);

function momentumTier(m: string | null | undefined): 'low' | 'high' {
  const s = (m || '').toLowerCase();
  return s.includes('high') ? 'high' : 'low';
}

function slaHoursFor(def: EaDef, tier: 'low' | 'high'): number {
  return typeof def.slaHours === 'number' ? def.slaHours : def.slaHours[tier];
}

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 9999;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / 86400000);
}

function hoursSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 3600000);
}

// Formats an hours value as "Xh" under 24 hours, or "Yd" (whole days) once
// it crosses 24 — a stale item reads as "105d ago" instead of "2523h ago."
function formatHoursOrDays(hours: number): string {
  const abs = Math.abs(hours);
  if (abs < 24) return `${hours}h`;
  const days = Math.floor(abs / 24) * (hours < 0 ? -1 : 1);
  return `${days}d`;
}

// Counts weekdays (Mon-Fri) between a date and now, not counting the
// start date itself. Used to cap how far back an auto-detected EA can
// reach — a trigger point older than ~7 business days is more likely a
// Salesforce-logged contact that just hasn't been entered in the Hub yet
// than a genuine miss, so it's suppressed rather than surfaced as overdue.
function businessDaysSince(date: Date): number {
  let count = 0;
  const cursor = new Date(date);
  cursor.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  while (cursor < today) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

// ── Personalization extraction (lightweight, mirrors the Students page) ──
function extractStatedGoal(note: string | null | undefined): string | null {
  if (!note) return null;
  const match = note.match(/goal for (?:the )?next week:?\**\s*\n*([\s\S]*?)(?:\n+\*\*|\n+[A-Z][a-zA-Z ]*:|$)/i);
  if (!match) return null;
  return match[1].replace(/\*\*/g, '').trim() || null;
}

function extractLastSummary(note: string | null | undefined): string | null {
  if (!note) return null;
  const match = note.match(/call summary:?\**\s*\n*([\s\S]*?)(?:\n+\*\*|\n+goal for|$)/i);
  const text = (match ? match[1] : note).replace(/\*\*/g, '').trim();
  if (!text) return null;
  const sentences = text.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
  return sentences.length < text.length ? `${sentences}..` : sentences;
}

function extractStruggle(note: string | null | undefined): string | null {
  if (!note) return null;
  const kw = /\b(struggl\w*|difficult\w*|challeng\w*|errors?|mistakes?|rushing|confus\w*|overwhelm\w*|stuck)\b/i;
  const sentence = note.split(/(?<=[.!?])\s+/).map((s) => s.trim()).find((s) => kw.test(s) && s.length < 300);
  return sentence || null;
}

function fmtDateShort(dateValue?: string | null): string {
  if (!dateValue) return '—';
  const d = new Date(dateValue.length <= 10 ? `${dateValue}T00:00:00` : dateValue);
  if (Number.isNaN(d.getTime())) return dateValue;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

type ActiveEa = {
  key: string; // unique per-card key
  student: StudentRow;
  eaType: string;
  firedAt: string; // ISO date
  slaHours: number;
  logRow?: EaLogRow; // present only for manually-logged EAs
};

export default function EssentialActions({ onEaChange }: { onEaChange?: () => void }) {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [touchpoints, setTouchpoints] = useState<TouchpointRow[]>([]);
  const [eaLog, setEaLog] = useState<EaLogRow[]>([]);
  const [recentlyClosed, setRecentlyClosed] = useState<EaLogRow[]>([]);
  const [allClosedLog, setAllClosedLog] = useState<EaLogRow[]>([]);
  const [selectedSnippet, setSelectedSnippet] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showLogForm, setShowLogForm] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [formStudentId, setFormStudentId] = useState('');
  const [formEaType, setFormEaType] = useState(MANUAL_EA_TYPES[0]);
  const [formFiredAt, setFormFiredAt] = useState(new Date().toISOString().slice(0, 10));

  async function load() {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [s, tp, log, allLog] = await Promise.all([
      supabase.from('students').select('id, display_name, momentum, last_contact_date, last_academic_activity_date, course, risk, on_term_break, missed_call_count, term_start_date').eq('archived', false),
      supabase.from('student_touchpoints').select('id, student_id, touchpoint_date, touchpoint_type, note').order('touchpoint_date', { ascending: false }),
      supabase.from('work_ea_log').select('*').eq('status', 'open').order('created_at', { ascending: false }),
      // Full history, not just a short window — pacing checkpoints need to
      // check "was this logged at all since the term started," which can
      // mean looking back months, not just the last day.
      supabase.from('work_ea_log').select('*').eq('status', 'closed'),
    ]);
    setStudents(((s.data as StudentRow[]) ?? []).filter((st) => !st.on_term_break));
    setTouchpoints((tp.data as TouchpointRow[]) ?? []);
    setEaLog((log.data as EaLogRow[]) ?? []);
    setAllClosedLog((allLog.data as EaLogRow[]) ?? []);
    setRecentlyClosed(((allLog.data as EaLogRow[]) ?? []).filter((r) => r.closed_at && hoursSince(r.closed_at) < 24));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const touchpointsByStudent = useMemo(() => {
    const map = new Map<string, TouchpointRow[]>();
    for (const t of touchpoints) {
      const arr = map.get(t.student_id) ?? [];
      arr.push(t);
      map.set(t.student_id, arr);
    }
    return map;
  }, [touchpoints]);

  // Auto-detected EAs: computed fresh every render from student data already
  // in the Hub. These aren't stored anywhere — they naturally disappear once
  // last_contact_date / last_academic_activity_date update via a new touchpoint.
  const autoEAs: ActiveEa[] = useMemo(() => {
    const recentlyHandled = new Set(recentlyClosed.map((r) => `${r.student_id}::${r.ea_type}`));
    // Cohort cutoff: at Kaylee's request, auto-detected EAs (No Contact,
    // Not Engaged, and pacing checkpoints) only fire for students whose
    // term started on or after this date. Older cohorts are considered
    // already handled/out of scope for this tracking system going forward.
    const EA_COHORT_CUTOFF = new Date('2026-07-01');
    const results: ActiveEa[] = [];
    for (const s of students) {
      if (!s.term_start_date || new Date(s.term_start_date) < EA_COHORT_CUTOFF) continue;
      const tier = momentumTier(s.momentum);
      // No PM Contact and Not Academically Engaged auto-detection turned
      // off at Kaylee's request — only the pacing checkpoints below stay
      // automatic. Both can still be logged manually via "Log an EA."
      // Pacing checkpoints fire once per term, not daily — suppressed by
      // checking the full closed-log history since this term started,
      // not just the last 24 hours.
      if (s.term_start_date) {
        const loggedThisTerm = (eaType: string) => allClosedLog.some((r) =>
          r.student_id === s.id && r.ea_type === eaType && new Date(r.created_at) >= new Date(s.term_start_date as string)
        );
        const daysIntoTerm = daysSince(s.term_start_date);
        const pacing2Trigger = new Date(new Date(s.term_start_date).getTime() + 60 * 86400000);
        if (daysIntoTerm >= 60 && businessDaysSince(pacing2Trigger) <= 7 && !loggedThisTerm('pacing_2m')) {
          results.push({
            key: `auto-pacing_2m-${s.id}`, student: s, eaType: 'pacing_2m',
            firedAt: pacing2Trigger.toISOString(), slaHours: slaHoursFor(EA_DEFS.pacing_2m, tier),
          });
        }
        const pacing4Trigger = new Date(new Date(s.term_start_date).getTime() + 120 * 86400000);
        if (daysIntoTerm >= 120 && businessDaysSince(pacing4Trigger) <= 7 && !loggedThisTerm('pacing_4m')) {
          results.push({
            key: `auto-pacing_4m-${s.id}`, student: s, eaType: 'pacing_4m',
            firedAt: pacing4Trigger.toISOString(), slaHours: slaHoursFor(EA_DEFS.pacing_4m, tier),
          });
        }
      }
    }
    return results;
  }, [students, recentlyClosed, allClosedLog]);

  const manualEAs: ActiveEa[] = useMemo(() => {
    return eaLog.map((row) => {
      const student = students.find((s) => s.id === row.student_id);
      if (!student) return null;
      return {
        key: `manual-${row.id}`, student, eaType: row.ea_type,
        firedAt: row.fired_at, slaHours: row.sla_hours || slaHoursFor(EA_DEFS[row.ea_type] || EA_DEFS.passed_oa, momentumTier(row.momentum_at_fire)),
        logRow: row,
      } as ActiveEa;
    }).filter(Boolean) as ActiveEa[];
  }, [eaLog, students]);

  const allActive = useMemo(() => {
    const combined = [...autoEAs, ...manualEAs];
    // Sort most-urgent first: hours remaining ascending (overdue ones go negative and sort first)
    return combined.sort((a, b) => {
      const aRemaining = a.slaHours - hoursSince(a.firedAt || new Date().toISOString());
      const bRemaining = b.slaHours - hoursSince(b.firedAt || new Date().toISOString());
      return aRemaining - bRemaining;
    });
  }, [autoEAs, manualEAs]);

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function logEa() {
    if (!supabase || !formStudentId) return;
    const student = students.find((s) => s.id === formStudentId);
    const tier = momentumTier(student?.momentum);
    const def = EA_DEFS[formEaType];
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (!uid) { alert('Could not confirm your login — try refreshing the page and logging this again.'); return; }
    const { error } = await supabase.from('work_ea_log').insert({
      user_id: uid,
      student_id: formStudentId,
      ea_type: formEaType,
      momentum_at_fire: student?.momentum || null,
      fired_at: formFiredAt,
      sla_hours: slaHoursFor(def, tier),
      status: 'open',
    });
    if (error) { alert(`EA log failed: ${error.message}`); return; }
    setShowLogForm(false);
    setFormStudentId('');
    setStudentSearch('');
    await load();
    onEaChange?.();
  }

  async function markManualHandled(row: EaLogRow, snippetUsed: string | null) {
    if (!supabase) return;
    const { error } = await supabase.from('work_ea_log').update({ status: 'closed', closed_at: new Date().toISOString(), snippet_used: snippetUsed }).eq('id', row.id);
    if (error) { alert(`EA update failed: ${error.message}`); return; }
    await load();
    onEaChange?.();
  }

  // Auto-detected EAs don't have a DB row of their own — marking one handled
  // creates a new closed log entry, both as a real record of what you did
  // and to suppress it from resurfacing for a day even if the underlying
  // date hasn't technically changed yet.
  async function markAutoHandled(ea: ActiveEa, snippetUsed: string | null) {
    if (!supabase) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (!uid) { alert('Could not confirm your login — try refreshing the page and marking this handled again.'); return; }
    const { error } = await supabase.from('work_ea_log').insert({
      user_id: uid,
      student_id: ea.student.id,
      ea_type: ea.eaType,
      momentum_at_fire: ea.student.momentum || null,
      fired_at: new Date().toISOString().slice(0, 10),
      sla_hours: ea.slaHours,
      status: 'closed',
      closed_at: new Date().toISOString(),
      snippet_used: snippetUsed,
    });
    if (error) { alert(`EA log failed: ${error.message}`); return; }
    await load();
    onEaChange?.();
  }

  const filteredStudentsForForm = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students.slice(0, 8);
    return students.filter((s) => s.display_name.toLowerCase().includes(q)).slice(0, 8);
  }, [students, studentSearch]);

  if (loading) return <div style={{ padding: 20 }}>Loading Essential Actions...</div>;

  return (
    <div>
      <div className="panel-head">
        <h2><ClipboardCheck size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />Essential Actions</h2>
        <button className="btn primary" onClick={() => setShowLogForm((v) => !v)}><Plus size={14} /> Log an EA</button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
        The "2-Month" and "4-Month Pacing Check-In" are detected automatically from your students' term start dates. Everything else — including "No PM Contact" and "Not Academically Engaged" — has to be logged manually via "Log an EA."
      </p>

      {showLogForm && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Log an Essential Action</h3>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <input
              placeholder="Search student by name..."
              value={formStudentId ? students.find((s) => s.id === formStudentId)?.display_name || '' : studentSearch}
              onChange={(e) => { setStudentSearch(e.target.value); setFormStudentId(''); }}
              style={{ width: '100%' }}
            />
            {studentSearch && !formStudentId && filteredStudentsForForm.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 2, maxHeight: 200, overflowY: 'auto' }}>
                {filteredStudentsForForm.map((s) => (
                  <div key={s.id} onClick={() => { setFormStudentId(s.id); setStudentSearch(''); }} style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                    {s.display_name} <span style={{ color: 'var(--muted)', fontSize: 11 }}>· {s.course || 'no course'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="form-grid" style={{ marginBottom: 10 }}>
            <select value={formEaType} onChange={(e) => setFormEaType(e.target.value)}>
              {MANUAL_EA_TYPES.map((key) => <option key={key} value={key}>{EA_DEFS[key].label}</option>)}
            </select>
            <input type="date" value={formFiredAt} onChange={(e) => setFormFiredAt(e.target.value)} />
          </div>
          <div className="form-actions">
            <button className="btn primary" disabled={!formStudentId} onClick={logEa}><Check size={14} /> Log It</button>
            <button className="btn ghost" onClick={() => setShowLogForm(false)}>Cancel</button>
          </div>
        </section>
      )}

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h3 style={{ margin: 0 }}>Active ({allActive.length})</h3></div>
        {allActive.length === 0 && <div className="brief-item">Nothing active right now.</div>}
        {allActive.map((ea) => {
          const def = EA_DEFS[ea.eaType];
          if (!def) return null;
          const remaining = ea.slaHours - hoursSince(ea.firedAt || new Date().toISOString());
          const overdue = remaining < 0;
          const isOpen = expanded.has(ea.key);
          const studentTps = touchpointsByStudent.get(ea.student.id) || [];
          const lastTp = studentTps[0];
          const lastGoal = extractStatedGoal(lastTp?.note);
          const lastRecap = extractLastSummary(lastTp?.note);
          const struggle = extractStruggle(lastTp?.note);

          return (
            <div key={ea.key} className="touchpoint-card" style={{ borderLeft: `3px solid ${overdue ? 'var(--red)' : remaining < 12 ? 'var(--amber)' : 'var(--border)'}` }}>
              <div className="panel-head" style={{ cursor: 'pointer' }} onClick={() => toggleExpand(ea.key)}>
                <div>
                  <strong>{ea.student.display_name}</strong>
                  <p>{def.label}{ea.student.course ? ` · ${ea.student.course}` : ''} · {ea.student.momentum || 'momentum unknown'}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: overdue ? 'var(--red)' : remaining < 12 ? 'var(--amber)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {overdue ? <AlertTriangle size={13} /> : <Clock size={13} />}
                    {overdue ? `SLA passed ${formatHoursOrDays(Math.abs(remaining))} ago` : `${formatHoursOrDays(remaining)} left`}
                  </span>
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
              </div>

              {isOpen && (
                <div style={{ padding: '0 4px 4px' }}>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{def.description}</p>

                  <div style={{ background: 'var(--surface-1)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
                      Matched snippet{def.snippets.length > 1 ? 's' : ''}{def.snippets.length > 1 ? ' — click the one you used' : ''}
                    </div>
                    {def.snippets.map((sn) => {
                      const isChosen = selectedSnippet[ea.key] === sn.shortcut;
                      return (
                        <div
                          key={sn.shortcut}
                          onClick={() => setSelectedSnippet((prev) => ({ ...prev, [ea.key]: sn.shortcut }))}
                          style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, cursor: 'pointer', padding: 4, borderRadius: 6, background: isChosen ? 'var(--purple-bg)' : 'transparent', border: isChosen ? '1px solid var(--purple)' : '1px solid transparent' }}
                        >
                          <code style={{ background: 'var(--purple-bg)', color: 'var(--purple)', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{sn.shortcut}</code>
                          <span style={{ fontSize: 12.5 }}>{sn.name}</span>
                          {isChosen && <Check size={13} color="var(--purple)" style={{ marginLeft: 'auto' }} />}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ background: 'var(--surface-1)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Personalize before sending</div>
                    {lastTp ? (
                      <>
                        <div style={{ fontSize: 12.5, marginBottom: 4 }}><strong>Last contact:</strong> {fmtDateShort(lastTp.touchpoint_date)} ({lastTp.touchpoint_type})</div>
                        {lastRecap && <div style={{ fontSize: 12.5, marginBottom: 4 }}><strong>Recap:</strong> {lastRecap}</div>}
                        {lastGoal && <div style={{ fontSize: 12.5, marginBottom: 4 }}><strong>Their stated goal:</strong> {lastGoal}</div>}
                        {struggle && <div style={{ fontSize: 12.5, marginBottom: 4 }}><strong>Named struggle:</strong> {struggle}</div>}
                        {!lastRecap && !lastGoal && !struggle && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No specific details extracted from the last note — reference it directly if useful.</div>}
                      </>
                    ) : (
                      <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No touchpoint history yet — this may be the first real contact.</div>
                    )}
                  </div>

                  <div className="form-actions">
                    <button
                      className="btn primary"
                      onClick={() => ea.logRow ? markManualHandled(ea.logRow, selectedSnippet[ea.key] || null) : markAutoHandled(ea, selectedSnippet[ea.key] || null)}
                    >
                      <Check size={14} /> Mark Handled
                    </button>
                  </div>
                  {!ea.logRow && (
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Auto-detected — marking this handled logs a real record and keeps it off this list for a day, even if the underlying date hasn't updated yet.</p>
                  )}
                </div>
              )}
            </div>

          );
        })}
      </section>

      <section className="panel">
        <div className="panel-head" style={{ cursor: 'pointer' }} onClick={() => setShowReference((v) => !v)}>
          <h3 style={{ margin: 0 }}>Full EA → Snippet Reference</h3>
          {showReference ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        {showReference && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['EA', 'Snippet(s)', 'SLA', 'Auto?'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--muted)' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(EA_DEFS).map(([key, def]) => (
                <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600 }}>{def.label}</td>
                  <td style={{ padding: '6px 8px' }}>{def.snippets.map((s) => <code key={s.shortcut} style={{ marginRight: 6 }}>{s.shortcut}</code>)}</td>
                  <td style={{ padding: '6px 8px' }}>{typeof def.slaHours === 'number' ? `${def.slaHours}h` : `${def.slaHours.low}h/${def.slaHours.high}h`}</td>
                  <td style={{ padding: '6px 8px' }}>{def.autoDetect ? '✅' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
