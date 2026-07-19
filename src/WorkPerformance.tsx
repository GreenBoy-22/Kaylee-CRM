// src/WorkPerformance.tsx
//
// Tracks work performance for the Work side of the Hub:
//  - Monthly KPI numbers (Enrollment, Drops, Graduates, OTP%, etc.) with trend charts
//  - Formal review archive (Midyear Check-Ins, Annual Comp Reviews) — full text + key facts
//  - Ad-hoc coaching/feedback notes with action items
//  - Goals with progress tracking against a target

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Plus, X, TrendingUp, FileText, MessageSquare, Target, Sparkles, ChevronDown, ChevronUp, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { supabase } from './lib/supabase';

// ── Types ────────────────────────────────────────────────────────────────

interface TouchpointRow {
  id: string;
  student_id: string;
  touchpoint_type: string;
  touchpoint_date: string;
  note: string;
  momentum: string | null;
}

interface AppointmentRow {
  id: string;
  student_id: string;
  appointment_at: string;
  is_weekly: boolean;
  missed: boolean;
  missed_email_sent: boolean;
  voicemail_left: boolean;
}

interface TermRecord {
  id: string;
  student_id: string;
  term_number: number;
  term_start_date: string | null;
  term_end_date: string;
  met_otp: boolean | null;
  outcome: 'continued' | 'dropped' | 'graduated' | 'deferred' | null;
}

interface MonthlyPrompt {
  user_id: string;
  month_key: string;
  starts_acknowledged: boolean;
  ends_acknowledged: boolean;
}

interface KpiMonth {
  id: string;
  month_date: string;
  enrollment_total: number | null;
  drops: number | null;
  graduates: number | null;
  otp_pct: number | null;
  grad_rate_4yr_pct: number | null;
  drop_rate_pct: number | null;
  pacing_2m_pct: number | null;
  pacing_4m_pct: number | null;
  vsat_pct: number | null;
  notes: string | null;
  otp_target_pct?: number | null;
  rolling_6m_otp_pct?: number | null;
  t1_t2_ret_pct?: number | null;
  t2_t3_ret_pct?: number | null;
  t3_plus_ret_pct?: number | null;
  on_time_starts_pct?: number | null;
  course_non_starts_pct?: number | null;
  limited_progress_pct?: number | null;
  w_vsat_pct?: number | null;
  avg_load?: number | null;
  calls_over_45s?: number | null;
  avg_call_time_min?: number | null;
  team_avg_calls_over_45s?: number | null;
  team_avg_call_time_min?: number | null;
  otp_met?: number | null;
  otp_total?: number | null;
  rolling_6m_otp_met?: number | null;
  rolling_6m_otp_total?: number | null;
  t1_t2_met?: number | null;
  t1_t2_total?: number | null;
  t2_t3_met?: number | null;
  t2_t3_total?: number | null;
  t3_plus_met?: number | null;
  t3_plus_total?: number | null;
}

interface Review {
  id: string;
  review_type: 'midyear_checkin' | 'annual_comp_review' | 'annual_review' | 'other';
  title: string;
  review_date: string;
  period_start: string | null;
  period_end: string | null;
  performance_rating: string | null;
  base_pay_before: number | null;
  base_pay_after: number | null;
  pay_increase_pct: number | null;
  manager_name: string | null;
  full_text: string | null;
}

interface CoachingNote {
  id: string;
  note_date: string;
  subject: string;
  from_person: string | null;
  summary: string | null;
  full_text: string | null;
  action_items: { text: string; done: boolean }[];
  status: 'open' | 'addressed' | 'ongoing';
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  metric_name: string | null;
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
  fiscal_year: string | null;
  due_date: string | null;
  status: 'on_track' | 'at_risk' | 'achieved' | 'missed';
}

interface StudentRow {
  id: string;
  display_name: string;
  risk: string;
  momentum: string | null;
  last_contact_date: string | null;
  next_call_at: string | null;
  missed_call_count: number | null;
  known_blockers: string | null;
  next_conversation_focus: string | null;
  on_term_break?: boolean;
  term_break_expected_back?: string | null;
  term_number?: number;
  term_start_date?: string | null;
  term_end_date?: string | null;
  graduated?: boolean;
}

const BLANK_KPI = { month_date: '', enrollment_total: '', drops: '', graduates: '', otp_pct: '', grad_rate_4yr_pct: '', drop_rate_pct: '', pacing_2m_pct: '', pacing_4m_pct: '', vsat_pct: '', notes: '', t1_t2_ret_pct: '', t2_t3_ret_pct: '', t3_plus_ret_pct: '', otp_met: '', otp_total: '', rolling_6m_otp_met: '', rolling_6m_otp_total: '', t1_t2_met: '', t1_t2_total: '', t2_t3_met: '', t2_t3_total: '', t3_plus_met: '', t3_plus_total: '' };
const BLANK_REVIEW = { review_type: 'midyear_checkin' as Review['review_type'], title: '', review_date: '', period_start: '', period_end: '', performance_rating: '', base_pay_before: '', base_pay_after: '', pay_increase_pct: '', manager_name: '', full_text: '' };
const BLANK_NOTE = { note_date: '', subject: '', from_person: '', summary: '', full_text: '', status: 'open' as CoachingNote['status'] };
const BLANK_GOAL = { title: '', description: '', metric_name: '', target_value: '', current_value: '', unit: '%', fiscal_year: '', due_date: '', status: 'on_track' as Goal['status'] };

const STATUS_COLORS: Record<string, string> = {
  on_track: '#16a34a', at_risk: '#f59e0b', achieved: '#4B5320', missed: '#dc2626',
  open: '#f59e0b', addressed: '#16a34a', ongoing: '#0891b2',
};

// Known program/college-level benchmarks (from your mentor dashboard and
// the FY26 BSCSIA program wins summary). These are what WGU is actually
// asking you to hit, separate from your own personal goals.
const PROGRAM_TARGETS = [
  { label: 'Term OTP', target: '49.20%', source: 'Monthly mentor dashboard target' },
  { label: 'W-VSAT (Student Satisfaction)', target: '52%', source: 'Monthly mentor dashboard target' },
  { label: '4-Year Grad Rate', target: '28%', source: 'FY26 program goal (program hit 30%+)' },
  { label: 'Program OTP Goal (annual)', target: '45%', source: 'FY26 program goal (program hit 49%)' },
];

// Definitions straight from your mentor dashboard's own glossary, paired
// with concrete "how to move this number" tips grounded in your manager's
// actual coaching (structured pacing conversations, Momentum Indicator
// reviews, avoiding call gaps, prioritizing low-momentum/0-CU/no-contact
// students) rather than generic advice.
const METRIC_INFO: Record<string, { color: string; definition: string; tip: string }> = {
  'OTP %': {
    color: '#4B5320',
    definition: 'Term On-Time Progress: % of students ending a term who met the pace needed to stay on track for on-time graduation.',
    tip: 'Run Momentum Indicator reviews mid-term (not just at term-end) so a slipping student gets a pacing conversation before it shows up as a miss. Prioritize your Low/Med-Low momentum students first — see Weak Areas tab.',
  },
  'Pacing 2M %': {
    color: '#0891b2',
    definition: '2-Month Pacing: % of students who completed at least 1 course within the first 2 months of their term.',
    tip: 'This is won or lost in week 1-2. A quick "did you register and start?" outreach right after term-start catches non-starters before they become a 2M miss.',
  },
  'Pacing 4M %': {
    color: '#16a34a',
    definition: '4-Month Pacing: % of students who completed their expected competency units (CUs) by month 4 of the term.',
    tip: 'A structured mid-term check-in around week 6-8 (not waiting until month 4) gives you time to correct course. Your own Team Giraldi Handbook/SOP is built for exactly this kind of consistency — lean on it.',
  },
  'Drop Rate %': {
    color: '#dc2626',
    definition: '% of active students who dropped that month.',
    tip: 'Your dashboard\'s own suggested priority list applies directly: inactive students, low momentum, no registration, 0 CUs at 3 months, and low OTP are your highest drop-risk group — call these first.',
  },
};

const OTHER_METRIC_INFO: { label: string; definition: string; tip: string }[] = [
  { label: 'VSAT (M-VSAT / W-VSAT)', definition: '% of students reporting "very satisfied" with mentoring support (M-VSAT) or their overall WGU experience (W-VSAT). Needs 10+ survey responses per period or it shows blank.', tip: 'Per your own manager feedback: students are most satisfied when mentors are genuine, responsive, and adaptive to how they learn — fast response times and non-scripted calls move this more than call volume alone.' },
  { label: 'T1→T2 / T2→T3 / T3+ Retention', definition: '% of students who continued into their next term, segmented by how many terms they\'ve already completed.', tip: 'Early terms (T1→T2) respond well to onboarding-style connection calls. Later terms (T3+) usually need blocker-specific problem-solving — check each student\'s known_blockers notes before the call, not during it.' },
  { label: 'On-Time Starts / Course Non-Starts', definition: 'On-Time Starts = % of courses activated on/before their scheduled start date. Course Non-Starts = % of registered courses never started that term.', tip: 'A reminder outreach 3-5 days before a course\'s scheduled start date (not after it\'s already late) is the highest-leverage moment for this one.' },
  { label: '4-Year Grad Rate', definition: '% of students who graduate within 4 years of starting their program.', tip: 'This is a lagging, longer-horizon metric — the biggest lever is actually keeping T1→T2 retention high, since most attrition that eventually hurts 4-year grad rate happens in a student\'s first year.' },
];

const STATUS_LABELS: Record<string, string> = {
  on_track: 'On Track', at_risk: 'At Risk', achieved: 'Achieved', missed: 'Missed',
  open: 'Open', addressed: 'Addressed', ongoing: 'Ongoing',
};

function fmtMonth(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}
function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function n(v: string): number | null { return v.trim() === '' ? null : parseFloat(v); }

// ── Lightweight inline SVG line chart (no chart library dependency) ───────

