import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Home, Users, LayoutDashboard, ClipboardCheck, Sparkles, CalendarDays, WalletCards,
  Inbox, ListTodo, ShieldCheck, Car, Plus, Copy, RefreshCw, Settings, LogOut,
  Lock, Eye, EyeOff, Save, Minus, Archive, Mail, Phone, MessageSquare, FileText, AlertTriangle, Edit3, Upload, Search, Send, Trash2,
  CheckCircle2, Circle, Clock, Zap, Wrench, Flower2, Bone, Snowflake, Sun, Moon, ChevronRight, ChevronDown, ExternalLink, Repeat, Hash, Heart, Brain, BookOpen, Menu, X as XIcon, MoreHorizontal, Clock as ClockIcon
} from 'lucide-react';
import { supabase, hasSupabase } from './lib/supabase';
import GoogleCalendar from './GoogleCalendar';
import GoogleCalendarToday from './GoogleCalendarToday';
import Budget from './Budget';
import Vehicles from './Vehicles';
import Jules from './Jules';
import { useDailyBriefing, type BriefingLine } from './useDailyBriefing';
import MigraineTracker from './MigraineTracker';
import Contacts from './Contacts';
import Books from './Books';
import FTOTracker from './FTOTracker';
import WorkCalendar from './WorkCalendar';

type Mode = 'home' | 'work';
type Role = 'admin' | 'limited';
type Page = 'dashboard' | 'today' | 'briefing' | 'calendar' | 'budget' | 'inventory' | 'chores' | 'vehicles' | 'jules' | 'migraine' | 'suggestions' | 'contacts' | 'books' | 'students' | 'outreach' | 'fto' | 'settings';
type Priority = 'urgent' | 'warning' | 'normal' | 'good';
type InventoryAction = 'none' | 'scanAdd' | 'manual' | 'scanUse';

type Profile = {
  id: string;
  display_name: string;
  email: string;
  role: Role;
};

type HouseholdUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  todoist_id: string | null;
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
  next_call_at?: string | null;
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
  email?: string | null;
  missed_call_count: number;
  archived: boolean;
  on_term_break?: boolean;
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

type EmailDraft = {
  id: string;
  student_id: string | null;
  cohort_label: string | null;
  template_kind: string;
  subject: string;
  body: string;
  status: 'pending' | 'sent' | 'archived' | string;
  created_at: string;
  sent_at: string | null;
  edited: boolean;
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

type ChoreTask = {
  id: string;
  name: string;
  description: string | null;
  day_of_week: string;
  room: string | null;
  recurrence: string | null;
  effort_level: 'light' | 'medium' | 'heavy' | string;
  estimated_minutes: number | null;
  priority: number;
  due_date: string | null;
  todoist_task_id: string | null;
  todoist_section: string | null;
  source_project: string | null;
  is_completed: boolean;
  status: string;
  deleted_in_todoist: boolean;
  last_completed_at: string | null;
  last_synced_at: string | null;
  labels: string[] | null;
  notes: string | null;
  assigned_to: string | null;
  todoist_assignee_id: string | null;
  escalation_note: string | null;
  escalated_at: string | null;
  escalated_to: string | null;
};

type ChoreSuggestion = {
  id: string;
  title: string;
  description: string;
  why_it_matters: string;
  category: 'homeowner' | 'vehicle' | 'tool' | 'dog' | 'garden' | 'preserving' | 'seasonal' | 'safety' | string;
  effort_level: 'light' | 'medium' | 'heavy' | string;
  estimated_minutes: number;
  frequency: string;
  month_triggers: number[] | null;
  origin: 'seed' | 'manual' | 'ai' | string;
  status: 'pending' | 'snoozed' | 'dismissed' | 'added' | 'done' | string;
  snoozed_until: string | null;
  last_done_at: string | null;
  next_due_at: string | null;
  added_to_todoist_at: string | null;
  todoist_task_id: string | null;
  required_tools: string[] | null;
  tags: string[] | null;
};

type TodoistSyncState = {
  id: number;
  last_sync_at: string | null;
  last_sync_status: 'never' | 'success' | 'error' | 'running' | string;
  last_sync_error: string | null;
  last_sync_added: number;
  last_sync_updated: number;
  last_sync_removed: number;
  source_project_ids: string[];
  source_project_names: string[];
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
  ['vehicles', 'Vehicles', Car],
  ['jules', 'Jules', Heart],
  ['migraine', 'Migraine Tracker', Brain],
  ['suggestions', 'Home Suggestions', Home],
  ['contacts', 'Contacts', Users],
  ['books', 'Library', BookOpen]
];

const workNav: readonly NavEntry[] = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['today', 'Today’s Tasks', ClipboardCheck],
  ['briefing', 'Daily Briefing', Sparkles],
  ['calendar', 'Calendar', CalendarDays],
  ['students', 'Students', Users],
  ['outreach', 'Outreach Drafts', Mail],
  ['fto', 'FTO Tracker', Clock]
];

