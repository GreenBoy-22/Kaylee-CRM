import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Home, Users, LayoutDashboard, ClipboardCheck, Sparkles, CalendarDays, WalletCards,
  Inbox, ListTodo, ShieldCheck, Car, Plus, Copy, RefreshCw, Settings, LogOut,
  Lock, Eye, EyeOff, Save, Minus, Archive, Mail, Phone, MessageSquare, FileText, AlertTriangle, Edit3, Upload
} from 'lucide-react';
import { supabase, hasSupabase } from './lib/supabase';

type Mode = 'home' | 'work';
type Role = 'admin' | 'limited';
type Page = 'dashboard' | 'today' | 'briefing' | 'calendar' | 'budget' | 'inventory' | 'chores' | 'adam' | 'vehicles' | 'suggestions' | 'students' | 'settings';
type Priority = 'urgent' | 'warning' | 'normal' | 'good';
type InventoryAction = 'none' | 'scanAdd' | 'manual' | 'scanUse';

type Profile = {
  id: string;
  display_name: string;
  email: string;
  role: Role;
};

type AccessLevel = 'hidden' | 'view' | 'edit';

type ModulePermission = {
  id?: string;
  module_name: string;
  role: 'limited';
  access_level: AccessLevel;
};

type InventoryItem = {
  id: string;
  name: string;
  brand: string | null;
  location: string;
  category: string;
  quantity: number;
  expires: string | null;
  value: number | null;
  barcode?: string | null;
};

type Student = {
  id: string;
  student_id?: string | null;
  display_name: string;
  course: string | null;
  goal: string;
  risk: 'Low' | 'Medium' | 'High' | 'High Risk' | string;
  status: 'Active' | 'Support' | 'Ghost' | 'Portal-only' | 'Archived' | string;
  copied: boolean;
  grow_note: string;
  admin_notes: string | null;
  next_call_prep: string | null;
  constructive_note: string | null;
  last_contact_date: string | null;
  next_appointment_date: string | null;
  graduation_goal_date?: string | null;
  momentum?: string | null;
  last_academic_activity_date?: string | null;
  course_end_date?: string | null;
  term_end_date?: string | null;
  enrolled_cu?: number | null;
  term_remaining_cu?: number | null;
  term_completed_cu?: number | null;
  contact_term?: number | null;
  weeks_in_course?: number | null;
  latest_course_note?: string | null;
  next_conversation_focus?: string | null;
  known_blockers?: string | null;
  preferred_contact_method?: string | null;
  student_timezone?: string | null;
  missed_call_count: number;
  archived: boolean;
};

type Touchpoint = {
  id: string;
  student_id: string;
  touchpoint_type: string;
  touchpoint_date: string;
  course: string | null;
  momentum: string | null;
  note: string;
  next_call_prep: string | null;
  constructive_note: string | null;
  follow_up_email: string | null;
  follow_up_text: string | null;
  copied: boolean;
};

type TaskItem = {
  id: string;
  title: string;
  owner: string;
  mode: Mode;
  minutes: number;
  priority: Priority;
  status: string;
  source: string;
};

type NavEntry = readonly [Page, string, React.ElementType];

const kayleeEmails = ['kayleet.green@gmail.com', 'green.kayleet@gmail.com'];
const adamEmails = ['adamlamargreen@gmail.com'];

const homeNav: readonly NavEntry[] = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['today', 'Today’s Tasks', ClipboardCheck],
  ['briefing', 'Daily Briefing', Sparkles],
  ['calendar', 'Calendar', CalendarDays],
  ['budget', 'Budget', WalletCards],
  ['inventory', 'Inventory', Inbox],
  ['chores', 'Chores & Tasks', ListTodo],
  ['adam', 'Adam’s Tasks', ShieldCheck],
  ['vehicles', 'Vehicles', Car],
  ['suggestions', 'Home Suggestions', Home]
];

const workNav: readonly NavEntry[] = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['today', 'Today’s Tasks', ClipboardCheck],
  ['briefing', 'Daily Briefing', Sparkles],
  ['calendar', 'Calendar', CalendarDays],
  ['students', 'Students', Users]
];

const moduleMeta: { page: Page; module_name: string; label: string; default_access: AccessLevel }[] = [
  { page: 'dashboard', module_name: 'dashboard', label: 'Dashboard', default_access: 'edit' },
  { page: 'today', module_name: 'today_tasks', label: 'Today’s Tasks', default_access: 'edit' },
  { page: 'briefing', module_name: 'daily_briefing', label: 'Daily Briefing', default_access: 'view' },
  { page: 'calendar', module_name: 'calendar', label: 'Calendar', default_access: 'edit' },
  { page: 'inventory', module_name: 'inventory', label: 'Inventory', default_access: 'edit' },
  { page: 'chores', module_name: 'chores', label: 'Chores & Tasks', default_access: 'edit' },
  { page: 'adam', module_name: 'adam_tasks', label: 'Adam’s Tasks', default_access: 'edit' },
  { page: 'vehicles', module_name: 'vehicles', label: 'Vehicles', default_access: 'view' },
  { page: 'suggestions', module_name: 'home_suggestions', label: 'Home Suggestions', default_access: 'edit' },
  { page: 'budget', module_name: 'budget', label: 'Budget', default_access: 'view' },
  { page: 'students', module_name: 'students', label: 'Students', default_access: 'hidden' }
];

const pageToModule = Object.fromEntries(moduleMeta.map((item) => [item.page, item.module_name])) as Record<string, string>;
const defaultAdamPermissions: ModulePermission[] = moduleMeta.map((item) => ({
  module_name: item.module_name,
  role: 'limited',
  access_level: item.default_access
}));

const seedInventory: InventoryItem[] = [
  { id: 'i1', name: 'Chicken broth', brand: 'Swanson', location: 'Indoor Pantry', category: 'Food', quantity: 3, expires: '2026-07-03', value: 8.97, barcode: 'seed-1' },
  { id: 'i2', name: 'Laundry detergent', brand: 'Tide', location: 'Laundry Room', category: 'Cleaning', quantity: 1, expires: null, value: 18.99, barcode: 'seed-2' },
  { id: 'i3', name: 'Air fryer', brand: 'Ninja', location: 'Kitchen', category: 'Appliance', quantity: 1, expires: null, value: 129, barcode: 'seed-3' },
  { id: 'i4', name: 'Greek yogurt', brand: 'Chobani', location: 'Fridge', category: 'Food', quantity: 2, expires: '2026-06-19', value: 11.98, barcode: 'seed-4' }
];

const seedStudents: Student[] = [
  { id: 's1', display_name: 'Andrea', course: 'D316', goal: 'Finish current study plan checkpoint', risk: 'Medium', status: 'Active', copied: false, grow_note: 'Goal: complete D316 checkpoint. Reality: already on study plan. Options: keep steady pace and use course resources. Will: send update by Friday.', admin_notes: '', next_call_prep: 'Ask about the study plan checkpoint and what resource helped most this week.', constructive_note: 'Ask one concrete pacing question before giving advice.', last_contact_date: null, next_appointment_date: null, graduation_goal_date: null, missed_call_count: 0, archived: false },
  { id: 's2', display_name: 'A.', course: 'Current course', goal: 'Increase weekly study time', risk: 'High', status: 'Support', copied: true, grow_note: 'Goal: get back on track. Reality: progress slowed. Options: block study time and ask for help early. Will: set aside focused study this week.', admin_notes: '', next_call_prep: 'Start with encouragement, then ask what study block worked best.', constructive_note: 'Keep questions open-ended and end with one small commitment.', last_contact_date: null, next_appointment_date: null, graduation_goal_date: null, missed_call_count: 1, archived: false }
];

const seedTouchpoints: Touchpoint[] = [];

const seedTasks: TaskItem[] = [
  { id: 't1', title: 'Check fridge items expiring this week', owner: 'Kaylee', mode: 'home', minutes: 8, priority: 'warning', status: 'open', source: 'Inventory' },
  { id: 't2', title: 'Draft 3 student follow-ups from GROW notes', owner: 'Kaylee', mode: 'work', minutes: 20, priority: 'normal', status: 'open', source: 'Students' },
  { id: 't3', title: "Approve Adam's Friday task plan", owner: 'Kaylee', mode: 'home', minutes: 5, priority: 'urgent', status: 'pending_approval', source: 'Adam' }
];

const adamPlan = [
  { day: 'Mon', tasks: ['Take trash out', 'Clear nightstand'], rationale: 'Quick wins first; no tedious stacking.' },
  { day: 'Tue', tasks: ['Unload dishwasher', 'Water porch plants'], rationale: 'Two light tasks only.' },
  { day: 'Wed', tasks: ['Vacuum living room'], rationale: 'Room-level subtask, not whole-house vacuuming.' },
  { day: 'Thu', tasks: ['Put laundry in hamper', 'Wipe bathroom counter'], rationale: 'Short, contained, visible finish.' },
  { day: 'Fri', tasks: ['Reset car trash'], rationale: 'One tiny task before weekend.' },
  { day: 'Sat', tasks: ['Yard work block'], rationale: 'Saturday heavy day; only task.' },
  { day: 'Sun', tasks: ['Rest day'], rationale: 'Sunday is always rest.' }
];

const vehicles = [
  { name: '2016 Toyota Corolla', miles: 134000, type: 'Gas', urgent: ['Spark plugs overdue', 'Transmission fluid unknown'], ok: ['Brakes completed 2025', 'Tire rotation at 133,900 mi'] },
  { name: '2013 Nissan Leaf', miles: 82500, type: 'EV', urgent: ['12V auxiliary battery likely due', 'HV battery health check'], ok: ['Registration tracked'] }
];

