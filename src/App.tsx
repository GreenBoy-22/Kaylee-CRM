import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Home, Users, LayoutDashboard, ClipboardCheck, Sparkles, CalendarDays, WalletCards,
  Inbox, ListTodo, ShieldCheck, Car, Plus, Copy, RefreshCw, Settings, LogOut,
  Lock, Eye, EyeOff, Save, Minus
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

type SectionPermission = {
  id?: string;
  user_key: string;
  section_key: Page;
  label: string;
  can_view: boolean;
  can_edit: boolean;
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
  display_name: string;
  goal: string;
  risk: string;
  copied: boolean;
  grow_note: string;
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

const configurableHomeSections = homeNav.filter(([id]) => id !== 'dashboard') as readonly NavEntry[];

const defaultAdamPermissions: SectionPermission[] = configurableHomeSections.map(([section_key, label]) => ({
  user_key: 'adam',
  section_key,
  label,
  can_view: true,
  can_edit: false
}));

const seedInventory: InventoryItem[] = [
  { id: 'i1', name: 'Chicken broth', brand: 'Swanson', location: 'Indoor Pantry', category: 'Food', quantity: 3, expires: '2026-07-03', value: 8.97, barcode: 'seed-1' },
  { id: 'i2', name: 'Laundry detergent', brand: 'Tide', location: 'Laundry Room', category: 'Cleaning', quantity: 1, expires: null, value: 18.99, barcode: 'seed-2' },
  { id: 'i3', name: 'Air fryer', brand: 'Ninja', location: 'Kitchen', category: 'Appliance', quantity: 1, expires: null, value: 129, barcode: 'seed-3' },
  { id: 'i4', name: 'Greek yogurt', brand: 'Chobani', location: 'Fridge', category: 'Food', quantity: 2, expires: '2026-06-19', value: 11.98, barcode: 'seed-4' }
];

const seedStudents: Student[] = [
  { id: 's1', display_name: 'Andrea', goal: 'Finish current study plan checkpoint', risk: 'Watch', copied: false, grow_note: 'Goal: complete D316 checkpoint. Reality: already on study plan. Options: keep steady pace and use course resources. Will: send update by Friday.' },
  { id: 's2', display_name: 'A.', goal: 'Increase weekly study time', risk: 'Support', copied: true, grow_note: 'Goal: get back on track. Reality: progress slowed. Options: block study time and ask for help early. Will: set aside focused study this week.' }
];

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
  const [tasks, setTasks] = useState<TaskItem[]>(seedTasks);
  const [permissions, setPermissions] = useState<SectionPermission[]>(defaultAdamPermissions);
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
      const [invResult, studentResult, taskResult, permissionResult] = await Promise.all([
        supabase.from('inventory_items').select('*').order('created_at', { ascending: false }),
        supabase.from('students').select('*').order('created_at', { ascending: false }),
        supabase.from('tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('section_permissions').select('*').eq('user_key', 'adam').order('section_key', { ascending: true })
      ]);

      if (!invResult.error && invResult.data) setInventory(invResult.data as InventoryItem[]);
      if (!studentResult.error && studentResult.data) setStudents(studentResult.data as Student[]);
      if (!taskResult.error && taskResult.data) setTasks(taskResult.data as TaskItem[]);
      if (!permissionResult.error && permissionResult.data && permissionResult.data.length) {
        setPermissions(mergePermissions(permissionResult.data as SectionPermission[]));
      }
      setMessage('Supabase data loaded.');
    } catch (error) {
      setMessage('Could not load Supabase data. Using starter data.');
    } finally {
      setLoading(false);
    }
  }

  function mergePermissions(rows: SectionPermission[]) {
    return defaultAdamPermissions.map((fallback) => rows.find((row) => row.section_key === fallback.section_key) || fallback);
  }

  function isAdmin() {
    return profile?.role === 'admin';
  }

  function permissionFor(section: Page) {
    if (isAdmin()) return { can_view: true, can_edit: true };
    if (section === 'dashboard') return { can_view: true, can_edit: false };
    return permissions.find((permission) => permission.section_key === section) || { can_view: true, can_edit: false };
  }

  function canView(section: Page) {
    if (isAdmin()) return true;
    if (mode === 'work') return false;
    return permissionFor(section).can_view;
  }

  function canEdit(section: Page) {
    if (isAdmin()) return true;
    if (mode === 'work') return false;
    return permissionFor(section).can_edit;
  }

  async function updatePermission(section_key: Page, patch: Partial<SectionPermission>) {
    const existing = permissions.find((permission) => permission.section_key === section_key);
    if (!existing || !isAdmin()) return;
    const next = { ...existing, ...patch };
    setPermissions((current) => current.map((permission) => permission.section_key === section_key ? next : permission));

    if (!supabase) return setMessage('Permission saved locally.');
    const { error } = await supabase
      .from('section_permissions')
      .upsert({ user_key: 'adam', section_key: section_key, label: next.label, can_view: next.can_view, can_edit: next.can_edit }, { onConflict: 'user_key,section_key' });
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

  async function createStudent(student: Omit<Student, 'id' | 'copied'>) {
    if (!isAdmin()) return setMessage('Student records are admin-only.');
    const optimistic = { ...student, copied: false, id: crypto.randomUUID() };
    setStudents((current) => [optimistic, ...current]);
    if (!supabase) return setMessage('Saved locally. Add Supabase env vars + schema to persist.');

    const { data, error } = await supabase.from('students').insert({ ...student, copied: false }).select().single();
    if (error) return setMessage(`Student save failed: ${error.message}`);
    setStudents((current) => [data as Student, ...current.filter((s) => s.id !== optimistic.id)]);
    setMessage('Student saved to Supabase.');
  }

  async function markStudentCopied(id: string, note: string) {
    if (!isAdmin()) return;
    await navigator.clipboard?.writeText(note);
    setStudents((current) => current.map((student) => student.id === id ? { ...student, copied: true } : student));
    if (!supabase) return;
    const { error } = await supabase.from('students').update({ copied: true }).eq('id', id);
    if (error) setMessage(`Copy status update failed: ${error.message}`);
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
              <Icon size={16} /><span>{label}</span>{activeRole === 'limited' && id !== 'dashboard' && !permissionFor(id).can_edit && <Lock size={13} className="nav-lock" />}
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
          {page === 'dashboard' && <Dashboard mode={activeRole === 'limited' ? 'home' : mode} inventory={inventory} students={students} tasks={tasks} role={activeRole} />}
          {page === 'today' && <Today tasks={tasks.filter((task) => activeRole === 'admin' || task.mode === 'home')} completeTask={completeTask} editable={canEdit('today')} />}
          {page === 'briefing' && <Briefing />}
          {page === 'calendar' && <Placeholder title="Calendar" sub="Google Calendar integration will connect here after auth basics are stable." />}
          {page === 'budget' && <Placeholder title="Budget" sub={activeRole === 'limited' ? 'Kaylee controls whether this is visible/editable for Adam.' : 'Calendar-based cashflow page scaffold.'} />}
          {page === 'inventory' && <Inventory inventory={inventory} createItem={createInventoryItem} updateQuantity={updateInventoryQuantity} editable={canEdit('inventory')} />}
          {page === 'chores' && <Placeholder title="Chores & Tasks" sub="Todoist integration will connect here." />}
          {page === 'adam' && <Adam editable={canEdit('adam')} />}
          {page === 'vehicles' && <Vehicles />}
          {page === 'suggestions' && <Suggestions editable={canEdit('suggestions')} />}
          {page === 'students' && activeRole === 'admin' && <Students students={students} createStudent={createStudent} markCopied={markStudentCopied} />}
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

function Dashboard({ mode, inventory, students, tasks, role }: { mode: Mode; inventory: InventoryItem[]; students: Student[]; tasks: TaskItem[]; role: Role }) {
  const expiring = inventory.filter((item) => item.expires).length;
  const pending = tasks.filter((task) => task.status === 'pending_approval').length;
  return <>
    <Header title={role === 'limited' ? 'Adam home dashboard' : mode === 'home' ? 'Home command center' : 'Work command center'} sub={role === 'limited' ? 'Home-only view. Kaylee controls which sections are editable.' : mode === 'home' ? 'Tasks, approvals, inventory, vehicles, and tenant-safe home care.' : 'FERPA-safe student workflow, GROW notes, and daily planning.'} />
    <Stats items={mode === 'home' ? [['Open tasks', String(tasks.filter((task) => task.status !== 'completed' && task.mode === 'home').length), 'home'], ['Adam pending', String(pending), 'approval needed'], ['Inventory', String(inventory.length), `${expiring} expiring`], ['Vehicle alerts', '4', 'critical/due']] : [['Students', String(students.length), 'FERPA-safe'], ['Need copy', String(students.filter((s) => !s.copied).length), 'Salesforce'], ['FERPA', 'On', 'clipboard only'], ['Calls today', '0', 'Outlook later']]} />
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

function Students({ students, createStudent, markCopied }: { students: Student[]; createStudent: (student: Omit<Student, 'id' | 'copied'>) => void; markCopied: (id: string, note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ display_name: '', goal: '', risk: 'Watch', grow_note: '' });
  function submit() {
    createStudent(form);
    setForm({ display_name: '', goal: '', risk: 'Watch', grow_note: '' });
    setOpen(false);
  }
  return <><Header title="Students" sub="FERPA-safe GROW notes. First name/nickname only. Clipboard copy only."><button className="btn primary" onClick={() => setOpen(!open)}><Plus size={15} /> Add Student</button></Header>{open && <section className="panel"><h2>Add student</h2><div className="form-grid"><input placeholder="First name or nickname only" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /><input placeholder="Goal" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} /><input placeholder="Risk level" value={form.risk} onChange={(e) => setForm({ ...form, risk: e.target.value })} /></div><textarea placeholder="GROW note" value={form.grow_note} onChange={(e) => setForm({ ...form, grow_note: e.target.value })} /><div className="form-actions"><button className="btn primary" onClick={submit}><Save size={15} /> Save Student</button></div></section>}<div className="grid two">{students.map((student) => <section className="panel" key={student.id}><div className="panel-head"><h2>{student.display_name}</h2><span className={`copy-pill ${student.copied ? 'done' : ''}`}>{student.copied ? 'Copied' : 'Needs copy'}</span></div><p>{student.goal}</p><textarea readOnly value={student.grow_note} /><button className="btn primary" onClick={() => markCopied(student.id, student.grow_note)}><Copy size={15} /> Copy to Salesforce</button></section>)}</div></>;
}

function SettingsPage({ permissions, updatePermission }: { permissions: SectionPermission[]; updatePermission: (section: Page, patch: Partial<SectionPermission>) => void }) {
  return <><Header title="Settings" sub="Control Adam's Home-side access as the app grows." /><section className="panel"><h2>Adam section access</h2><p className="settings-intro">Adam never sees Work mode. For Home sections, keep View on if he can see it. Turn Edit on only when he should be able to change or complete things.</p><div className="permission-list">{permissions.map((permission) => <div className="permission-row" key={permission.section_key}><div><strong>{permission.label}</strong><p>{permission.can_view ? 'Visible to Adam' : 'Hidden from Adam'} · {permission.can_edit ? 'Editable' : 'View-only'}</p></div><label className="switch-row"><Eye size={15} /> View <input type="checkbox" checked={permission.can_view} onChange={(e) => updatePermission(permission.section_key, { can_view: e.target.checked, can_edit: e.target.checked ? permission.can_edit : false })} /></label><label className="switch-row"><Save size={15} /> Edit <input type="checkbox" checked={permission.can_edit} disabled={!permission.can_view} onChange={(e) => updatePermission(permission.section_key, { can_edit: e.target.checked })} /></label></div>)}</div></section><section className="panel"><h2>Access rules</h2><div className="brief-item"><strong>Kaylee:</strong> admin, full Home + Work access.</div><div className="brief-item"><strong>Adam:</strong> Home only. Can see sections when View is on. Can edit only when Edit is on.</div><div className="brief-item"><strong>Students:</strong> always admin-only and FERPA-safe.</div></section></>;
}

function Placeholder({ title, sub }: { title: string; sub: string }) {
  return <section className="panel"><h2>{title}</h2><p>{sub}</p></section>;
}

export default App;