const moduleMeta: { page: Page; module_name: string; label: string; default_access: AccessLevel }[] = [
  { page: 'dashboard', module_name: 'dashboard', label: 'Dashboard', default_access: 'edit' },
  { page: 'today', module_name: 'today_tasks', label: 'Today’s Tasks', default_access: 'edit' },
  { page: 'briefing', module_name: 'daily_briefing', label: 'Daily Briefing', default_access: 'view' },
  { page: 'calendar', module_name: 'calendar', label: 'Calendar', default_access: 'edit' },
  { page: 'inventory', module_name: 'inventory', label: 'Inventory', default_access: 'edit' },
  { page: 'chores', module_name: 'chores', label: 'Chores & Tasks', default_access: 'edit' },
  { page: 'vehicles', module_name: 'vehicles', label: 'Vehicles', default_access: 'view' },
  { page: 'jules', module_name: 'jules', label: 'Jules', default_access: 'edit' },
  { page: 'migraine', module_name: 'migraine', label: 'Migraine Tracker', default_access: 'edit' },
  { page: 'suggestions', module_name: 'home_suggestions', label: 'Home Suggestions', default_access: 'edit' },
  { page: 'budget', module_name: 'budget', label: 'Budget', default_access: 'view' },
  { page: 'contacts', module_name: 'contacts', label: 'Contacts', default_access: 'view' },
  { page: 'books', module_name: 'books', label: 'Library', default_access: 'view' },
  { page: 'students', module_name: 'students', label: 'Students', default_access: 'hidden' },
  { page: 'outreach', module_name: 'outreach', label: 'Outreach Drafts', default_access: 'hidden' }
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


const COMPACT_ROW_CSS = `
.ct-panel { padding-bottom: 6px; }
.ct-list { display: flex; flex-direction: column; }

.ct-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--border, rgba(0,0,0,0.07));
}
.ct-row:last-child { border-bottom: none; }

.ct-checkbox {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  border-radius: 50%;
  border: 1.5px solid var(--muted, #9aa0a6);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  color: transparent;
  transition: border-color 120ms ease, background 120ms ease;
}
.ct-checkbox:disabled { cursor: default; }
.ct-checkbox:hover:not(:disabled) { border-color: var(--accent, #4F46E5); }
.ct-checkbox.checked { background: var(--accent, #4F46E5); border-color: var(--accent, #4F46E5); color: #fff; }
.ct-checkbox.dot-urgent { border-color: #e5484d; }
.ct-checkbox.dot-warning { border-color: #f5a524; }
.ct-checkbox.dot-normal { border-color: var(--accent, #4F46E5); }
.ct-checkbox.dot-good { border-color: #9aa0a6; }

.ct-body { flex: 1; min-width: 0; }

.ct-title {
  font-size: 14px;
  line-height: 1.4;
  color: var(--text, #1a1a1a);
  word-break: break-word;
}
.ct-title-done { text-decoration: line-through; color: var(--muted, #9aa0a6); }

.ct-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-top: 3px;
  row-gap: 2px;
}

.ct-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  line-height: 1.3;
  color: var(--muted, #9aa0a6);
  white-space: nowrap;
}
.ct-meta-item svg { flex-shrink: 0; }
.ct-meta-overdue { color: #e5484d; font-weight: 600; }
.ct-meta-due { color: #2f9e44; }
.ct-meta-muted { color: var(--muted, #9aa0a6); }
.ct-meta-tag { color: var(--muted, #9aa0a6); }

.ct-reason {
  margin-top: 4px;
  font-size: 12px;
  font-style: italic;
  color: var(--accent, #4F46E5);
  opacity: 0.85;
}

.ct-day-group { border-bottom: 1px solid var(--border, rgba(0,0,0,0.07)); padding: 4px 0; }
.ct-day-group:last-child { border-bottom: none; }
.ct-day-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 4px;
  cursor: pointer;
  list-style: none;
  font-size: 13px;
}
.ct-day-summary::-webkit-details-marker { display: none; }
.ct-day-summary strong { font-size: 13px; letter-spacing: 0.01em; }
.ct-day-count {
  font-size: 12px;
  color: var(--muted, #9aa0a6);
  background: var(--surface-2, rgba(0,0,0,0.04));
  border-radius: 999px;
  padding: 1px 8px;
}
.ct-day-today > summary strong {
  color: var(--accent, #4F46E5);
}
.ct-day-today {
  border-left: 2px solid var(--accent, #4F46E5);
  padding-left: 6px;
}
.ct-day-overdue > summary strong {
  color: #e5484d;
}
.ct-day-overdue {
  border-left: 2px solid #e5484d;
  padding-left: 6px;
}
.last-sync-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted, #9aa0a6);
  margin: 4px 0 14px;
}
.last-sync-status {
  text-transform: capitalize;
}
.last-sync-status.error { color: #e5484d; }
.last-sync-status.running { color: #f5a524; }
.ct-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 4px 6px;
  font-size: 13px;
  color: var(--muted, #9aa0a6);
}

.view-toggle {
  display: flex;
  gap: 4px;
  background: var(--surface-2, rgba(0,0,0,0.04));
  border-radius: 10px;
  padding: 4px;
  margin: 4px 0 16px;
  width: fit-content;
}
.view-toggle button {
  border: none;
  background: transparent;
  padding: 7px 14px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  color: var(--muted, #9aa0a6);
  cursor: pointer;
  white-space: nowrap;
  transition: background 120ms ease, color 120ms ease;
}
.view-toggle button:hover {
  color: var(--text, #1a1a1a);
}
.view-toggle button.active {
  background: var(--surface, #fff);
  color: var(--text, #1a1a1a);
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
}

.ct-row-with-action {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ct-row-with-action .ct-row {
  flex: 1;
}
.ct-take-button {
  flex-shrink: 0;
  white-space: nowrap;
}
`;

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

  // ── Dark mode ──
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('kh-sidebar-open') !== 'false'; } catch { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem('kh-sidebar-open', String(sidebarOpen)); } catch {}
  }, [sidebarOpen]);
  const [showMoreDrawer, setShowMoreDrawer] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try { return localStorage.getItem('kh-dark-mode') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    try { localStorage.setItem('kh-dark-mode', String(darkMode)); } catch {}
  }, [darkMode]);
  const [page, setPage] = useState<Page>('dashboard');
  const [inventory, setInventory] = useState<InventoryItem[]>(seedInventory);
  const [students, setStudents] = useState<Student[]>(seedStudents);
  const [touchpoints, setTouchpoints] = useState<Touchpoint[]>(seedTouchpoints);
  const [tasks, setTasks] = useState<TaskItem[]>(seedTasks);
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [choreTasks, setChoreTasks] = useState<ChoreTask[]>([]);
  const [choreSuggestions, setChoreSuggestions] = useState<ChoreSuggestion[]>([]);
  const [syncState, setSyncState] = useState<TodoistSyncState | null>(null);
  const [householdUsers, setHouseholdUsers] = useState<HouseholdUser[]>([]);
  const [syncing, setSyncing] = useState(false);
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
      const [
        invResult, studentResult, touchpointResult, taskResult,
        permissionResult, draftResult, choreResult, suggestionResult, syncStateResult, userResult
      ] = await Promise.all([
        supabase.from('inventory_items').select('*').order('created_at', { ascending: false }),
        supabase.from('students').select('*').order('created_at', { ascending: false }),
        supabase.from('student_touchpoints').select('*').order('touchpoint_date', { ascending: false }),
        supabase.from('tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('module_permissions').select('*').eq('role', 'limited').order('module_name', { ascending: true }),
        supabase.from('email_drafts').select('*').order('created_at', { ascending: false }),
        supabase.from('chore_tasks').select('*').eq('deleted_in_todoist', false).order('priority', { ascending: false }),
        supabase.from('chore_suggestions').select('*').order('category', { ascending: true }),
        supabase.from('todoist_sync_state').select('*').eq('id', 1).maybeSingle(),
        supabase.from('users').select('*')
      ]);

      if (!invResult.error && invResult.data) setInventory(invResult.data as InventoryItem[]);
      if (!studentResult.error && studentResult.data) setStudents(normalizeStudents(studentResult.data as Student[]));
      if (!touchpointResult.error && touchpointResult.data) setTouchpoints(touchpointResult.data as Touchpoint[]);
      if (!taskResult.error && taskResult.data) setTasks(taskResult.data as TaskItem[]);
      if (!draftResult.error && draftResult.data) setDrafts(draftResult.data as EmailDraft[]);
      if (!choreResult.error && choreResult.data) setChoreTasks(choreResult.data as ChoreTask[]);
      if (!suggestionResult.error && suggestionResult.data) setChoreSuggestions(suggestionResult.data as ChoreSuggestion[]);
      if (!syncStateResult.error && syncStateResult.data) setSyncState(syncStateResult.data as TodoistSyncState);
      if (!userResult.error && userResult.data) setHouseholdUsers(userResult.data as HouseholdUser[]);
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
      next_call_at: row.next_call_at || null,
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
      email: row.email || '',
      missed_call_count: Number(row.missed_call_count || 0),
      archived: Boolean(row.archived)
    }));
  }

  function generateStudentSupport(
    note: string,
    course?: string | null,
    momentum?: string | null,
    student?: Student | null,
    pastTouchpoints?: Touchpoint[]
  ) {
    const lower = note.toLowerCase();
    const courseText = course ? course : (student?.course || 'their current course');
    const m = (momentum || student?.momentum || '').toLowerCase();
    const missedCount = Number(student?.missed_call_count || 0);
    const courseEnd = student?.course_end_date || '';
    const gradGoal = student?.graduation_goal_date || '';
    const lastActivity = student?.last_academic_activity_date || '';

    // Pull recent touchpoint history (most recent 3, excluding this note)
    const recent = (pastTouchpoints || []).slice(0, 3);
    const recentSummary = recent.map((t) => `${t.touchpoint_date} (${t.touchpoint_type}): ${(t.note || '').slice(0, 140)}`).filter(Boolean);

    // Theme detection from current + past notes
    const allText = [note, ...recent.map((t) => t.note || '')].join(' ').toLowerCase();
    const hasAssessment = /\b(assessment|oa\b|pa\b|exam|test|proctored)/.test(allText);
    const hasZyBooks = /\bzy ?books?|labs?\b/.test(allText);
    const hasBlocked = /\b(block|stuck|behind|struggl|overwhelm|hard time|confus|fail)/.test(allText);
    const hasLife = /\b(work|job|family|kid|sick|health|move|moving|loss|funeral|childcare)/.test(allText);
    const hasGhost = missedCount >= 2 || /\b(no answer|voicemail|no reply|no response|haven.?t heard)/.test(allText);
    const isLowMomentum = m.includes('low');
    const isHighMomentum = m.includes('high') && !m.includes('low');

    // ===== Talking points: things to definitely curate / dig into =====
    const talkingPoints: string[] = [];
    talkingPoints.push(`Open with a specific reference to last contact${recent[0] ? ` (${recent[0].touchpoint_date}, ${recent[0].touchpoint_type})` : ''} so the student knows you remember.`);
    if (hasAssessment) talkingPoints.push(`Curate from past notes any assessment chatter — confirm which OA/PA is up next in ${courseText} and whether they have a scheduled date.`);
    if (hasZyBooks) talkingPoints.push(`Follow up on ZyBooks participation and labs — ask which module they are on and what percent complete.`);
    if (hasBlocked) talkingPoints.push(`Past notes show a blocker theme — gently surface it: "Last time you mentioned ___; how is that piece going now?"`);
    if (hasLife) talkingPoints.push(`Past notes flagged a life circumstance — acknowledge it briefly without prying, then ask how it is affecting study time this week.`);
    if (courseEnd) talkingPoints.push(`Course end date is ${courseEnd} — calculate weeks remaining out loud and confirm pacing is realistic.`);
    if (gradGoal) talkingPoints.push(`Graduation goal is ${gradGoal} — tie this week's action back to that target.`);
    if (lastActivity) talkingPoints.push(`Most recent academic activity was ${lastActivity} — ask what they have done in the course since then.`);
    if (isLowMomentum) talkingPoints.push(`Momentum is low — ask what one small win this week would look like. Avoid overwhelming with multiple goals.`);
    if (isHighMomentum) talkingPoints.push(`Momentum is high — celebrate it explicitly and ask what is fueling the rhythm so you can help protect it.`);
    if (hasGhost) talkingPoints.push(`Multiple missed touches — lead with "I have been trying to reach you because I care about your progress, not to chase you." Then confirm best contact method and time.`);
    if (recentSummary.length) talkingPoints.push(`Recent notes for cross-reference: ${recentSummary.join(' | ')}`);

    const next_call_prep = '• ' + talkingPoints.join('\n• ');

    // ===== Coaching questions for Kaylee (specific, GROW-aligned) =====
    const coachQuestions: string[] = [];
    coachQuestions.push(`Goal — "What do you most want to walk away from today's call with?"`);
    coachQuestions.push(`Reality — "On a scale of 1-10, where are you with ${courseText} this week, and what makes it that number?"`);
    if (hasBlocked || isLowMomentum) {
      coachQuestions.push(`Reality — "What is the one thing that has been hardest to make progress on lately?"`);
      coachQuestions.push(`Options — "What have you already tried, and what is one thing you haven't tried yet?"`);
    } else {
      coachQuestions.push(`Options — "What are two or three different ways you could get to your next milestone?"`);
    }
    if (hasAssessment) coachQuestions.push(`Options — "If we mapped your study time backward from your assessment date, what does each week need to look like?"`);
    if (hasLife) coachQuestions.push(`Reality — "How is your study time fitting around what is going on outside of school right now?"`);
    coachQuestions.push(`Will — "By our next call, what is the ONE specific thing you will have completed, and what day?"`);
    coachQuestions.push(`Will — "What could get in the way of that, and what is your plan if it does?"`);
    coachQuestions.push(`Self-check for Kaylee: did I ask before I offered? Did I end with a commitment in the student's own words?`);

    const constructive_note = '• ' + coachQuestions.join('\n• ');

    const follow_up_email = `Hi {first_name},

Thank you for connecting with me${recent[0] ? ` on ${recent[0].touchpoint_date}` : ''}. Based on our conversation, the next best step is to focus on one specific course action in ${courseText} before our next check-in${courseEnd ? ` (course end ${courseEnd})` : ''}. Please reply with what you plan to complete next and what support you need from me.

Best,
Kaylee`;
    const follow_up_text = `Hi {first_name}, this is Kaylee checking in. Before our next call, what is the one ${courseText} task you plan to complete next?`;

    return { next_call_prep, constructive_note, follow_up_email, follow_up_text };
  }

  function ferpaWarnings(text: string) {
    const warnings: string[] = [];
    if (/\d{6,}/.test(text)) warnings.push('Possible student ID or long identifying number');
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) warnings.push('Possible email address');
    if (/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(text)) warnings.push('Possible phone number');
    if (/\d{3}-\d{2}-\d{4}/.test(text)) warnings.push('Possible SSN-like number');
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
    // Robust RFC 4180 CSV parser. Handles quoted fields, escaped quotes (""),
    // and newlines (LF, CR, CRLF) both as row terminators and inside quoted fields.
    const rows: string[][] = [];
    let row: string[] = [];
    let value = '';
    let inQuotes = false;
    let i = 0;
    while (i < text.length) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            // Escaped quote inside quoted field
            value += '"';
            i += 2;
            continue;
          }
          // End of quoted field
          inQuotes = false;
          i += 1;
          continue;
        }
        // Any other char (including newlines and commas) is literal inside quotes
        value += char;
        i += 1;
        continue;
      }
      // Not in quotes
      if (char === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (char === ',') {
        row.push(value.trim());
        value = '';
        i += 1;
        continue;
      }
      if (char === '\r' || char === '\n') {
        // Handle CRLF as one terminator
        if (char === '\r' && text[i + 1] === '\n') i += 1;
        row.push(value.trim());
        if (row.some((cell) => cell !== '')) rows.push(row);
        row = [];
        value = '';
        i += 1;
        continue;
      }
      value += char;
      i += 1;
    }
    // Flush trailing value/row at EOF
    if (value !== '' || row.length > 0) {
      row.push(value.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
    }
    return rows;
  }

  function csvDate(value?: string) {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    // ISO format YYYY-MM-DD passes through
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    // US format M/D/YYYY or MM/DD/YYYY -> normalize to YYYY-MM-DD
    const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) {
      const month = us[1].padStart(2, '0');
      const day = us[2].padStart(2, '0');
      return `${us[3]}-${month}-${day}`;
    }
    // Fallback: try Date parsing
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
    const records: Record<string, string>[] = rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])));

    // Accept either "Name" or "DisplayName" as the student name column.
    // Also accept several plausible aliases for the WGU student ID column.
    const cleaned = records
      .map((row): Record<string, string> => ({
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

    if (!cleaned.length) return setMessage('No importable students found. Make sure the CSV includes Name and StudentID.');

    // Update-only mode: match by student_id. Skip any CSV row whose ID isn't already in the DB.
    // Only update fields that come from Salesforce; preserve everything Kaylee has edited in the UI.
    const existingById = new Map<string, Student>();
    for (const s of students) {
      const sid = String(s.student_id || '').trim();
      if (sid) existingById.set(sid, s);
    }

    type UpdateRow = {
      id: string;
      patch: Partial<Student>;
    };
    const updates: UpdateRow[] = [];
    let skippedNoId = 0;
    let skippedNotFound = 0;
    for (const row of cleaned) {
      const sid = String(row.student_id || '').trim();
      if (!sid) { skippedNoId++; continue; }
      const match = existingById.get(sid);
      if (!match) { skippedNotFound++; continue; }
      // Salesforce-sourced fields ONLY. Manual fields (admin_notes, goal, status,
      // missed_call_count, next_appointment_date, last_contact_date, next_call_prep,
      // next_conversation_focus, constructive_note, grow_note, display_name) are preserved.
      const patch: Partial<Student> = {
        course: row.course || match.course,
        risk: riskFromMomentum(row.momentum) || match.risk,
        graduation_goal_date: row.graduation_goal_date ?? match.graduation_goal_date,
        momentum: row.momentum || match.momentum,
        last_academic_activity_date: row.last_academic_activity_date ?? match.last_academic_activity_date,
        course_end_date: row.course_end_date ?? match.course_end_date,
        term_end_date: row.term_end_date ?? match.term_end_date,
        enrolled_cu: row.enrolled_cu ?? match.enrolled_cu,
        term_remaining_cu: row.term_remaining_cu ?? match.term_remaining_cu,
        term_completed_cu: row.term_completed_cu ?? match.term_completed_cu,
        contact_term: row.contact_term ?? match.contact_term,
        weeks_in_course: row.weeks_in_course ?? match.weeks_in_course,
        student_timezone: row.student_timezone || match.student_timezone
      };
      updates.push({ id: match.id, patch });
    }

    if (!updates.length) {
      const parts = [];
      if (skippedNotFound) parts.push(`${skippedNotFound} student${skippedNotFound === 1 ? '' : 's'} not in system (skipped)`);
      if (skippedNoId) parts.push(`${skippedNoId} row${skippedNoId === 1 ? '' : 's'} missing Student ID (skipped)`);
      return setMessage(`No updates applied. ${parts.join(', ') || 'CSV had no matching rows.'}`);
    }

    if (!supabase) {
      setStudents((current) => current.map((s) => {
        const u = updates.find((u) => u.id === s.id);
        return u ? { ...s, ...u.patch } : s;
      }));
      return setMessage(`Updated ${updates.length} students locally${skippedNotFound ? ` · ${skippedNotFound} not in system, skipped` : ''}.`);
    }

    // Apply updates in parallel (small batch, fine for ~150 students).
    const results = await Promise.all(updates.map(async (u) => {
      const { data, error } = await supabase.from('students').update(u.patch).eq('id', u.id).select().single();
      return { id: u.id, data: data as Student | null, error };
    }));
    const errors = results.filter((r) => r.error);
    if (errors.length === results.length) {
      return setMessage(`CSV update failed: ${errors[0].error?.message || 'unknown error'}`);
    }
    setStudents((current) => current.map((s) => {
      const r = results.find((r) => r.id === s.id && r.data);
      return r && r.data ? r.data : s;
    }));
    const skipMsg = skippedNotFound ? ` · ${skippedNotFound} not in system, skipped` : '';
    const errMsg = errors.length ? ` · ${errors.length} failed` : '';
    setMessage(`Updated ${results.length - errors.length} students from CSV${skipMsg}${errMsg}.`);
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

  async function unarchiveStudent(id: string) {
    await updateStudent(id, { archived: false, status: 'Active' });
  }

  async function createTouchpoint(input: Omit<Touchpoint, 'id' | 'next_call_prep' | 'constructive_note' | 'follow_up_email' | 'follow_up_text' | 'copied'>) {
    if (!isAdmin()) return setMessage('Touchpoint logs are admin-only.');
    const student = students.find((s) => s.id === input.student_id);
    const pastForStudent = touchpoints.filter((t) => t.student_id === input.student_id);
    const generated = generateStudentSupport(input.note, input.course, input.momentum, student, pastForStudent);
    const touchpoint: Touchpoint = { ...input, ...generated, copied: false, id: crypto.randomUUID() };
    setTouchpoints((current) => [touchpoint, ...current]);

    const isMissed = input.touchpoint_type.toLowerCase().includes('missed') || input.touchpoint_type.toLowerCase().includes('no-show');
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

  function buildDraftForStudent(student: Student, kind: string, cohortLabel: string): { subject: string; body: string } {
    const name = student.display_name || 'there';
    const course = student.course || 'your current course';
    const courseEnd = student.course_end_date ? ` (course end ${student.course_end_date})` : '';
    const lastContact = student.last_contact_date || '—';
    const missed = Number(student.missed_call_count || 0);

    const sigBlock = '\n\nBest,\nKaylee Green\nProgram Mentor · BS Cybersecurity & Information Assurance\nWestern Governors University';

    if (kind === 'ghost') {
      return {
        subject: `Checking in — let's get you back on track in ${course}`,
        body: `Hi ${name},\n\nI haven't been able to reach you on our last few attempts and I want you to know I'm still here for you. You're not in trouble — I just want to make sure nothing is getting in the way that I could help with.\n\nCan you reply with a day and time this week that works for a quick 15-minute call? Even a short conversation will help us figure out the next best step in ${course}${courseEnd}.\n\nIf life is happening right now and you need a different kind of support, just say so. We can work with where you are.${sigBlock}`
      };
    }
    if (kind === 'high_risk') {
      return {
        subject: `Let's build a plan for ${course}`,
        body: `Hi ${name},\n\nI've been reviewing your progress and I want us to take a focused look at ${course}${courseEnd} together. My goal is to help you identify one or two concrete steps that will move you forward this week.\n\nWhen you have a moment, please reply with the biggest blocker you're facing right now — even a one-line answer helps me prepare so our next call is as useful as possible.\n\nYou've got this, and I'm in your corner.${sigBlock}`
      };
    }
    if (kind === 'course_ending') {
      return {
        subject: `${course} is wrapping up soon — let's plan the finish`,
        body: `Hi ${name},\n\nWe're approaching the end window for ${course}${courseEnd}. I want to make sure you have a clear path to complete it on time and a plan for what comes next in your term.\n\nCan you let me know where you are in the course and what the last remaining piece looks like? If we need to adjust anything — pacing, resources, an extension conversation — now is the right time to talk through it.${sigBlock}`
      };
    }
    if (kind === 'no_contact_14') {
      return {
        subject: `Quick check-in — how are things going?`,
        body: `Hi ${name},\n\nIt's been a couple of weeks since we last connected (around ${lastContact}) and I wanted to reach out to see how things are going in ${course}.\n\nNo need for a long update — even a quick reply telling me what you've completed or what you're working on this week is helpful. If anything has shifted or you need support, I'd rather hear it from you than guess.${sigBlock}`
      };
    }
    if (kind === 'win') {
      return {
        subject: `Nice work on ${course}!`,
        body: `Hi ${name},\n\nI saw your recent progress in ${course} and wanted to send a quick note: well done. The consistency you're showing matters, and it's what gets students across the finish line at WGU.\n\nKeep the momentum going — let me know what you're tackling next so I can be ready to support.${sigBlock}`
      };
    }
    // generic check-in
    return {
      subject: `Checking in on ${course}`,
      body: `Hi ${name},\n\nI wanted to check in and see how things are going with ${course}${courseEnd}. ${missed > 0 ? `I noticed we've had a couple of missed connections recently. ` : ''}Whenever you have a moment, reply with where you're at and anything you'd like support with on our next call.${sigBlock}`
    };
  }

  function selectCohort(cohort: string): Student[] {
    const active = students.filter((s) => !s.archived);
    const today = new Date();
    if (cohort === 'high_risk') return active.filter((s) => String(s.risk).toLowerCase().includes('high'));
    if (cohort === 'ghost') return active.filter((s) => studentStatusSignals(s, touchpoints).isGhost);
    if (cohort === 'no_contact_14') return active.filter((s) => {
      const last = s.last_contact_date ? new Date(s.last_contact_date) : null;
      if (!last) return true;
      return (today.getTime() - last.getTime()) / 86400000 >= 14;
    });
    if (cohort === 'course_ending') return active.filter((s) => {
      if (!s.course_end_date) return false;
      const end = new Date(s.course_end_date);
      const diff = (end.getTime() - today.getTime()) / 86400000;
      return diff <= 30 && diff >= 0;
    });
    if (cohort.startsWith('course:')) {
      const code = cohort.slice('course:'.length).toLowerCase();
      return active.filter((s) => (s.course || '').toLowerCase().includes(code));
    }
    if (cohort === 'all_active') return active;
    return [];
  }

  async function generateCohortDrafts(cohort: string, cohortLabel: string, kind: string) {
    if (!isAdmin()) return setMessage('Outreach is admin-only.');
    const targets = selectCohort(cohort);
    if (targets.length === 0) {
      setMessage(`No students in cohort "${cohortLabel}".`);
      return;
    }
    const rows = targets.map((student) => {
      const { subject, body } = buildDraftForStudent(student, kind, cohortLabel);
      return { student_id: student.id, cohort_label: cohortLabel, template_kind: kind, subject, body, status: 'pending', edited: false };
    });
    if (!supabase) {
      const locals: EmailDraft[] = rows.map((r) => ({
        ...r, id: crypto.randomUUID(), created_at: new Date().toISOString(), sent_at: null
      } as EmailDraft));
      setDrafts((current) => [...locals, ...current]);
      setMessage(`Generated ${locals.length} drafts locally.`);
      return;
    }
    const { data, error } = await supabase.from('email_drafts').insert(rows).select();
    if (error) return setMessage(`Draft generation failed: ${error.message}`);
    setDrafts((current) => [...(data as EmailDraft[]), ...current]);
    setMessage(`Generated ${data?.length || 0} drafts for "${cohortLabel}".`);
  }

  async function generateSingleDraft(studentId: string, kind: string) {
    if (!isAdmin()) return setMessage('Outreach is admin-only.');
    const student = students.find((s) => s.id === studentId);
    if (!student) return;
    const { subject, body } = buildDraftForStudent(student, kind, 'single');
    const row = { student_id: student.id, cohort_label: 'single', template_kind: kind, subject, body, status: 'pending', edited: false };
    if (!supabase) {
      const local: EmailDraft = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString(), sent_at: null } as EmailDraft;
      setDrafts((current) => [local, ...current]);
      return setMessage('Draft created locally.');
    }
    const { data, error } = await supabase.from('email_drafts').insert(row).select().single();
    if (error) return setMessage(`Draft save failed: ${error.message}`);
    setDrafts((current) => [data as EmailDraft, ...current]);
    setMessage(`Draft created for ${student.display_name}.`);
  }

  async function updateDraft(id: string, patch: Partial<EmailDraft>) {
    setDrafts((current) => current.map((d) => d.id === id ? { ...d, ...patch } : d));
    if (!supabase) return;
    await supabase.from('email_drafts').update(patch).eq('id', id);
  }

  async function markDraftSent(id: string) {
    const draft = drafts.find((d) => d.id === id);
    if (!draft) return;
    const sentAt = new Date().toISOString();
    await updateDraft(id, { status: 'sent', sent_at: sentAt });
    // Auto-log a touchpoint
    if (draft.student_id) {
      const student = students.find((s) => s.id === draft.student_id);
      if (student) {
        await createTouchpoint({
          student_id: draft.student_id,
          touchpoint_type: 'Email sent',
          touchpoint_date: new Date().toISOString().slice(0, 10),
          course: student.course || '',
          momentum: '',
          note: `[${draft.cohort_label || 'outreach'} · ${draft.template_kind}] ${draft.subject}\n\n${draft.body}`
        });
      }
    }
    setMessage('Draft marked sent and touchpoint logged.');
  }

  async function deleteDraft(id: string) {
    setDrafts((current) => current.filter((d) => d.id !== id));
    if (!supabase) return;
    await supabase.from('email_drafts').delete().eq('id', id);
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

  async function syncTodoistNow() {
    if (!supabase) return setMessage('Supabase not configured.');
    if (syncing) return;
    setSyncing(true);
    setMessage('Pulling tasks from Todoist…');
    try {
      const { data, error } = await supabase.functions.invoke('sync-todoist', { body: {} });
      if (error) throw new Error(error.message);
      if (data?.success === false) throw new Error(data?.error || 'Sync failed');
      setMessage(`Todoist synced: ${data?.added ?? 0} added, ${data?.updated ?? 0} updated, ${data?.removed ?? 0} removed.`);
      // Reload chores + sync state
      const [choreResult, syncStateResult] = await Promise.all([
        supabase.from('chore_tasks').select('*').eq('deleted_in_todoist', false).order('priority', { ascending: false }),
        supabase.from('todoist_sync_state').select('*').eq('id', 1).maybeSingle()
      ]);
      if (!choreResult.error && choreResult.data) setChoreTasks(choreResult.data as ChoreTask[]);
      if (!syncStateResult.error && syncStateResult.data) setSyncState(syncStateResult.data as TodoistSyncState);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage(`Todoist sync failed: ${msg}`);
    } finally {
      setSyncing(false);
    }
  }

  async function completeChore(id: string) {
    if (!canEdit('chores')) return setMessage('Chores are view-only for Adam right now.');
    const now = new Date().toISOString();
    const target = choreTasks.find((c) => c.id === id);

    // Optimistic local update so the UI responds immediately.
    setChoreTasks((current) => current.map((c) => c.id === id ? { ...c, is_completed: true, status: 'completed', last_completed_at: now } : c));
    if (!supabase) return;

    const { error } = await supabase.from('chore_tasks').update({
      is_completed: true, status: 'completed', last_completed_at: now
    }).eq('id', id);
    if (error) return setMessage(`Chore update failed: ${error.message}`);

    // Tell Todoist this occurrence is done. For recurring chores this is
    // what advances the due date to the next occurrence — without this
    // call, Todoist never hears about it and the SAME stale due date
    // comes back on every future sync.
    if (target?.todoist_task_id) {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('todoist-complete-task', {
          body: { todoist_task_id: target.todoist_task_id }
        });
        if (fnError) throw new Error(fnError.message);
        if (data?.success === false) throw new Error(data?.error || 'Complete failed');

        if (data?.fully_completed) {
          // One-off task: Todoist has no next occurrence. Leave it marked
          // completed locally; the next sync will soft-delete it once it
          // drops off Todoist's active list.
          setMessage('Chore completed in Todoist.');
        } else if (data?.next_due_date) {
          // Recurring task rolled forward — reflect the new due date and
          // reopen it locally so it's not stuck showing "done" forever.
          const nextDue = data.next_due_date as string;
          const nextRecurrence = data.next_recurrence as string | null;
          setChoreTasks((current) => current.map((c) => c.id === id ? {
            ...c,
            is_completed: false,
            status: 'sent',
            due_date: nextDue,
            recurrence: nextRecurrence ?? c.recurrence
          } : c));
          await supabase.from('chore_tasks').update({
            is_completed: false,
            status: 'sent',
            due_date: nextDue,
            recurrence: nextRecurrence ?? target.recurrence,
            updated_at: new Date().toISOString()
          }).eq('id', id);
          setMessage(`Chore done — next occurrence ${new Date(nextDue).toLocaleDateString()}.`);
        } else {
          setMessage('Chore marked done. Todoist confirmed but did not return a next due date.');
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setMessage(`Marked done locally, but Todoist sync failed: ${msg}. It may show overdue again until you sync.`);
      }
    } else {
      setMessage('Chore marked done.');
    }
  }

  async function uncompleteChore(id: string) {
    if (!canEdit('chores')) return;
    setChoreTasks((current) => current.map((c) => c.id === id ? { ...c, is_completed: false, status: 'sent' } : c));
    if (!supabase) return;
    await supabase.from('chore_tasks').update({ is_completed: false, status: 'sent' }).eq('id', id);
  }

  function computeNextDue(frequency: string): string {
    const d = new Date();
    const f = (frequency || '').toLowerCase();
    if (f === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (f === 'quarterly') d.setMonth(d.getMonth() + 3);
    else if (f === 'biannual' || f === 'biannually') d.setMonth(d.getMonth() + 6);
    else if (f === 'annual' || f === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else if (f === 'biennial') d.setFullYear(d.getFullYear() + 2);
    else if (f.includes('5 year')) d.setFullYear(d.getFullYear() + 5);
    else if (f.includes('3 year')) d.setFullYear(d.getFullYear() + 3);
    else d.setMonth(d.getMonth() + 6);
    return d.toISOString();
  }

  async function markSuggestionDone(id: string) {
    if (!canEdit('chores')) return setMessage('Suggestions are view-only for Adam right now.');
    const target = choreSuggestions.find((s) => s.id === id);
    if (!target) return;
    const now = new Date().toISOString();
    const next_due_at = computeNextDue(target.frequency);
    setChoreSuggestions((current) => current.map((s) => s.id === id ? { ...s, status: 'done', last_done_at: now, next_due_at } : s));
    if (!supabase) return;
    const { error } = await supabase.from('chore_suggestions').update({
      status: 'done', last_done_at: now, next_due_at, updated_at: now
    }).eq('id', id);
    if (error) setMessage(`Suggestion update failed: ${error.message}`);
    else setMessage(`"${target.title}" marked done. Next due ${new Date(next_due_at).toLocaleDateString()}.`);
  }

  async function snoozeSuggestion(id: string, days: number) {
    if (!canEdit('chores')) return;
    const snoozed = new Date();
    snoozed.setDate(snoozed.getDate() + days);
    const snoozedIso = snoozed.toISOString().slice(0, 10);
    setChoreSuggestions((current) => current.map((s) => s.id === id ? { ...s, status: 'snoozed', snoozed_until: snoozedIso } : s));
    if (!supabase) return;
    await supabase.from('chore_suggestions').update({
      status: 'snoozed', snoozed_until: snoozedIso, updated_at: new Date().toISOString()
    }).eq('id', id);
    setMessage(`Snoozed for ${days} days.`);
  }

  async function dismissSuggestion(id: string) {
    if (!canEdit('chores')) return;
    setChoreSuggestions((current) => current.map((s) => s.id === id ? { ...s, status: 'dismissed' } : s));
    if (!supabase) return;
    await supabase.from('chore_suggestions').update({
      status: 'dismissed', updated_at: new Date().toISOString()
    }).eq('id', id);
    setMessage('Suggestion dismissed.');
  }

  async function restoreSuggestion(id: string) {
    if (!canEdit('chores')) return;
    setChoreSuggestions((current) => current.map((s) => s.id === id ? { ...s, status: 'pending', snoozed_until: null } : s));
    if (!supabase) return;
    await supabase.from('chore_suggestions').update({
      status: 'pending', snoozed_until: null, updated_at: new Date().toISOString()
    }).eq('id', id);
  }

  async function addSuggestionToTodoist(id: string, assigneeTodoistId?: string | null) {
    if (!canEdit('chores')) return setMessage('Adding to Todoist is admin-only.');
    if (!supabase) return setMessage('Supabase not configured.');
    const target = choreSuggestions.find((s) => s.id === id);
    if (!target) return;
    setMessage(`Adding "${target.title}" to Todoist…`);
    try {
      const priorityMap: Record<string, number> = { light: 1, medium: 2, heavy: 3 };
      const { data, error } = await supabase.functions.invoke('todoist-create-task', {
        body: {
          title: target.title,
          description: target.why_it_matters,
          category: target.category,
          priority: priorityMap[target.effort_level] ?? 2
        }
      });
      if (error) throw new Error(error.message);
      if (data?.success === false) throw new Error(data?.error || 'Create failed');
      const now = new Date().toISOString();
      const newTaskId = data?.todoist_task_id ?? null;

      // If approving specifically for someone (Adam), assign it to them in
      // Todoist right away rather than leaving it unassigned.
      if (assigneeTodoistId && newTaskId) {
        try {
          await supabase.functions.invoke('todoist-assign-task', {
            body: { todoist_task_id: newTaskId, responsible_uid: assigneeTodoistId }
          });
        } catch (assignErr) {
          console.error('Assignment after create failed', assignErr);
        }
      }

      setChoreSuggestions((current) => current.map((s) => s.id === id ? { ...s, status: 'added', added_to_todoist_at: now, todoist_task_id: newTaskId } : s));
      await supabase.from('chore_suggestions').update({
        status: 'added', added_to_todoist_at: now, todoist_task_id: newTaskId, updated_at: now
      }).eq('id', id);
      setMessage(assigneeTodoistId
        ? `Sent "${target.title}" to Todoist and assigned it. Sync will mirror it into Chores within 15 minutes (or click Sync now).`
        : `Added "${target.title}" to Todoist. Run Sync to mirror it into Chores.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage(`Add to Todoist failed: ${msg}`);
    }
  }

  /** "Send to Adam" from the Review & Approve panel: creates the task in
   * Todoist (if not already there) and assigns it to Adam. */
  async function approveSuggestionForAdam(id: string) {
    const adam = householdUsers.find((u) => u.name.toLowerCase() === 'adam');
    if (!adam?.todoist_id) return setMessage("Adam's Todoist ID isn't set up yet — check Settings.");
    await addSuggestionToTodoist(id, adam.todoist_id);
  }

  /** "I'll do this instead" from the Review & Approve panel: creates the
   * task in Todoist (if not already there) and assigns it to Kaylee. */
  async function approveSuggestionForSelf(id: string) {
    const kaylee = householdUsers.find((u) => u.name.toLowerCase() === 'kaylee');
    await addSuggestionToTodoist(id, kaylee?.todoist_id ?? null);
  }

  /** Reassigns an existing chore (already in Todoist) to a different
   * household member — used for "I'll take this one" on Adam's list, and
   * for manually pulling back an escalated task. */
  async function reassignChore(choreId: string, toUserName: 'Kaylee' | 'Adam') {
    if (!canEdit('chores')) return setMessage('Reassigning chores is admin-only.');
    if (!supabase) return setMessage('Supabase not configured.');
    const chore = choreTasks.find((c) => c.id === choreId);
    if (!chore?.todoist_task_id) return setMessage('This chore has no linked Todoist task to reassign.');
    const target = householdUsers.find((u) => u.name === toUserName);
    if (!target?.todoist_id) return setMessage(`${toUserName}'s Todoist ID isn't set up yet — check Settings.`);

    setMessage(`Reassigning "${chore.name}" to ${toUserName}…`);
    try {
      const { data, error } = await supabase.functions.invoke('todoist-assign-task', {
        body: { todoist_task_id: chore.todoist_task_id, responsible_uid: target.todoist_id }
      });
      if (error) throw new Error(error.message);
      if (data?.success === false) throw new Error(data?.error || 'Reassign failed');

      setChoreTasks((current) => current.map((c) => c.id === choreId ? {
        ...c, assigned_to: target.id, todoist_assignee_id: target.todoist_id, escalation_note: null
      } : c));
      await supabase.from('chore_tasks').update({
        assigned_to: target.id, todoist_assignee_id: target.todoist_id, escalation_note: null, updated_at: new Date().toISOString()
      }).eq('id', choreId);
      setMessage(`"${chore.name}" is now assigned to ${toUserName}.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage(`Reassign failed: ${msg}`);
    }
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
      <style>{COMPACT_ROW_CSS}</style>
      <header className="topbar">
        <div className="logo"><span className="logo-mark">KH</span><span>Kaylee's Hub</span></div>
        <div className="toggle-wrap">
          <button className={mode === 'home' ? 'active' : ''} onClick={() => { setMode('home'); setPage('dashboard'); }}><Home size={15} /> Home</button>
          <button className={mode === 'work' ? 'active' : ''} disabled={activeRole !== 'admin'} onClick={() => { setMode('work'); setPage('dashboard'); }}><Users size={15} /> Work</button>
        </div>
        <div className="top-actions">
          <button
            className="btn ghost"
            onClick={() => setDarkMode((d) => !d)}
            title={darkMode ? 'Light mode' : 'Dark mode'}
            style={{ padding: '7px 10px' }}
          >
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <span className={`role-pill ${activeRole}`}>{activeName} · {activeRole === 'admin' ? 'Admin' : 'Limited'}</span>
          <button className="btn ghost" onClick={signOut}><LogOut size={15} /> Sign out</button>
        </div>
      </header>
      <div className="main">
        <button
          className={`sidebar-toggle ${sidebarOpen ? 'open' : ''}`}
          onClick={() => setSidebarOpen(o => !o)}
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          {sidebarOpen ? <XIcon size={14} /> : <Menu size={14} />}
        </button>
        <aside className={`sidebar${sidebarOpen ? '' : ' collapsed'}`}>
          <div className="nav-label">{activeRole === 'limited' ? 'Home' : mode === 'home' ? 'Home' : 'Work'}</div>
          {navItems.map(([id, label, Icon]) => (
            <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => { setPage(id); if (window.innerWidth < 900) setSidebarOpen(false); }}>
              <Icon size={16} /><span>{label}</span>{activeRole === 'limited' && id !== 'dashboard' && permissionFor(id).access_level !== 'edit' && <Lock size={13} className="nav-lock" />}
            </button>
          ))}
          {activeRole === 'admin' && (
            <>
              <div className="nav-label">Admin</div>
              <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => { setPage('settings'); if (window.innerWidth < 900) setSidebarOpen(false); }}><Settings size={16} /><span>Settings</span></button>
            </>
          )}
          <div className="side-note"><strong>{activeRole === 'limited' ? 'Adam home mode' : mode === 'home' ? 'Canton tenant mode' : 'FERPA-safe mode'}</strong><p>{activeRole === 'limited' ? 'Home side only. Kaylee controls view/edit access by section.' : mode === 'home' ? 'Tenant-only suggestions. Adam access controlled in Settings.' : 'First name/nickname only. Clipboard copy only.'}</p></div>
          <div className="sync-note"><strong>{hasSupabase ? 'Supabase enabled' : 'Local demo mode'}</strong><p>{loading ? 'Loading...' : message}</p><button className="btn tiny" onClick={loadData}><RefreshCw size={13} /> Refresh</button></div>
        </aside>
        <main className="content">
          {!activeCanEdit && activeRole === 'limited' && page !== 'dashboard' && <ViewOnlyBanner />}
          {page === 'dashboard' && <Dashboard mode={activeRole === 'limited' ? 'home' : mode} inventory={inventory} students={students} touchpoints={touchpoints} tasks={tasks} choreTasks={choreTasks} householdUsers={householdUsers} role={activeRole} setPage={setPage} />}
          {page === 'today' && <Today tasks={tasks.filter((task) => activeRole === 'admin' || task.mode === 'home')} choreTasks={choreTasks} householdUsers={householdUsers} completeTask={completeTask} completeChore={completeChore} editable={canEdit('today') && canEdit('chores')} />}
          {page === 'briefing' && <Briefing role={activeRole} />}
          {page === 'calendar' && (mode === 'home' || activeRole === 'limited'
            ? <GoogleCalendar />
            : <WorkCalendar students={students} />
          )}
          {page === 'budget' && <Budget />}
          {page === 'inventory' && <Inventory inventory={inventory} createItem={createInventoryItem} updateQuantity={updateInventoryQuantity} editable={canEdit('inventory')} />}
          {page === 'chores' && <Chores choreTasks={choreTasks} choreSuggestions={choreSuggestions} syncState={syncState} syncing={syncing} householdUsers={householdUsers} currentUserName={activeName} syncTodoistNow={syncTodoistNow} completeChore={completeChore} uncompleteChore={uncompleteChore} markSuggestionDone={markSuggestionDone} snoozeSuggestion={snoozeSuggestion} dismissSuggestion={dismissSuggestion} restoreSuggestion={restoreSuggestion} addSuggestionToTodoist={addSuggestionToTodoist} approveSuggestionForAdam={approveSuggestionForAdam} approveSuggestionForSelf={approveSuggestionForSelf} reassignChore={reassignChore} editable={canEdit('chores')} />}
          {page === 'vehicles' && <Vehicles />}
          {page === 'jules' && <Jules />}
          {page === 'migraine' && <MigraineTracker />}
          {page === 'contacts' && <Contacts />}
          {page === 'books' && <Books />}
          {page === 'suggestions' && <Suggestions choreSuggestions={choreSuggestions} markSuggestionDone={markSuggestionDone} snoozeSuggestion={snoozeSuggestion} dismissSuggestion={dismissSuggestion} restoreSuggestion={restoreSuggestion} addSuggestionToTodoist={addSuggestionToTodoist} editable={canEdit('suggestions')} />}
          {page === 'students' && activeRole === 'admin' && <Students students={students} touchpoints={touchpoints} importStudentsFromCsv={importStudentsFromCsv} createStudent={createStudent} updateStudent={updateStudent} archiveStudent={archiveStudent} unarchiveStudent={unarchiveStudent} createTouchpoint={createTouchpoint} copyText={copyStudentText} ferpaWarnings={ferpaWarnings} generateSingleDraft={generateSingleDraft} drafts={drafts} setPage={setPage} />}
          {page === 'fto' && activeRole === 'admin' && <FTOTracker />}
          {page === 'outreach' && activeRole === 'admin' && <Outreach drafts={drafts} students={students} generateCohortDrafts={generateCohortDrafts} updateDraft={updateDraft} markDraftSent={markDraftSent} deleteDraft={deleteDraft} />}
          {page === 'settings' && activeRole === 'admin' && <SettingsPage permissions={permissions} updatePermission={updatePermission} />}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      {activeRole === 'admin' && (
        <>
          {showMoreDrawer && (
            <>
              <div className="mobile-more-drawer-overlay" onClick={() => setShowMoreDrawer(false)} />
              <div className="mobile-more-drawer">
                {(mode === 'home' ? homeNav : workNav)
                  .slice(5)
                  .filter(([id]) => canView(id as Page))
                  .map(([id, label, Icon]) => (
                    <button
                      key={id}
                      className={page === id ? 'active' : ''}
                      onClick={() => { setPage(id as Page); setShowMoreDrawer(false); }}
                    >
                      <Icon size={20} />
                      {label}
                    </button>
                  ))}
                <button
                  className={page === 'settings' ? 'active' : ''}
                  onClick={() => { setPage('settings'); setShowMoreDrawer(false); }}
                >
                  <Settings size={20} />
                  Settings
                </button>
              </div>
            </>
          )}
          <nav className="mobile-bottom-nav">
            {(mode === 'home' ? homeNav : workNav)
              .slice(0, 4)
              .filter(([id]) => canView(id as Page))
              .map(([id, label, Icon]) => (
                <button
                  key={id}
                  className={page === id ? 'active' : ''}
                  onClick={() => { setPage(id as Page); setShowMoreDrawer(false); }}
                >
                  <Icon size={22} />
                  {label.split(' ')[0]}
                </button>
              ))}
            <button
              className={`more-btn ${showMoreDrawer ? 'active' : ''}`}
              onClick={() => setShowMoreDrawer(v => !v)}
            >
              <MoreHorizontal size={22} />
              More
            </button>
          </nav>
        </>
      )}
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

function Dashboard({ mode, inventory, students, touchpoints, tasks, choreTasks, householdUsers, role, setPage }: { mode: Mode; inventory: InventoryItem[]; students: Student[]; touchpoints: Touchpoint[]; tasks: TaskItem[]; choreTasks: ChoreTask[]; householdUsers: HouseholdUser[]; role: Role; setPage: (page: Page) => void }) {
  const expiring = inventory.filter((item) => item.expires).length;
  const pending = tasks.filter((task) => task.status === 'pending_approval').length;
  const activeStudents = students.filter((student) => !student.archived);
  const highRiskStudents = activeStudents.filter((student) => studentStatusSignals(student, touchpoints).isHighRisk);
  const ghostRiskStudents = activeStudents.filter((student) => studentStatusSignals(student, touchpoints).isGhost);
  const supportStudents = activeStudents.filter((student) => studentStatusSignals(student, touchpoints).isSupport);
  const followUpsDue = activeStudents.filter((student) => studentStatusSignals(student, touchpoints).needsFollowUp);
  const today = new Date().toISOString().slice(0, 10);
  const isSameDay = (iso: string | null | undefined, ymd: string) => !!iso && iso.slice(0, 10) === ymd;
  const callsToday = activeStudents
    .filter((student) => isSameDay(student.next_call_at, today) || student.next_appointment_date === today)
    .sort((a, b) => {
      const at = a.next_call_at ? new Date(a.next_call_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bt = b.next_call_at ? new Date(b.next_call_at).getTime() : Number.MAX_SAFE_INTEGER;
      return at - bt;
    });
  const nowMs = Date.now();
  const sevenDaysMs = nowMs + 7 * 24 * 60 * 60 * 1000;
  const callsThisWeek = activeStudents
    .filter((student) => {
      if (!student.next_call_at) return false;
      const t = new Date(student.next_call_at).getTime();
      return t > nowMs && t <= sevenDaysMs && !isSameDay(student.next_call_at, today);
    })
    .sort((a, b) => new Date(a.next_call_at!).getTime() - new Date(b.next_call_at!).getTime());
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
      <section className="panel">
        <div className="panel-head"><h2>Today’s Scheduled Calls</h2><Phone size={17} /></div>
        {callsToday.length === 0 && <div className="brief-item">No calls scheduled for today. Add a "Next call" datetime when logging a touchpoint to populate this list.</div>}
        {callsToday.map((student) => {
          const timeText = student.next_call_at
            ? new Date(student.next_call_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            : 'All day';
          return <button className="mentor-queue-row" key={student.id} onClick={() => setPage('students')}>
            <span className="queue-rank">{timeText}</span>
            <div>
              <strong>{student.display_name}</strong>
              <p>{student.student_id ? `ID ${student.student_id} · ` : ''}{student.course || 'No course'} · {student.status}</p>
            </div>
            <span className={`risk-pill ${String(student.risk).toLowerCase().replace(' ', '-')}`}>{student.risk}</span>
          </button>;
        })}
        {callsThisWeek.length > 0 && <details style={{ marginTop: 12 }}><summary><strong>Upcoming this week ({callsThisWeek.length})</strong></summary>
          {callsThisWeek.map((student) => <div className="brief-item" key={student.id}>
            <strong>{new Date(student.next_call_at!).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong> · {student.display_name} · {student.course || 'No course'}
          </div>)}
        </details>}
      </section>
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

  // ── Home dashboard: command center grid ───────────────────────────────
  return <HomeDashboard
    role={role}
    tasks={tasks}
    choreTasks={choreTasks}
    inventory={inventory}
    householdUsers={householdUsers}
    setPage={setPage}
  />;
}

// ── HomeDashboard: command center grid ─────────────────────────────────────
function HomeDashboard({ role, tasks, choreTasks, inventory, householdUsers, setPage }: {
  role: Role;
  tasks: TaskItem[];
  choreTasks: ChoreTask[];
  inventory: InventoryItem[];
  householdUsers: HouseholdUser[];
  setPage: (p: Page) => void;
}) {
  const isKaylee = role === 'admin';
  const today = new Date().toISOString().slice(0, 10);

  // Identify users
  const kaylee = householdUsers.find(u => u.name.toLowerCase().includes('kaylee')) ?? null;
  const adam   = householdUsers.find(u => u.name.toLowerCase().includes('adam')) ?? null;
  const meUser = isKaylee ? kaylee : adam;

  // My chores today
  const myChores = useMemo(() => {
    const mine = choreTasks.filter(c =>
      !c.is_completed && !c.deleted_in_todoist &&
      (meUser ? (c.assigned_to === meUser.id || (!c.assigned_to && isKaylee)) : isKaylee)
    );
    return computeTackleToday(mine).slice(0, 5);
  }, [choreTasks, meUser, isKaylee]);

  // Supabase snapshot data
  const [migraineToday, setMigraineToday]       = useState<null | 'yes' | 'no'>(null);
  const [migraineSeverity, setMigraineSeverity] = useState<string>('');
  const [currentBook, setCurrentBook]           = useState<{ title: string; author: string | null } | null>(null);
  const [dueContacts, setDueContacts]           = useState<{ name: string; type: string }[]>([]);
  const [vehicleAlerts, setVehicleAlerts]       = useState<{ name: string; item: string; status: string }[]>([]);
  const [budgetToday, setBudgetToday]           = useState<{ name: string; amount: number }[]>([]);
  const [expiringSoon, setExpiringSoon]         = useState<{ name: string; expires: string }[]>([]);
  const [suggestionCount, setSuggestionCount]   = useState<number>(0);
  const [julesDue, setJulesDue]                 = useState<string[]>([]);
  const [loadingSnaps, setLoadingSnaps]         = useState(true);

  useEffect(() => {
    if (!supabase) { setLoadingSnaps(false); return; }
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) { setLoadingSnaps(false); return; }

      await Promise.all([
        // 1. Migraine today
        (async () => {
          const { data } = await supabase.from('migraine_log').select('severity, wong_baker_score').eq('entry_date', today).limit(1).maybeSingle();
          if (data) { setMigraineToday('yes'); setMigraineSeverity(data.severity ?? ''); }
          else setMigraineToday('no');
        })(),

        // 2. Current book
        (async () => {
          const { data } = await supabase.from('books').select('title, author').eq('user_id', userId).eq('status', 'reading').limit(1).maybeSingle();
          if (data) setCurrentBook({ title: data.title, author: data.author });
        })(),

        // 3. Contacts due for outreach
        (async () => {
          const { data } = await supabase.from('contact_reminders')
            .select('display_name, reminder_type, next_due')
            .eq('user_id', userId)
            .eq('is_done', false)
            .lte('next_due', today)
            .order('next_due', { ascending: true })
            .limit(5);
          if (data) setDueContacts(data.map((r: any) => ({ name: r.display_name, type: r.reminder_type })));
        })(),

        // 4. Vehicle alerts (from budget rules)
        (async () => {
          const [vehiclesRes, maintRes, rulesRes] = await Promise.all([
            supabase.from('vehicles').select('id, name').eq('active', true),
            supabase.from('vehicle_maintenance_log').select('vehicle_id, service_type, service_date'),
            supabase.from('budget_recurring_rules').select('vehicle_id, name, month_of_year, months').eq('category', 'vehicle'),
          ]);
          const vehicles = vehiclesRes.data ?? [];
          const maint = maintRes.data ?? [];
          const rules = rulesRes.data ?? [];
          const alerts: { name: string; item: string; status: string }[] = [];
          const nowMonth = new Date().getMonth() + 1;
          for (const v of vehicles) {
            for (const r of rules.filter((r: any) => r.vehicle_id === v.id)) {
              const lastDone = maint.filter((m: any) => m.vehicle_id === v.id).sort((a: any, b: any) => b.service_date.localeCompare(a.service_date))[0];
              const months: number[] = r.months ?? (r.month_of_year ? [r.month_of_year] : []);
              if (months.includes(nowMonth) || months.includes(nowMonth - 1)) {
                alerts.push({ name: v.name, item: r.name, status: months.includes(nowMonth) ? 'due' : 'overdue' });
              }
            }
          }
          setVehicleAlerts(alerts.slice(0, 4));
        })(),

        // 5. Budget items due today
        (async () => {
          const { data } = await supabase.from('budget_recurring_rules').select('name, amount, day_of_month').eq('active', true).eq('recurrence', 'monthly_day');
          if (data) {
            const dom = new Date().getDate();
            const due = (data as any[]).filter(r => r.day_of_month === dom);
            setBudgetToday(due.map(r => ({ name: r.name, amount: r.amount })));
          }
        })(),

        // 6. Inventory expiring soon (within 7 days)
        (async () => {
          const soon = new Date(); soon.setDate(soon.getDate() + 7);
          const soonStr = soon.toISOString().slice(0, 10);
          const items = inventory.filter(i => i.expires && i.expires <= soonStr && i.expires >= today);
          setExpiringSoon(items.slice(0, 4).map(i => ({ name: i.name, expires: i.expires! })));
        })(),

        // 7. Home suggestions pending
        (async () => {
          const { count } = await supabase.from('home_suggestions').select('*', { count: 'exact', head: true }).eq('status', 'pending');
          setSuggestionCount(count ?? 0);
        })(),

        // 8. Jules due items
        (async () => {
          const { data: pet } = await supabase.from('pet_info').select('id').limit(1).maybeSingle();
          if (!pet) return;
          const { data: med } = await supabase.from('pet_medical_log').select('item_type, service_date, recurrence_months').eq('pet_id', pet.id);
          const { data: groom } = await supabase.from('pet_grooming_log').select('groom_date').eq('pet_id', pet.id).order('groom_date', { ascending: false }).limit(1).maybeSingle();
          const dueDates: string[] = [];
          if (med) {
            for (const m of med as any[]) {
              if (!m.recurrence_months) continue;
              const due = new Date(m.service_date + 'T00:00:00');
              due.setMonth(due.getMonth() + m.recurrence_months);
              if (due <= new Date()) dueDates.push(m.item_type.replace(/_/g, ' '));
            }
          }
          if (groom) {
            const lastGroom = new Date(groom.groom_date + 'T00:00:00');
            const nextGroom = new Date(lastGroom); nextGroom.setDate(nextGroom.getDate() + 42);
            if (nextGroom <= new Date()) dueDates.push('grooming');
          }
          setJulesDue([...new Set(dueDates)].slice(0, 3));
        })(),
      ]);
      setLoadingSnaps(false);
    })();
  }, [today, inventory]);

  const greeting = isKaylee ? 'Hey Kaylee 👋' : 'Hey Adam 👋';
  const subGreeting = `${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{greeting}</h1>
          <p>{subGreeting}</p>
        </div>
      </div>

      {/* Top row: calendar today + my tasks */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div><GoogleCalendarToday /></div>
        <section className="panel" style={{ cursor: 'pointer' }} onClick={() => setPage('today')}>
          <div className="panel-head">
            <h2>📋 My Tasks Today</h2>
            <span className="readonly-pill">{myChores.length} items</span>
          </div>
          {myChores.length === 0
            ? <div className="brief-item" style={{ color: 'var(--muted)' }}>All clear — nothing due today.</div>
            : myChores.map(c => (
              <div key={c.id} className="brief-item" style={{ borderLeft: c.due_date && c.due_date < today ? '3px solid var(--red)' : '3px solid var(--green)' }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</div>
                {c.due_date && c.due_date < today && <div style={{ fontSize: 11, color: 'var(--red)' }}>Overdue · {c.due_date}</div>}
              </div>
            ))
          }
          <div style={{ fontSize: 11, color: 'var(--purple)', marginTop: 6, textAlign: 'right' }}>View all →</div>
        </section>
      </div>

      {/* Middle row: 4-column snapshot grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>

        {/* Migraine */}
        <section className="panel" style={{ cursor: 'pointer' }} onClick={() => setPage('migraine')}>
          <div className="panel-head"><h2>🧠 Migraine</h2></div>
          {migraineToday === null
            ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</div>
            : migraineToday === 'yes'
            ? <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--red)' }}>YES</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{migraineSeverity.replace(/_/g, ' ')}</div>
              </div>
            : <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--green)' }}>NO</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>None logged today</div>
              </div>
          }
          <div style={{ fontSize: 11, color: 'var(--purple)', marginTop: 6, textAlign: 'right' }}>Log / view →</div>
        </section>

        {/* Library */}
        <section className="panel" style={{ cursor: 'pointer' }} onClick={() => setPage('books')}>
          <div className="panel-head"><h2>📖 Reading Now</h2></div>
          {currentBook
            ? <>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{currentBook.title}</div>
                {currentBook.author && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>by {currentBook.author}</div>}
              </>
            : <div style={{ fontSize: 12, color: 'var(--muted)' }}>No book in progress</div>
          }
          <div style={{ fontSize: 11, color: 'var(--purple)', marginTop: 6, textAlign: 'right' }}>Library →</div>
        </section>

        {/* Jules */}
        <section className="panel" style={{ cursor: 'pointer' }} onClick={() => setPage('jules')}>
          <div className="panel-head"><h2>🐾 Jules</h2></div>
          {julesDue.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>All up to date ✓</div>
            : julesDue.map((item, i) => (
                <div key={i} className="brief-item" style={{ borderLeft: '3px solid var(--amber)' }}>
                  <span style={{ fontSize: 12, textTransform: 'capitalize' }}>{item} due</span>
                </div>
              ))
          }
          <div style={{ fontSize: 11, color: 'var(--purple)', marginTop: 6, textAlign: 'right' }}>View Jules →</div>
        </section>

        {/* Home Suggestions */}
        <section className="panel" style={{ cursor: 'pointer' }} onClick={() => setPage('suggestions')}>
          <div className="panel-head"><h2>🏠 Suggestions</h2></div>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: suggestionCount > 0 ? 'var(--amber)' : 'var(--green)' }}>{suggestionCount}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>pending items</div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--purple)', marginTop: 6, textAlign: 'right' }}>View all →</div>
        </section>
      </div>

      {/* Bottom row: contacts, vehicles, budget, inventory */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>

        {/* Contacts due */}
        {isKaylee && (
          <section className="panel" style={{ cursor: 'pointer' }} onClick={() => setPage('contacts')}>
            <div className="panel-head">
              <h2>👥 Outreach Due</h2>
              {dueContacts.length > 0 && <span className="risk-pill high">{dueContacts.length}</span>}
            </div>
            {dueContacts.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>No outreach overdue ✓</div>
              : dueContacts.map((c, i) => (
                  <div key={i} className="brief-item" style={{ borderLeft: '3px solid var(--purple)' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.type}</div>
                  </div>
                ))
            }
            <div style={{ fontSize: 11, color: 'var(--purple)', marginTop: 6, textAlign: 'right' }}>Open Contacts →</div>
          </section>
        )}

        {/* Vehicles */}
        <section className="panel" style={{ cursor: 'pointer' }} onClick={() => setPage('vehicles')}>
          <div className="panel-head">
            <h2>🚗 Vehicles</h2>
            {vehicleAlerts.length > 0 && <span className="risk-pill high">{vehicleAlerts.length} alerts</span>}
          </div>
          {vehicleAlerts.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>No maintenance due ✓</div>
            : vehicleAlerts.map((a, i) => (
                <div key={i} className="brief-item" style={{ borderLeft: `3px solid ${a.status === 'overdue' ? 'var(--red)' : 'var(--amber)'}` }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.item} — {a.status}</div>
                </div>
              ))
          }
          <div style={{ fontSize: 11, color: 'var(--purple)', marginTop: 6, textAlign: 'right' }}>View Vehicles →</div>
        </section>

        {/* Budget */}
        <section className="panel" style={{ cursor: 'pointer' }} onClick={() => setPage('budget')}>
          <div className="panel-head">
            <h2>💰 Budget</h2>
            {budgetToday.length > 0 && <span className="risk-pill medium">{budgetToday.length} due today</span>}
          </div>
          {budgetToday.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>No bills due today</div>
            : budgetToday.map((b, i) => (
                <div key={i} className="brief-item" style={{ borderLeft: '3px solid var(--amber)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12 }}>{b.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>${b.amount.toFixed(2)}</span>
                </div>
              ))
          }
          <div style={{ fontSize: 11, color: 'var(--purple)', marginTop: 6, textAlign: 'right' }}>Open Budget →</div>
        </section>

        {/* Inventory */}
        <section className="panel" style={{ cursor: 'pointer' }} onClick={() => setPage('inventory')}>
          <div className="panel-head">
            <h2>📦 Inventory</h2>
            {expiringSoon.length > 0 && <span className="risk-pill medium">{expiringSoon.length} expiring</span>}
          </div>
          {expiringSoon.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Nothing expiring this week</div>
            : expiringSoon.map((item, i) => (
                <div key={i} className="brief-item" style={{ borderLeft: '3px solid var(--amber)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12 }}>{item.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.expires}</span>
                </div>
              ))
          }
          <div style={{ fontSize: 11, color: 'var(--purple)', marginTop: 6, textAlign: 'right' }}>Open Inventory →</div>
        </section>
      </div>
    </>
  );
}

/* ============================================================
   COMPACT TASK ROW — Todoist-density row used across Today,
   Chores, and Adam's Tasks. Circle checkbox, title, then a thin
   metadata line (time/recurrence/project/section) underneath.
   ============================================================ */

function CompactTaskRow({
  title, completed, onToggle, editable, timeLabel, overdue,
  recurrence, projectLabel, sectionLabel, priorityDot, reason
}: {
  title: string;
  completed: boolean;
  onToggle: () => void;
  editable: boolean;
  timeLabel?: string | null;
  overdue?: boolean;
  recurrence?: string | null;
  projectLabel?: string | null;
  sectionLabel?: string | null;
  priorityDot?: 'urgent' | 'warning' | 'normal' | 'good' | null;
  reason?: string | null;
}) {
  const metaParts: { icon: React.ReactNode; text: string; tone?: 'overdue' | 'due' | 'muted' }[] = [];
  if (timeLabel) metaParts.push({ icon: <Clock size={11} />, text: timeLabel, tone: overdue ? 'overdue' : 'due' });
  if (recurrence) metaParts.push({ icon: <Repeat size={11} />, text: recurrence, tone: 'muted' });

  return (
    <div className="ct-row">
      <button
        type="button"
        className={`ct-checkbox ${completed ? 'checked' : ''} ${priorityDot && !completed ? `dot-${priorityDot}` : ''}`}
        onClick={editable ? onToggle : undefined}
        disabled={!editable}
        aria-label={completed ? 'Mark not done' : 'Mark done'}
      >
        {completed && <CheckCircle2 size={13} strokeWidth={2.5} />}
      </button>
      <div className="ct-body">
        <div className={`ct-title ${completed ? 'ct-title-done' : ''}`}>{title}</div>
        {(metaParts.length > 0 || projectLabel || sectionLabel) && (
          <div className="ct-meta">
            {metaParts.map((m, i) => (
              <span className={`ct-meta-item ct-meta-${m.tone || 'muted'}`} key={i}>{m.icon}{m.text}</span>
            ))}
            {(projectLabel || sectionLabel) && (
              <span className="ct-meta-item ct-meta-tag">
                <Hash size={11} />
                {projectLabel}{sectionLabel ? ` / ${sectionLabel}` : ''}
              </span>
            )}
          </div>
        )}
        {reason && <div className="ct-reason">{reason}</div>}
      </div>
    </div>
  );
}

function choreToRowProps(chore: ChoreTask, showReason: boolean) {
  const due = chore.due_date ? new Date(chore.due_date) : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // Overdue means the due date falls on a day strictly before today — NOT
  // just "not completed yet today". A daily chore due today at 9pm should
  // read as "Today", not "Overdue", until the day actually passes.
  const dueIsBeforeToday = due ? (() => {
    const dueDay = new Date(due); dueDay.setHours(0, 0, 0, 0);
    return dueDay.getTime() < today.getTime();
  })() : false;
  const overdue = dueIsBeforeToday && !chore.is_completed;
  const dueToday = due ? sameYmd(due, new Date()) : false;
  const priorityDot: 'urgent' | 'warning' | 'normal' | 'good' =
    chore.priority === 4 ? 'urgent' : chore.priority === 3 ? 'warning' : chore.priority === 2 ? 'normal' : 'good';

  let timeLabel: string | null = null;
  if (due) {
    const hasTime = chore.due_date && chore.due_date.includes('T');
    if (overdue) timeLabel = `Overdue · ${due.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    else if (dueToday && hasTime) timeLabel = due.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    else if (dueToday) timeLabel = 'Today';
    else timeLabel = due.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  let reason: string | null = null;
  if (showReason) {
    const parts: string[] = [];
    if (overdue && due) parts.push(`Wasn't done ${due.toLocaleDateString()}`);
    else if (dueToday) parts.push('Due today');
    else if (chore.day_of_week === dayOfWeekName(new Date())) parts.push(`Scheduled for ${chore.day_of_week}`);
    else if (chore.day_of_week === 'Daily') parts.push('Daily recurring');
    if (chore.priority >= 3) parts.push('Higher priority');
    reason = parts.length ? `Why today: ${parts.join(' · ')}` : null;
  }

  return {
    title: chore.name,
    completed: chore.is_completed,
    timeLabel,
    overdue,
    recurrence: chore.recurrence,
    projectLabel: chore.source_project,
    sectionLabel: chore.todoist_section || chore.room,
    priorityDot,
    reason
  };
}

function Today({ tasks, choreTasks, householdUsers, completeTask, completeChore, editable, role, compact = false }: { tasks: TaskItem[]; choreTasks: ChoreTask[]; householdUsers: HouseholdUser[]; completeTask: (id: string) => void; completeChore: (id: string) => void; editable: boolean; role?: Role; compact?: boolean }) {
  const isKaylee = role === 'admin';
  const today = new Date().toISOString().slice(0, 10);
  const kaylee = householdUsers.find((u) => u.name.toLowerCase().includes('kaylee')) ?? null;
  const adam   = householdUsers.find((u) => u.name.toLowerCase().includes('adam')) ?? null;
  const meUser = isKaylee ? kaylee : adam;

  // Cross-tab snapshot data for Today
  const [julesDue, setJulesDue]         = useState<string[]>([]);
  const [vehiclesDue, setVehiclesDue]   = useState<string[]>([]);
  const [budgetDue, setBudgetDue]       = useState<{ name: string; amount: number }[]>([]);
  const [contactsDue, setContactsDue]   = useState<string[]>([]);
  const [migraineToday, setMigraineToday] = useState<boolean | null>(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return;

      await Promise.all([
        // Jules overdue items
        (async () => {
          const { data: pet } = await supabase.from('pet_info').select('id').limit(1).maybeSingle();
          if (!pet) return;
          const { data: med } = await supabase.from('pet_medical_log').select('item_type, service_date, recurrence_months').eq('pet_id', pet.id);
          const { data: groom } = await supabase.from('pet_grooming_log').select('groom_date').eq('pet_id', pet.id).order('groom_date', { ascending: false }).limit(1).maybeSingle();
          const due: string[] = [];
          if (med) for (const m of med as any[]) {
            if (!m.recurrence_months) continue;
            const d = new Date(m.service_date + 'T00:00:00'); d.setMonth(d.getMonth() + m.recurrence_months);
            if (d <= new Date()) due.push(m.item_type.replace(/_/g, ' '));
          }
          if (groom) {
            const last = new Date(groom.groom_date + 'T00:00:00'); const next = new Date(last); next.setDate(next.getDate() + 42);
            if (next <= new Date()) due.push('grooming');
          }
          setJulesDue([...new Set(due)]);
        })(),

        // Vehicle alerts this month
        (async () => {
          const nowMonth = new Date().getMonth() + 1;
          const { data: rules } = await supabase.from('budget_recurring_rules').select('name, months, month_of_year').eq('category', 'vehicle').eq('active', true);
          if (rules) {
            const due = (rules as any[]).filter(r => {
              const months: number[] = r.months ?? (r.month_of_year ? [r.month_of_year] : []);
              return months.includes(nowMonth) || months.includes(nowMonth - 1);
            }).map(r => r.name);
            setVehiclesDue(due.slice(0, 3));
          }
        })(),

        // Budget due today
        (async () => {
          const dom = new Date().getDate();
          const { data } = await supabase.from('budget_recurring_rules').select('name, amount').eq('active', true).eq('recurrence', 'monthly_day').eq('day_of_month', dom);
          if (data) setBudgetDue((data as any[]).map(r => ({ name: r.name, amount: r.amount })));
        })(),

        // Contacts overdue (Kaylee only)
        (async () => {
          if (!isKaylee) return;
          const { data } = await supabase.from('contact_reminders').select('display_name').eq('user_id', userId).eq('is_done', false).lte('next_due', today).limit(5);
          if (data) setContactsDue((data as any[]).map(r => r.display_name));
        })(),

        // Migraine today (Adam check)
        (async () => {
          const { data } = await supabase.from('migraine_log').select('id').eq('entry_date', today).limit(1).maybeSingle();
          setMigraineToday(!!data);
        })(),
      ]);
    })();
  }, [today, isKaylee]);

  // My chores
  const myChoreTasks = useMemo(() => {
    if (!meUser) return isKaylee ? choreTasks : [];
    return choreTasks.filter(c => c.assigned_to === meUser.id || (!c.assigned_to && isKaylee));
  }, [choreTasks, meUser, isKaylee]);
  const tackleList = useMemo(() => computeTackleToday(myChoreTasks), [myChoreTasks]);
  const shown = compact ? tackleList.slice(0, 3) : tackleList;

  if (compact) {
    return <section className="panel ct-panel">
      <div className="panel-head">
        <h2>Today's Tackle List</h2>
        <span className="readonly-pill"><Zap size={14} /> {tackleList.length}</span>
      </div>
      {shown.length === 0 && <div className="brief-item" style={{ color: 'var(--muted)' }}>Nothing due today.</div>}
      <div className="ct-list">
        {shown.map(chore => <CompactTaskRow key={chore.id} {...choreToRowProps(chore, true)} editable={editable} onToggle={() => completeChore(chore.id)} />)}
      </div>
    </section>;
  }

  return <>
    <div className="page-header">
      <div>
        <h1>Today's Tasks</h1>
        <p>{isKaylee ? 'Kaylee' : 'Adam'} · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>
    </div>

    {/* My chores */}
    <section className="panel ct-panel">
      <div className="panel-head">
        <h2>📋 My Chores & Tasks</h2>
        <span className="readonly-pill"><Zap size={14} /> {tackleList.length} for today</span>
      </div>
      {tackleList.length === 0 && <div className="brief-item" style={{ color: 'var(--muted)' }}>No chores queued for today. Sync from Todoist on the Chores tab.</div>}
      <div className="ct-list">
        {tackleList.map(chore => <CompactTaskRow key={chore.id} {...choreToRowProps(chore, true)} editable={editable} onToggle={() => completeChore(chore.id)} />)}
      </div>
    </section>

    {/* Cross-tab items */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>

      {/* Jules */}
      {julesDue.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h2>🐾 Jules Needs Attention</h2></div>
          {julesDue.map((item, i) => (
            <div key={i} className="brief-item" style={{ borderLeft: '3px solid var(--amber)' }}>
              <span style={{ fontSize: 13, textTransform: 'capitalize' }}>{item} is due</span>
            </div>
          ))}
        </section>
      )}

      {/* Vehicles */}
      {vehiclesDue.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h2>🚗 Vehicle Maintenance</h2></div>
          {vehiclesDue.map((item, i) => (
            <div key={i} className="brief-item" style={{ borderLeft: '3px solid var(--amber)' }}>
              <span style={{ fontSize: 13 }}>{item}</span>
            </div>
          ))}
        </section>
      )}

      {/* Budget */}
      {budgetDue.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h2>💰 Bills Due Today</h2></div>
          {budgetDue.map((b, i) => (
            <div key={i} className="brief-item" style={{ borderLeft: '3px solid var(--purple)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13 }}>{b.name}</span>
              <span style={{ fontWeight: 600 }}>${b.amount.toFixed(2)}</span>
            </div>
          ))}
        </section>
      )}

      {/* Contacts (Kaylee only) */}
      {isKaylee && contactsDue.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h2>👥 Reach Out Today</h2></div>
          {contactsDue.map((name, i) => (
            <div key={i} className="brief-item" style={{ borderLeft: '3px solid var(--green)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span>
            </div>
          ))}
        </section>
      )}

      {/* Migraine reminder for Adam */}
      {!isKaylee && (
        <section className="panel" style={{ borderLeft: migraineToday ? '4px solid var(--green)' : '4px solid var(--purple)' }}>
          <div className="panel-head"><h2>🧠 Migraine Check-in</h2></div>
          {migraineToday
            ? <div style={{ color: 'var(--green)', fontWeight: 600 }}>✓ Logged today</div>
            : <div style={{ color: 'var(--muted)', fontSize: 13 }}>No migraine logged yet today. If you have one, track it in the Migraine Tracker tab.</div>
          }
        </section>
      )}
    </div>

    {/* Other Todoist tasks */}
    {tasks.length > 0 && (
      <section className="panel ct-panel" style={{ marginTop: 12 }}>
        <h2>Other Tasks</h2>
        <div className="ct-list">
          {tasks.map(task => <CompactTaskRow key={task.id} title={task.title} completed={task.status === 'completed'} onToggle={() => completeTask(task.id)} editable={editable} priorityDot={task.priority} projectLabel={task.source} reason={null} timeLabel={task.minutes ? `${task.minutes} min` : null} />)}
        </div>
      </section>
    )}
  </>;
}

function sameYmd(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayOfWeekName(d: Date) {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
}

function computeTackleToday(choreTasks: ChoreTask[]): ChoreTask[] {
  const now = new Date();
  const todayName = dayOfWeekName(now);
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const todayYmd = now.toISOString().slice(0, 10);

  const candidates = choreTasks.filter((c) => !c.is_completed && c.status !== 'completed' && !c.deleted_in_todoist).map((c) => {
    const due = c.due_date ? new Date(c.due_date) : null;
    const dueYmd = due ? due.toISOString().slice(0, 10) : null;
    let score = 0;
    let matches = false;

    // Overdue: highest priority
    if (due && dueYmd && dueYmd < todayYmd) { score += 1000; matches = true; }
    // Due today
    if (dueYmd === todayYmd) { score += 800; matches = true; }
    // Day of week match
    if (c.day_of_week === todayName) { score += 500; matches = true; }
    if (c.day_of_week === 'Daily') { score += 600; matches = true; }
    if (c.day_of_week === 'Weekly' && (todayName === 'Sunday' || todayName === 'Monday')) { score += 300; matches = true; }
    if (c.day_of_week === 'Monthly' && now.getDate() <= 7) { score += 250; matches = true; }
    if ((c.day_of_week === 'Anytime') && isWeekend) { score += 100; matches = true; }

    // Priority bump
    score += (c.priority || 1) * 50;
    // Lighter chores edge slightly higher for morning momentum
    if (c.effort_level === 'light') score += 25;
    if (c.effort_level === 'heavy') score -= 25;

    return { chore: c, score, matches };
  })
  .filter((x) => x.matches)
  .sort((a, b) => b.score - a.score);

  return candidates.map((x) => x.chore);
}

function Briefing({ compact = false, role }: { compact?: boolean; role?: Role }) {
  const { loading, lines } = useDailyBriefing(role ?? 'admin');
  const shown = compact ? lines.slice(0, 3) : lines;
  const isKaylee = (role ?? 'admin') === 'admin';

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>✨ Daily Briefing</h2>
        {!compact && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{isKaylee ? 'Kaylee' : 'Adam'}'s day</span>}
      </div>
      {loading
        ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Building your briefing…</div>
        : shown.length === 0
        ? <div className="brief-item">Nothing urgent today — all clear!</div>
        : shown.map(item => (
            <div key={item.id} className={`brief-item ${item.severity === 'urgent' ? 'urgent' : item.severity === 'warning' ? 'warning' : ''}`}>
              {item.text}
            </div>
          ))
      }
      {compact && lines.length > 3 && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>+{lines.length - 3} more items</div>
      )}
    </section>
  );
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


function Suggestions({ choreSuggestions, markSuggestionDone, snoozeSuggestion, dismissSuggestion, restoreSuggestion, addSuggestionToTodoist, editable }: { choreSuggestions: ChoreSuggestion[]; markSuggestionDone: (id: string) => void; snoozeSuggestion: (id: string, days: number) => void; dismissSuggestion: (id: string) => void; restoreSuggestion: (id: string) => void; addSuggestionToTodoist: (id: string) => void; editable: boolean }) {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showDismissed, setShowDismissed] = useState(false);

  const categories: { id: string; label: string; icon: React.ElementType }[] = [
    { id: 'all', label: 'All', icon: Home },
    { id: 'homeowner', label: 'Home', icon: Home },
    { id: 'safety', label: 'Safety', icon: ShieldCheck },
    { id: 'vehicle', label: 'Vehicles', icon: Car },
    { id: 'tool', label: 'Tools', icon: Wrench },
    { id: 'dog', label: 'Dogs', icon: Bone },
    { id: 'garden', label: 'Garden', icon: Flower2 },
    { id: 'preserving', label: 'Preserving', icon: Archive }
  ];

  const visible = choreSuggestions.filter((s) => {
    if (s.status === 'dismissed' && !showDismissed) return false;
    if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
    return true;
  });

  const counts = {
    pending: choreSuggestions.filter((s) => s.status === 'pending').length,
    snoozed: choreSuggestions.filter((s) => s.status === 'snoozed').length,
    added: choreSuggestions.filter((s) => s.status === 'added').length,
    done: choreSuggestions.filter((s) => s.status === 'done').length
  };

  return <>
    <Header title="Home Suggestions" sub="New-homeowner playbook: HVAC, plumbing, vehicles, tools, dogs, garden, and food preserving.">
      {editable ? null : <span className="readonly-pill"><Eye size={14} /> View only</span>}
    </Header>
    <Stats items={[
      ['Pending', String(counts.pending), 'not yet acted on'],
      ['Snoozed', String(counts.snoozed), 'come back later'],
      ['In Todoist', String(counts.added), 'mirrored to chores'],
      ['Completed', String(counts.done), 'this cycle']
    ]} />
    <section className="panel">
      <div className="panel-head">
        <h2>Browse by category</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} />
          Show dismissed
        </label>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {categories.map((cat) => {
          const Icon = cat.icon;
          const active = categoryFilter === cat.id;
          return <button key={cat.id} className={active ? 'btn primary' : 'btn ghost'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setCategoryFilter(cat.id)}>
            <Icon size={14} /> {cat.label}
          </button>;
        })}
      </div>
    </section>
    {visible.length === 0 && <section className="panel"><div className="brief-item">Nothing in this category right now.</div></section>}
    {visible.map((s) => <SuggestionCard key={s.id}
      suggestion={s}
      editable={editable}
      onAdd={() => addSuggestionToTodoist(s.id)}
      onDone={() => markSuggestionDone(s.id)}
      onSnooze={(days) => snoozeSuggestion(s.id, days)}
      onDismiss={() => dismissSuggestion(s.id)}
      onRestore={() => restoreSuggestion(s.id)}
    />)}
  </>;
}

function SuggestionCard({ suggestion, editable, onAdd, onDone, onSnooze, onDismiss, onRestore }: {
  suggestion: ChoreSuggestion;
  editable: boolean;
  onAdd: () => void;
  onDone: () => void;
  onSnooze: (days: number) => void;
  onDismiss: () => void;
  onRestore: () => void;
}) {
  const monthNow = new Date().getMonth() + 1;
  const isInSeason = !suggestion.month_triggers || suggestion.month_triggers.length === 0 || suggestion.month_triggers.includes(monthNow);
  const urgencyClass = suggestion.status === 'snoozed' ? '' :
    suggestion.status === 'added' ? 'good' :
    suggestion.status === 'done' ? 'good' :
    suggestion.status === 'dismissed' ? '' :
    isInSeason ? 'urgent' : '';

  const lastDone = suggestion.last_done_at ? new Date(suggestion.last_done_at).toLocaleDateString() : null;
  const nextDue = suggestion.next_due_at ? new Date(suggestion.next_due_at).toLocaleDateString() : null;
  const snoozedUntil = suggestion.snoozed_until ? new Date(suggestion.snoozed_until).toLocaleDateString() : null;

  return <section className={`panel suggestion ${urgencyClass}`}>
    <div className="panel-head">
      <h2>{suggestion.title}</h2>
      <span className="readonly-pill" style={{ textTransform: 'capitalize' }}>{suggestion.category} · {suggestion.frequency}</span>
    </div>
    <p>{suggestion.description}</p>
    {suggestion.why_it_matters && <p style={{ color: 'var(--muted, #888)', fontStyle: 'italic' }}>{suggestion.why_it_matters}</p>}
    <small>
      {suggestion.estimated_minutes} min · {suggestion.effort_level} effort
      {isInSeason ? ' · 🟢 In season now' : suggestion.month_triggers && suggestion.month_triggers.length ? ` · Best months: ${suggestion.month_triggers.join(', ')}` : ''}
      {lastDone ? ` · Last done ${lastDone}` : ''}
      {nextDue ? ` · Next due ${nextDue}` : ''}
      {snoozedUntil && suggestion.status === 'snoozed' ? ` · Snoozed until ${snoozedUntil}` : ''}
      {suggestion.status === 'added' && suggestion.added_to_todoist_at ? ` · Sent to Todoist ${new Date(suggestion.added_to_todoist_at).toLocaleDateString()}` : ''}
    </small>
    {editable && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
      {(suggestion.status === 'pending' || suggestion.status === 'snoozed') && <>
        <button className="btn primary" onClick={onAdd}><Send size={14} /> Add to Todoist</button>
        <button className="btn ghost" onClick={onDone}><CheckCircle2 size={14} /> I did this</button>
        <button className="btn ghost" onClick={() => onSnooze(30)}><Clock size={14} /> Snooze 30d</button>
        <button className="btn ghost" onClick={() => onSnooze(90)}><Clock size={14} /> Snooze 90d</button>
        <button className="btn ghost" onClick={onDismiss}><Trash2 size={14} /> Dismiss</button>
      </>}
      {suggestion.status === 'added' && <>
        <span className="readonly-pill" style={{ background: 'rgba(34,197,94,0.15)' }}><CheckCircle2 size={14} /> In Todoist</span>
        <button className="btn ghost" onClick={onDone}><CheckCircle2 size={14} /> Mark cycle done</button>
      </>}
      {suggestion.status === 'done' && <>
        <button className="btn ghost" onClick={onRestore}><RefreshCw size={14} /> Reset</button>
      </>}
      {suggestion.status === 'dismissed' && <>
        <button className="btn ghost" onClick={onRestore}><RefreshCw size={14} /> Restore</button>
      </>}
    </div>}
  </section>;
}

const touchpointTypes = [
  'Email from student', 'Email to student', 'Text from student', 'Text to student',
  'Call from student', 'Call to student', 'Voicemail from student', 'Voicemail to student',
  'Appointment', 'No-show / missed call'
];

const riskLevels = ['Low', 'Medium', 'High', 'High Risk'];
const studentStatuses = ['Active', 'Support', 'Ghost', 'Portal-only', 'Archived'];

function Students({ students, touchpoints, importStudentsFromCsv, createStudent, updateStudent, archiveStudent, unarchiveStudent, createTouchpoint, copyText, ferpaWarnings, generateSingleDraft, drafts, setPage }: {
  students: Student[];
  touchpoints: Touchpoint[];
  importStudentsFromCsv: (text: string) => Promise<void>;
  createStudent: (student: Omit<Student, 'id' | 'copied' | 'archived'>) => void;
  updateStudent: (id: string, patch: Partial<Student>) => void;
  archiveStudent: (id: string) => void;
  unarchiveStudent: (id: string) => void;
  createTouchpoint: (touchpoint: Omit<Touchpoint, 'id' | 'next_call_prep' | 'constructive_note' | 'follow_up_email' | 'follow_up_text' | 'copied'>) => void;
  copyText: (text: string, id?: string, table?: 'students' | 'student_touchpoints') => void;
  ferpaWarnings: (text: string) => string[];
  generateSingleDraft: (studentId: string, kind: string) => void;
  drafts: EmailDraft[];
  setPage: (page: Page) => void;
}) {
  const activeStudents = students.filter((student) => !student.archived);
  const archivedStudents = students.filter((student) => student.archived);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const baseList = showArchived ? archivedStudents : activeStudents;
  const visibleStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? baseList.filter((s) =>
          s.display_name.toLowerCase().includes(q) ||
          String(s.student_id || '').toLowerCase().includes(q)
        )
      : baseList;
    return [...filtered].sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }));
  }, [baseList, search]);
  const [selectedId, setSelectedId] = useState(visibleStudents[0]?.id || students[0]?.id || '');
  const selected = students.find((student) => student.id === selectedId) || visibleStudents[0] || students[0];
  const selectedTouchpoints = selected ? touchpoints.filter((touchpoint) => touchpoint.student_id === selected.id) : [];
  const [addingStudent, setAddingStudent] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [studentForm, setStudentForm] = useState({
    display_name: '', student_id: '', course: '', goal: '', risk: 'Medium', status: 'Active',
    admin_notes: '', next_appointment_date: '', graduation_goal_date: '', missed_call_count: '0', email: ''
  });
  const [touchForm, setTouchForm] = useState({
    touchpoint_type: 'Call to student', touchpoint_date: new Date().toISOString().slice(0, 10),
    course: '', momentum: '', note: '', next_call_at: ''
  });

  useEffect(() => {
    if (!selected && visibleStudents[0]) setSelectedId(visibleStudents[0].id);
  }, [showArchived, students.length]);

  function resetStudentForm() {
    setStudentForm({ display_name: '', student_id: '', course: '', goal: '', risk: 'Medium', status: 'Active', admin_notes: '', next_appointment_date: '', graduation_goal_date: '', missed_call_count: '0', email: '' });
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
      constructive_note: '',
      email: studentForm.email || null
    } as Omit<Student, 'id' | 'copied' | 'archived'>);
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
      missed_call_count: String(selected.missed_call_count || 0),
      email: selected.email || ''
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
      missed_call_count: Number(studentForm.missed_call_count || 0),
      email: studentForm.email || null
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
    if (touchForm.next_call_at) {
      const iso = new Date(touchForm.next_call_at).toISOString();
      updateStudent(selected.id, { next_call_at: iso } as Partial<Student>);
    }
    setTouchForm({ touchpoint_type: 'Call to student', touchpoint_date: new Date().toISOString().slice(0, 10), course: selected.course || '', momentum: '', note: '', next_call_at: '' });
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
      <label className="btn ghost upload-button" title="Updates existing students from Salesforce CSV by Student ID. Does not create new students or overwrite your notes."><Upload size={15} /> {importingCsv ? 'Updating...' : 'Update from Salesforce CSV'}<input type="file" accept=".csv,text/csv" onChange={(e) => handleCsvUpload(e.target.files?.[0])} /></label>
      <button className="btn ghost" onClick={() => setShowArchived(!showArchived)}><Archive size={15} /> {showArchived ? 'Active' : 'Archived'}</button>
    </Header>
    <Stats items={[["Active", String(activeStudents.length)], ["Archived", String(archivedStudents.length)], ["High risk", String(students.filter((s) => s.risk === 'High Risk' && !s.archived).length)], ["Ghost flags", String(students.filter((s) => s.status === 'Ghost' && !s.archived).length)]]} />
    {addingStudent && <section className="panel"><h2>Add student</h2><p className="settings-intro">Use first name, nickname, or initial only. Avoid student IDs, email addresses, phone numbers, and last names.</p><div className="form-grid"><input placeholder="Display name" value={studentForm.display_name} onChange={(e) => setStudentForm({ ...studentForm, display_name: e.target.value })} /><input placeholder="Student ID (WGU)" value={studentForm.student_id} onChange={(e) => setStudentForm({ ...studentForm, student_id: e.target.value })} /><input placeholder="Course" value={studentForm.course} onChange={(e) => setStudentForm({ ...studentForm, course: e.target.value })} /><input placeholder="Goal" value={studentForm.goal} onChange={(e) => setStudentForm({ ...studentForm, goal: e.target.value })} /><input placeholder="Email (for outreach drafts)" type="email" value={studentForm.email} onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })} /><select value={studentForm.risk} onChange={(e) => setStudentForm({ ...studentForm, risk: e.target.value })}>{riskLevels.map((risk) => <option key={risk}>{risk}</option>)}</select><select value={studentForm.status} onChange={(e) => setStudentForm({ ...studentForm, status: e.target.value })}>{studentStatuses.filter((status) => status !== 'Archived').map((status) => <option key={status}>{status}</option>)}</select><label className="date-field"><span>Next appointment</span><input type="date" value={studentForm.next_appointment_date} onChange={(e) => setStudentForm({ ...studentForm, next_appointment_date: e.target.value })} /></label><label className="date-field"><span>Graduation goal</span><input type="date" value={studentForm.graduation_goal_date} onChange={(e) => setStudentForm({ ...studentForm, graduation_goal_date: e.target.value })} /></label></div><textarea placeholder="Admin notes for Kaylee only" value={studentForm.admin_notes} onChange={(e) => setStudentForm({ ...studentForm, admin_notes: e.target.value })} />{ferpaWarnings(`${studentForm.display_name} ${studentForm.goal} ${studentForm.admin_notes}`).length > 0 && <FerpaWarning warnings={ferpaWarnings(`${studentForm.display_name} ${studentForm.goal} ${studentForm.admin_notes}`)} />}<div className="form-actions"><button className="btn primary" onClick={submitStudent}><Save size={15} /> Save Student</button></div></section>}
    <div className="students-crm-layout">
      <section className="panel student-scroll-list"><div className="panel-head"><h2>{showArchived ? 'Archived Students' : 'Student List'}</h2><span className="readonly-pill"><Users size={14} /> {visibleStudents.length}</span></div><div className="student-search-row"><Search size={15} /><input type="text" placeholder="Search by name or ID" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search students" /></div>{visibleStudents.length === 0 && <div className="brief-item">{search ? 'No students match that search.' : 'No students in this view yet.'}</div>}{visibleStudents.map((student) => <button key={student.id} className={`student-list-item ${selected?.id === student.id ? 'active' : ''}`} style={student.on_term_break ? { opacity: 0.6, background: '#f5f5f8' } : {}} onClick={() => setSelectedId(student.id)}><div><strong>{student.display_name}</strong><p>{student.course || 'No course'} · {student.status}{student.on_term_break ? ' · ☕ Break' : ''}</p></div><span className={`risk-pill ${String(student.risk).toLowerCase().replace(' ', '-')}`}>{student.risk}</span><small>Last: {student.last_contact_date || '—'}</small></button>)}</section>
      {selected ? <section className="student-detail-pane" style={selected.on_term_break ? { filter: 'grayscale(0.6)', opacity: 0.75, background: '#f0f0f5' } : {}}>
        {/* TOP ZONE: header + health + quick facts + next call prep — always visible without scrolling */}
        <section className="panel student-top-zone">
          {/* student-top-zone header */}
          <div className="panel-head">
            <div>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {selected.display_name}
                {selected.on_term_break && (
                  <span style={{ fontSize: 11, fontWeight: 600, background: '#e0e0e8', color: '#666', borderRadius: 999, padding: '2px 10px' }}>
                    Term Break
                  </span>
                )}
              </h2>
              <p>{selected.course || 'No course'} · {selected.status} · {selected.risk}</p>
            </div>
            <div className="actions">
              <select className="btn ghost" defaultValue="" onChange={(e) => { if (e.target.value) { generateSingleDraft(selected.id, e.target.value); e.target.value = ''; } }}>
                <option value="" disabled>Draft email…</option>
                <option value="check_in">Generic check-in</option>
                <option value="ghost">Ghost outreach</option>
                <option value="high_risk">High-risk plan</option>
                <option value="course_ending">Course ending soon</option>
                <option value="no_contact_14">No contact 14+ days</option>
                <option value="win">Recognize a win</option>
              </select>
              {drafts.filter((d) => d.student_id === selected.id && d.status === 'pending').length > 0 && (
                <button className="btn ghost" onClick={() => setPage('outreach')}>
                  <Mail size={15} /> {drafts.filter((d) => d.student_id === selected.id && d.status === 'pending').length} pending
                </button>
              )}
              <button
                className={selected.on_term_break ? 'btn warning' : 'btn ghost'}
                onClick={() => updateStudent(selected.id, { on_term_break: !selected.on_term_break })}
              >
                {selected.on_term_break ? '↩ Back in Term' : '☕ Term Break'}
              </button>
              <button className="btn ghost" onClick={() => { startEditProfile(); setTimeout(() => document.getElementById('student-edit-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }}>
                <Edit3 size={15} /> Edit
              </button>
              {!selected.archived && (
                <button className="btn warning" onClick={() => archiveStudent(selected.id)}>
                  <Archive size={15} /> Archive
                </button>
              )}
              {selected.archived && (
                <button className="btn ghost" onClick={() => unarchiveStudent(selected.id)}>
                  ↩ Unarchive
                </button>
              )}
            </div>
          </div>
          {activeWarnings.length > 0 && <FerpaWarning warnings={activeWarnings} />}
          <StudentHealthPanel student={selected} touchpoints={touchpoints} />
          <div className="quick-facts">
            <div><span>Student ID</span><strong>{selected.student_id || '—'}</strong></div>
            <div><span>Course</span><strong>{selected.course || '—'}</strong></div>
            <div><span>Course end</span><strong>{selected.course_end_date || '—'}</strong></div>
            <div><span>Next call</span><strong>{selected.next_call_at ? new Date(selected.next_call_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</strong></div>
            <div className="quick-facts-goal"><span>Goal</span><strong>{selected.goal || 'No goal saved yet.'}</strong></div>
          </div>
          <div className="next-call-compact">
            <div className="next-call-compact-head"><FileText size={15} /> <strong>Call Prep</strong></div>
            {selected.next_call_prep ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {selected.next_call_prep.split('\n').map((line, i) => {
                  if (!line.trim()) return <div key={i} style={{ height: 4 }} />;
                  const isGrow = /^[GROW] —/.test(line);
                  const isSection = line === 'GROW questions:';
                  const isOpen = line.startsWith('📌');
                  const isDate = line.startsWith('📅');
                  const isMomentum = line.startsWith('⚡');
                  return (
                    <div key={i} style={{
                      fontSize: isSection ? 11 : 13,
                      fontWeight: isSection ? 700 : isOpen ? 600 : 400,
                      color: isSection ? 'var(--muted)' : isGrow ? 'var(--text)' : isDate ? 'var(--amber)' : isMomentum ? 'var(--purple)' : 'var(--text)',
                      paddingLeft: isGrow ? 10 : 0,
                      textTransform: isSection ? 'uppercase' as const : 'none' as const,
                      letterSpacing: isSection ? '0.05em' : 0,
                      lineHeight: 1.4,
                    }}>
                      {line}
                    </div>
                  );
                })}
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>
                  {selected.constructive_note || 'Ask before advising. End with a commitment in their words.'}
                </div>
              </div>
            ) : (
              <div className="brief-item">Log a touchpoint to generate call prep.</div>
            )}
          </div>
        </section>

        {editingProfile && <section className="panel" id="student-edit-form"><h2>Edit profile</h2><div className="form-grid"><input value={studentForm.display_name} onChange={(e) => setStudentForm({ ...studentForm, display_name: e.target.value })} /><input placeholder="Student ID (WGU)" value={studentForm.student_id} onChange={(e) => setStudentForm({ ...studentForm, student_id: e.target.value })} /><input value={studentForm.course} onChange={(e) => setStudentForm({ ...studentForm, course: e.target.value })} /><input value={studentForm.goal} onChange={(e) => setStudentForm({ ...studentForm, goal: e.target.value })} /><input placeholder="Email" type="email" value={studentForm.email} onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })} /><select value={studentForm.risk} onChange={(e) => setStudentForm({ ...studentForm, risk: e.target.value })}>{riskLevels.map((risk) => <option key={risk}>{risk}</option>)}</select><select value={studentForm.status} onChange={(e) => setStudentForm({ ...studentForm, status: e.target.value })}>{studentStatuses.map((status) => <option key={status}>{status}</option>)}</select><label className="date-field"><span>Next appointment</span><input type="date" value={studentForm.next_appointment_date} onChange={(e) => setStudentForm({ ...studentForm, next_appointment_date: e.target.value })} /></label><label className="date-field"><span>Graduation goal</span><input type="date" value={studentForm.graduation_goal_date} onChange={(e) => setStudentForm({ ...studentForm, graduation_goal_date: e.target.value })} /></label></div><textarea value={studentForm.admin_notes} onChange={(e) => setStudentForm({ ...studentForm, admin_notes: e.target.value })} /><div className="form-actions"><button className="btn primary" onClick={saveProfileEdit}><Save size={15} /> Save Profile</button></div></section>}

        {/* TWO-COLUMN ZONE: scrollable history on left, sticky touchpoint form on right */}
        <div className="student-work-area">
          <div className="student-work-main">
            <section className="panel"><h2>Admin Notes</h2><textarea value={selected.admin_notes || ''} onChange={(e) => updateStudent(selected.id, { admin_notes: e.target.value })} placeholder="Private notes for Kaylee. Keep FERPA-safe." /></section>
            <section className="panel"><h2>Profile Details</h2><div className="profile-grid"><div><strong>Last contact</strong><p>{selected.last_contact_date || '—'}</p></div><div><strong>Next appointment</strong><p>{selected.next_appointment_date || '—'}</p></div><div><strong>Graduation goal</strong><p>{selected.graduation_goal_date || '—'}</p></div><div><strong>Missed calls</strong><p>{selected.missed_call_count || 0}{(selected.missed_call_count || 0) >= 3 ? ' · Ghost flag' : ''}</p></div><div><strong>Momentum</strong><p>{selected.momentum || '—'}</p></div><div><strong>Last academic activity</strong><p>{selected.last_academic_activity_date || '—'}</p></div><div><strong>Term end</strong><p>{selected.term_end_date || '—'}</p></div><div><strong>CUs</strong><p>{selected.term_completed_cu ?? '—'} completed · {selected.term_remaining_cu ?? '—'} remaining</p></div></div></section>
            <StudentTimeline student={selected} touchpoints={selectedTouchpoints} />
            <section className="panel"><h2>Touchpoint Log</h2>{selectedTouchpoints.length === 0 && <div className="brief-item">No touchpoints yet. Add the first call, email, text, or voicemail in the panel on the right.</div>}{selectedTouchpoints.map((touchpoint) => <div className="touchpoint-card" key={touchpoint.id}><div className="panel-head"><div><strong>{touchpoint.touchpoint_type}</strong><p>{touchpoint.touchpoint_date} · {touchpoint.course || selected.course || 'No course'} · {touchpoint.momentum || 'Momentum not set'}</p></div>{touchpoint.touchpoint_type.includes('Email') ? <Mail size={17} /> : touchpoint.touchpoint_type.includes('Text') ? <MessageSquare size={17} /> : <Phone size={17} />}</div><p>{touchpoint.note}</p><details><summary>Next-call prep and follow-up drafts</summary><div className="brief-item"><strong>Next call:</strong> {touchpoint.next_call_prep}</div><div className="brief-item"><strong>Kaylee coaching:</strong> {touchpoint.constructive_note}</div><textarea readOnly value={touchpoint.follow_up_email || ''} /><button className="btn primary" onClick={() => copyText(touchpoint.follow_up_email || '', touchpoint.id, 'student_touchpoints')}><Copy size={15} /> Copy Email Draft</button><textarea readOnly value={touchpoint.follow_up_text || ''} /><button className="btn ghost" onClick={() => copyText(touchpoint.follow_up_text || '', touchpoint.id, 'student_touchpoints')}><Copy size={15} /> Copy Text Draft</button></details></div>)}</section>
          </div>
          <aside className="student-work-side">
            <section className="panel"><h2>Add Touchpoint</h2><div className="form-grid"><select value={touchForm.touchpoint_type} onChange={(e) => setTouchForm({ ...touchForm, touchpoint_type: e.target.value })}>{touchpointTypes.map((type) => <option key={type}>{type}</option>)}</select><input type="date" value={touchForm.touchpoint_date} onChange={(e) => setTouchForm({ ...touchForm, touchpoint_date: e.target.value })} /><input placeholder="Course" value={touchForm.course || selected.course || ''} onChange={(e) => setTouchForm({ ...touchForm, course: e.target.value })} /><input placeholder="Momentum" value={touchForm.momentum} onChange={(e) => setTouchForm({ ...touchForm, momentum: e.target.value })} /></div><label className="date-field"><span>Next call with this student (optional)</span><input type="datetime-local" value={touchForm.next_call_at} onChange={(e) => setTouchForm({ ...touchForm, next_call_at: e.target.value })} /></label><textarea placeholder="What happened? What did the student say? What is the next step?" value={touchForm.note} onChange={(e) => setTouchForm({ ...touchForm, note: e.target.value })} />{ferpaWarnings(touchForm.note).length > 0 && <FerpaWarning warnings={ferpaWarnings(touchForm.note)} />}<div className="form-actions"><button className="btn primary" onClick={submitTouchpoint}><Save size={15} /> Save Touchpoint + Generate Prep</button></div></section>
          </aside>
        </div>
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
  const events = timelineForStudent(student, touchpoints).slice(0, 12);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const touchpointDates = new Set(touchpoints.map((t) => t.touchpoint_date).filter(Boolean));
  return <section className="panel">
    <div className="panel-head">
      <h2>Student Timeline</h2>
      <button className="readonly-pill timeline-cal-btn" onClick={() => setCalendarOpen(!calendarOpen)} aria-expanded={calendarOpen}>
        <CalendarDays size={14} /> {touchpointDates.size} touchpoint{touchpointDates.size === 1 ? '' : 's'}
      </button>
    </div>
    {calendarOpen && <TouchpointCalendar dates={touchpointDates} />}
    {events.length === 0 && <div className="brief-item">No timeline events yet.</div>}
    {events.map((event) => <details className={`timeline-item-collapsible ${event.kind}`} key={event.id}>
      <summary><span className="timeline-date">{event.date}</span> <strong>{event.title}</strong></summary>
      <p>{event.detail}</p>
    </details>)}
  </section>;
}

function TouchpointCalendar({ dates }: { dates: Set<string> }) {
  // Determine the latest touchpoint to anchor the calendar view; default to today.
  const sorted = [...dates].sort();
  const initialMonth = (() => {
    const last = sorted[sorted.length - 1];
    const d = last ? new Date(last + 'T00:00:00') : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  })();
  const [view, setView] = useState(initialMonth);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const firstDay = new Date(view.year, view.month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();

  function shift(delta: number) {
    let m = view.month + delta;
    let y = view.year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setView({ year: y, month: m });
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthKey = `${view.year}-${String(view.month + 1).padStart(2, '0')}`;

  return <div className="touchpoint-calendar">
    <div className="touchpoint-calendar-head">
      <button type="button" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
      <strong>{monthNames[view.month]} {view.year}</strong>
      <button type="button" onClick={() => shift(1)} aria-label="Next month">›</button>
    </div>
    <div className="touchpoint-calendar-grid">
      {['S','M','T','W','T','F','S'].map((d, i) => <span key={`hdr-${i}`} className="touchpoint-calendar-dow">{d}</span>)}
      {cells.map((d, i) => {
        if (d === null) return <span key={`empty-${i}`} className="touchpoint-calendar-cell empty" />;
        const iso = `${monthKey}-${String(d).padStart(2, '0')}`;
        const hit = dates.has(iso);
        return <span key={iso} className={`touchpoint-calendar-cell ${hit ? 'has-touchpoint' : ''}`} title={hit ? `Touchpoint on ${iso}` : iso}>{d}</span>;
      })}
    </div>
    <p className="touchpoint-calendar-legend"><span className="touchpoint-calendar-dot" /> Day with a logged touchpoint</p>
  </div>;
}

function FerpaWarning({ warnings }: { warnings: string[] }) {
  return <div className="ferpa-warning"><AlertTriangle size={16} /><div><strong>FERPA guardrail check</strong><p>{warnings.join(' · ')}</p></div></div>;
}

function SettingsPage({ permissions, updatePermission }: { permissions: ModulePermission[]; updatePermission: (module_name: string, access_level: AccessLevel) => void }) {
  function accessFor(module_name: string) {
    return permissions.find((permission) => permission.module_name === module_name)?.access_level || 'hidden';
  }

  async function reconnectGoogle() {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-auth`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const { url } = await resp.json();
    if (url) window.location.href = url;
  }

  return <><Header title="Settings" sub="Control Adam's Home-side access as the app grows." /><section className="panel"><h2>Google Connection</h2><p className="settings-intro">Reconnect Google to pick up new permissions (like Contacts). You'll see Google's consent screen and be returned here automatically.</p><button className="btn primary" onClick={reconnectGoogle}>Reconnect Google Account</button></section><section className="panel"><h2>Adam section access</h2><p className="settings-intro">Adam never sees Work mode or Students. For Home sections, choose Hidden, View Only, or Edit. This avoids confusing combinations like edit without view.</p><div className="permission-list">{moduleMeta.filter((item) => item.page !== 'students').map((item) => {
    const current = accessFor(item.module_name);
    return <div className="permission-row" key={item.module_name}><div><strong>{item.label}</strong><p>{current === 'hidden' ? 'Hidden from Adam' : current === 'view' ? 'Visible · View-only' : 'Visible · Editable'}</p></div><label className="switch-row"><Eye size={15} /> Adam Access <select value={current} onChange={(e) => updatePermission(item.module_name, e.target.value as AccessLevel)}><option value="hidden">Hidden</option><option value="view">View Only</option><option value="edit">Edit</option></select></label></div>;
  })}</div></section><section className="panel"><h2>Access rules</h2><div className="brief-item"><strong>Kaylee:</strong> admin, full Home + Work access.</div><div className="brief-item"><strong>Adam:</strong> Home only. Hidden means no sidebar item. View Only means no add/save/edit buttons. Edit means full access.</div><div className="brief-item"><strong>Students:</strong> always admin-only and FERPA-safe.</div></section></>;
}

function Outreach({ drafts, students, generateCohortDrafts, updateDraft, markDraftSent, deleteDraft }: {
  drafts: EmailDraft[];
  students: Student[];
  generateCohortDrafts: (cohort: string, cohortLabel: string, kind: string) => void;
  updateDraft: (id: string, patch: Partial<EmailDraft>) => void;
  markDraftSent: (id: string) => void;
  deleteDraft: (id: string) => void;
}) {
  const [cohort, setCohort] = useState('high_risk');
  const [kind, setKind] = useState('check_in');
  const [courseCode, setCourseCode] = useState('');
  const [filter, setFilter] = useState<'pending' | 'sent' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<{ subject: string; body: string }>({ subject: '', body: '' });

  const cohortOptions: { value: string; label: string }[] = [
    { value: 'high_risk', label: 'All High Risk' },
    { value: 'ghost', label: 'Ghost risk (3+ missed)' },
    { value: 'no_contact_14', label: 'No contact in 14+ days' },
    { value: 'course_ending', label: 'Course ending in 30 days' },
    { value: 'course', label: 'Specific course code…' },
    { value: 'all_active', label: 'All active students' }
  ];
  const kindOptions: { value: string; label: string }[] = [
    { value: 'check_in', label: 'Generic check-in' },
    { value: 'ghost', label: 'Ghost outreach' },
    { value: 'high_risk', label: 'High-risk plan' },
    { value: 'course_ending', label: 'Course ending soon' },
    { value: 'no_contact_14', label: 'No contact 14+ days' },
    { value: 'win', label: 'Recognize a win' }
  ];

  function studentName(id: string | null) {
    if (!id) return 'Unknown';
    const s = students.find((st) => st.id === id);
    return s ? s.display_name : 'Unknown';
  }
  function studentEmail(id: string | null) {
    if (!id) return '';
    return students.find((st) => st.id === id)?.email || '';
  }
  function studentMeta(id: string | null) {
    const s = students.find((st) => st.id === id);
    if (!s) return '';
    return `${s.student_id ? `ID ${s.student_id} · ` : ''}${s.course || 'No course'} · ${s.status}`;
  }

  const filtered = useMemo(() => {
    return drafts.filter((d) => {
      if (filter === 'pending' && d.status !== 'pending') return false;
      if (filter === 'sent' && d.status !== 'sent') return false;
      if (search) {
        const name = studentName(d.student_id).toLowerCase();
        const s = search.toLowerCase();
        if (!name.includes(s) && !(d.subject || '').toLowerCase().includes(s) && !(d.cohort_label || '').toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [drafts, filter, search, students]);

  function runGenerate() {
    const actualCohort = cohort === 'course' ? `course:${courseCode.trim()}` : cohort;
    const label = cohort === 'course' ? `Course ${courseCode.toUpperCase()}` : (cohortOptions.find((c) => c.value === cohort)?.label || cohort);
    generateCohortDrafts(actualCohort, label, kind);
  }

  function startEdit(d: EmailDraft) {
    setEditingId(d.id);
    setEditBuffer({ subject: d.subject, body: d.body });
  }
  function saveEdit(id: string) {
    updateDraft(id, { subject: editBuffer.subject, body: editBuffer.body, edited: true });
    setEditingId(null);
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard?.writeText(text);
  }

  return <>
    <Header title="Outreach Drafts" sub="Generate cohort-based email drafts, review and edit, then copy into Outlook to send. Marking a draft sent auto-logs a touchpoint." />
    <section className="panel">
      <h2>Generate cohort drafts</h2>
      <div className="form-grid">
        <label className="date-field"><span>Cohort</span>
          <select value={cohort} onChange={(e) => setCohort(e.target.value)}>
            {cohortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="date-field"><span>Email template</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {kindOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {cohort === 'course' && <input placeholder="Course code, e.g. D316" value={courseCode} onChange={(e) => setCourseCode(e.target.value)} />}
      </div>
      <div className="form-actions">
        <button className="btn primary" onClick={runGenerate}><Sparkles size={15} /> Generate drafts</button>
      </div>
    </section>

    <section className="panel">
      <div className="panel-head">
        <h2>Draft inbox ({filtered.length})</h2>
        <div className="actions">
          <select value={filter} onChange={(e) => setFilter(e.target.value as 'pending' | 'sent' | 'all')}>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="all">All</option>
          </select>
          <input placeholder="Search name, subject, cohort" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      {filtered.length === 0 && <div className="brief-item">No drafts match. Generate a cohort batch above or draft directly from a student profile.</div>}
      {filtered.map((d) => {
        const isEditing = editingId === d.id;
        const email = studentEmail(d.student_id);
        return <div className="touchpoint-card" key={d.id}>
          <div className="panel-head">
            <div>
              <strong>{studentName(d.student_id)}</strong>
              <p>{studentMeta(d.student_id)} · {d.cohort_label || 'single'} · {d.template_kind}{d.edited ? ' · edited' : ''}{d.status === 'sent' ? ` · sent ${d.sent_at ? new Date(d.sent_at).toLocaleString([], { month: 'short', day: 'numeric' }) : ''}` : ''}</p>
            </div>
            <Mail size={17} />
          </div>
          {email ? <p style={{ fontSize: 13, color: 'var(--muted, #888)' }}>To: {email}</p> : <p style={{ fontSize: 13, color: '#c44' }}>No email on file — add one on the student profile before sending.</p>}
          {isEditing ? <>
            <input value={editBuffer.subject} onChange={(e) => setEditBuffer({ ...editBuffer, subject: e.target.value })} />
            <textarea value={editBuffer.body} onChange={(e) => setEditBuffer({ ...editBuffer, body: e.target.value })} rows={10} />
            <div className="form-actions">
              <button className="btn primary" onClick={() => saveEdit(d.id)}><Save size={15} /> Save edits</button>
              <button className="btn ghost" onClick={() => setEditingId(null)}>Cancel</button>
            </div>
          </> : <>
            <p><strong>Subject:</strong> {d.subject}</p>
            <details open><summary>Email body</summary><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14 }}>{d.body}</pre></details>
            <div className="form-actions">
              <button className="btn primary" onClick={() => copyToClipboard(`Subject: ${d.subject}\n\n${d.body}`)}><Copy size={15} /> Copy subject + body</button>
              <button className="btn ghost" onClick={() => copyToClipboard(d.body)}><Copy size={15} /> Copy body only</button>
              {d.status === 'pending' && <button className="btn ghost" onClick={() => startEdit(d)}><Edit3 size={15} /> Edit</button>}
              {d.status === 'pending' && <button className="btn primary" onClick={() => markDraftSent(d.id)}><Send size={15} /> Mark sent</button>}
              <button className="btn warning" onClick={() => { if (confirm('Delete this draft?')) deleteDraft(d.id); }}><Trash2 size={15} /> Delete</button>
            </div>
          </>}
        </div>;
      })}
    </section>
  </>;
}

type ChoresViewMode = 'mine' | 'adam' | 'approval';

function Chores({
  choreTasks, choreSuggestions, syncState, syncing, householdUsers, currentUserName,
  syncTodoistNow, completeChore, uncompleteChore,
  markSuggestionDone, snoozeSuggestion, dismissSuggestion, restoreSuggestion,
  addSuggestionToTodoist, approveSuggestionForAdam, approveSuggestionForSelf, reassignChore,
  editable
}: {
  choreTasks: ChoreTask[];
  choreSuggestions: ChoreSuggestion[];
  syncState: TodoistSyncState | null;
  syncing: boolean;
  householdUsers: HouseholdUser[];
  currentUserName: string;
  syncTodoistNow: () => void;
  completeChore: (id: string) => void;
  uncompleteChore: (id: string) => void;
  markSuggestionDone: (id: string) => void;
  snoozeSuggestion: (id: string, days: number) => void;
  dismissSuggestion: (id: string) => void;
  restoreSuggestion: (id: string) => void;
  addSuggestionToTodoist: (id: string, assigneeTodoistId?: string | null) => void;
  approveSuggestionForAdam: (id: string) => void;
  approveSuggestionForSelf: (id: string) => void;
  reassignChore: (choreId: string, toUserName: 'Kaylee' | 'Adam') => void;
  editable: boolean;
}) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [openKeys, setOpenKeys] = useState<Set<string> | null>(null); // null = not yet initialized
  const [view, setView] = useState<ChoresViewMode>('mine');

  const monthNow = new Date().getMonth() + 1;

  const kaylee = householdUsers.find((u) => u.name.toLowerCase() === 'kaylee') ?? null;
  const adam = householdUsers.find((u) => u.name.toLowerCase() === 'adam') ?? null;

  // Split chores by who they're assigned to. Anything with no assignment
  // at all defaults into Kaylee's view, since unassigned Todoist tasks are
  // hers by default until she delegates them.
  const myChores = useMemo(() => {
    if (!kaylee) return choreTasks.filter((c) => !c.assigned_to);
    return choreTasks.filter((c) => c.assigned_to === kaylee.id || !c.assigned_to);
  }, [choreTasks, kaylee]);

  const adamChores = useMemo(() => {
    if (!adam) return [];
    return choreTasks.filter((c) => c.assigned_to === adam.id);
  }, [choreTasks, adam]);

  // Recently-escalated chores: were Adam's, auto-moved to Kaylee for being
  // 3+ days overdue. Surfaced as a callout at the top of "My Tasks".
  const escalatedToMe = useMemo(() => {
    return choreTasks.filter((c) => c.escalation_note && kaylee && c.assigned_to === kaylee.id);
  }, [choreTasks, kaylee]);

  // Suggestions worth reviewing: in-season AND pending (or overdue), same
  // logic as before, just now feeding the "Needs Approval" tab instead of
  // a fixed "this month" panel.
  const reviewSuggestions = useMemo(() => {
    const now = Date.now();
    return choreSuggestions.filter((s) => {
      if (s.status === 'dismissed') return false;
      if (s.status === 'done') return false;
      if (s.status === 'added') return false;
      if (s.status === 'snoozed') {
        if (!s.snoozed_until) return false;
        if (new Date(s.snoozed_until).getTime() > now) return false;
      }
      const inSeason = !s.month_triggers || s.month_triggers.length === 0 || s.month_triggers.includes(monthNow);
      const isOverdue = s.next_due_at ? new Date(s.next_due_at).getTime() < now : false;
      return inSeason || isOverdue;
    });
  }, [choreSuggestions, monthNow]);

  const activeList = view === 'mine' ? myChores : view === 'adam' ? adamChores : [];
  const dateBuckets = useMemo(() => groupChoresByDate(activeList, showCompleted), [activeList, showCompleted]);

  // Auto-expand Today + any overdue buckets the first time buckets compute
  // for the CURRENT view; resets when switching views so each tab starts
  // with a sensible default instead of carrying over the other tab's state.
  useEffect(() => {
    setOpenKeys(null);
  }, [view]);

  useEffect(() => {
    if (openKeys !== null) return;
    const initial = new Set<string>();
    for (const bucket of dateBuckets) {
      if (bucket.isToday || bucket.isOverdue) initial.add(bucket.key);
    }
    setOpenKeys(initial);
  }, [dateBuckets, openKeys]);

  function toggleKey(key: string) {
    setOpenKeys((current) => {
      const next = new Set(current ?? []);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const lastSyncLabel = syncState?.last_sync_at
    ? new Date(syncState.last_sync_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'never';

  return <>
    <Header title="Chores & Tasks" sub="Synced with Todoist.">
      {editable
        ? <button className="btn primary" onClick={syncTodoistNow} disabled={syncing}>
            <RefreshCw size={15} className={syncing ? 'spin' : ''} /> {syncing ? 'Syncing…' : 'Sync from Todoist'}
          </button>
        : <span className="readonly-pill"><Eye size={14} /> View only</span>}
    </Header>

    <div className="last-sync-line">
      <RefreshCw size={12} />
      Last sync: {lastSyncLabel} · auto-syncs every 15 min
      {syncState?.last_sync_status && syncState.last_sync_status !== 'success' && syncState.last_sync_status !== 'never' && (
        <span className={`last-sync-status ${syncState.last_sync_status}`}>· {syncState.last_sync_status}</span>
      )}
    </div>

    {syncState?.last_sync_status === 'error' && syncState?.last_sync_error && <section className="panel suggestion urgent">
      <h2>Last sync failed</h2>
      <p>{syncState.last_sync_error}</p>
      <small>Make sure TODOIST_API_TOKEN is set in Supabase function secrets, then click Sync again.</small>
    </section>}

    {/* ============ 3-WAY TOGGLE ============ */}
    <div className="view-toggle">
      <button className={view === 'mine' ? 'active' : ''} onClick={() => setView('mine')}>
        My Tasks{myChores.length > 0 ? ` (${myChores.filter((c) => !c.is_completed).length})` : ''}
      </button>
      <button className={view === 'adam' ? 'active' : ''} onClick={() => setView('adam')}>
        Adam's Tasks{adamChores.length > 0 ? ` (${adamChores.filter((c) => !c.is_completed).length})` : ''}
      </button>
      <button className={view === 'approval' ? 'active' : ''} onClick={() => setView('approval')}>
        Needs Approval{reviewSuggestions.length > 0 ? ` (${reviewSuggestions.length})` : ''}
      </button>
    </div>

    {/* ============ ESCALATION CALLOUT (My Tasks only) ============ */}
    {view === 'mine' && escalatedToMe.length > 0 && <section className="panel suggestion urgent">
      <div className="panel-head">
        <h2><AlertTriangle size={16} style={{ verticalAlign: 'text-bottom' }} /> Moved from Adam</h2>
        <span className="readonly-pill">{escalatedToMe.length} task{escalatedToMe.length === 1 ? '' : 's'}</span>
      </div>
      {escalatedToMe.map((c) => (
        <div className="brief-item" key={c.id}><strong>{c.name}</strong> — {c.escalation_note}</div>
      ))}
    </section>}

    {/* ============ NEEDS APPROVAL TAB ============ */}
    {view === 'approval' && <section className="panel">
      <div className="panel-head">
        <h2>Review &amp; Approve</h2>
        <span className="readonly-pill">{reviewSuggestions.length} suggestion{reviewSuggestions.length === 1 ? '' : 's'}</span>
      </div>
      <p style={{ color: 'var(--muted, #888)', fontSize: 13, marginTop: -8 }}>
        Things the Hub thinks are worth doing soon. Send a task to Adam, or take it yourself if it's a better fit for you.
      </p>
      {reviewSuggestions.length === 0 && <div className="brief-item">Nothing waiting on review right now.</div>}
      <div className="grid two" style={{ gap: 12 }}>
        {reviewSuggestions.map((s) => <ApprovalSuggestionCard
          key={s.id}
          suggestion={s}
          editable={editable}
          adamAvailable={Boolean(adam?.todoist_id)}
          onSendToAdam={() => approveSuggestionForAdam(s.id)}
          onTakeForSelf={() => approveSuggestionForSelf(s.id)}
          onDone={() => markSuggestionDone(s.id)}
          onSnooze={(days) => snoozeSuggestion(s.id, days)}
          onDismiss={() => dismissSuggestion(s.id)}
        />)}
      </div>
    </section>}

    {/* ============ DATE-GROUPED LIST (My Tasks / Adam's Tasks) ============ */}
    {view !== 'approval' && <section className="panel ct-panel">
      <div className="panel-head">
        <h2>{view === 'mine' ? 'My Tasks' : "Adam's Tasks"}</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
          Show completed
        </label>
      </div>
      {dateBuckets.length === 0 && <div className="brief-item">
        {view === 'adam'
          ? "Nothing assigned to Adam right now. Approve a suggestion for him from Needs Approval, or assign a task to him in Todoist."
          : 'Nothing scheduled. Sync Todoist or add tasks there.'}
      </div>}
      {dateBuckets.map((bucket) => {
        const isOpen = openKeys?.has(bucket.key) ?? (bucket.isToday || bucket.isOverdue);
        return <details key={bucket.key} className={`ct-day-group ${bucket.isToday ? 'ct-day-today' : ''} ${bucket.isOverdue ? 'ct-day-overdue' : ''}`} open={isOpen} onToggle={(e) => {
          const nowOpen = (e.target as HTMLDetailsElement).open;
          if (nowOpen !== isOpen) toggleKey(bucket.key);
        }}>
          <summary className="ct-day-summary">
            <strong>{bucket.label}</strong>
            <span className="ct-day-count">{bucket.chores.length}</span>
          </summary>
          <div className="ct-list">
            {bucket.chores.map((chore) => {
              const props = choreToRowProps(chore, bucket.isToday);
              return <div className="ct-row-with-action" key={chore.id}>
                <CompactTaskRow
                  {...props}
                  editable={editable}
                  onToggle={() => chore.is_completed ? uncompleteChore(chore.id) : completeChore(chore.id)}
                />
                {editable && view === 'adam' && !chore.is_completed && (
                  <button
                    className="btn ghost tiny ct-take-button"
                    onClick={() => reassignChore(chore.id, 'Kaylee')}
                    title="Take this task yourself instead of Adam"
                  >
                    I'll do this
                  </button>
                )}
              </div>;
            })}
          </div>
        </details>;
      })}
    </section>}
  </>;
}

function ApprovalSuggestionCard({ suggestion, editable, adamAvailable, onSendToAdam, onTakeForSelf, onDone, onSnooze, onDismiss }: {
  suggestion: ChoreSuggestion;
  editable: boolean;
  adamAvailable: boolean;
  onSendToAdam: () => void;
  onTakeForSelf: () => void;
  onDone: () => void;
  onSnooze: (days: number) => void;
  onDismiss: () => void;
}) {
  const iconMap: Record<string, React.ElementType> = {
    homeowner: Home, vehicle: Car, tool: Wrench, dog: Bone,
    garden: Flower2, preserving: Archive, safety: ShieldCheck, seasonal: Sun
  };
  const Icon = iconMap[suggestion.category] || Home;
  return <div className="brief-item" style={{ padding: 12 }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <Icon size={20} style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <strong>{suggestion.title}</strong>
        <p style={{ fontSize: 13, margin: '4px 0' }}>{suggestion.why_it_matters || suggestion.description}</p>
        <small>{suggestion.estimated_minutes} min · {suggestion.effort_level} · {suggestion.frequency}</small>
        {editable && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          <button className="btn primary tiny" onClick={onSendToAdam} disabled={!adamAvailable} title={adamAvailable ? 'Send to Adam in Todoist' : "Adam's Todoist ID isn't set up yet"}>
            <Send size={12} /> Send to Adam
          </button>
          <button className="btn ghost tiny" onClick={onTakeForSelf}><CheckCircle2 size={12} /> I'll do this instead</button>
          <button className="btn ghost tiny" onClick={onDone}><CheckCircle2 size={12} /> Already done</button>
          <button className="btn ghost tiny" onClick={() => onSnooze(30)}><Clock size={12} /> 30d</button>
          <button className="btn ghost tiny" onClick={onDismiss}><Trash2 size={12} /> Skip</button>
        </div>}
      </div>
    </div>
  </div>;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function dateGroupLabel(d: Date, today: Date): string {
  const diffDays = Math.round((startOfDay(d).getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return diffDays === -1 ? 'Yesterday' : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · Overdue`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6
};

/**
 * Estimates a calendar date for chores that don't carry an explicit
 * due_date but do carry a day_of_week section (e.g. a "Monday" section
 * task with no due date set in Todoist). Picks the next upcoming occurrence
 * of that weekday, or today if day_of_week is "Daily".
 */
function estimateDateFromDayOfWeek(dayOfWeek: string, today: Date): Date | null {
  if (dayOfWeek === 'Daily') return today;
  if (dayOfWeek === 'Weekend') {
    const dow = today.getDay();
    const toSat = (6 - dow + 7) % 7;
    return addDays(today, toSat);
  }
  const idx = WEEKDAY_INDEX[dayOfWeek];
  if (idx === undefined) return null;
  const dow = today.getDay();
  const diff = (idx - dow + 7) % 7;
  return addDays(today, diff);
}

/**
 * Groups chores by actual calendar date — Today, Tomorrow, named weekdays,
 * then a far-future bucket — the way Todoist's Upcoming view works, rather
 * than by static Todoist section name. Chores with no real due date but a
 * day_of_week section get slotted into their next likely occurrence so they
 * still show up somewhere sensible. Anything with neither lands in "No date".
 */
function groupChoresByDate(choreTasks: ChoreTask[], showCompleted: boolean): { key: string; label: string; chores: ChoreTask[]; isToday: boolean; isOverdue: boolean }[] {
  const today = startOfDay(new Date());
  const buckets = new Map<string, { date: Date | null; chores: ChoreTask[] }>();

  for (const chore of choreTasks) {
    if (!showCompleted && chore.is_completed) continue;

    let bucketDate: Date | null = null;
    if (chore.due_date) {
      bucketDate = startOfDay(new Date(chore.due_date));
    } else if (chore.day_of_week && chore.day_of_week !== 'Anytime' && chore.day_of_week !== 'Monthly' && chore.day_of_week !== 'Jules') {
      bucketDate = estimateDateFromDayOfWeek(chore.day_of_week, today);
    }

    const key = bucketDate ? bucketDate.toISOString().slice(0, 10) : 'no-date';
    if (!buckets.has(key)) buckets.set(key, { date: bucketDate, chores: [] });
    buckets.get(key)!.chores.push(chore);
  }

  const result: { key: string; label: string; chores: ChoreTask[]; isToday: boolean; isOverdue: boolean; sortKey: number }[] = [];
  for (const [key, bucket] of buckets.entries()) {
    const sorted = bucket.chores.sort((a, b) => (b.priority || 1) - (a.priority || 1));
    if (key === 'no-date') {
      result.push({ key, label: 'No date', chores: sorted, isToday: false, isOverdue: false, sortKey: Number.MAX_SAFE_INTEGER });
      continue;
    }
    const d = bucket.date!;
    const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000);
    result.push({
      key,
      label: dateGroupLabel(d, today),
      chores: sorted,
      isToday: diffDays === 0,
      isOverdue: diffDays < 0,
      sortKey: diffDays
    });
  }

  result.sort((a, b) => a.sortKey - b.sortKey);
  return result.map(({ sortKey, ...rest }) => rest);
}

function Placeholder({ title, sub }: { title: string; sub: string }) {
  return <section className="panel"><h2>{title}</h2><p>{sub}</p></section>;
}

export default App;