function TrendChart({ data, fields }: { data: KpiMonth[]; fields: { key: keyof KpiMonth; label: string; color: string }[] }) {
  const width = 700, height = 240, padL = 40, padR = 10, padT = 10, padB = 28;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const sorted = [...data].sort((a, b) => a.month_date.localeCompare(b.month_date));
  const [hover, setHover] = useState<{ x: number; y: number; monthLabel: string; entries: { label: string; color: string; value: number }[] } | null>(null);
  if (sorted.length === 0) return null;

  const allVals = fields.flatMap(f => sorted.map(d => d[f.key] as number | null).filter((v): v is number => v !== null));
  const maxVal = Math.max(10, ...allVals) * 1.1;

  function xFor(i: number) { return padL + (sorted.length <= 1 ? 0 : (i / (sorted.length - 1)) * plotW); }
  function yFor(v: number) { return padT + plotH - (v / maxVal) * plotH; }

  function showHoverFor(i: number) {
    const d = sorted[i];
    const entries = fields
      .map(f => ({ label: f.label, color: f.color, value: d[f.key] as number | null }))
      .filter((e): e is { label: string; color: string; value: number } => e.value !== null);
    if (entries.length === 0) return;
    setHover({ x: xFor(i), y: padT, monthLabel: fmtMonth(d.month_date), entries });
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }} onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={padL} x2={width - padR} y1={padT + plotH * (1 - f)} y2={padT + plotH * (1 - f)} stroke="var(--border)" strokeWidth={1} />
        ))}
        {sorted.map((d, i) => (
          <text key={d.id} x={xFor(i)} y={height - 8} fontSize={10} textAnchor="middle" fill="var(--muted)">{fmtMonth(d.month_date)}</text>
        ))}
        {fields.map(f => {
          const pts = sorted.map((d, i) => ({ x: xFor(i), y: d[f.key] !== null ? yFor(d[f.key] as number) : null }));
          const path = pts.filter(p => p.y !== null).map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          return (
            <g key={String(f.key)}>
              <path d={path} fill="none" stroke={f.color} strokeWidth={2} />
              {pts.map((p, i) => p.y !== null && <circle key={i} cx={p.x} cy={p.y} r={3} fill={f.color} />)}
            </g>
          );
        })}
        {/* Invisible wide hit-areas per month, so hovering anywhere near a
            month's column shows that month's values — easier to hit than
            the small dots themselves, and works with touch/scroll too. */}
        {sorted.map((d, i) => (
          <rect
            key={`hit-${d.id}`}
            x={xFor(i) - (plotW / Math.max(1, sorted.length - 1)) / 2}
            y={padT}
            width={plotW / Math.max(1, sorted.length - 1)}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => showHoverFor(i)}
            onTouchStart={() => showHoverFor(i)}
            style={{ cursor: 'pointer' }}
          />
        ))}
        {hover && <line x1={hover.x} x2={hover.x} y1={padT} y2={padT + plotH} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3,3" />}
      </svg>
      {hover && (
        <div style={{
          position: 'absolute',
          left: `${Math.min(78, Math.max(2, (hover.x / width) * 100))}%`,
          top: 4,
          background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '8px 10px', fontSize: 11, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', pointerEvents: 'none', zIndex: 5, minWidth: 120,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{hover.monthLabel}</div>
          {hover.entries.map(e => (
            <div key={e.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: e.color, display: 'inline-block' }} />
              <span>{e.label}: <strong>{e.value}%</strong></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────

export default function WorkPerformance() {
  const [tab, setTab] = useState<'kpi' | 'reviews' | 'coaching' | 'goals' | 'insights'>('insights');
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [allStudents, setAllStudents] = useState<StudentRow[]>([]); // unfiltered — needed for term-break re-entry candidates
  const [touchpoints, setTouchpoints] = useState<TouchpointRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [termHistory, setTermHistory] = useState<TermRecord[]>([]);
  const [monthlyPrompt, setMonthlyPrompt] = useState<MonthlyPrompt | null>(null);
  const [showStartsModal, setShowStartsModal] = useState(false);
  const [deferringId, setDeferringId] = useState<string | null>(null);
  const [deferDate, setDeferDate] = useState('');
  const [showEndsModal, setShowEndsModal] = useState(false);
  const [endsDraft, setEndsDraft] = useState<Record<string, { met_otp: boolean | null; outcome: TermRecord['outcome'] }>>({});

  const [kpis, setKpis] = useState<KpiMonth[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [notes, setNotes] = useState<CoachingNote[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  const [showKpiForm, setShowKpiForm] = useState(false);
  const [expandedRecap, setExpandedRecap] = useState<string | null>(null);
  const [expandedStat, setExpandedStat] = useState<'high_risk' | 'low_momentum' | 'no_contact' | 'overdue' | null>(null);
  const [kpiForm, setKpiForm] = useState({ ...BLANK_KPI });
  const [showKpiPaste, setShowKpiPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteMsg, setPasteMsg] = useState('');

  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewForm, setReviewForm] = useState({ ...BLANK_REVIEW });
  const [expandedReview, setExpandedReview] = useState<string | null>(null);

  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteForm, setNoteForm] = useState({ ...BLANK_NOTE });
  const [expandedNote, setExpandedNote] = useState<string | null>(null);

  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({ ...BLANK_GOAL });

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data: sd } = await supabase.auth.getSession();
    const uid = sd.session?.user?.id;
    if (!uid) { setLoading(false); return; }
    const monthKey = new Date().toISOString().slice(0, 7);
    const [k, r, c, g, s, tp, ap, th, mp] = await Promise.all([
      supabase.from('work_kpi_monthly').select('*').eq('user_id', uid).order('month_date', { ascending: true }),
      supabase.from('work_reviews').select('*').eq('user_id', uid).order('review_date', { ascending: false }),
      supabase.from('work_coaching_notes').select('*').eq('user_id', uid).order('note_date', { ascending: false }),
      supabase.from('work_goals').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('students').select('id, display_name, risk, momentum, last_contact_date, next_call_at, missed_call_count, known_blockers, next_conversation_focus, on_term_break, term_break_expected_back, term_number, term_start_date, term_end_date, graduated').eq('archived', false),
      supabase.from('student_touchpoints').select('id, student_id, touchpoint_type, touchpoint_date, note, momentum').order('touchpoint_date', { ascending: true }),
      supabase.from('student_appointments').select('id, student_id, appointment_at, is_weekly, missed, missed_email_sent, voicemail_left').order('appointment_at', { ascending: true }),
      supabase.from('student_term_history').select('id, student_id, term_number, term_start_date, term_end_date, met_otp, outcome').order('term_end_date', { ascending: true }),
      supabase.from('work_monthly_prompts').select('*').eq('user_id', uid).eq('month_key', monthKey).maybeSingle(),
    ]);
    setKpis((k.data as KpiMonth[]) ?? []);
    setReviews((r.data as Review[]) ?? []);
    setNotes((c.data as CoachingNote[]) ?? []);
    setGoals((g.data as Goal[]) ?? []);
    const rawStudents = (s.data as StudentRow[]) ?? [];
    setAllStudents(rawStudents);
    setStudents(rawStudents.filter((st) => !st.on_term_break));
    setTouchpoints((tp.data as TouchpointRow[]) ?? []);
    setAppointments((ap.data as AppointmentRow[]) ?? []);
    setTermHistory((th.data as TermRecord[]) ?? []);
    setMonthlyPrompt((mp.data as MonthlyPrompt | null) ?? { user_id: uid, month_key: monthKey, starts_acknowledged: false, ends_acknowledged: false });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Term tracking: monthly popups ──────────────────────────────────────
  const termStartCandidates = useMemo(() => {
    return allStudents.filter(st => !st.graduated && (!st.term_start_date || st.on_term_break));
  }, [allStudents]);

  const monthKeyNow = new Date().toISOString().slice(0, 7);
  const termEndCandidates = useMemo(() => {
    const decidedKeys = new Set(termHistory.map(t => `${t.student_id}__${t.term_end_date}`));
    return allStudents.filter(st =>
      !st.graduated && !st.on_term_break && st.term_end_date &&
      st.term_end_date.slice(0, 7) < monthKeyNow &&  // term's end month has fully passed — surfaces on the 1st of the following month, and stays until resolved even if a month gets missed
      !decidedKeys.has(`${st.id}__${st.term_end_date}`)
    );
  }, [allStudents, termHistory, monthKeyNow]);

  // Auto-popups shouldn't fire the instant you open the page each month —
  // term ends need the month to have actually finished (handled by the
  // candidate filter above), and term starts get a week's buffer before nagging.
  const todayDayOfMonth = new Date().getDate();

  useEffect(() => {
    if (loading || !monthlyPrompt) return;
    if (!monthlyPrompt.starts_acknowledged && termStartCandidates.length > 0 && todayDayOfMonth >= 7) { setShowStartsModal(true); return; }
    if (!monthlyPrompt.ends_acknowledged && termEndCandidates.length > 0) { setShowEndsModal(true); }
  }, [loading, monthlyPrompt, termStartCandidates.length, termEndCandidates.length, todayDayOfMonth]);

  async function ackPrompt(which: 'starts' | 'ends') {
    if (!supabase) return;
    const { data: sd } = await supabase.auth.getSession();
    const uid = sd.session?.user?.id;
    if (!uid) return;
    const monthKey = new Date().toISOString().slice(0, 7);
    const patch = which === 'starts' ? { starts_acknowledged: true } : { ends_acknowledged: true };
    await supabase.from('work_monthly_prompts').upsert({ user_id: uid, month_key: monthKey, ...patch }, { onConflict: 'user_id,month_key' });
    setMonthlyPrompt((p) => p ? { ...p, ...patch } : p);
  }

  async function resolveStart(student: StudentRow, action: 'start' | 'defer', deferUntil?: string) {
    if (!supabase) return;
    if (action === 'start') {
      const today = new Date().toISOString().slice(0, 10);
      const sixMonthsOut = new Date(); sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);
      await supabase.from('students').update({
        term_start_date: today, term_end_date: sixMonthsOut.toISOString().slice(0, 10), on_term_break: false, term_break_expected_back: null
      }).eq('id', student.id);
      setAllStudents((cur) => cur.map(s => s.id === student.id ? { ...s, on_term_break: false, term_break_expected_back: null } : s));
    } else {
      await supabase.from('students').update({ on_term_break: true, term_break_expected_back: deferUntil || null }).eq('id', student.id);
      setAllStudents((cur) => cur.map(s => s.id === student.id ? { ...s, on_term_break: true, term_break_expected_back: deferUntil || null } : s));
    }
    load();
  }

  function setEndsDraftField(studentId: string, patch: Partial<{ met_otp: boolean | null; outcome: TermRecord['outcome'] }>) {
    setEndsDraft((cur) => ({ ...cur, [studentId]: { met_otp: null, outcome: null, ...cur[studentId], ...patch } }));
  }

  async function resolveEnd(student: StudentRow) {
    if (!supabase) return;
    const draft = endsDraft[student.id];
    if (!draft || !draft.outcome) return;
    const termEndDate = student.term_end_date as string;
    await supabase.from('student_term_history').insert({
      student_id: student.id,
      term_number: student.term_number ?? 1,
      term_start_date: student.term_start_date || null,
      term_end_date: termEndDate,
      met_otp: draft.met_otp,
      outcome: draft.outcome
    });
    if (draft.outcome === 'continued') {
      const nextStart = termEndDate;
      const nextEnd = new Date(termEndDate); nextEnd.setMonth(nextEnd.getMonth() + 6);
      await supabase.from('students').update({
        term_number: (student.term_number ?? 1) + 1, term_start_date: nextStart, term_end_date: nextEnd.toISOString().slice(0, 10), on_term_break: false
      }).eq('id', student.id);
    } else if (draft.outcome === 'graduated') {
      await supabase.from('students').update({ graduated: true, graduation_date: termEndDate, status: 'Graduated' }).eq('id', student.id);
    } else if (draft.outcome === 'deferred') {
      await supabase.from('students').update({ on_term_break: true }).eq('id', student.id);
    } else if (draft.outcome === 'dropped') {
      await supabase.from('students').update({ status: 'Dropped' }).eq('id', student.id);
    }
    setEndsDraft((cur) => { const next = { ...cur }; delete next[student.id]; return next; });
    load();
  }

  // ── KPI ──────────────────────────────────────────────────────────────
  async function saveKpi() {
    if (!supabase || !kpiForm.month_date) return;
    const { data: sd } = await supabase.auth.getSession();
    const uid = sd.session?.user?.id;
    if (!uid) return;
    await supabase.from('work_kpi_monthly').upsert({
      user_id: uid,
      month_date: kpiForm.month_date + '-01',
      enrollment_total: n(kpiForm.enrollment_total),
      drops: n(kpiForm.drops),
      graduates: n(kpiForm.graduates),
      otp_pct: n(kpiForm.otp_pct),
      grad_rate_4yr_pct: n(kpiForm.grad_rate_4yr_pct),
      drop_rate_pct: n(kpiForm.drop_rate_pct),
      pacing_2m_pct: n(kpiForm.pacing_2m_pct),
      pacing_4m_pct: n(kpiForm.pacing_4m_pct),
      vsat_pct: n(kpiForm.vsat_pct),
      t1_t2_ret_pct: n(kpiForm.t1_t2_ret_pct),
      t2_t3_ret_pct: n(kpiForm.t2_t3_ret_pct),
      t3_plus_ret_pct: n(kpiForm.t3_plus_ret_pct),
      otp_met: n(kpiForm.otp_met),
      otp_total: n(kpiForm.otp_total),
      rolling_6m_otp_met: n(kpiForm.rolling_6m_otp_met),
      rolling_6m_otp_total: n(kpiForm.rolling_6m_otp_total),
      t1_t2_met: n(kpiForm.t1_t2_met),
      t1_t2_total: n(kpiForm.t1_t2_total),
      t2_t3_met: n(kpiForm.t2_t3_met),
      t2_t3_total: n(kpiForm.t2_t3_total),
      t3_plus_met: n(kpiForm.t3_plus_met),
      t3_plus_total: n(kpiForm.t3_plus_total),
      notes: kpiForm.notes || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,month_date' });
    setKpiForm({ ...BLANK_KPI });
    setShowKpiForm(false);
    await load();
  }

  async function deleteKpi(id: string) {
    if (!supabase || !confirm('Delete this month?')) return;
    await supabase.from('work_kpi_monthly').delete().eq('id', id);
    await load();
  }

  async function extractKpiFromPaste() {
    if (!supabase || !pasteText.trim()) return;
    setPasteBusy(true);
    setPasteMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: {
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: `Extract monthly KPI data from this pasted table/text and return ONLY a JSON array, no markdown, no explanation. Each entry: {"month_date":"YYYY-MM","enrollment_total":number|null,"drops":number|null,"graduates":number|null,"otp_pct":number|null,"grad_rate_4yr_pct":number|null,"drop_rate_pct":number|null,"pacing_2m_pct":number|null,"pacing_4m_pct":number|null,"vsat_pct":number|null,"t1_t2_ret_pct":number|null,"t2_t3_ret_pct":number|null,"t3_plus_ret_pct":number|null}. "otp_pct" should be the Term OTP value if both Term OTP and 6-month rolling OTP are present. t1_t2_ret_pct/t2_t3_ret_pct/t3_plus_ret_pct are retention rates for students moving from term 1→2, term 2→3, and term 3+ respectively. Skip any "Total" column — only individual months. Infer the year from context (fiscal years like "FY26" typically run Jul-Jun; e.g. Jul-25 through Jun-26). If a cell is blank, use null.\n\nText:\n${pasteText.slice(0, 6000)}`,
          }],
        },
      });
      if (error) throw error;
      const text = data?.content?.[0]?.text ?? '';
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) { setPasteMsg('Could not find any KPI rows in that text.'); setPasteBusy(false); return; }
      const rows = JSON.parse(match[0]) as any[];
      const { data: sd } = await supabase.auth.getSession();
      const uid = sd.session?.user?.id;
      if (!uid) { setPasteBusy(false); return; }
      let saved = 0;
      for (const row of rows) {
        if (!row.month_date) continue;
        const monthDate = row.month_date.length === 7 ? row.month_date + '-01' : row.month_date;
        const { error: upErr } = await supabase.from('work_kpi_monthly').upsert({
          user_id: uid, month_date: monthDate,
          enrollment_total: row.enrollment_total ?? null, drops: row.drops ?? null, graduates: row.graduates ?? null,
          otp_pct: row.otp_pct ?? null, grad_rate_4yr_pct: row.grad_rate_4yr_pct ?? null, drop_rate_pct: row.drop_rate_pct ?? null,
          pacing_2m_pct: row.pacing_2m_pct ?? null, pacing_4m_pct: row.pacing_4m_pct ?? null, vsat_pct: row.vsat_pct ?? null,
          t1_t2_ret_pct: row.t1_t2_ret_pct ?? null, t2_t3_ret_pct: row.t2_t3_ret_pct ?? null, t3_plus_ret_pct: row.t3_plus_ret_pct ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,month_date' });
        if (!upErr) saved++;
      }
      setPasteMsg(`✅ Imported ${saved} month(s).`);
      setPasteText('');
      await load();
    } catch (err) {
      setPasteMsg(`Error: ${err instanceof Error ? err.message : 'Could not extract data.'}`);
    }
    setPasteBusy(false);
  }

  // ── Reviews ──────────────────────────────────────────────────────────
  async function saveReview() {
    if (!supabase || !reviewForm.title.trim() || !reviewForm.review_date) return;
    const { data: sd } = await supabase.auth.getSession();
    const uid = sd.session?.user?.id;
    if (!uid) return;
    await supabase.from('work_reviews').insert({
      user_id: uid,
      review_type: reviewForm.review_type,
      title: reviewForm.title.trim(),
      review_date: reviewForm.review_date,
      period_start: reviewForm.period_start || null,
      period_end: reviewForm.period_end || null,
      performance_rating: reviewForm.performance_rating || null,
      base_pay_before: n(reviewForm.base_pay_before),
      base_pay_after: n(reviewForm.base_pay_after),
      pay_increase_pct: n(reviewForm.pay_increase_pct),
      manager_name: reviewForm.manager_name || null,
      full_text: reviewForm.full_text || null,
    });
    setReviewForm({ ...BLANK_REVIEW });
    setShowReviewForm(false);
    await load();
  }

  async function deleteReview(id: string) {
    if (!supabase || !confirm('Delete this review?')) return;
    await supabase.from('work_reviews').delete().eq('id', id);
    await load();
  }

  // ── Coaching notes ───────────────────────────────────────────────────
  async function saveNote() {
    if (!supabase || !noteForm.subject.trim() || !noteForm.note_date) return;
    const { data: sd } = await supabase.auth.getSession();
    const uid = sd.session?.user?.id;
    if (!uid) return;
    await supabase.from('work_coaching_notes').insert({
      user_id: uid,
      note_date: noteForm.note_date,
      subject: noteForm.subject.trim(),
      from_person: noteForm.from_person || null,
      summary: noteForm.summary || null,
      full_text: noteForm.full_text || null,
      status: noteForm.status,
      action_items: [],
    });
    setNoteForm({ ...BLANK_NOTE });
    setShowNoteForm(false);
    await load();
  }

  async function deleteNote(id: string) {
    if (!supabase || !confirm('Delete this note?')) return;
    await supabase.from('work_coaching_notes').delete().eq('id', id);
    await load();
  }

  async function toggleActionItem(note: CoachingNote, idx: number) {
    if (!supabase) return;
    const updated = note.action_items.map((a, i) => i === idx ? { ...a, done: !a.done } : a);
    await supabase.from('work_coaching_notes').update({ action_items: updated }).eq('id', note.id);
    setNotes(prev => prev.map(n2 => n2.id === note.id ? { ...n2, action_items: updated } : n2));
  }

  async function setNoteStatus(id: string, status: CoachingNote['status']) {
    if (!supabase) return;
    await supabase.from('work_coaching_notes').update({ status }).eq('id', id);
    setNotes(prev => prev.map(n2 => n2.id === id ? { ...n2, status } : n2));
  }

  // ── Goals ────────────────────────────────────────────────────────────
  async function saveGoal() {
    if (!supabase || !goalForm.title.trim()) return;
    const { data: sd } = await supabase.auth.getSession();
    const uid = sd.session?.user?.id;
    if (!uid) return;
    await supabase.from('work_goals').insert({
      user_id: uid,
      title: goalForm.title.trim(),
      description: goalForm.description || null,
      metric_name: goalForm.metric_name || null,
      target_value: n(goalForm.target_value),
      current_value: n(goalForm.current_value),
      unit: goalForm.unit || null,
      fiscal_year: goalForm.fiscal_year || null,
      due_date: goalForm.due_date || null,
      status: goalForm.status,
    });
    setGoalForm({ ...BLANK_GOAL });
    setShowGoalForm(false);
    await load();
  }

  async function updateGoalProgress(goal: Goal, newValue: number) {
    if (!supabase) return;
    await supabase.from('work_goals').update({ current_value: newValue, updated_at: new Date().toISOString() }).eq('id', goal.id);
    setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, current_value: newValue } : g));
  }

  async function deleteGoal(id: string) {
    if (!supabase || !confirm('Delete this goal?')) return;
    await supabase.from('work_goals').delete().eq('id', id);
    await load();
  }

  const latestKpi = kpis[kpis.length - 1];

  const autoKpi = useMemo(() => {
    const closedThisMonth = termHistory.filter(t => t.term_end_date.slice(0, 7) === monthKeyNow);
    const otpDecided = closedThisMonth.filter(t => t.met_otp !== null);
    const otpPct = otpDecided.length > 0 ? Math.round((otpDecided.filter(t => t.met_otp).length / otpDecided.length) * 100) : null;

    const retentionFor = (termNum: number | 'plus') => {
      const pool = termHistory.filter(t => termNum === 'plus' ? t.term_number >= 3 : t.term_number === termNum);
      const decided = pool.filter(t => t.outcome === 'continued' || t.outcome === 'dropped');
      if (decided.length === 0) return null;
      return Math.round((decided.filter(t => t.outcome === 'continued').length / decided.length) * 100);
    };

    const gradCount = termHistory.filter(t => t.outcome === 'graduated').length;

    return {
      otpPct, closedCount: closedThisMonth.length,
      t1t2: retentionFor(1), t2t3: retentionFor(2), t3plus: retentionFor('plus'),
      gradCount
    };
  }, [termHistory, monthKeyNow]);

  return (
    <>
      {showStartsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface-0, #fff)', borderRadius: 12, maxWidth: 560, width: '100%', maxHeight: '80vh', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>📆 Verify Term Starts — {fmtMonth(monthKeyNow + '-01')}</h2>
              <button className="btn ghost tiny" onClick={() => setShowStartsModal(false)}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
              These students don't have a confirmed term in progress yet (new, or currently on term break). For each, confirm whether their term is starting now or being deferred.
            </p>
            {termStartCandidates.map(st => (
              <div key={st.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 6 }}>
                <div>
                  <strong style={{ fontSize: 13 }}>{st.display_name}</strong>
                  {st.on_term_break && (
                    <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>
                      currently on term break{st.term_break_expected_back ? ` · expected back ${fmtDate(st.term_break_expected_back)}` : ''}
                    </span>
                  )}
                </div>
                {deferringId === st.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="date"
                      value={deferDate}
                      onChange={(e) => setDeferDate(e.target.value)}
                      style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)' }}
                    />
                    <button
                      className="btn tiny"
                      style={{ background: '#16a34a', color: '#fff' }}
                      onClick={() => { resolveStart(st, 'defer', deferDate); setDeferringId(null); }}
                    >
                      Confirm
                    </button>
                    <button className="btn ghost tiny" onClick={() => setDeferringId(null)}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn tiny" style={{ background: '#16a34a', color: '#fff' }} onClick={() => resolveStart(st, 'start')}>Starting Now</button>
                    <button
                      className="btn ghost tiny"
                      onClick={() => {
                        setDeferringId(st.id);
                        const base = st.term_break_expected_back ? new Date(`${st.term_break_expected_back}T00:00:00`) : new Date();
                        base.setDate(base.getDate() + 30);
                        setDeferDate(base.toISOString().slice(0, 10));
                      }}
                    >
                      ☕ Deferring
                    </button>
                  </div>
                )}
              </div>
            ))}
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn primary" onClick={() => { ackPrompt('starts'); setShowStartsModal(false); }}>Done for this month</button>
            </div>
          </div>
        </div>
      )}

      {showEndsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface-0, #fff)', borderRadius: 12, maxWidth: 640, width: '100%', maxHeight: '80vh', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>🏁 Verify Term Ends — {fmtMonth(monthKeyNow + '-01')}</h2>
              <button className="btn ghost tiny" onClick={() => setShowEndsModal(false)}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
              These students' terms end this month. For each: did they meet OTP, and what happened next? This feeds your real OTP and retention numbers automatically.
            </p>
            {termEndCandidates.map(st => {
              const draft = endsDraft[st.id] || { met_otp: null, outcome: null };
              return (
                <div key={st.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <strong style={{ fontSize: 13 }}>{st.display_name}</strong>
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>Term {st.term_number ?? 1} · ends {st.term_end_date}</span>
                  <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Met OTP?</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn tiny" style={draft.met_otp === true ? { background: '#16a34a', color: '#fff' } : {}} onClick={() => setEndsDraftField(st.id, { met_otp: true })}>Yes</button>
                        <button className="btn tiny" style={draft.met_otp === false ? { background: '#dc2626', color: '#fff' } : {}} onClick={() => setEndsDraftField(st.id, { met_otp: false })}>No</button>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Outcome</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button className="btn tiny" style={draft.outcome === 'continued' ? { background: '#16a34a', color: '#fff' } : {}} onClick={() => setEndsDraftField(st.id, { outcome: 'continued' })}>Continued</button>
                        <button className="btn tiny" style={draft.outcome === 'graduated' ? { background: '#4B5320', color: '#fff' } : {}} onClick={() => setEndsDraftField(st.id, { outcome: 'graduated' })}>🎓 Graduated</button>
                        <button className="btn tiny" style={draft.outcome === 'dropped' ? { background: '#dc2626', color: '#fff' } : {}} onClick={() => setEndsDraftField(st.id, { outcome: 'dropped' })}>Dropped</button>
                        <button className="btn tiny" style={draft.outcome === 'deferred' ? { background: '#666', color: '#fff' } : {}} onClick={() => setEndsDraftField(st.id, { outcome: 'deferred' })}>☕ Deferred</button>
                      </div>
                    </div>
                    <button className="btn primary tiny" disabled={!draft.outcome} onClick={() => resolveEnd(st)} style={{ alignSelf: 'flex-end' }}>Save</button>
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn primary" onClick={() => { ackPrompt('ends'); setShowEndsModal(false); }}>Done for this month</button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1>Work Performance</h1>
          <p>Tracking KPIs, reviews, coaching, and goals</p>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={tab === 'insights' ? 'active' : ''} onClick={() => setTab('insights')}><Sparkles size={13} /> Weak Areas &amp; Suggestions</button>
        <button className={tab === 'kpi' ? 'active' : ''} onClick={() => setTab('kpi')}><TrendingUp size={13} /> KPI Dashboard</button>
        <button className={tab === 'reviews' ? 'active' : ''} onClick={() => setTab('reviews')}><FileText size={13} /> Reviews ({reviews.length})</button>
        <button className={tab === 'coaching' ? 'active' : ''} onClick={() => setTab('coaching')}><MessageSquare size={13} /> Coaching Notes ({notes.length})</button>
        <button className={tab === 'goals' ? 'active' : ''} onClick={() => setTab('goals')}><Target size={13} /> Goals ({goals.length})</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button className="btn ghost tiny" onClick={() => setShowStartsModal(true)}>📆 Verify Term Starts {termStartCandidates.length > 0 ? `(${termStartCandidates.length})` : ''}</button>
        <button className="btn ghost tiny" onClick={() => setShowEndsModal(true)}>🏁 Verify Term Ends {termEndCandidates.length > 0 ? `(${termEndCandidates.length})` : ''}</button>
      </div>

      {loading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</p>}

      {/* ── INSIGHTS: weak areas + student-based suggestions ── */}
      {!loading && tab === 'insights' && (() => {
        const latest = kpis[kpis.length - 1];
        const highRisk = students.filter(s => (s.risk ?? '').toLowerCase().includes('high'));
        const lowMomentum = students.filter(s => ['low', 'med low'].includes((s.momentum ?? '').toLowerCase().trim()));
        const now = Date.now();
        const noContact14d = students.filter(s => !s.last_contact_date || (now - new Date(s.last_contact_date).getTime()) / 86400000 > 14);
        const criticalList = students.filter(s =>
          (s.risk ?? '').toLowerCase().includes('high') &&
          (!s.last_contact_date || (now - new Date(s.last_contact_date).getTime()) / 86400000 > 14)
        );
        const withBlockers = students.filter(s => s.known_blockers && s.known_blockers.trim());
        const overdueCallPrep = students.filter(s => s.next_call_at && new Date(s.next_call_at).getTime() < now);

        // Students whose most recent 2+ logged appointments were all missed —
        // a distinct early-warning signal from general contact gaps, since it
        // means scheduled time is actively being missed, not just no outreach.
        const consecutiveMissed = students.filter(s => {
          const theirAppts = appointments
            .filter(a => a.student_id === s.id)
            .sort((a, b) => a.appointment_at.localeCompare(b.appointment_at));
          if (theirAppts.length < 2) return false;
          const lastTwo = theirAppts.slice(-2);
          return lastTwo.every(a => a.missed);
        });

        // ── Performance rating — weighted toward communication/outreach ──
        // Your manager's own framing: results depend a lot on the student,
        // but weekly calls and outreach are what's actually in your control
        // and what the job is measured on. So this weights communication
        // effort at 65% and KPI outcomes at 35%, not the other way around.
        const totalActive = Math.max(1, students.length);
        const contactCoveragePct = ((totalActive - noContact14d.length) / totalActive) * 100;
        const avgMissedCalls = students.reduce((s, st) => s + (st.missed_call_count ?? 0), 0) / totalActive;
        const addressedNotes = notes.filter(n2 => n2.status === 'addressed').length;
        const noteResponsivenessPct = notes.length > 0 ? (addressedNotes / notes.length) * 100 : 100;
        const hasRecentCallData = latest?.calls_over_45s !== null && latest?.calls_over_45s !== undefined;

        const commScore = Math.round(
          (contactCoveragePct * 0.40) +
          (Math.max(0, 100 - avgMissedCalls * 50) * 0.20) +
          (noteResponsivenessPct * 0.20) +
          ((hasRecentCallData ? 100 : 60) * 0.20)
        );

        const otpComponent = latest?.otp_pct != null && latest?.otp_target_pct != null
          ? Math.max(0, Math.min(100, 50 + (latest.otp_pct - latest.otp_target_pct) * 2))
          : 60;
        const pacingComponent = latest?.pacing_2m_pct != null && latest?.pacing_4m_pct != null
          ? Math.max(0, Math.min(100, ((latest.pacing_2m_pct + latest.pacing_4m_pct) / 2 / 55) * 70))
          : 60;
        const dropComponent = latest?.drop_rate_pct != null
          ? Math.max(0, Math.min(100, 100 - (latest.drop_rate_pct - 4) * 15))
          : 60;
        const retComponent = latest?.t1_t2_ret_pct != null && latest?.t2_t3_ret_pct != null && latest?.t3_plus_ret_pct != null
          ? (latest.t1_t2_ret_pct + latest.t2_t3_ret_pct + latest.t3_plus_ret_pct) / 3
          : 60;

        const kpiScore = Math.round((otpComponent * 0.35) + (pacingComponent * 0.25) + (dropComponent * 0.20) + (retComponent * 0.20));

        const overallScore = Math.round(commScore * 0.65 + kpiScore * 0.35);
        const rating = overallScore >= 78 ? 'Exceeds' : overallScore >= 55 ? 'Achieves' : 'Needs Improvement';
        const ratingColor = rating === 'Exceeds' ? '#4B5320' : rating === 'Achieves' ? '#16a34a' : '#dc2626';

        // Plain-language reasons behind the score, built from the exact
        // same numbers driving the calculation above — nothing here is
        // separate from what's shown in the bars.
        const reasons: string[] = [];
        if (contactCoveragePct >= 85) reasons.push(`You're contacting ${Math.round(contactCoveragePct)}% of your caseload within a 14-day window — that's strong, consistent outreach and the single biggest reason your Communication score is high.`);
        else if (contactCoveragePct >= 65) reasons.push(`${Math.round(contactCoveragePct)}% of your caseload has been contacted within 14 days — decent, but ${noContact14d.length} students haven't heard from you in 2+ weeks, which is pulling this score down.`);
        else reasons.push(`Only ${Math.round(contactCoveragePct)}% of your caseload has been contacted in the last 14 days — ${noContact14d.length} students are overdue for contact, and this is the single biggest drag on your overall rating.`);

        if (avgMissedCalls <= 0.3) reasons.push(`Missed calls are low (${avgMissedCalls.toFixed(2)} per student on average) — you're reaching people, not just attempting to.`);
        else reasons.push(`Missed calls are running at ${avgMissedCalls.toFixed(2)} per student on average — worth checking if a different contact method or time of day would land better with this group.`);

        if (notes.length > 0) {
          reasons.push(noteResponsivenessPct === 100
            ? `Every coaching note you've received has been marked addressed — that responsiveness is exactly what your manager's feedback has asked for.`
            : `${addressedNotes} of ${notes.length} coaching notes are marked addressed — closing out the rest would strengthen this further.`);
        }
        if (!hasRecentCallData) reasons.push(`No call volume has been logged for the current month yet — logging it (manually or via Paste & Extract) would sharpen this score instead of relying on a neutral default.`);

        if (latest?.otp_pct != null && latest?.otp_target_pct != null) {
          const diff = latest.otp_pct - latest.otp_target_pct;
          reasons.push(diff >= 0
            ? `Your OTP (${latest.otp_pct}%) is above the ${latest.otp_target_pct}% target by ${diff.toFixed(1)} pts — a real outcome win, even though your manager weighs this less than outreach.`
            : `Your OTP (${latest.otp_pct}%) is below the ${latest.otp_target_pct}% target by ${Math.abs(diff).toFixed(1)} pts, which is dragging the KPI side down — though per your manager's own framing, this is the metric most dependent on student behavior rather than your effort.`);
        } else {
          reasons.push(`No OTP figure logged for the latest month, so the KPI score is using a neutral middle-of-the-road estimate rather than your real number.`);
        }

        reasons.push(`Overall, Communication counts for 65% of this score and KPIs only 35% — so ${rating === 'Needs Improvement' ? 'even strong outreach can\'t fully offset a low overall score if outcomes are also struggling' : rating === 'Exceeds' ? 'your consistent outreach is doing a lot of the work here, which lines up with what your manager actually measures you on' : 'your outreach effort is keeping this respectable even where individual KPIs are mixed'}.`);

        const weakSpots: { label: string; detail: string; severity: 'urgent' | 'warning' | 'info' }[] = [];
        if (latest) {
          if (latest.otp_target_pct !== null && latest.otp_target_pct !== undefined && latest.otp_pct !== null) {
            const diff = latest.otp_pct - latest.otp_target_pct;
            if (diff < 0) weakSpots.push({ label: 'OTP below target', detail: `${latest.otp_pct}% vs ${latest.otp_target_pct}% target (${diff.toFixed(1)} pts) this month.`, severity: diff < -10 ? 'urgent' : 'warning' });
          }
          if (latest.t3_plus_ret_pct !== null && latest.t3_plus_ret_pct !== undefined && latest.t3_plus_ret_pct < 70) {
            weakSpots.push({ label: 'T3+ Retention is your softest cohort', detail: `${latest.t3_plus_ret_pct}% this month — students furthest along are dropping at a higher rate than earlier terms.`, severity: 'warning' });
          }
          if (latest.pacing_2m_pct !== null && latest.pacing_2m_pct < 55) {
            weakSpots.push({ label: '2-Month Pacing trailing', detail: `${latest.pacing_2m_pct}% — ties directly to the ${lowMomentum.length} students currently at Low/Med-Low momentum.`, severity: 'info' });
          }
        }
        if (highRisk.length > 0) {
          weakSpots.push({ label: 'High caseload concentration in High Risk', detail: `${highRisk.length} of ${students.length} active students (${Math.round(highRisk.length / Math.max(1, students.length) * 100)}%) are flagged High/High Risk.`, severity: highRisk.length / Math.max(1, students.length) > 0.5 ? 'urgent' : 'warning' });
        }
        if (criticalList.length > 0) {
          weakSpots.push({ label: 'High-risk students with no recent contact', detail: `${criticalList.length} high-risk students haven't been contacted in 14+ days — these are the most likely to drop or miss OTP.`, severity: 'urgent' });
        }
        if (consecutiveMissed.length > 0) {
          weakSpots.push({
            label: 'Students missing back-to-back appointments',
            detail: `${consecutiveMissed.map(s => s.display_name).join(', ')} — last 2+ logged appointments were all missed. A scheduling change or a different contact method may be needed here, not just another call attempt.`,
            severity: consecutiveMissed.length >= 3 ? 'urgent' : 'warning'
          });
        }

        return (
          <div>
            <section className="panel" style={{ borderTop: `4px solid ${ratingColor}`, marginBottom: 14 }}>
              <div className="panel-head"><h2>📊 My Read on Your Performance</h2></div>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, fontStyle: 'italic' }}>
                This is my own assessment based on your logged data — not an official WGU rating. Since your boss has told you results depend heavily on the student while communication/outreach is what's actually in your control, this weights that effort at 65% and raw KPI outcomes at 35%.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Overall</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: ratingColor }}>{rating}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{overallScore}/100</div>
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700 }}>Communication &amp; Outreach (65% weight)</span><span>{commScore}/100</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-1)', overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ height: '100%', width: `${commScore}%`, background: '#0891b2' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {Math.round(contactCoveragePct)}% of caseload contacted within 14 days · {avgMissedCalls.toFixed(2)} avg missed calls/student · {notes.length > 0 ? `${addressedNotes}/${notes.length} coaching notes addressed` : 'no coaching notes logged'} · {hasRecentCallData ? `${latest?.calls_over_45s} calls logged this month` : 'no recent call volume logged'}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '10px 0 4px' }}>
                    <span style={{ fontWeight: 700 }}>KPI Outcomes (35% weight)</span><span>{kpiScore}/100</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-1)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${kpiScore}%`, background: '#4B5320' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>OTP vs target, pacing, drop rate, and retention from your latest logged month{!latest ? ' (no month logged yet — using neutral defaults)' : ''}.</div>
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Why this rating</div>
                <ul style={{ paddingLeft: 18, margin: 0, fontSize: 12, lineHeight: 1.8, color: 'var(--text)' }}>
                  {reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            </section>

            <section className="panel" style={{ borderTop: '3px solid var(--red)', marginBottom: 14 }}>
              <div className="panel-head"><h2>⚠️ Weak Areas</h2></div>
              {weakSpots.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Nothing flagged as a clear weak spot right now — log this month's KPIs for a sharper read.</p>}
              {weakSpots.map((w, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < weakSpots.length - 1 ? '1px solid var(--border)' : undefined }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{w.severity === 'urgent' ? '🔴' : w.severity === 'warning' ? '🟡' : '🔵'}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{w.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{w.detail}</div>
                  </div>
                </div>
              ))}
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
              {[
                ['High Risk Students', highRisk.length, '#dc2626', 'high_risk'],
                ['Low Momentum', lowMomentum.length, '#f59e0b', 'low_momentum'],
                ['No Contact 14d+', noContact14d.length, '#0891b2', 'no_contact'],
                ['Overdue Call Prep', overdueCallPrep.length, '#4B5320', 'overdue'],
              ].map(([label, val, color, key]) => (
                <button
                  key={String(label)}
                  className="panel"
                  onClick={() => setExpandedStat(expandedStat === key ? null : key as any)}
                  style={{
                    textAlign: 'center', padding: '10px 8px', cursor: 'pointer',
                    border: expandedStat === key ? `2px solid ${color}` : '1px solid transparent',
                    background: expandedStat === key ? `${color}0f` : undefined
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: String(color) }}>{val}</div>
                </button>
              ))}
            </div>

            <section className="panel" style={{ borderTop: '3px solid var(--green)', marginBottom: 14 }}>
              <div className="panel-head"><h2>💡 Suggested Next Actions</h2></div>
              <ol style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.9 }}>
                {criticalList.length > 0 && (
                  <li><strong>Call these {Math.min(10, criticalList.length)} first</strong> — high-risk and overdue for contact: {criticalList.slice(0, 10).map(s => s.display_name).join(', ')}{criticalList.length > 10 ? ` (+${criticalList.length - 10} more)` : ''}.</li>
                )}
                {lowMomentum.length > 5 && (
                  <li>Your Low/Med-Low momentum group ({lowMomentum.length} students) is the most direct lever on Pacing — a short pacing check-in with these students tends to move 2M/4M numbers faster than general outreach.</li>
                )}
                {withBlockers.length > 0 && (
                  <li>{withBlockers.length} student{withBlockers.length !== 1 ? 's have' : ' has'} a noted blocker on file — worth a quick pass to see if any are resolved or need escalation: {withBlockers.slice(0, 5).map(s => s.display_name).join(', ')}{withBlockers.length > 5 ? '…' : ''}.</li>
                )}
                {overdueCallPrep.length > 0 && (
                  <li>{overdueCallPrep.length} student{overdueCallPrep.length !== 1 ? 's have' : ' has'} a call scheduled that's now overdue — reschedule or complete these to avoid gaps like the ones flagged in your Dec 2024 coaching note.</li>
                )}
                {weakSpots.length === 0 && criticalList.length === 0 && <li>No urgent items right now — solid spot to focus on proactive outreach to your Low momentum group to stay ahead.</li>}
              </ol>
            </section>

            {expandedStat && (() => {
              const cohortMap: Record<string, { title: string; color: string; list: StudentRow[] }> = {
                high_risk: { title: 'High Risk Students', color: '#dc2626', list: highRisk },
                low_momentum: { title: 'Low Momentum', color: '#f59e0b', list: lowMomentum },
                no_contact: { title: 'No Contact 14d+', color: '#0891b2', list: noContact14d },
                overdue: { title: 'Overdue Call Prep', color: '#4B5320', list: overdueCallPrep },
              };
              const { title, color, list } = cohortMap[expandedStat];
              return (
                <section className="panel" style={{ overflowX: 'auto', borderTop: `3px solid ${color}`, marginBottom: 14 }}>
                  <div className="panel-head"><h2>{title}</h2><span className="readonly-pill">{list.length}</span></div>
                  {list.length === 0 ? <div className="brief-item">No students currently in this group.</div> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border)' }}>
                          {['Name', 'Momentum', 'Last Contact', 'Missed Calls', 'Next Call', 'Blocker'].map(h => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--muted)' }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {list.map(s => {
                          const daysSince = s.last_contact_date ? Math.round((now - new Date(s.last_contact_date).getTime()) / 86400000) : null;
                          const nextCallOverdue = s.next_call_at ? new Date(s.next_call_at).getTime() < now : false;
                          return (
                            <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '6px 8px', fontWeight: 700 }}>{s.display_name}</td>
                              <td style={{ padding: '6px 8px' }}>{s.momentum || '—'}</td>
                              <td style={{ padding: '6px 8px', color: daysSince !== null && daysSince > 14 ? 'var(--red)' : undefined, fontWeight: daysSince !== null && daysSince > 14 ? 700 : undefined }}>{daysSince !== null ? `${daysSince}d ago` : 'Never'}</td>
                              <td style={{ padding: '6px 8px' }}>{s.missed_call_count ?? 0}</td>
                              <td style={{ padding: '6px 8px', color: nextCallOverdue ? 'var(--red)' : undefined, fontWeight: nextCallOverdue ? 700 : undefined }}>{s.next_call_at ? new Date(s.next_call_at).toLocaleDateString() : '—'}</td>
                              <td style={{ padding: '6px 8px', fontSize: 11, color: 'var(--muted)' }}>{s.known_blockers ? s.known_blockers.slice(0, 40) : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </section>
              );
            })()}
          </div>
        );
      })()}

      {/* ── KPI DASHBOARD ── */}
      {!loading && tab === 'kpi' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={() => { setKpiForm({ ...BLANK_KPI }); setShowKpiForm(v => !v); }}><Plus size={14} /> Add Month</button>
            <button className="btn ghost" onClick={() => setShowKpiPaste(v => !v)} style={{ color: 'var(--purple)', borderColor: 'var(--purple)' }}><Sparkles size={14} /> Paste &amp; Extract</button>
          </div>

          <section className="panel" style={{ borderLeft: '3px solid #16a34a', marginBottom: 14 }}>
            <div className="panel-head"><h2>📐 Auto-Calculated From Your Term Tracking</h2></div>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
              Built from real per-student term outcomes you've logged via the Term Ends popup — not estimates. Deferred (term break) terms are excluded from retention, since those students didn't leave. Use these to double-check or replace what you paste in from WGU's dashboard.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>OTP this month</div><div style={{ fontSize: 20, fontWeight: 700 }}>{autoKpi.otpPct !== null ? `${autoKpi.otpPct}%` : '—'}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>{autoKpi.closedCount} terms closed</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>T1→T2 Retention</div><div style={{ fontSize: 20, fontWeight: 700 }}>{autoKpi.t1t2 !== null ? `${autoKpi.t1t2}%` : '—'}</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>T2→T3 Retention</div><div style={{ fontSize: 20, fontWeight: 700 }}>{autoKpi.t2t3 !== null ? `${autoKpi.t2t3}%` : '—'}</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>T3+ Retention</div><div style={{ fontSize: 20, fontWeight: 700 }}>{autoKpi.t3plus !== null ? `${autoKpi.t3plus}%` : '—'}</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Graduates logged</div><div style={{ fontSize: 20, fontWeight: 700 }}>🎓 {autoKpi.gradCount}</div></div>
            </div>
          </section>

          {showKpiPaste && (
            <section className="panel" style={{ borderLeft: '3px solid var(--purple)', marginBottom: 14 }}>
              <div className="panel-head"><h2>Paste a KPI Table</h2><button className="btn ghost" onClick={() => setShowKpiPaste(false)}>Close</button></div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Paste a table of monthly numbers (like your KPI summary screenshot text) and AI will pull out each month automatically.</p>
              <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="Paste your KPI table here…" style={{ minHeight: 120, width: '100%', fontSize: 13 }} />
              <button className="btn primary" onClick={extractKpiFromPaste} disabled={pasteBusy || !pasteText.trim()} style={{ marginTop: 10 }}>
                {pasteBusy ? 'Extracting…' : 'Extract & Import'}
              </button>
              {pasteMsg && <div style={{ marginTop: 8, fontSize: 13 }}>{pasteMsg}</div>}
            </section>
          )}

          {showKpiForm && (
            <section className="panel" style={{ borderLeft: '3px solid var(--green)', marginBottom: 14 }}>
              <div className="panel-head"><h2>Add / Update a Month</h2><button className="btn ghost" onClick={() => setShowKpiForm(false)}>Close</button></div>
              <div className="form-grid">
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Month<input type="month" value={kpiForm.month_date} onChange={e => setKpiForm(p => ({ ...p, month_date: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Enrollment Total<input type="number" value={kpiForm.enrollment_total} onChange={e => setKpiForm(p => ({ ...p, enrollment_total: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Drops<input type="number" value={kpiForm.drops} onChange={e => setKpiForm(p => ({ ...p, drops: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Graduates<input type="number" value={kpiForm.graduates} onChange={e => setKpiForm(p => ({ ...p, graduates: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>OTP %<input type="number" step="0.1" value={kpiForm.otp_pct} onChange={e => setKpiForm(p => ({ ...p, otp_pct: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>OTP met / total students<span style={{ display: 'flex', gap: 6 }}><input type="number" placeholder="met" value={kpiForm.otp_met} onChange={e => setKpiForm(p => ({ ...p, otp_met: e.target.value }))} /><input type="number" placeholder="total" value={kpiForm.otp_total} onChange={e => setKpiForm(p => ({ ...p, otp_total: e.target.value }))} /></span></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>6-Month Rolling OTP met / total<span style={{ display: 'flex', gap: 6 }}><input type="number" placeholder="met" value={kpiForm.rolling_6m_otp_met} onChange={e => setKpiForm(p => ({ ...p, rolling_6m_otp_met: e.target.value }))} /><input type="number" placeholder="total" value={kpiForm.rolling_6m_otp_total} onChange={e => setKpiForm(p => ({ ...p, rolling_6m_otp_total: e.target.value }))} /></span></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Grad Rate 4YR %<input type="number" step="0.1" value={kpiForm.grad_rate_4yr_pct} onChange={e => setKpiForm(p => ({ ...p, grad_rate_4yr_pct: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Drop Rate %<input type="number" step="0.1" value={kpiForm.drop_rate_pct} onChange={e => setKpiForm(p => ({ ...p, drop_rate_pct: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Pacing 2M %<input type="number" step="0.1" value={kpiForm.pacing_2m_pct} onChange={e => setKpiForm(p => ({ ...p, pacing_2m_pct: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Pacing 4M %<input type="number" step="0.1" value={kpiForm.pacing_4m_pct} onChange={e => setKpiForm(p => ({ ...p, pacing_4m_pct: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>VSAT %<input type="number" step="0.1" value={kpiForm.vsat_pct} onChange={e => setKpiForm(p => ({ ...p, vsat_pct: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>T1→T2 Retention %<input type="number" step="0.1" value={kpiForm.t1_t2_ret_pct} onChange={e => setKpiForm(p => ({ ...p, t1_t2_ret_pct: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>T1→T2 met / total students<span style={{ display: 'flex', gap: 6 }}><input type="number" placeholder="met" value={kpiForm.t1_t2_met} onChange={e => setKpiForm(p => ({ ...p, t1_t2_met: e.target.value }))} /><input type="number" placeholder="total" value={kpiForm.t1_t2_total} onChange={e => setKpiForm(p => ({ ...p, t1_t2_total: e.target.value }))} /></span></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>T2→T3 Retention %<input type="number" step="0.1" value={kpiForm.t2_t3_ret_pct} onChange={e => setKpiForm(p => ({ ...p, t2_t3_ret_pct: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>T2→T3 met / total students<span style={{ display: 'flex', gap: 6 }}><input type="number" placeholder="met" value={kpiForm.t2_t3_met} onChange={e => setKpiForm(p => ({ ...p, t2_t3_met: e.target.value }))} /><input type="number" placeholder="total" value={kpiForm.t2_t3_total} onChange={e => setKpiForm(p => ({ ...p, t2_t3_total: e.target.value }))} /></span></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>T3+ Retention %<input type="number" step="0.1" value={kpiForm.t3_plus_ret_pct} onChange={e => setKpiForm(p => ({ ...p, t3_plus_ret_pct: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>T3+ met / total students<span style={{ display: 'flex', gap: 6 }}><input type="number" placeholder="met" value={kpiForm.t3_plus_met} onChange={e => setKpiForm(p => ({ ...p, t3_plus_met: e.target.value }))} /><input type="number" placeholder="total" value={kpiForm.t3_plus_total} onChange={e => setKpiForm(p => ({ ...p, t3_plus_total: e.target.value }))} /></span></label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>Notes<textarea value={kpiForm.notes} onChange={e => setKpiForm(p => ({ ...p, notes: e.target.value }))} style={{ minHeight: 50 }} /></label>
              <button className="btn primary" onClick={saveKpi} disabled={!kpiForm.month_date} style={{ marginTop: 12 }}>Save Month</button>
            </section>
          )}

          <section className="panel" style={{ borderTop: '3px solid var(--purple)', marginBottom: 14 }}>
            <div className="panel-head"><h2>🎯 Targets to Strive For</h2></div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>What the program is actually asking you to hit — not your personal goals, the college-level benchmarks.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {PROGRAM_TARGETS.map(t => (
                <div key={t.label} style={{ padding: '10px 12px', background: 'var(--surface-1)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{t.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--purple)', marginTop: 2 }}>{t.target}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{t.source}</div>
                </div>
              ))}
            </div>
            {latestKpi && latestKpi.otp_pct !== null && latestKpi.otp_target_pct !== null && latestKpi.otp_target_pct !== undefined && (
              <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: latestKpi.otp_pct >= latestKpi.otp_target_pct ? '#16a34a' : '#dc2626' }}>
                Your latest Term OTP ({fmtMonth(latestKpi.month_date)}): {latestKpi.otp_pct}% — {latestKpi.otp_pct >= latestKpi.otp_target_pct ? `above target by ${(latestKpi.otp_pct - latestKpi.otp_target_pct).toFixed(1)} pts ✅` : `below target by ${(latestKpi.otp_target_pct - latestKpi.otp_pct).toFixed(1)} pts`}
              </div>
            )}
          </section>

          {latestKpi && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
              {[
                ['Enrollment', latestKpi.enrollment_total, ''],
                ['OTP', latestKpi.otp_pct, '%'],
                ['Drop Rate', latestKpi.drop_rate_pct, '%'],
                ['Graduates (total)', kpis.reduce((s, k) => s + (k.graduates ?? 0), 0), ''],
              ].map(([label, val, suffix]) => (
                <section key={String(label)} className="panel" style={{ textAlign: 'center', padding: '10px 8px' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{label} <span style={{ opacity: 0.6 }}>({fmtMonth(latestKpi.month_date)})</span></div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--purple)' }}>{val ?? '—'}{val !== null && suffix}</div>
                </section>
              ))}
            </div>
          )}

          {kpis.length > 0 && (() => {
            // Column averages, used to color cells above/below the period
            // average — green for a good direction, red for a concerning
            // one, respecting which way each metric is supposed to move.
            function avgOf(key: keyof KpiMonth): number | null {
              const vals = kpis.map(k => k[key] as number | null).filter((v): v is number => v !== null && v !== undefined);
              return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            }
            const avgOtp = avgOf('otp_pct'), avgDrop = avgOf('drop_rate_pct'), avg2m = avgOf('pacing_2m_pct'), avg4m = avgOf('pacing_4m_pct'), avgVsat = avgOf('vsat_pct');
            const avgT1 = avgOf('t1_t2_ret_pct'), avgT2 = avgOf('t2_t3_ret_pct'), avgT3 = avgOf('t3_plus_ret_pct');
            function cellStyle(val: number | null | undefined, avg: number | null, higherIsBetter: boolean): CSSProperties {
              if (val === null || val === undefined || avg === null) return {};
              const diff = val - avg;
              if (Math.abs(diff) < 1.5) return {};
              const isGood = higherIsBetter ? diff > 0 : diff < 0;
              return { background: isGood ? '#dcfce7' : '#fee2e2', color: isGood ? '#15803d' : '#b91c1c', fontWeight: 700 };
            }

            return (
              <>
                <section className="panel" style={{ marginBottom: 14 }}>
                  <div className="panel-head"><h2>Quality Metrics Trend</h2></div>
                  <TrendChart data={kpis} fields={[
                    { key: 'otp_pct', label: 'OTP %', color: '#4B5320' },
                    { key: 'pacing_2m_pct', label: 'Pacing 2M %', color: '#0891b2' },
                    { key: 'pacing_4m_pct', label: 'Pacing 4M %', color: '#16a34a' },
                    { key: 'drop_rate_pct', label: 'Drop Rate %', color: '#dc2626' },
                  ]} />
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Hover over the chart to see exact values for each month. Full numbers for every month are in the table below.</p>
                </section>

                <section className="panel" style={{ overflowX: 'auto', marginBottom: 14 }}>
                  <div className="panel-head"><h2>Monthly Detail</h2></div>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                    <span style={{ background: '#dcfce7', color: '#15803d', fontWeight: 700, padding: '1px 6px', borderRadius: 4 }}>Green</span> = better than your period average · <span style={{ background: '#fee2e2', color: '#b91c1c', fontWeight: 700, padding: '1px 6px', borderRadius: 4 }}>Red</span> = worse than your period average · small gray numbers under OTP/retention % show the actual student count behind them
                  </p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, border: '1px solid var(--border)' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        {['Month', 'Enroll', 'Drops', 'Grads', 'OTP%', 'Drop%', 'Pace2M%', 'Pace4M%', 'VSAT%', 'T1→T2%', 'T2→T3%', 'T3+%', ''].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--muted)', border: '1px solid var(--border)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...kpis].reverse().map(k => {
                        const countSub = (met?: number | null, total?: number | null) =>
                          (met != null && total != null) ? <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>({met}/{total})</div> : null;
                        const countTitle = (label: string, met?: number | null, total?: number | null) =>
                          (met != null && total != null) ? `${label}: ${met} of ${total} students` : undefined;
                        return (
                        <tr key={k.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 700, border: '1px solid var(--border)' }}>{fmtMonth(k.month_date)}</td>
                          <td style={{ padding: '6px 8px', border: '1px solid var(--border)' }}>{k.enrollment_total ?? '—'}</td>
                          <td style={{ padding: '6px 8px', border: '1px solid var(--border)' }}>{k.drops ?? '—'}</td>
                          <td style={{ padding: '6px 8px', border: '1px solid var(--border)' }}>{k.graduates ?? '—'}</td>
                          <td style={{ padding: '6px 8px', border: '1px solid var(--border)', ...cellStyle(k.otp_pct, avgOtp, true) }} title={countTitle('OTP', k.otp_met, k.otp_total)}>{k.otp_pct ?? '—'}{countSub(k.otp_met, k.otp_total)}</td>
                          <td style={{ padding: '6px 8px', border: '1px solid var(--border)', ...cellStyle(k.drop_rate_pct, avgDrop, false) }}>{k.drop_rate_pct ?? '—'}</td>
                          <td style={{ padding: '6px 8px', border: '1px solid var(--border)', ...cellStyle(k.pacing_2m_pct, avg2m, true) }}>{k.pacing_2m_pct ?? '—'}</td>
                          <td style={{ padding: '6px 8px', border: '1px solid var(--border)', ...cellStyle(k.pacing_4m_pct, avg4m, true) }}>{k.pacing_4m_pct ?? '—'}</td>
                          <td style={{ padding: '6px 8px', border: '1px solid var(--border)', ...cellStyle(k.vsat_pct, avgVsat, true) }}>{k.vsat_pct ?? '—'}</td>
                          <td style={{ padding: '6px 8px', border: '1px solid var(--border)', ...cellStyle(k.t1_t2_ret_pct, avgT1, true) }} title={countTitle('T1→T2', k.t1_t2_met, k.t1_t2_total)}>{k.t1_t2_ret_pct ?? '—'}{countSub(k.t1_t2_met, k.t1_t2_total)}</td>
                          <td style={{ padding: '6px 8px', border: '1px solid var(--border)', ...cellStyle(k.t2_t3_ret_pct, avgT2, true) }} title={countTitle('T2→T3', k.t2_t3_met, k.t2_t3_total)}>{k.t2_t3_ret_pct ?? '—'}{countSub(k.t2_t3_met, k.t2_t3_total)}</td>
                          <td style={{ padding: '6px 8px', border: '1px solid var(--border)', ...cellStyle(k.t3_plus_ret_pct, avgT3, true) }} title={countTitle('T3+', k.t3_plus_met, k.t3_plus_total)}>{k.t3_plus_ret_pct ?? '—'}{countSub(k.t3_plus_met, k.t3_plus_total)}</td>
                          <td style={{ padding: '6px 8px', border: '1px solid var(--border)' }}><button onClick={() => deleteKpi(k.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}><Trash2 size={12} /></button></td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>

                <section className="panel" style={{ marginBottom: 14 }}>
                  <div className="panel-head"><h2>📅 Monthly Recaps</h2></div>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
                    For each month: what you actually logged (when touchpoint history exists) plus what likely went well or held you back based on the metric itself. Months before you started logging touchpoints fall back to metric-pattern reasoning only.
                  </p>
                  {[...kpis].reverse().map(k => {
                    const isOpen = expandedRecap === k.id;
                    const wins: string[] = [];
                    const gaps: string[] = [];
                    if (k.otp_pct !== null && avgOtp !== null) (k.otp_pct >= avgOtp ? wins : gaps).push(
                      k.otp_pct >= avgOtp
                        ? `OTP was ${k.otp_pct}%, above your ${avgOtp.toFixed(1)}% average — ${METRIC_INFO['OTP %'].tip}`
                        : `OTP was ${k.otp_pct}%, below your ${avgOtp.toFixed(1)}% average — likely a sign momentum/pacing conversations were thinner this month than usual. Next month: ${METRIC_INFO['OTP %'].tip}`
                    );
                    if (k.pacing_2m_pct !== null && avg2m !== null) (k.pacing_2m_pct >= avg2m ? wins : gaps).push(
                      k.pacing_2m_pct >= avg2m
                        ? `2-Month Pacing was ${k.pacing_2m_pct}%, above average — early-term outreach was likely landing well.`
                        : `2-Month Pacing was ${k.pacing_2m_pct}%, below average. Next month: ${METRIC_INFO['Pacing 2M %'].tip}`
                    );
                    if (k.pacing_4m_pct !== null && avg4m !== null) (k.pacing_4m_pct >= avg4m ? wins : gaps).push(
                      k.pacing_4m_pct >= avg4m
                        ? `4-Month Pacing was ${k.pacing_4m_pct}%, above average — mid-term check-ins were likely consistent.`
                        : `4-Month Pacing was ${k.pacing_4m_pct}%, below average. Next month: ${METRIC_INFO['Pacing 4M %'].tip}`
                    );
                    if (k.drop_rate_pct !== null && avgDrop !== null) (k.drop_rate_pct <= avgDrop ? wins : gaps).push(
                      k.drop_rate_pct <= avgDrop
                        ? `Drop Rate was ${k.drop_rate_pct}%, better (lower) than your average — high-risk students were likely getting caught early.`
                        : `Drop Rate was ${k.drop_rate_pct}%, worse than average. Next month: ${METRIC_INFO['Drop Rate %'].tip}`
                    );
                    if (k.t3_plus_ret_pct !== null && avgT3 !== null) (k.t3_plus_ret_pct >= avgT3 ? wins : gaps).push(
                      k.t3_plus_ret_pct >= avgT3
                        ? `T3+ Retention was ${k.t3_plus_ret_pct}%, above average — later-term students likely had blockers addressed before they became drops.`
                        : `T3+ Retention was ${k.t3_plus_ret_pct}%, below average. These students usually need blocker-specific problem-solving, not general check-ins — review known_blockers notes before your next round of calls.`
                    );

                    const monthKey = k.month_date.slice(0, 7); // 'YYYY-MM'
                    const monthTouchpoints = touchpoints.filter(t => t.touchpoint_date.slice(0, 7) === monthKey);
                    const studentsSeen = new Set(monthTouchpoints.map(t => t.student_id));
                    const typeCounts: Record<string, number> = {};
                    monthTouchpoints.forEach(t => { typeCounts[t.touchpoint_type] = (typeCounts[t.touchpoint_type] || 0) + 1; });

                    const monthAppointments = appointments.filter(a => a.appointment_at.slice(0, 7) === monthKey);
                    const monthMissed = monthAppointments.filter(a => a.missed).length;
                    const attendanceRate = monthAppointments.length > 0 ? Math.round(((monthAppointments.length - monthMissed) / monthAppointments.length) * 100) : null;

                    return (
                      <div key={k.id} style={{ marginBottom: 8, borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                        <div onClick={() => setExpandedRecap(isOpen ? null : k.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', cursor: 'pointer', background: 'var(--surface-1)' }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtMonth(k.month_date)} <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted)' }}>· {wins.length} above avg, {gaps.length} below avg</span></div>
                          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                        {isOpen && (
                          <div style={{ padding: 12 }}>
                            {monthTouchpoints.length > 0 ? (
                              <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>📋 What you actually logged this month ({monthTouchpoints.length} touchpoints · {studentsSeen.size} students)</div>
                                <ul style={{ paddingLeft: 18, margin: 0, fontSize: 12, lineHeight: 1.7 }}>
                                  {Object.entries(typeCounts).map(([type, count]) => <li key={type}>{type}: {count}</li>)}
                                </ul>
                              </div>
                            ) : (
                              <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>No touchpoints logged for this month — recap below is metric-average reasoning only, not grounded history.</div>
                            )}
                            {attendanceRate !== null && (
                              <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>📅 Appointment attendance: {attendanceRate}% ({monthAppointments.length - monthMissed} of {monthAppointments.length} attended{monthMissed > 0 ? `, ${monthMissed} missed` : ''})</div>
                              </div>
                            )}
                            {wins.length > 0 && (
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>✅ What went well</div>
                                <ul style={{ paddingLeft: 18, margin: 0, fontSize: 12, lineHeight: 1.7 }}>{wins.map((w, i) => <li key={i}>{w}</li>)}</ul>
                              </div>
                            )}
                            {gaps.length > 0 && (
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>⚠️ What held this month back — and what to try next</div>
                                <ul style={{ paddingLeft: 18, margin: 0, fontSize: 12, lineHeight: 1.7 }}>{gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
                              </div>
                            )}
                            {wins.length === 0 && gaps.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>Not enough data logged for this month to compare against your average yet.</p>}
                            {k.notes && <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 12, fontStyle: 'italic' }}>Your note: {k.notes}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </section>

                <section className="panel" style={{ marginBottom: 14 }}>
                  <div className="panel-head"><h2>What Each Metric Means &amp; How To Improve It</h2></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                    {Object.entries(METRIC_INFO).map(([label, info]) => (
                      <div key={label} style={{ padding: '10px 12px', background: 'var(--surface-1)', borderRadius: 8, border: `1px solid ${info.color}33` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 999, background: info.color, display: 'inline-block', flexShrink: 0 }} />{label}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>{info.definition}</div>
                        <div style={{ fontSize: 12, display: 'flex', gap: 6 }}><span style={{ flexShrink: 0 }}>💡</span><span>{info.tip}</span></div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="panel" style={{ marginBottom: 14 }}>
                  <div className="panel-head"><h2>What The Other Numbers Mean</h2></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {OTHER_METRIC_INFO.map(info => (
                      <div key={info.label} style={{ paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{info.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{info.definition}</div>
                        <div style={{ fontSize: 12, display: 'flex', gap: 6 }}><span style={{ flexShrink: 0 }}>💡</span><span>{info.tip}</span></div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            );
          })()}
          {kpis.length === 0 && !showKpiForm && !showKpiPaste && (
            <section className="panel" style={{ textAlign: 'center', padding: 40 }}><p style={{ color: 'var(--muted)' }}>No KPI months logged yet. Add one manually or paste a table above.</p></section>
          )}
        </div>
      )}

      {/* ── REVIEWS ── */}
      {!loading && tab === 'reviews' && (
        <div>
          <button className="btn primary" onClick={() => { setReviewForm({ ...BLANK_REVIEW }); setShowReviewForm(v => !v); }} style={{ marginBottom: 14 }}><Plus size={14} /> Add Review</button>

          {showReviewForm && (
            <section className="panel" style={{ borderLeft: '3px solid var(--green)', marginBottom: 14 }}>
              <div className="panel-head"><h2>Add Review</h2><button className="btn ghost" onClick={() => setShowReviewForm(false)}>Close</button></div>
              <div className="form-grid">
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Type<select value={reviewForm.review_type} onChange={e => setReviewForm(p => ({ ...p, review_type: e.target.value as Review['review_type'] }))}>
                  <option value="midyear_checkin">Midyear Check-In</option>
                  <option value="annual_comp_review">Annual Comp Review</option>
                  <option value="annual_review">Annual Review</option>
                  <option value="other">Other</option>
                </select></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Title *<input value={reviewForm.title} onChange={e => setReviewForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. FY2026 Midyear Check-In" /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Review Date *<input type="date" value={reviewForm.review_date} onChange={e => setReviewForm(p => ({ ...p, review_date: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Manager<input value={reviewForm.manager_name} onChange={e => setReviewForm(p => ({ ...p, manager_name: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Period Start<input type="date" value={reviewForm.period_start} onChange={e => setReviewForm(p => ({ ...p, period_start: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Period End<input type="date" value={reviewForm.period_end} onChange={e => setReviewForm(p => ({ ...p, period_end: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Performance Rating<input value={reviewForm.performance_rating} onChange={e => setReviewForm(p => ({ ...p, performance_rating: e.target.value }))} placeholder="e.g. Achieves/Solid Strength" /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Base Pay Before<input type="number" value={reviewForm.base_pay_before} onChange={e => setReviewForm(p => ({ ...p, base_pay_before: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Base Pay After<input type="number" value={reviewForm.base_pay_after} onChange={e => setReviewForm(p => ({ ...p, base_pay_after: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Pay Increase %<input type="number" step="0.01" value={reviewForm.pay_increase_pct} onChange={e => setReviewForm(p => ({ ...p, pay_increase_pct: e.target.value }))} /></label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>Full Text / Notes<textarea value={reviewForm.full_text} onChange={e => setReviewForm(p => ({ ...p, full_text: e.target.value }))} style={{ minHeight: 100 }} /></label>
              <button className="btn primary" onClick={saveReview} disabled={!reviewForm.title.trim() || !reviewForm.review_date} style={{ marginTop: 12 }}>Save Review</button>
            </section>
          )}

          {reviews.map(r => {
            const isOpen = expandedReview === r.id;
            return (
              <section key={r.id} className="panel" style={{ marginBottom: 10, borderLeft: `3px solid ${r.review_type === 'annual_comp_review' ? '#16a34a' : '#4B5320'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => setExpandedReview(isOpen ? null : r.id)}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{r.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      {fmtDate(r.review_date)}{r.manager_name ? ` · ${r.manager_name}` : ''}
                      {r.performance_rating ? ` · ${r.performance_rating}` : ''}
                    </div>
                    {r.base_pay_after !== null && (
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', marginTop: 4 }}>
                        ${r.base_pay_before?.toLocaleString()} → ${r.base_pay_after?.toLocaleString()} {r.pay_increase_pct !== null && `(+${r.pay_increase_pct}%)`}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={e => { e.stopPropagation(); deleteReview(r.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}><Trash2 size={14} /></button>
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>
                {isOpen && r.full_text && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{r.full_text}</div>
                )}
              </section>
            );
          })}
          {reviews.length === 0 && !showReviewForm && (
            <section className="panel" style={{ textAlign: 'center', padding: 40 }}><p style={{ color: 'var(--muted)' }}>No reviews logged yet.</p></section>
          )}
        </div>
      )}

      {/* ── COACHING NOTES ── */}
      {!loading && tab === 'coaching' && (
        <div>
          <button className="btn primary" onClick={() => { setNoteForm({ ...BLANK_NOTE }); setShowNoteForm(v => !v); }} style={{ marginBottom: 14 }}><Plus size={14} /> Add Coaching Note</button>

          {showNoteForm && (
            <section className="panel" style={{ borderLeft: '3px solid var(--amber)', marginBottom: 14 }}>
              <div className="panel-head"><h2>Add Coaching Note</h2><button className="btn ghost" onClick={() => setShowNoteForm(false)}>Close</button></div>
              <div className="form-grid">
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Subject *<input value={noteForm.subject} onChange={e => setNoteForm(p => ({ ...p, subject: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Date *<input type="date" value={noteForm.note_date} onChange={e => setNoteForm(p => ({ ...p, note_date: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>From<input value={noteForm.from_person} onChange={e => setNoteForm(p => ({ ...p, from_person: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Status<select value={noteForm.status} onChange={e => setNoteForm(p => ({ ...p, status: e.target.value as CoachingNote['status'] }))}>
                  <option value="open">Open</option><option value="ongoing">Ongoing</option><option value="addressed">Addressed</option>
                </select></label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>Summary<textarea value={noteForm.summary} onChange={e => setNoteForm(p => ({ ...p, summary: e.target.value }))} style={{ minHeight: 50 }} /></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>Full Text<textarea value={noteForm.full_text} onChange={e => setNoteForm(p => ({ ...p, full_text: e.target.value }))} style={{ minHeight: 80 }} /></label>
              <button className="btn primary" onClick={saveNote} disabled={!noteForm.subject.trim() || !noteForm.note_date} style={{ marginTop: 12 }}>Save Note</button>
            </section>
          )}

          {notes.map(note => {
            const isOpen = expandedNote === note.id;
            return (
              <section key={note.id} className="panel" style={{ marginBottom: 10, borderLeft: `3px solid ${STATUS_COLORS[note.status]}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => setExpandedNote(isOpen ? null : note.id)}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{note.subject}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: `${STATUS_COLORS[note.status]}22`, color: STATUS_COLORS[note.status] }}>{STATUS_LABELS[note.status]}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{fmtDate(note.note_date)}{note.from_person ? ` · from ${note.from_person}` : ''}</div>
                    {note.summary && <div style={{ fontSize: 13, marginTop: 6 }}>{note.summary}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    <button onClick={e => { e.stopPropagation(); deleteNote(note.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}><Trash2 size={14} /></button>
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    {note.full_text && <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{note.full_text}</div>}
                    {note.action_items.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>Action Items</div>
                        {note.action_items.map((a, i) => (
                          <div key={i} onClick={() => toggleActionItem(note, i)} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', cursor: 'pointer', fontSize: 13, textDecoration: a.done ? 'line-through' : 'none', color: a.done ? 'var(--muted)' : 'var(--text)' }}>
                            {a.done ? <CheckCircle2 size={14} color="#16a34a" /> : <Circle size={14} color="var(--muted)" />} {a.text}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['open', 'ongoing', 'addressed'] as const).map(s => (
                        <button key={s} onClick={() => setNoteStatus(note.id, s)} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, border: `1.5px solid ${note.status === s ? STATUS_COLORS[s] : 'var(--border)'}`, background: note.status === s ? `${STATUS_COLORS[s]}22` : 'transparent', color: note.status === s ? STATUS_COLORS[s] : 'var(--muted)', cursor: 'pointer' }}>{STATUS_LABELS[s]}</button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
          {notes.length === 0 && !showNoteForm && (
            <section className="panel" style={{ textAlign: 'center', padding: 40 }}><p style={{ color: 'var(--muted)' }}>No coaching notes logged yet.</p></section>
          )}
        </div>
      )}

      {/* ── GOALS ── */}
      {!loading && tab === 'goals' && (
        <div>
          <button className="btn primary" onClick={() => { setGoalForm({ ...BLANK_GOAL }); setShowGoalForm(v => !v); }} style={{ marginBottom: 14 }}><Plus size={14} /> Add Goal</button>

          {showGoalForm && (
            <section className="panel" style={{ borderLeft: '3px solid var(--purple)', marginBottom: 14 }}>
              <div className="panel-head"><h2>Add Goal</h2><button className="btn ghost" onClick={() => setShowGoalForm(false)}>Close</button></div>
              <div className="form-grid">
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', gridColumn: 'span 2' }}>Title *<input value={goalForm.title} onChange={e => setGoalForm(p => ({ ...p, title: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Metric Name<input value={goalForm.metric_name} onChange={e => setGoalForm(p => ({ ...p, metric_name: e.target.value }))} placeholder="e.g. Graduates" /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Unit<input value={goalForm.unit} onChange={e => setGoalForm(p => ({ ...p, unit: e.target.value }))} placeholder="%, count, $, hours…" /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Current Value<input type="number" value={goalForm.current_value} onChange={e => setGoalForm(p => ({ ...p, current_value: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Target Value<input type="number" value={goalForm.target_value} onChange={e => setGoalForm(p => ({ ...p, target_value: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Fiscal Year<input value={goalForm.fiscal_year} onChange={e => setGoalForm(p => ({ ...p, fiscal_year: e.target.value }))} placeholder="FY26" /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Due Date<input type="date" value={goalForm.due_date} onChange={e => setGoalForm(p => ({ ...p, due_date: e.target.value }))} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Status<select value={goalForm.status} onChange={e => setGoalForm(p => ({ ...p, status: e.target.value as Goal['status'] }))}>
                  <option value="on_track">On Track</option><option value="at_risk">At Risk</option><option value="achieved">Achieved</option><option value="missed">Missed</option>
                </select></label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>Description<textarea value={goalForm.description} onChange={e => setGoalForm(p => ({ ...p, description: e.target.value }))} style={{ minHeight: 50 }} /></label>
              <button className="btn primary" onClick={saveGoal} disabled={!goalForm.title.trim()} style={{ marginTop: 12 }}>Save Goal</button>
            </section>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {goals.map(g => {
              const pct = g.target_value && g.current_value !== null ? Math.min(100, Math.round((g.current_value / g.target_value) * 100)) : null;
              return (
                <section key={g.id} className="panel" style={{ borderTop: `3px solid ${STATUS_COLORS[g.status]}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{g.title}</div>
                    <button onClick={() => deleteGoal(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}><Trash2 size={13} /></button>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: `${STATUS_COLORS[g.status]}22`, color: STATUS_COLORS[g.status] }}>{STATUS_LABELS[g.status]}</span>
                  {g.description && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{g.description}</p>}
                  {g.target_value !== null && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span>{g.current_value ?? 0}{g.unit} of {g.target_value}{g.unit}</span>
                        <span style={{ fontWeight: 700 }}>{pct}%</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-1)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: STATUS_COLORS[g.status], borderRadius: 999 }} />
                      </div>
                      <input
                        type="number"
                        value={g.current_value ?? ''}
                        onChange={e => updateGoalProgress(g, parseFloat(e.target.value) || 0)}
                        style={{ marginTop: 8, width: '100%', fontSize: 12, padding: '4px 8px' }}
                        placeholder="Update current value"
                      />
                    </div>
                  )}
                  {g.due_date && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Due {fmtDate(g.due_date)}</div>}
                </section>
              );
            })}
          </div>
          {goals.length === 0 && !showGoalForm && (
            <section className="panel" style={{ textAlign: 'center', padding: 40 }}><p style={{ color: 'var(--muted)' }}>No goals set yet.</p></section>
          )}
        </div>
      )}
    </>
  );
}