const homeSuggestions = [
  { title: 'Replace HVAC filter', urgency: 'urgent', reason: 'Georgia pollen + renter-safe maintenance.', effort: '10 min' },
  { title: 'Check under sinks for leaks', urgency: 'soon', reason: 'Tenant-only prevention before humidity damage.', effort: '15 min' },
  { title: 'Pest entry point walkthrough', urgency: 'seasonal', reason: 'Canton summer pest pressure.', effort: '20 min' },
  { title: 'Clean dryer lint path', urgency: 'routine', reason: 'Low-cost fire prevention.', effort: '15 min' }
];

const briefing = [
  'Today focuses on approval, quick wins, and expiring inventory.',
  'Adam should stay at 2-3 tasks max; no Sunday tasks should be generated.',
  'Work mode keeps student records FERPA-safe: first name/nickname only, GROW notes only, clipboard copy only.',
  'Budget page is scaffolded next; calendar cashflow is the source of truth.'
];

function getRoleFromEmail(email = ''): Role {
  const lowered = email.toLowerCase();
  if (kayleeEmails.includes(lowered)) return 'admin';
  if (adamEmails.includes(lowered)) return 'limited';
  return 'limited';
}

function getNameFromEmail(email = '') {
  const lowered = email.toLowerCase();
  if (kayleeEmails.includes(lowered)) return 'Kaylee';
  if (adamEmails.includes(lowered)) return 'Adam';
  return email.split('@')[0] || 'User';
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('home');
  const [page, setPage] = useState<Page>('dashboard');
  const [inventory, setInventory] = useState<InventoryItem[]>(seedInventory);
  const [students, setStudents] = useState<Student[]>(seedStudents);
  const [touchpoints, setTouchpoints] = useState<Touchpoint[]>(seedTouchpoints);
  const [tasks, setTasks] = useState<TaskItem[]>(seedTasks);
  const [permissions, setPermissions] = useState<ModulePermission[]>(defaultAdamPermissions);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Ready.');

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
      if (data.session) void bootUser(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) void bootUser(nextSession);
      else {
        setProfile(null);
        setMode('home');
        setPage('dashboard');
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (profile?.role === 'limited' && mode === 'work') {
      setMode('home');
      setPage('dashboard');
    }
  }, [profile, mode]);

  async function bootUser(activeSession: Session) {
    await ensureProfile(activeSession);
    await loadData();
  }

  async function ensureProfile(activeSession: Session) {
    if (!supabase || !activeSession.user.email) return;
    const email = activeSession.user.email;
    const role = getRoleFromEmail(email);
    const display_name = getNameFromEmail(email);

    const { data: existing } = await supabase.from('profiles').select('*').eq('id', activeSession.user.id).maybeSingle();
    if (existing) {
      setProfile(existing as Profile);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .upsert({ id: activeSession.user.id, email, display_name, role }, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) {
      setProfile({ id: activeSession.user.id, email, display_name, role });
      setMessage(`Profile fallback loaded. SQL schema may need v0.5 auth update: ${error.message}`);
      return;
    }
    setProfile(data as Profile);
  }

  async function loadData() {
    if (!supabase) return;
    setLoading(true);
    try {
      const [invResult, studentResult, touchpointResult, taskResult, permissionResult] = await Promise.all([
        supabase.from('inventory_items').select('*').order('created_at', { ascending: false }),
        supabase.from('students').select('*').order('created_at', { ascending: false }),
        supabase.from('student_touchpoints').select('*').order('touchpoint_date', { ascending: false }),
        supabase.from('tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('module_permissions').select('*').eq('role', 'limited').order('module_name', { ascending: true })
      ]);

      if (!invResult.error && invResult.data) setInventory(invResult.data as InventoryItem[]);
      if (!studentResult.error && studentResult.data) setStudents(normalizeStudents(studentResult.data as Student[]));
      if (!touchpointResult.error && touchpointResult.data) setTouchpoints(touchpointResult.data as Touchpoint[]);
      if (!taskResult.error && taskResult.data) setTasks(taskResult.data as TaskItem[]);
      if (!permissionResult.error && permissionResult.data && permissionResult.data.length) {
        setPermissions(mergePermissions(permissionResult.data as ModulePermission[]));
      }
      setMessage('Supabase data loaded.');
    } catch (error) {
      setMessage('Could not load Supabase data. Using starter data.');
    } finally {
      setLoading(false);
    }
  }

  function mergePermissions(rows: ModulePermission[]) {
    return defaultAdamPermissions.map((fallback) => rows.find((row) => row.module_name === fallback.module_name) || fallback);
  }

  function normalizeStudents(rows: Student[]) {
    return rows.map((row) => ({
      ...row,
      course: row.course || '',
      status: row.status || 'Active',
      risk: row.risk || 'Medium',
      admin_notes: row.admin_notes || '',
      next_call_prep: row.next_call_prep || '',
      constructive_note: row.constructive_note || '',
      last_contact_date: row.last_contact_date || null,
      next_appointment_date: row.next_appointment_date || null,
      graduation_goal_date: row.graduation_goal_date || null,
      momentum: row.momentum || '',
      last_academic_activity_date: row.last_academic_activity_date || null,
      course_end_date: row.course_end_date || null,
      term_end_date: row.term_end_date || null,
      enrolled_cu: row.enrolled_cu ?? null,
      term_remaining_cu: row.term_remaining_cu ?? null,
      term_completed_cu: row.term_completed_cu ?? null,
      contact_term: row.contact_term ?? null,
      weeks_in_course: row.weeks_in_course ?? null,
      latest_course_note: row.latest_course_note || '',
      next_conversation_focus: row.next_conversation_focus || '',
      known_blockers: row.known_blockers || '',
      preferred_contact_method: row.preferred_contact_method || '',
      student_timezone: row.student_timezone || '',
      missed_call_count: Number(row.missed_call_count || 0),
      archived: Boolean(row.archived)
    }));
  }

  function generateStudentSupport(note: string, course?: string | null, momentum?: string | null) {
    const lower = note.toLowerCase();
    const courseText = course ? ` in ${course}` : '';
    const next_call_prep = [
      `Check progress${courseText} and ask what changed since the last touchpoint.`,
      momentum ? `Confirm whether momentum is still ${momentum.toLowerCase()} and what support would make next week easier.` : 'Ask the student to name one realistic study block before the next call.',
      lower.includes('assessment') || lower.includes('oa') || lower.includes('pa') ? 'Ask what is left before the assessment and whether pacing or confidence is the blocker.' : 'Ask what the next measurable course action is.'
    ].join(' ');
    const constructive_note = lower.includes('behind') || lower.includes('miss') || lower.includes('ghost')
      ? 'Lead with empathy, then ask for a specific commitment and confirm the next appointment before ending the call.'
      : 'Ask one clarifying question before offering resources; keep the next step small and specific.';
    const follow_up_email = `Hi {first_name},

Thank you for connecting with me. Based on our last touchpoint, the next best step is to focus on one specific course action before our next check-in. Please reply with what you plan to complete next and what support you need from me.

Best,
Kaylee`;
    const follow_up_text = `Hi {first_name}, this is Kaylee checking in. Before our next call, what is the one course task you plan to complete next?`;
    return { next_call_prep, constructive_note, follow_up_email, follow_up_text };
  }

  function ferpaWarnings(text: string) {
    const warnings: string[] = [];
    if (/\d{6,}/.test(text)) warnings.push('Possible student ID or long identifying number');
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) warnings.push('Possible email address');
    if (/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(text)) warnings.push('Possible phone number');
    if (/\d{3}-\d{2}-\d{4}/.test(text)) warnings.push('Possible SSN-like number');
    return warnings;
  }

  function isAdmin() {
    return profile?.role === 'admin';
  }

  function moduleFor(section: Page) {
    return pageToModule[section] || section;
  }

  function permissionFor(section: Page) {
    if (isAdmin()) return { access_level: 'edit' as AccessLevel };
    if (section === 'settings') return { access_level: 'hidden' as AccessLevel };
    if (section === 'students') return { access_level: 'hidden' as AccessLevel };
    const module_name = moduleFor(section);
    return permissions.find((permission) => permission.module_name === module_name) || { access_level: 'hidden' as AccessLevel };
  }

  function canView(section: Page) {
    if (isAdmin()) return true;
    if (mode === 'work') return false;
    return permissionFor(section).access_level !== 'hidden';
  }

  function canEdit(section: Page) {
    if (isAdmin()) return true;
    if (mode === 'work') return false;
    return permissionFor(section).access_level === 'edit';
  }

  async function updatePermission(module_name: string, access_level: AccessLevel) {
    if (!isAdmin()) return;
    const next = { module_name, role: 'limited' as const, access_level };
    setPermissions((current) => {
      const exists = current.some((permission) => permission.module_name === module_name);
      return exists
        ? current.map((permission) => permission.module_name === module_name ? { ...permission, access_level } : permission)
        : [...current, next];
    });

    if (!supabase) return setMessage('Permission saved locally.');
    const { error } = await supabase
      .from('module_permissions')
      .upsert(next, { onConflict: 'module_name,role' });
    if (error) setMessage(`Permission save failed: ${error.message}`);
    else setMessage('Adam permission saved.');
  }

  async function createInventoryItem(item: Omit<InventoryItem, 'id'>) {
    if (!canEdit('inventory')) return setMessage('This section is view-only for Adam. Kaylee can enable editing in Settings.');
    const optimistic = { ...item, id: crypto.randomUUID() };
    setInventory((current) => [optimistic, ...current]);
    if (!supabase) return setMessage('Saved locally. Add Supabase env vars + schema to persist.');

    const { data, error } = await supabase.from('inventory_items').insert(item).select().single();
    if (error) return setMessage(`Inventory save failed: ${error.message}`);
    setInventory((current) => [data as InventoryItem, ...current.filter((i) => i.id !== optimistic.id)]);
    setMessage('Inventory item saved to Supabase.');
  }

  async function updateInventoryQuantity(id: string, quantity: number) {
    if (!canEdit('inventory')) return setMessage('Inventory is view-only for Adam right now.');
    const nextQty = Math.max(0, quantity);
    setInventory((current) => current.map((item) => item.id === id ? { ...item, quantity: nextQty } : item));
    if (!supabase) return;
    const { error } = await supabase.from('inventory_items').update({ quantity: nextQty }).eq('id', id);
    if (error) setMessage(`Quantity update failed: ${error.message}`);
  }


  function parseCsv(text: string) {
    const rows: string[][] = [];
    let row: string[] = [];
    let value = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (char === '"' && inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(value.trim());
        value = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') i += 1;
        row.push(value.trim());
        if (row.some((cell) => cell !== '')) rows.push(row);
        row = [];
        value = '';
      } else {
        value += char;
      }
    }
    row.push(value.trim());
    if (row.some((cell) => cell !== '')) rows.push(row);
    return rows;
  }

  function csvDate(value?: string) {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  function csvNumber(value?: string) {
    if (!value) return null;
    const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function riskFromMomentum(momentum?: string) {
    const m = String(momentum || '').toLowerCase();
    if (m.includes('low') && !m.includes('med')) return 'High Risk';
    if (m.includes('med low')) return 'High';
    if (m.includes('med')) return 'Medium';
    if (m.includes('high')) return 'Low';
    return 'Medium';
  }

  function buildNextConversationFocus(row: Record<string, string>) {
    const course = row.coursecode || 'current course';
    const momentum = row.momentum || 'not set';
    const courseEnd = row.courseenddate || '';
    const note = row.latestcoursenote || '';
    const pieces = [
      `Review progress in ${course}.`,
      courseEnd ? `Confirm the plan to complete by ${courseEnd}.` : 'Confirm the next course milestone and target date.',
      `Check whether momentum is still ${momentum}.`
    ];
    if (note) pieces.push('Follow up on the latest course note and ask what support is needed next.');
    return pieces.join(' ');
  }

  function buildImportedNextCallPrep(row: Record<string, string>) {
    const course = row.coursecode || 'the current course';
    const momentum = row.momentum || 'not set';
    const lastActivity = row.lastacademicactivitydate || 'not available';
    const termRemaining = row.termremainingcu || '';
    const termCompleted = row.termcompletedcu || '';
    return [
      `Current course: ${course}.`,
      `Momentum: ${momentum}. Last academic activity: ${lastActivity}.`,
      termRemaining || termCompleted ? `Term CUs: ${termCompleted || '0'} completed, ${termRemaining || 'unknown'} remaining.` : '',
      'Suggested questions: What progress did you make since our last touchpoint? What is your next measurable course action? What blocker could keep you from completing that action before our next call? What support do you need from me this week?'
    ].filter(Boolean).join(' ');
  }

  async function importStudentsFromCsv(text: string) {
    if (!isAdmin()) return setMessage('CSV import is admin-only.');
    const rows = parseCsv(text);
    if (rows.length < 2) return setMessage('No student rows found in CSV.');
    const headers = rows[0].map((header) => header.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
    const records = rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])));

    // Accept either "Name" or "DisplayName" as the student name column.
    // Also accept several plausible aliases for the WGU student ID column.
    const cleaned = records
      .map((row) => ({
        ...row,
        displayname: row.displayname || row.name || '',
        studentid: row.studentid || row.wguid || row.studentidnumber || ''
      }))
      .filter((row) => row.displayname)
      .map((row) => {
        const course = row.coursecode || '';
        const latestNote = row.latestcoursenote || '';
        return {
          display_name: row.displayname,
          student_id: row.studentid || null,
          course,
          goal: course ? `Progress steadily through ${course}.` : 'Progress steadily toward current course goal.',
          risk: riskFromMomentum(row.momentum),
          status: 'Active',
          copied: false,
          grow_note: '',
          admin_notes: latestNote ? `Latest course note: ${latestNote}` : '',
          next_call_prep: buildImportedNextCallPrep(row),
          constructive_note: 'Use GROW: confirm the goal, clarify current reality, offer options, and end with one measurable commitment.',
          last_contact_date: null,
          next_appointment_date: null,
          graduation_goal_date: csvDate(row.studentgraduationgoal),
          missed_call_count: 0,
          archived: false,
          momentum: row.momentum || '',
          last_academic_activity_date: csvDate(row.lastacademicactivitydate),
          course_end_date: csvDate(row.courseenddate),
          term_end_date: csvDate(row.termenddate),
          enrolled_cu: csvNumber(row.enrolledcu),
          term_remaining_cu: csvNumber(row.termremainingcu),
          term_completed_cu: csvNumber(row.termcompletedcu),
          contact_term: csvNumber(row.contactterm),
          weeks_in_course: csvNumber(row.weeksincourse),
          latest_course_note: latestNote,
          next_conversation_focus: buildNextConversationFocus(row),
          known_blockers: '',
          preferred_contact_method: '',
          student_timezone: row.timezone || ''
        };
      });

    if (!cleaned.length) return setMessage('No importable students found. Make sure the CSV includes DisplayName.');

    const existingKeys = new Set(students.map((student) => `${student.display_name.toLowerCase()}|${String(student.course || '').toLowerCase()}`));
    const newStudents = cleaned.filter((student) => !existingKeys.has(`${student.display_name.toLowerCase()}|${String(student.course || '').toLowerCase()}`));
    if (!newStudents.length) return setMessage('CSV processed, but all students already appear to exist.');

    if (!supabase) {
      setStudents((current) => [...newStudents.map((student) => ({ ...student, id: crypto.randomUUID() } as Student)), ...current]);
      return setMessage(`Imported ${newStudents.length} students locally.`);
    }

    const { data, error } = await supabase.from('students').insert(newStudents).select();
    if (error) return setMessage(`CSV import failed: ${error.message}`);
    setStudents((current) => normalizeStudents([...(data as Student[]), ...current]));
    setMessage(`Imported ${data?.length || newStudents.length} FERPA-safe students.`);
  }

  async function createStudent(student: Omit<Student, 'id' | 'copied' | 'archived'>) {
    if (!isAdmin()) return setMessage('Student records are admin-only.');
    const optimistic: Student = { ...student, copied: false, archived: false, id: crypto.randomUUID() };
    setStudents((current) => [optimistic, ...current]);
    if (!supabase) return setMessage('Saved locally. Add Supabase env vars + schema to persist.');

    const { data, error } = await supabase.from('students').insert({ ...student, copied: false, archived: false }).select().single();
    if (error) return setMessage(`Student save failed: ${error.message}`);
    setStudents((current) => [data as Student, ...current.filter((s) => s.id !== optimistic.id)]);
    setMessage('Student saved to Supabase.');
  }

  async function updateStudent(id: string, patch: Partial<Student>) {
    if (!isAdmin()) return setMessage('Student records are admin-only.');
    setStudents((current) => current.map((student) => student.id === id ? { ...student, ...patch } : student));
    if (!supabase) return;
    const { error } = await supabase.from('students').update(patch).eq('id', id);
    if (error) setMessage(`Student update failed: ${error.message}`);
    else setMessage('Student updated.');
  }

  async function archiveStudent(id: string) {
    await updateStudent(id, { archived: true, status: 'Archived' });
  }

  async function createTouchpoint(input: Omit<Touchpoint, 'id' | 'next_call_prep' | 'constructive_note' | 'follow_up_email' | 'follow_up_text' | 'copied'>) {
    if (!isAdmin()) return setMessage('Touchpoint logs are admin-only.');
    const generated = generateStudentSupport(input.note, input.course, input.momentum);
    const touchpoint: Touchpoint = { ...input, ...generated, copied: false, id: crypto.randomUUID() };
    setTouchpoints((current) => [touchpoint, ...current]);

    const isMissed = input.touchpoint_type.toLowerCase().includes('missed') || input.touchpoint_type.toLowerCase().includes('no-show');
    const student = students.find((s) => s.id === input.student_id);
    const missed_call_count = isMissed ? Number(student?.missed_call_count || 0) + 1 : Number(student?.missed_call_count || 0);
    const status = missed_call_count >= 3 ? 'Ghost' : student?.status || 'Active';
    await updateStudent(input.student_id, {
      course: input.course || student?.course || '',
      last_contact_date: input.touchpoint_date,
      missed_call_count,
      status,
      next_call_prep: generated.next_call_prep,
      constructive_note: generated.constructive_note
    });

    if (!supabase) return setMessage('Touchpoint saved locally.');
    const { data, error } = await supabase.from('student_touchpoints').insert({ ...input, ...generated, copied: false }).select().single();
    if (error) return setMessage(`Touchpoint save failed: ${error.message}`);
    setTouchpoints((current) => [data as Touchpoint, ...current.filter((t) => t.id !== touchpoint.id)]);
    setMessage('Touchpoint saved and next-call prep generated.');
  }

  async function copyStudentText(text: string, id?: string, table: 'students' | 'student_touchpoints' = 'students') {
    if (!isAdmin()) return;
    await navigator.clipboard?.writeText(text);
    if (id && table === 'students') {
      setStudents((current) => current.map((student) => student.id === id ? { ...student, copied: true } : student));
      await supabase?.from('students').update({ copied: true }).eq('id', id);
    }
    if (id && table === 'student_touchpoints') {
      setTouchpoints((current) => current.map((touchpoint) => touchpoint.id === id ? { ...touchpoint, copied: true } : touchpoint));
      await supabase?.from('student_touchpoints').update({ copied: true }).eq('id', id);
    }
  }

  async function completeTask(id: string) {
    if (!canEdit('today')) return setMessage('Tasks are view-only for Adam right now.');
    setTasks((current) => current.map((task) => task.id === id ? { ...task, status: 'completed' } : task));
    if (!supabase) return;
    const { error } = await supabase.from('tasks').update({ status: 'completed' }).eq('id', id);
    if (error) setMessage(`Task update failed: ${error.message}`);
  }

  async function signOut() {
    await supabase?.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  const navItems = useMemo(() => {
    if (profile?.role === 'limited') return homeNav.filter(([id]) => canView(id));
    return mode === 'home' ? homeNav : workNav;
  }, [mode, profile, permissions]);

  if (!hasSupabase) {
    return <LoginScreen localOnly />;
  }

  if (authLoading) {
    return <div className="loading-screen">Loading Kaylee's Hub...</div>;
  }

  if (!session) {
    return <LoginScreen />;
  }

  const activeRole = profile?.role || getRoleFromEmail(session.user.email || '');
  const activeName = profile?.display_name || getNameFromEmail(session.user.email || '');
  const activeCanEdit = canEdit(page);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="logo"><span className="logo-mark">KH</span><span>Kaylee's Hub</span></div>
        <div className="toggle-wrap">
          <button className={mode === 'home' ? 'active' : ''} onClick={() => { setMode('home'); setPage('dashboard'); }}><Home size={15} /> Home</button>
          <button className={mode === 'work' ? 'active' : ''} disabled={activeRole !== 'admin'} onClick={() => { setMode('work'); setPage('dashboard'); }}><Users size={15} /> Work</button>
        </div>
        <div className="top-actions">
          <span className={`role-pill ${activeRole}`}>{activeName} · {activeRole === 'admin' ? 'Admin' : 'Limited'}</span>
          <button className="btn ghost" onClick={signOut}><LogOut size={15} /> Sign out</button>
        </div>
      </header>
      <div className="main">
        <aside className="sidebar">
          <div className="nav-label">{activeRole === 'limited' ? 'Home' : mode === 'home' ? 'Home' : 'Work'}</div>
          {navItems.map(([id, label, Icon]) => (
            <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}>
              <Icon size={16} /><span>{label}</span>{activeRole === 'limited' && id !== 'dashboard' && permissionFor(id).access_level !== 'edit' && <Lock size={13} className="nav-lock" />}
            </button>
          ))}
          {activeRole === 'admin' && (
            <>
              <div className="nav-label">Admin</div>
              <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}><Settings size={16} /><span>Settings</span></button>
            </>
          )}
          <div className="side-note"><strong>{activeRole === 'limited' ? 'Adam home mode' : mode === 'home' ? 'Canton tenant mode' : 'FERPA-safe mode'}</strong><p>{activeRole === 'limited' ? 'Home side only. Kaylee controls view/edit access by section.' : mode === 'home' ? 'Tenant-only suggestions. Adam access controlled in Settings.' : 'First name/nickname only. Clipboard copy only.'}</p></div>
          <div className="sync-note"><strong>{hasSupabase ? 'Supabase enabled' : 'Local demo mode'}</strong><p>{loading ? 'Loading...' : message}</p><button className="btn tiny" onClick={loadData}><RefreshCw size={13} /> Refresh</button></div>
        </aside>
        <main className="content">
          {!activeCanEdit && activeRole === 'limited' && page !== 'dashboard' && <ViewOnlyBanner />}
          {page === 'dashboard' && <Dashboard mode={activeRole === 'limited' ? 'home' : mode} inventory={inventory} students={students} touchpoints={touchpoints} tasks={tasks} role={activeRole} setPage={setPage} />}
          {page === 'today' && <Today tasks={tasks.filter((task) => activeRole === 'admin' || task.mode === 'home')} completeTask={completeTask} editable={canEdit('today')} />}
          {page === 'briefing' && <Briefing />}
          {page === 'calendar' && <Placeholder title="Calendar" sub="Google Calendar integration will connect here after auth basics are stable." />}
          {page === 'budget' && <Placeholder title="Budget" sub={activeRole === 'limited' ? 'Kaylee controls whether this is visible/editable for Adam.' : 'Calendar-based cashflow page scaffold.'} />}
          {page === 'inventory' && <Inventory inventory={inventory} createItem={createInventoryItem} updateQuantity={updateInventoryQuantity} editable={canEdit('inventory')} />}
          {page === 'chores' && <Placeholder title="Chores & Tasks" sub="Todoist integration will connect here." />}
          {page === 'adam' && <Adam editable={canEdit('adam')} />}
          {page === 'vehicles' && <Vehicles />}
          {page === 'suggestions' && <Suggestions editable={canEdit('suggestions')} />}
          {page === 'students' && activeRole === 'admin' && <Students students={students} touchpoints={touchpoints} importStudentsFromCsv={importStudentsFromCsv} createStudent={createStudent} updateStudent={updateStudent} archiveStudent={archiveStudent} createTouchpoint={createTouchpoint} copyText={copyStudentText} ferpaWarnings={ferpaWarnings} />}
          {page === 'settings' && activeRole === 'admin' && <SettingsPage permissions={permissions} updatePermission={updatePermission} />}
        </main>
      </div>
    </div>
  );
}

function LoginScreen({ localOnly = false }: { localOnly?: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(localOnly ? 'Add Supabase env vars to Vercel to enable login.' : 'Sign in with your Kaylee or Adam account.');
  const [busy, setBusy] = useState(false);

  async function signIn() {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
  }

  async function signUp() {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
    else setMessage('Account created. If email confirmation is on, confirm first, then sign in.');
  }

  return (
    <div className="login-screen">
      <section className="login-card">
        <div className="logo login-logo"><span className="logo-mark">KH</span><span>Kaylee's Hub</span></div>
        <h1>Welcome back</h1>
        <p>{message}</p>
        <input placeholder="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <input placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <button className="btn primary wide" onClick={signIn} disabled={busy || localOnly}>Sign in</button>
        <button className="btn ghost wide" onClick={signUp} disabled={busy || localOnly}>Create account</button>
        <div className="login-hint"><strong>Roles:</strong> Kaylee is admin. Adam is limited to Home mode, with section view/edit access controlled in Settings.</div>
      </section>
    </div>
  );
}

function ViewOnlyBanner() {
  return <div className="view-only-banner"><Lock size={16} /><span>View-only mode: Kaylee can turn on editing for this section in Settings.</span></div>;
}

function Header({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return <div className="page-header"><div><h1>{title}</h1><p>{sub}</p></div>{children && <div className="actions">{children}</div>}</div>;
}

function Stats({ items }: { items: [string, string, string?][] }) {
  return <div className="stats-row">{items.map(([label, value, sub]) => <div className="stat-card" key={label}><div className="stat-label">{label}</div><div className="stat-val">{value}</div>{sub && <div className="stat-sub">{sub}</div>}</div>)}</div>;
}

function studentStatusSignals(student: Student, touchpoints: Touchpoint[]) {
  const studentTouchpoints = touchpoints.filter((touchpoint) => touchpoint.student_id === student.id);
  const meaningfulTouchpoints = studentTouchpoints.filter((touchpoint) => !touchpoint.touchpoint_type.toLowerCase().includes('missed') && !touchpoint.touchpoint_type.toLowerCase().includes('no-show'));
  const lastTouchpoint = studentTouchpoints[0];
  const lastMeaningful = meaningfulTouchpoints[0];
  const missedCalls = Number(student.missed_call_count || 0);
  const isGhost = String(student.status).toLowerCase().includes('ghost') || missedCalls >= 3;
  const isSupport = String(student.status).toLowerCase().includes('support');
  const isPortalOnly = String(student.status).toLowerCase().includes('portal');
  const isHighRisk = String(student.risk).toLowerCase().includes('high') || isGhost || isPortalOnly;
  const needsFollowUp = !student.copied || isHighRisk || isSupport;
  return { studentTouchpoints, lastTouchpoint, lastMeaningful, missedCalls, isGhost, isSupport, isPortalOnly, isHighRisk, needsFollowUp };
}

function priorityScore(student: Student, touchpoints: Touchpoint[]) {
  const signals = studentStatusSignals(student, touchpoints);
  let score = 0;
  if (signals.isGhost) score += 50;
  if (signals.isHighRisk) score += 35;
  if (signals.isSupport) score += 20;
  if (!student.copied) score += 12;
  score += Math.min(signals.missedCalls * 8, 30);
  if (student.next_appointment_date) score += 8;
  if (!student.last_contact_date && signals.studentTouchpoints.length === 0) score += 10;
  return score;
}


function daysSince(dateValue?: string | null) {
  if (!dateValue) return 999;
  const value = new Date(dateValue).getTime();
  if (Number.isNaN(value)) return 999;
  return Math.max(0, Math.floor((Date.now() - value) / 86400000));
}

function daysUntil(dateValue?: string | null) {
  if (!dateValue) return null;
  const value = new Date(dateValue).getTime();
  if (Number.isNaN(value)) return null;
  return Math.ceil((value - Date.now()) / 86400000);
}

function riskPenalty(student: Student, touchpoints: Touchpoint[]) {
  const signals = studentStatusSignals(student, touchpoints);
  let penalty = 0;
  if (String(student.risk).toLowerCase().includes('high risk')) penalty += 32;
  else if (String(student.risk).toLowerCase().includes('high')) penalty += 22;
  else if (String(student.risk).toLowerCase().includes('medium')) penalty += 10;
  if (signals.isGhost) penalty += 28;
  if (signals.isPortalOnly) penalty += 22;
  if (signals.isSupport) penalty += 8;
  penalty += Math.min(signals.missedCalls * 7, 24);
  const gap = Math.min(daysSince(student.last_contact_date || signals.lastMeaningful?.touchpoint_date || signals.lastTouchpoint?.touchpoint_date), 30);
  if (gap >= 21) penalty += 24;
  else if (gap >= 14) penalty += 16;
  else if (gap >= 7) penalty += 8;
  return Math.min(100, penalty);
}

function studentHealth(student: Student, touchpoints: Touchpoint[]) {
  const signals = studentStatusSignals(student, touchpoints);
  const meaningfulGap = daysSince(student.last_contact_date || signals.lastMeaningful?.touchpoint_date || signals.lastTouchpoint?.touchpoint_date);
  const momentumText = `${student.goal || ''} ${student.grow_note || ''} ${student.admin_notes || ''} ${signals.lastTouchpoint?.note || ''} ${signals.lastTouchpoint?.momentum || ''}`.toLowerCase();
  let momentum = 62;
  if (momentumText.includes('passed') || momentumText.includes('complete') || momentumText.includes('scheduled') || momentumText.includes('progress')) momentum += 18;
  if (momentumText.includes('behind') || momentumText.includes('stuck') || momentumText.includes('overwhelm') || momentumText.includes('slow')) momentum -= 18;
  if (meaningfulGap > 14) momentum -= 12;
  let engagement = 78;
  if (signals.isSupport) engagement += 8;
  if (meaningfulGap <= 7) engagement += 10;
  if (signals.missedCalls >= 1) engagement -= Math.min(signals.missedCalls * 12, 36);
  if (signals.isGhost || signals.isPortalOnly) engagement -= 28;
  const risk = Math.max(0, 100 - riskPenalty(student, touchpoints));
  let goalProgress = 58;
  const gradDays = daysUntil(student.graduation_goal_date);
  if (gradDays !== null && gradDays <= 90 && String(student.risk).toLowerCase().includes('high')) goalProgress -= 18;
  if (momentum >= 75) goalProgress += 12;
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  momentum = clamp(momentum);
  engagement = clamp(engagement);
  goalProgress = clamp(goalProgress);
  const overall = clamp(momentum * .3 + engagement * .3 + risk * .25 + goalProgress * .15);
  return { overall, momentum, engagement, risk, goalProgress };
}

function healthClass(score: number) {
  if (score >= 80) return 'good';
  if (score >= 60) return 'medium';
  if (score >= 40) return 'high';
  return 'high-risk';
}

function timelineForStudent(student: Student, touchpoints: Touchpoint[]) {
  const studentTouchpoints = touchpoints.filter((touchpoint) => touchpoint.student_id === student.id);
  const profileEvents = [
    student.next_appointment_date ? { id: `next-${student.id}`, date: student.next_appointment_date, title: 'Next appointment', detail: 'Manual appointment date · Outlook sync later', kind: 'appointment' } : null,
    student.graduation_goal_date ? { id: `grad-${student.id}`, date: student.graduation_goal_date, title: 'Graduation goal date', detail: 'Student success target date', kind: 'goal' } : null
  ].filter(Boolean) as { id: string; date: string; title: string; detail: string; kind: string }[];
  const touchEvents = studentTouchpoints.map((touchpoint) => ({
    id: touchpoint.id,
    date: touchpoint.touchpoint_date,
    title: touchpoint.touchpoint_type,
    detail: touchpoint.note,
    kind: 'touchpoint'
  }));
  return [...profileEvents, ...touchEvents].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function Dashboard({ mode, inventory, students, touchpoints, tasks, role, setPage }: { mode: Mode; inventory: InventoryItem[]; students: Student[]; touchpoints: Touchpoint[]; tasks: TaskItem[]; role: Role; setPage: (page: Page) => void }) {
  const expiring = inventory.filter((item) => item.expires).length;
  const pending = tasks.filter((task) => task.status === 'pending_approval').length;
  const activeStudents = students.filter((student) => !student.archived);
  const highRiskStudents = activeStudents.filter((student) => studentStatusSignals(student, touchpoints).isHighRisk);
  const ghostRiskStudents = activeStudents.filter((student) => studentStatusSignals(student, touchpoints).isGhost);
  const supportStudents = activeStudents.filter((student) => studentStatusSignals(student, touchpoints).isSupport);
  const followUpsDue = activeStudents.filter((student) => studentStatusSignals(student, touchpoints).needsFollowUp);
  const today = new Date().toISOString().slice(0, 10);
  const callsToday = activeStudents.filter((student) => student.next_appointment_date === today);
  const priorityQueue = [...activeStudents].sort((a, b) => priorityScore(b, touchpoints) - priorityScore(a, touchpoints)).slice(0, 6);

  if (mode === 'work' && role === 'admin') {
    return <>
      <Header title="Mentor Success Dashboard" sub="Daily command center for student risk, call prep, follow-ups, and mentor readiness.">
        <button className="btn primary" onClick={() => setPage('students')}><Users size={15} /> Open Students</button>
      </Header>
      <Stats items={[
        ['High risk', String(highRiskStudents.length), 'needs strategy'],
        ['Ghost risk', String(ghostRiskStudents.length), '3+ missed/no contact'],
        ['Calls today', String(callsToday.length), 'manual now · Outlook later'],
        ['Follow-ups due', String(followUpsDue.length), 'copy/draft needed']
      ]} />
      <div className="mentor-grid">
        <section className="panel mentor-action-panel">
          <div className="panel-head"><h2>Today’s Priority Queue</h2><span className="readonly-pill"><AlertTriangle size={14} /> Risk ordered</span></div>
          {priorityQueue.length === 0 && <div className="brief-item">No active students yet. Add students to begin building your call-prep queue.</div>}
          {priorityQueue.map((student, index) => {
            const signals = studentStatusSignals(student, touchpoints);
            const score = priorityScore(student, touchpoints);
            const health = studentHealth(student, touchpoints);
            return <button className="mentor-queue-row" key={student.id} onClick={() => setPage('students')}>
              <span className="queue-rank">{index + 1}</span>
              <div>
                <strong>{student.display_name}</strong>
                <p>{student.course || 'No course'} · {student.status} · Last: {student.last_contact_date || signals.lastTouchpoint?.touchpoint_date || '—'}</p>
              </div>
              <span className={`risk-pill ${String(student.risk).toLowerCase().replace(' ', '-')}`}>{student.risk}</span>
              <span className={`health-pill ${healthClass(health.overall)}`}>Health {health.overall}</span><small>{signals.isGhost ? 'Ghost risk' : signals.isSupport ? 'Support' : score >= 35 ? 'Watch closely' : 'Prep ready'}</small>
            </button>;
          })}
        </section>
        <section className="panel mentor-action-panel">
          <div className="panel-head"><h2>Call Prep Focus</h2><FileText size={17} /></div>
          {priorityQueue.slice(0, 3).map((student) => {
            const signals = studentStatusSignals(student, touchpoints);
            const prep = student.next_call_prep || signals.lastTouchpoint?.next_call_prep || 'Review course momentum, confirm the next measurable action, and end with one clear commitment.';
            return <div className="call-prep-card" key={student.id}>
              <strong>{student.display_name}</strong>
              <p>{prep}</p>
              <small>{signals.missedCalls ? `${signals.missedCalls} missed call(s)` : 'No missed call flag'} · {student.next_appointment_date || 'No appointment date entered'}</small>
            </div>;
          })}
        </section>
      </div>
      <div className="grid two">
        <section className="panel"><h2>Risk Buckets</h2><div className="brief-item urgent"><strong>High risk:</strong> {highRiskStudents.map((s) => s.display_name).join(', ') || 'None'}</div><div className="brief-item"><strong>Ghost risk:</strong> {ghostRiskStudents.map((s) => s.display_name).join(', ') || 'None'}</div><div className="brief-item good"><strong>Support:</strong> {supportStudents.map((s) => s.display_name).join(', ') || 'None'}</div></section>
        <section className="panel"><h2>Mentor Metrics</h2><div className="brief-item"><strong>Active students:</strong> {activeStudents.length}</div><div className="brief-item"><strong>Touchpoints logged:</strong> {touchpoints.length}</div><div className="brief-item"><strong>Salesforce copy pending:</strong> {students.filter((s) => !s.copied && !s.archived).length}</div><div className="brief-item"><strong>FERPA mode:</strong> First name/nickname only · clipboard only</div></section>
      </div>
    </>;
  }

  return <>
    <Header title={role === 'limited' ? 'Adam home dashboard' : mode === 'home' ? 'Home command center' : 'Work command center'} sub={role === 'limited' ? 'Home-only view. Kaylee controls which sections are editable.' : mode === 'home' ? 'Tasks, approvals, inventory, vehicles, and tenant-safe home care.' : 'FERPA-safe student workflow, GROW notes, and daily planning.'} />
    <Stats items={mode === 'home' ? [['Open tasks', String(tasks.filter((task) => task.status !== 'completed' && task.mode === 'home').length), 'home'], ['Adam pending', String(pending), 'approval needed'], ['Inventory', String(inventory.length), `${expiring} expiring`], ['Vehicle alerts', '4', 'critical/due']] : [['Active students', String(activeStudents.length), 'FERPA-safe'], ['Need copy', String(students.filter((s) => !s.copied).length), 'Salesforce'], ['FERPA', 'On', 'clipboard only'], ['Calls today', String(callsToday.length), 'manual now']]} />
    <div className="grid two"><Today tasks={tasks.filter((task) => mode === 'work' ? task.mode === 'work' : task.mode === 'home').slice(0, 3)} completeTask={() => undefined} editable={false} /><Briefing compact /></div>
  </>;
}

function Today({ tasks, completeTask, editable, compact = false }: { tasks: TaskItem[]; completeTask: (id: string) => void; editable: boolean; compact?: boolean }) {
  const list = compact ? tasks.slice(0, 3) : tasks;
  return <section className="panel"><h2>Today’s Tasks</h2>{list.map((task) => <div className={`task-card ${task.priority}`} key={task.id}>{editable ? <button className="check" onClick={() => completeTask(task.id)} /> : <span className="check disabled" />}<div><strong>{task.title}</strong><p>{task.owner} · {task.minutes} min · {task.source} · {task.status}</p></div></div>)}</section>;
}

function Briefing({ compact = false }: { compact?: boolean }) {
  const list = compact ? briefing.slice(0, 2) : briefing;
  return <section className="panel"><h2>Daily Briefing</h2>{list.map((item) => <div className="brief-item" key={item}>{item}</div>)}</section>;
}

function Inventory({ inventory, createItem, updateQuantity, editable }: { inventory: InventoryItem[]; createItem: (item: Omit<InventoryItem, 'id'>) => void; updateQuantity: (id: string, quantity: number) => void; editable: boolean }) {
  const [action, setAction] = useState<InventoryAction>('none');
  const [form, setForm] = useState({ name: '', brand: '', location: '', category: '', quantity: '1', value: '', barcode: '' });

  function submit() {
    createItem({ name: form.name || 'Untitled item', brand: form.brand || null, location: form.location || 'Fridge', category: form.category || 'Food', quantity: Number(form.quantity) || 1, expires: null, value: Number(form.value) || 0, barcode: form.barcode || null });
    setForm({ name: '', brand: '', location: '', category: '', quantity: '1', value: '', barcode: '' });
    setAction('none');
  }

  return <>
    <Header title="Inventory" sub="Scan to add, manual entry, scan to use/remove, and insurance-ready tracking.">{editable ? <><button className="btn primary" onClick={() => setAction('scanAdd')}>Scan to Add</button><button className="btn ghost" onClick={() => setAction('manual')}><Plus size={15} /> Manual Entry</button><button className="btn warning" onClick={() => setAction('scanUse')}>Scan to Use / Remove</button></> : <span className="readonly-pill"><Eye size={14} /> View only</span>}</Header>
    <Stats items={[['Total items', String(inventory.length)], ['Estimated value', `$${inventory.reduce((sum, item) => sum + Number(item.value || 0), 0).toFixed(2)}`], ['Expiring soon', String(inventory.filter((item) => item.expires).length)], ['Locations', '15']]} />
    {editable && action !== 'none' && <section className={`panel action-panel ${action}`}><div className="panel-head"><h2>{action === 'manual' ? 'Manual Entry' : action === 'scanAdd' ? 'Scan to Add' : 'Scan to Use / Remove'}</h2><button className="btn ghost" onClick={() => setAction('none')}>Close</button></div>{action === 'manual' ? <div><div className="form-grid"><input placeholder="Item name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><input placeholder="Brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /><input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /><input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /><input placeholder="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /><input placeholder="Estimated value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div><div className="form-actions"><button className="btn primary" onClick={submit}><Save size={15} /> Save Item</button></div></div> : <div className="scan-row"><input placeholder="Scan or type barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /><button className={action === 'scanUse' ? 'btn warning' : 'btn primary'}>{action === 'scanUse' ? 'Use item' : 'Look up barcode'}</button></div>}</section>}
    <div className="table-card"><table><thead><tr><th>Item</th><th>Location</th><th>Category</th><th>Qty</th><th>Expires</th><th>Value</th></tr></thead><tbody>{inventory.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.brand || '—'}</small></td><td>{item.location}</td><td>{item.category}</td><td>{item.quantity} {editable && <button className="qty-button" onClick={() => updateQuantity(item.id, item.quantity - 1)}><Minus size={12} /></button>}</td><td>{item.expires || '—'}</td><td>${Number(item.value || 0).toFixed(2)}</td></tr>)}</tbody></table></div>
  </>;
}

function Adam({ editable }: { editable: boolean }) {
  return <><Header title="Adam’s Tasks" sub="ADHD-safe, Kaylee-approved task planning.">{editable ? <button className="btn primary">Create task plan</button> : <span className="readonly-pill"><Eye size={14} /> View only</span>}</Header><Stats items={[["Pending approval", '3'], ['Max/day', '2–3'], ['Heavy day', 'Saturday'], ['Sunday', 'Rest']]} /><div className="day-grid">{adamPlan.map((day) => <div className="day-card" key={day.day}><h3>{day.day}</h3>{day.tasks.map((task) => <p key={task}>{task}</p>)}<small>{day.rationale}</small></div>)}</div></>;
}

function Vehicles() {
  return <><Header title="Vehicles" sub="Maintenance tracking for Corolla and Leaf." /><div className="grid two">{vehicles.map((vehicle) => <section className="panel" key={vehicle.name}><h2>{vehicle.name}</h2><p>{vehicle.type} · {vehicle.miles.toLocaleString()} miles</p><h3>Urgent</h3>{vehicle.urgent.map((item) => <div className="brief-item urgent" key={item}>{item}</div>)}<h3>Okay</h3>{vehicle.ok.map((item) => <div className="brief-item good" key={item}>{item}</div>)}</section>)}</div></>;
}

function Suggestions({ editable }: { editable: boolean }) {
  return <><Header title="Home Suggestions" sub="Tenant-only Canton/Georgia-aware home care.">{editable ? <button className="btn primary">Generate ideas</button> : <span className="readonly-pill"><Eye size={14} /> View only</span>}</Header>{homeSuggestions.map((item) => <section className={`panel suggestion ${item.urgency}`} key={item.title}><h2>{item.title}</h2><p>{item.reason}</p><small>{item.effort}</small></section>)}</>;
}

const touchpointTypes = [
  'Email from student', 'Email to student', 'Text from student', 'Text to student',
  'Call from student', 'Call to student', 'Voicemail from student', 'Voicemail to student',
  'Appointment', 'No-show / missed call'
];

const riskLevels = ['Low', 'Medium', 'High', 'High Risk'];
const studentStatuses = ['Active', 'Support', 'Ghost', 'Portal-only', 'Archived'];

function Students({ students, touchpoints, importStudentsFromCsv, createStudent, updateStudent, archiveStudent, createTouchpoint, copyText, ferpaWarnings }: {
  students: Student[];
  touchpoints: Touchpoint[];
  importStudentsFromCsv: (text: string) => Promise<void>;
  createStudent: (student: Omit<Student, 'id' | 'copied' | 'archived'>) => void;
  updateStudent: (id: string, patch: Partial<Student>) => void;
  archiveStudent: (id: string) => void;
  createTouchpoint: (touchpoint: Omit<Touchpoint, 'id' | 'next_call_prep' | 'constructive_note' | 'follow_up_email' | 'follow_up_text' | 'copied'>) => void;
  copyText: (text: string, id?: string, table?: 'students' | 'student_touchpoints') => void;
  ferpaWarnings: (text: string) => string[];
}) {
  const activeStudents = students.filter((student) => !student.archived);
  const archivedStudents = students.filter((student) => student.archived);
  const [showArchived, setShowArchived] = useState(false);
  const visibleStudents = showArchived ? archivedStudents : activeStudents;
  const [selectedId, setSelectedId] = useState(visibleStudents[0]?.id || students[0]?.id || '');
  const selected = students.find((student) => student.id === selectedId) || visibleStudents[0] || students[0];
  const selectedTouchpoints = selected ? touchpoints.filter((touchpoint) => touchpoint.student_id === selected.id) : [];
  const [addingStudent, setAddingStudent] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [studentForm, setStudentForm] = useState({
    display_name: '', student_id: '', course: '', goal: '', risk: 'Medium', status: 'Active',
    admin_notes: '', next_appointment_date: '', graduation_goal_date: '', missed_call_count: '0'
  });
  const [touchForm, setTouchForm] = useState({
    touchpoint_type: 'Call to student', touchpoint_date: new Date().toISOString().slice(0, 10),
    course: '', momentum: '', note: ''
  });

  useEffect(() => {
    if (!selected && visibleStudents[0]) setSelectedId(visibleStudents[0].id);
  }, [showArchived, students.length]);

  function resetStudentForm() {
    setStudentForm({ display_name: '', student_id: '', course: '', goal: '', risk: 'Medium', status: 'Active', admin_notes: '', next_appointment_date: '', graduation_goal_date: '', missed_call_count: '0' });
  }

  function submitStudent() {
    const warnings = ferpaWarnings(`${studentForm.display_name} ${studentForm.goal} ${studentForm.admin_notes}`);
    if (warnings.length && !confirm(`FERPA warning:\n- ${warnings.join('\n- ')}\n\nSave anyway?`)) return;
    createStudent({
      display_name: studentForm.display_name || 'New student',
      student_id: studentForm.student_id || null,
      course: studentForm.course,
      goal: studentForm.goal,
      risk: studentForm.risk,
      status: studentForm.status,
      admin_notes: studentForm.admin_notes,
      next_appointment_date: studentForm.next_appointment_date || null,
      graduation_goal_date: studentForm.graduation_goal_date || null,
      missed_call_count: Number(studentForm.missed_call_count || 0),
      last_contact_date: null,
      grow_note: '',
      next_call_prep: '',
      constructive_note: ''
    });
    resetStudentForm();
    setAddingStudent(false);
  }

  function startEditProfile() {
    if (!selected) return;
    setStudentForm({
      display_name: selected.display_name,
      student_id: selected.student_id || '',
      course: selected.course || '',
      goal: selected.goal || '',
      risk: selected.risk || 'Medium',
      status: selected.status || 'Active',
      admin_notes: selected.admin_notes || '',
      next_appointment_date: selected.next_appointment_date || '',
      graduation_goal_date: selected.graduation_goal_date || '',
      missed_call_count: String(selected.missed_call_count || 0)
    });
    setEditingProfile(true);
  }

  function saveProfileEdit() {
    if (!selected) return;
    const warnings = ferpaWarnings(`${studentForm.display_name} ${studentForm.goal} ${studentForm.admin_notes}`);
    if (warnings.length && !confirm(`FERPA warning:\n- ${warnings.join('\n- ')}\n\nSave anyway?`)) return;
    updateStudent(selected.id, {
      display_name: studentForm.display_name,
      student_id: studentForm.student_id || null,
      course: studentForm.course,
      goal: studentForm.goal,
      risk: studentForm.risk,
      status: studentForm.status,
      admin_notes: studentForm.admin_notes,
      next_appointment_date: studentForm.next_appointment_date || null,
      graduation_goal_date: studentForm.graduation_goal_date || null,
      missed_call_count: Number(studentForm.missed_call_count || 0)
    });
    setEditingProfile(false);
  }

  function submitTouchpoint() {
    if (!selected) return;
    const warnings = ferpaWarnings(touchForm.note);
    if (warnings.length && !confirm(`FERPA warning:\n- ${warnings.join('\n- ')}\n\nSave touchpoint anyway?`)) return;
    createTouchpoint({
      student_id: selected.id,
      touchpoint_type: touchForm.touchpoint_type,
      touchpoint_date: touchForm.touchpoint_date,
      course: touchForm.course || selected.course || '',
      momentum: touchForm.momentum,
      note: touchForm.note
    });
    setTouchForm({ touchpoint_type: 'Call to student', touchpoint_date: new Date().toISOString().slice(0, 10), course: selected.course || '', momentum: '', note: '' });
  }


  async function handleCsvUpload(file?: File) {
    if (!file) return;
    setImportingCsv(true);
    try {
      const text = await file.text();
      await importStudentsFromCsv(text);
    } finally {
      setImportingCsv(false);
    }
  }

  const activeWarnings = selected ? ferpaWarnings(`${selected.display_name} ${selected.goal} ${selected.admin_notes || ''}`) : [];

  return <>
    <Header title="Students" sub="FERPA-safe student history, touchpoints, next-call prep, and follow-up drafts.">
      <button className="btn primary" onClick={() => setAddingStudent(!addingStudent)}><Plus size={15} /> Add Student</button>
      <label className="btn ghost upload-button"><Upload size={15} /> {importingCsv ? 'Importing...' : 'Import FERPA CSV'}<input type="file" accept=".csv,text/csv" onChange={(e) => handleCsvUpload(e.target.files?.[0])} /></label>
      <button className="btn ghost" onClick={() => setShowArchived(!showArchived)}><Archive size={15} /> {showArchived ? 'Active' : 'Archived'}</button>
    </Header>
    <Stats items={[["Active", String(activeStudents.length)], ["Archived", String(archivedStudents.length)], ["High risk", String(students.filter((s) => s.risk === 'High Risk' && !s.archived).length)], ["Ghost flags", String(students.filter((s) => s.status === 'Ghost' && !s.archived).length)]]} />
    {addingStudent && <section className="panel"><h2>Add student</h2><p className="settings-intro">Use first name, nickname, or initial only. Avoid student IDs, email addresses, phone numbers, and last names.</p><div className="form-grid"><input placeholder="Display name" value={studentForm.display_name} onChange={(e) => setStudentForm({ ...studentForm, display_name: e.target.value })} /><input placeholder="Student ID (WGU)" value={studentForm.student_id} onChange={(e) => setStudentForm({ ...studentForm, student_id: e.target.value })} /><input placeholder="Course" value={studentForm.course} onChange={(e) => setStudentForm({ ...studentForm, course: e.target.value })} /><input placeholder="Goal" value={studentForm.goal} onChange={(e) => setStudentForm({ ...studentForm, goal: e.target.value })} /><select value={studentForm.risk} onChange={(e) => setStudentForm({ ...studentForm, risk: e.target.value })}>{riskLevels.map((risk) => <option key={risk}>{risk}</option>)}</select><select value={studentForm.status} onChange={(e) => setStudentForm({ ...studentForm, status: e.target.value })}>{studentStatuses.filter((status) => status !== 'Archived').map((status) => <option key={status}>{status}</option>)}</select><label className="date-field"><span>Next appointment</span><input type="date" value={studentForm.next_appointment_date} onChange={(e) => setStudentForm({ ...studentForm, next_appointment_date: e.target.value })} /></label><label className="date-field"><span>Graduation goal</span><input type="date" value={studentForm.graduation_goal_date} onChange={(e) => setStudentForm({ ...studentForm, graduation_goal_date: e.target.value })} /></label></div><textarea placeholder="Admin notes for Kaylee only" value={studentForm.admin_notes} onChange={(e) => setStudentForm({ ...studentForm, admin_notes: e.target.value })} />{ferpaWarnings(`${studentForm.display_name} ${studentForm.goal} ${studentForm.admin_notes}`).length > 0 && <FerpaWarning warnings={ferpaWarnings(`${studentForm.display_name} ${studentForm.goal} ${studentForm.admin_notes}`)} />}<div className="form-actions"><button className="btn primary" onClick={submitStudent}><Save size={15} /> Save Student</button></div></section>}
    <div className="students-crm-layout">
      <section className="panel student-scroll-list"><div className="panel-head"><h2>{showArchived ? 'Archived Students' : 'Student List'}</h2><span className="readonly-pill"><Users size={14} /> {visibleStudents.length}</span></div>{visibleStudents.length === 0 && <div className="brief-item">No students in this view yet.</div>}{visibleStudents.map((student) => <button key={student.id} className={`student-list-item ${selected?.id === student.id ? 'active' : ''}`} onClick={() => setSelectedId(student.id)}><div><strong>{student.display_name}</strong><p>{student.course || 'No course'} · {student.status}</p></div><span className={`risk-pill ${String(student.risk).toLowerCase().replace(' ', '-')}`}>{student.risk}</span><small>Last: {student.last_contact_date || '—'}</small></button>)}</section>
      {selected ? <section className="student-detail-pane">
        <section className="panel"><div className="panel-head"><div><h2>{selected.display_name}</h2><p>{selected.course || 'No course'} · {selected.status} · {selected.risk}</p></div><div className="actions"><button className="btn ghost" onClick={startEditProfile}><Edit3 size={15} /> Edit</button>{!selected.archived && <button className="btn warning" onClick={() => archiveStudent(selected.id)}><Archive size={15} /> Archive</button>}</div></div>{activeWarnings.length > 0 && <FerpaWarning warnings={activeWarnings} />}<StudentHealthPanel student={selected} touchpoints={touchpoints} />
        <div className="profile-grid"><div><strong>Student ID</strong><p>{selected.student_id || '—'}</p></div><div><strong>Goal</strong><p>{selected.goal || 'No goal saved yet.'}</p></div><div><strong>Last contact</strong><p>{selected.last_contact_date || '—'}</p></div><div><strong>Next appointment</strong><p>{selected.next_appointment_date || '—'}</p></div><div><strong>Graduation goal</strong><p>{selected.graduation_goal_date || '—'}</p></div><div><strong>Missed calls</strong><p>{selected.missed_call_count || 0}{(selected.missed_call_count || 0) >= 3 ? ' · Ghost flag' : ''}</p></div><div><strong>Momentum</strong><p>{selected.momentum || '—'}</p></div><div><strong>Last academic activity</strong><p>{selected.last_academic_activity_date || '—'}</p></div><div><strong>Course end date</strong><p>{selected.course_end_date || '—'}</p></div><div><strong>CUs</strong><p>{selected.term_completed_cu ?? '—'} completed · {selected.term_remaining_cu ?? '—'} remaining</p></div></div></section>
        {editingProfile && <section className="panel"><h2>Edit profile</h2><div className="form-grid"><input value={studentForm.display_name} onChange={(e) => setStudentForm({ ...studentForm, display_name: e.target.value })} /><input placeholder="Student ID (WGU)" value={studentForm.student_id} onChange={(e) => setStudentForm({ ...studentForm, student_id: e.target.value })} /><input value={studentForm.course} onChange={(e) => setStudentForm({ ...studentForm, course: e.target.value })} /><input value={studentForm.goal} onChange={(e) => setStudentForm({ ...studentForm, goal: e.target.value })} /><select value={studentForm.risk} onChange={(e) => setStudentForm({ ...studentForm, risk: e.target.value })}>{riskLevels.map((risk) => <option key={risk}>{risk}</option>)}</select><select value={studentForm.status} onChange={(e) => setStudentForm({ ...studentForm, status: e.target.value })}>{studentStatuses.map((status) => <option key={status}>{status}</option>)}</select><label className="date-field"><span>Next appointment</span><input type="date" value={studentForm.next_appointment_date} onChange={(e) => setStudentForm({ ...studentForm, next_appointment_date: e.target.value })} /></label><label className="date-field"><span>Graduation goal</span><input type="date" value={studentForm.graduation_goal_date} onChange={(e) => setStudentForm({ ...studentForm, graduation_goal_date: e.target.value })} /></label></div><textarea value={studentForm.admin_notes} onChange={(e) => setStudentForm({ ...studentForm, admin_notes: e.target.value })} /><div className="form-actions"><button className="btn primary" onClick={saveProfileEdit}><Save size={15} /> Save Profile</button></div></section>}
        <section className="panel"><h2>Admin Notes</h2><textarea value={selected.admin_notes || ''} onChange={(e) => updateStudent(selected.id, { admin_notes: e.target.value })} placeholder="Private notes for Kaylee. Keep FERPA-safe." /></section>
        <section className="panel"><div className="panel-head"><h2>Next Call Prep</h2><FileText size={17} /></div><div className="brief-item focus-item"><strong>Next conversation focus:</strong><br />{selected.next_conversation_focus || 'Set a next conversation focus after your next touchpoint.'}</div><div className="brief-item"><strong>Prepared talking points:</strong><br />{selected.next_call_prep || 'Add a touchpoint note to generate next-call prep.'}</div><div className="brief-item"><strong>Latest course note:</strong><br />{selected.latest_course_note || 'No imported course note yet.'}</div><div className="brief-item"><strong>Constructive coaching note for Kaylee:</strong><br />{selected.constructive_note || 'Add a touchpoint to generate a self-coaching reminder.'}</div></section>
        <section className="panel"><h2>Add Touchpoint</h2><div className="form-grid"><select value={touchForm.touchpoint_type} onChange={(e) => setTouchForm({ ...touchForm, touchpoint_type: e.target.value })}>{touchpointTypes.map((type) => <option key={type}>{type}</option>)}</select><input type="date" value={touchForm.touchpoint_date} onChange={(e) => setTouchForm({ ...touchForm, touchpoint_date: e.target.value })} /><input placeholder="Course" value={touchForm.course || selected.course || ''} onChange={(e) => setTouchForm({ ...touchForm, course: e.target.value })} /><input placeholder="Momentum" value={touchForm.momentum} onChange={(e) => setTouchForm({ ...touchForm, momentum: e.target.value })} /></div><textarea placeholder="What happened? What did the student say? What is the next step?" value={touchForm.note} onChange={(e) => setTouchForm({ ...touchForm, note: e.target.value })} />{ferpaWarnings(touchForm.note).length > 0 && <FerpaWarning warnings={ferpaWarnings(touchForm.note)} />}<div className="form-actions"><button className="btn primary" onClick={submitTouchpoint}><Save size={15} /> Save Touchpoint + Generate Prep</button></div></section>
        <StudentTimeline student={selected} touchpoints={selectedTouchpoints} />
        <section className="panel"><h2>Touchpoint Log</h2>{selectedTouchpoints.length === 0 && <div className="brief-item">No touchpoints yet. Add the first call, email, text, or voicemail above.</div>}{selectedTouchpoints.map((touchpoint) => <div className="touchpoint-card" key={touchpoint.id}><div className="panel-head"><div><strong>{touchpoint.touchpoint_type}</strong><p>{touchpoint.touchpoint_date} · {touchpoint.course || selected.course || 'No course'} · {touchpoint.momentum || 'Momentum not set'}</p></div>{touchpoint.touchpoint_type.includes('Email') ? <Mail size={17} /> : touchpoint.touchpoint_type.includes('Text') ? <MessageSquare size={17} /> : <Phone size={17} />}</div><p>{touchpoint.note}</p><details><summary>Next-call prep and follow-up drafts</summary><div className="brief-item"><strong>Next call:</strong> {touchpoint.next_call_prep}</div><div className="brief-item"><strong>Kaylee coaching:</strong> {touchpoint.constructive_note}</div><textarea readOnly value={touchpoint.follow_up_email || ''} /><button className="btn primary" onClick={() => copyText(touchpoint.follow_up_email || '', touchpoint.id, 'student_touchpoints')}><Copy size={15} /> Copy Email Draft</button><textarea readOnly value={touchpoint.follow_up_text || ''} /><button className="btn ghost" onClick={() => copyText(touchpoint.follow_up_text || '', touchpoint.id, 'student_touchpoints')}><Copy size={15} /> Copy Text Draft</button></details></div>)}</section>
      </section> : <section className="panel"><h2>Select a student</h2><p>Add or select a student to view their profile, touchpoints, and next-call prep.</p></section>}
    </div>
  </>;
}


function StudentHealthPanel({ student, touchpoints }: { student: Student; touchpoints: Touchpoint[] }) {
  const health = studentHealth(student, touchpoints);
  const signals = studentStatusSignals(student, touchpoints);
  const gradDays = daysUntil(student.graduation_goal_date);
  return <section className="health-panel">
    <div className={`health-score ${healthClass(health.overall)}`}>
      <span>Student Health</span>
      <strong>{health.overall}</strong>
      <small>{signals.isGhost ? 'Ghost risk' : signals.isSupport ? 'Support active' : signals.isPortalOnly ? 'Portal-only risk' : 'Monitor weekly'}</small>
    </div>
    <div className="health-bars">
      <HealthBar label="Momentum" value={health.momentum} />
      <HealthBar label="Engagement" value={health.engagement} />
      <HealthBar label="Risk safety" value={health.risk} />
      <HealthBar label="Goal progress" value={health.goalProgress} />
    </div>
    <div className="health-insights">
      <div><strong>Contact gap</strong><p>{daysSince(student.last_contact_date || signals.lastMeaningful?.touchpoint_date || signals.lastTouchpoint?.touchpoint_date) >= 999 ? 'No meaningful contact logged yet' : `${daysSince(student.last_contact_date || signals.lastMeaningful?.touchpoint_date || signals.lastTouchpoint?.touchpoint_date)} day(s) since contact`}</p></div>
      <div><strong>Graduation timing</strong><p>{gradDays === null ? 'No graduation goal date yet' : gradDays >= 0 ? `${gradDays} day(s) until goal` : `${Math.abs(gradDays)} day(s) past goal`}</p></div>
    </div>
  </section>;
}

function HealthBar({ label, value }: { label: string; value: number }) {
  return <div className="health-bar-row"><div><strong>{label}</strong><span>{value}/100</span></div><div className="health-bar-track"><span className={`health-bar-fill ${healthClass(value)}`} style={{ width: `${value}%` }} /></div></div>;
}

function StudentTimeline({ student, touchpoints }: { student: Student; touchpoints: Touchpoint[] }) {
  const events = timelineForStudent(student, touchpoints).slice(0, 8);
  return <section className="panel"><div className="panel-head"><h2>Student Timeline</h2><span className="readonly-pill"><CalendarDays size={14} /> {events.length}</span></div>{events.length === 0 && <div className="brief-item">No timeline events yet.</div>}{events.map((event) => <div className={`timeline-item ${event.kind}`} key={event.id}><div className="timeline-date">{event.date}</div><div><strong>{event.title}</strong><p>{event.detail}</p></div></div>)}</section>;
}

function FerpaWarning({ warnings }: { warnings: string[] }) {
  return <div className="ferpa-warning"><AlertTriangle size={16} /><div><strong>FERPA guardrail check</strong><p>{warnings.join(' · ')}</p></div></div>;
}

function SettingsPage({ permissions, updatePermission }: { permissions: ModulePermission[]; updatePermission: (module_name: string, access_level: AccessLevel) => void }) {
  function accessFor(module_name: string) {
    return permissions.find((permission) => permission.module_name === module_name)?.access_level || 'hidden';
  }

  return <><Header title="Settings" sub="Control Adam's Home-side access as the app grows." /><section className="panel"><h2>Adam section access</h2><p className="settings-intro">Adam never sees Work mode or Students. For Home sections, choose Hidden, View Only, or Edit. This avoids confusing combinations like edit without view.</p><div className="permission-list">{moduleMeta.filter((item) => item.page !== 'students').map((item) => {
    const current = accessFor(item.module_name);
    return <div className="permission-row" key={item.module_name}><div><strong>{item.label}</strong><p>{current === 'hidden' ? 'Hidden from Adam' : current === 'view' ? 'Visible · View-only' : 'Visible · Editable'}</p></div><label className="switch-row"><Eye size={15} /> Adam Access <select value={current} onChange={(e) => updatePermission(item.module_name, e.target.value as AccessLevel)}><option value="hidden">Hidden</option><option value="view">View Only</option><option value="edit">Edit</option></select></label></div>;
  })}</div></section><section className="panel"><h2>Access rules</h2><div className="brief-item"><strong>Kaylee:</strong> admin, full Home + Work access.</div><div className="brief-item"><strong>Adam:</strong> Home only. Hidden means no sidebar item. View Only means no add/save/edit buttons. Edit means full access.</div><div className="brief-item"><strong>Students:</strong> always admin-only and FERPA-safe.</div></section></>;
}

function Placeholder({ title, sub }: { title: string; sub: string }) {
  return <section className="panel"><h2>{title}</h2><p>{sub}</p></section>;
}

export default App;
