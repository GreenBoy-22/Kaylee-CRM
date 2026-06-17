import { useEffect, useMemo, useState } from 'react';
import {
  Home, Users, LayoutDashboard, ClipboardCheck, Sparkles, CalendarDays, WalletCards,
  Inbox, ListTodo, ShieldCheck, Car, Plus, Copy, Save, Minus, Trash2, RefreshCw
} from 'lucide-react';
import { supabase, hasSupabase } from './lib/supabase';

type Mode = 'home' | 'work';
type Page = 'dashboard' | 'today' | 'briefing' | 'calendar' | 'budget' | 'inventory' | 'chores' | 'adam' | 'vehicles' | 'suggestions' | 'students';
type Priority = 'urgent' | 'warning' | 'normal' | 'good';
type InventoryAction = 'none' | 'scanAdd' | 'manual' | 'scanUse';

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

function App() {
  const [mode, setMode] = useState<Mode>('home');
  const [page, setPage] = useState<Page>('dashboard');
  const [inventory, setInventory] = useState<InventoryItem[]>(seedInventory);
  const [students, setStudents] = useState<Student[]>(seedStudents);
  const [tasks, setTasks] = useState<TaskItem[]>(seedTasks);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    if (!supabase) return;
    setLoading(true);
    try {
      const [invResult, studentResult, taskResult] = await Promise.all([
        supabase.from('inventory_items').select('*').order('created_at', { ascending: false }),
        supabase.from('students').select('*').order('created_at', { ascending: false }),
        supabase.from('tasks').select('*').order('created_at', { ascending: false })
      ]);

      if (!invResult.error && invResult.data && invResult.data.length > 0) setInventory(invResult.data as InventoryItem[]);
      if (!studentResult.error && studentResult.data && studentResult.data.length > 0) setStudents(studentResult.data as Student[]);
      if (!taskResult.error && taskResult.data && taskResult.data.length > 0) setTasks(taskResult.data as TaskItem[]);

      const errors = [invResult.error, studentResult.error, taskResult.error].filter(Boolean);
      if (errors.length) setMessage('Supabase connected, but one or more tables need the v0.4 schema. Using starter data until then.');
      else setMessage('Supabase data loaded.');
    } catch (error) {
      setMessage('Could not load Supabase data. Using starter data.');
    } finally {
      setLoading(false);
    }
  }

  async function createInventoryItem(item: Omit<InventoryItem, 'id'>) {
    const optimistic = { ...item, id: crypto.randomUUID() };
    setInventory((current) => [optimistic, ...current]);
    if (!supabase) return setMessage('Saved locally. Add Supabase env vars + schema to persist.');

    const { data, error } = await supabase.from('inventory_items').insert(item).select().single();
    if (error) return setMessage(`Inventory save failed: ${error.message}`);
    setInventory((current) => [data as InventoryItem, ...current.filter((i) => i.id !== optimistic.id)]);
    setMessage('Inventory item saved to Supabase.');
  }

  async function updateInventoryQuantity(id: string, quantity: number) {
    const nextQty = Math.max(0, quantity);
    setInventory((current) => current.map((item) => item.id === id ? { ...item, quantity: nextQty } : item));
    if (!supabase) return;
    const { error } = await supabase.from('inventory_items').update({ quantity: nextQty }).eq('id', id);
    if (error) setMessage(`Quantity update failed: ${error.message}`);
  }

  async function createStudent(student: Omit<Student, 'id' | 'copied'>) {
    const optimistic = { ...student, copied: false, id: crypto.randomUUID() };
    setStudents((current) => [optimistic, ...current]);
    if (!supabase) return setMessage('Saved locally. Add Supabase env vars + schema to persist.');

    const { data, error } = await supabase.from('students').insert({ ...student, copied: false }).select().single();
    if (error) return setMessage(`Student save failed: ${error.message}`);
    setStudents((current) => [data as Student, ...current.filter((s) => s.id !== optimistic.id)]);
    setMessage('Student saved to Supabase.');
  }

  async function markStudentCopied(id: string, note: string) {
    await navigator.clipboard?.writeText(note);
    setStudents((current) => current.map((student) => student.id === id ? { ...student, copied: true } : student));
    if (!supabase) return;
    const { error } = await supabase.from('students').update({ copied: true }).eq('id', id);
    if (error) setMessage(`Copy status update failed: ${error.message}`);
  }

  async function completeTask(id: string) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, status: 'completed' } : task));
    if (!supabase) return;
    const { error } = await supabase.from('tasks').update({ status: 'completed' }).eq('id', id);
    if (error) setMessage(`Task update failed: ${error.message}`);
  }

  const navItems = mode === 'home' ? homeNav : workNav;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="logo"><span className="logo-mark">KH</span><span>Kaylee's Hub</span></div>
        <div className="toggle-wrap">
          <button className={mode === 'home' ? 'active' : ''} onClick={() => { setMode('home'); setPage('dashboard'); }}><Home size={15} /> Home</button>
          <button className={mode === 'work' ? 'active' : ''} onClick={() => { setMode('work'); setPage('dashboard'); }}><Users size={15} /> Work</button>
        </div>
        <div className="avatars"><span className="avatar kaylee">K</span><span className="avatar adam">A</span></div>
      </header>
      <div className="main">
        <aside className="sidebar">
          <div className="nav-label">{mode === 'home' ? 'Home' : 'Work'}</div>
          {navItems.map(([id, label, Icon]) => (
            <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id as Page)}>
              <Icon size={16} /><span>{label}</span>
            </button>
          ))}
          <div className="side-note"><strong>{mode === 'home' ? 'Canton tenant mode' : 'FERPA-safe mode'}</strong><p>{mode === 'home' ? 'Tenant-only suggestions. Adam has limited visibility.' : 'First name/nickname only. Clipboard copy only.'}</p></div>
          <div className="sync-note"><strong>{hasSupabase ? 'Supabase enabled' : 'Local demo mode'}</strong><p>{loading ? 'Loading...' : message || 'Ready.'}</p><button className="btn tiny" onClick={loadData}><RefreshCw size={13} /> Refresh</button></div>
        </aside>
        <main className="content">
          {page === 'dashboard' && <Dashboard mode={mode} inventory={inventory} students={students} tasks={tasks} />}
          {page === 'today' && <Today tasks={tasks} completeTask={completeTask} />}
          {page === 'briefing' && <Briefing />}
          {page === 'calendar' && <Placeholder title="Calendar" sub="Google Calendar integration will connect here after Supabase basics are stable." />}
          {page === 'budget' && <Placeholder title="Budget" sub="Calendar-based cashflow page scaffold." />}
          {page === 'inventory' && <Inventory inventory={inventory} createItem={createInventoryItem} updateQuantity={updateInventoryQuantity} />}
          {page === 'chores' && <Placeholder title="Chores & Tasks" sub="Todoist integration will connect here." />}
          {page === 'adam' && <Adam />}
          {page === 'vehicles' && <Vehicles />}
          {page === 'suggestions' && <Suggestions />}
          {page === 'students' && <Students students={students} createStudent={createStudent} markCopied={markStudentCopied} />}
        </main>
      </div>
    </div>
  );
}

const homeNav = [
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
] as const;

const workNav = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['today', 'Today’s Tasks', ClipboardCheck],
  ['briefing', 'Daily Briefing', Sparkles],
  ['calendar', 'Calendar', CalendarDays],
  ['students', 'Students', Users]
] as const;

function Header({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return <div className="page-header"><div><h1>{title}</h1><p>{sub}</p></div>{children && <div className="actions">{children}</div>}</div>;
}

function Stats({ items }: { items: [string, string, string?][] }) {
  return <div className="stats-row">{items.map(([label, value, sub]) => <div className="stat-card" key={label}><div className="stat-label">{label}</div><div className="stat-val">{value}</div>{sub && <div className="stat-sub">{sub}</div>}</div>)}</div>;
}

function Dashboard({ mode, inventory, students, tasks }: { mode: Mode; inventory: InventoryItem[]; students: Student[]; tasks: TaskItem[] }) {
  const expiring = inventory.filter((item) => item.expires && new Date(item.expires) <= new Date(Date.now() + 7 * 86400000)).length;
  const pending = tasks.filter((task) => task.status === 'pending_approval').length;
  const open = tasks.filter((task) => task.status !== 'completed').length;
  const needCopy = students.filter((student) => !student.copied).length;

  return <>
    <Header title={mode === 'home' ? 'Home command center' : 'Work command center'} sub={mode === 'home' ? 'Tasks, approvals, inventory, vehicles, and tenant-safe home care.' : 'FERPA-safe student workflow, GROW notes, and daily planning.'}><button className="btn primary"><Plus size={16} /> Quick add</button></Header>
    <Stats items={mode === 'home' ? [['Open tasks', String(open), 'from task table'], ['Adam pending', String(pending), 'approval needed'], ['Expiring soon', String(expiring), 'next 7 days'], ['Vehicle alerts', '4', 'seeded']] : [['Students', String(students.length), 'Supabase/local'], ['Need copy', String(needCopy), 'Salesforce'], ['FERPA', 'On', 'clipboard only'], ['Calls today', '0', 'Outlook later']]} />
    <div className="grid two"><Today tasks={tasks.slice(0, 3)} compact completeTask={() => undefined} /><Briefing compact /></div>
  </>;
}

function Today({ tasks, compact = false, completeTask }: { tasks: TaskItem[]; compact?: boolean; completeTask: (id: string) => void }) {
  return <section className="panel"><h2>Today’s Tasks</h2>{tasks.map((task) => <div className={`task-card ${task.priority}`} key={task.id}><button className="check" onClick={() => completeTask(task.id)} /><div><strong>{task.title}</strong><p>{task.owner} · {task.minutes} min · {task.source}</p></div></div>)}{!compact && tasks.length === 0 && <p>No tasks yet.</p>}</section>;
}

function Briefing({ compact = false }: { compact?: boolean }) {
  const list = compact ? briefing.slice(0, 2) : briefing;
  return <section className="panel"><h2>Daily Briefing</h2>{list.map((item) => <div className="brief-item" key={item}>{item}</div>)}</section>;
}

function Inventory({ inventory, createItem, updateQuantity }: { inventory: InventoryItem[]; createItem: (item: Omit<InventoryItem, 'id'>) => void; updateQuantity: (id: string, quantity: number) => void }) {
  const [action, setAction] = useState<InventoryAction>('none');
  const [form, setForm] = useState({ name: '', brand: '', location: 'Fridge', category: 'Food', quantity: '1', expires: '', value: '', barcode: '' });
  const totalValue = inventory.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  const expiring = inventory.filter((item) => item.expires && new Date(item.expires) <= new Date(Date.now() + 7 * 86400000)).length;

  function submitManual() {
    if (!form.name.trim()) return;
    createItem({ name: form.name, brand: form.brand || null, location: form.location, category: form.category, quantity: Number(form.quantity) || 1, expires: form.expires || null, value: form.value ? Number(form.value) : null, barcode: form.barcode || null });
    setForm({ name: '', brand: '', location: 'Fridge', category: 'Food', quantity: '1', expires: '', value: '', barcode: '' });
    setAction('none');
  }

  function scanToAdd() {
    createItem({ name: form.name || `Scanned item ${form.barcode || ''}`.trim(), brand: form.brand || null, location: form.location, category: form.category, quantity: Number(form.quantity) || 1, expires: form.expires || null, value: form.value ? Number(form.value) : null, barcode: form.barcode || null });
    setAction('none');
  }

  return <>
    <Header title="Inventory" sub="Supabase-ready inventory with manual entry, scan to add, scan to use/remove, and quick consume.">
      <button className="btn primary" onClick={() => setAction('scanAdd')}>Scan to Add</button>
      <button className="btn ghost" onClick={() => setAction('manual')}><Plus size={16} /> Manual Entry</button>
      <button className="btn warning" onClick={() => setAction('scanUse')}>Scan to Use / Remove</button>
    </Header>
    <Stats items={[['Total items', String(inventory.length)], ['Estimated value', `$${totalValue.toFixed(2)}`], ['Expiring soon', String(expiring)], ['Locations', '15']]} />
    {action !== 'none' && <section className={`panel action-panel ${action}`}><div className="panel-head"><h2>{action === 'scanAdd' ? 'Scan to Add' : action === 'manual' ? 'Manual Entry' : 'Scan to Use / Remove'}</h2><button className="btn ghost" onClick={() => setAction('none')}>Close</button></div>{action === 'scanUse' ? <ScanUse inventory={inventory} updateQuantity={updateQuantity} /> : <div className="form-grid"><input placeholder="Item name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><input placeholder="Brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /><input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /><input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /><input placeholder="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /><input placeholder="Estimated value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /><input placeholder="Expiration date YYYY-MM-DD" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} /><input placeholder="Barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /><button className="btn primary" onClick={action === 'scanAdd' ? scanToAdd : submitManual}><Save size={16} /> Save item</button></div>}</section>}
    <div className="table-card"><table><thead><tr><th>Item</th><th>Location</th><th>Category</th><th>Qty</th><th>Expires</th><th>Value</th><th>Use</th></tr></thead><tbody>{inventory.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.brand}</small></td><td>{item.location}</td><td>{item.category}</td><td>{item.quantity}</td><td>{item.expires ?? '—'}</td><td>${Number(item.value || 0).toFixed(2)}</td><td><button className="btn tiny warning" onClick={() => updateQuantity(item.id, item.quantity - 1)}><Minus size={13} /> Use 1</button></td></tr>)}</tbody></table></div>
  </>;
}

function ScanUse({ inventory, updateQuantity }: { inventory: InventoryItem[]; updateQuantity: (id: string, quantity: number) => void }) {
  const [barcode, setBarcode] = useState('');
  const item = useMemo(() => inventory.find((i) => i.barcode && i.barcode === barcode), [barcode, inventory]);
  return <div><div className="scan-row"><input placeholder="Scan or type barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} autoFocus />{item && <button className="btn warning" onClick={() => updateQuantity(item.id, item.quantity - 1)}><Trash2 size={16} /> Use {item.name}</button>}</div>{barcode && !item && <p>No matching barcode yet. Use Quick Consume from the table or add barcode to item.</p>}</div>;
}

function Adam() {
  return <><Header title="Adam’s Tasks" sub="ADHD-safe, Kaylee-approved task planning." /><Stats items={[["Pending approval", "3"], ["Max/day", "2-3"], ["Heavy day", "Saturday"], ["Sunday", "Rest"]]} /><div className="day-grid">{adamPlan.map((day) => <div className="day-card" key={day.day}><h3>{day.day}</h3>{day.tasks.map((task) => <p key={task}>{task}</p>)}<small>{day.rationale}</small></div>)}</div></>;
}

function Vehicles() {
  return <><Header title="Vehicles" sub="Maintenance tracking for Corolla and Leaf." /><div className="grid two">{vehicles.map((vehicle) => <section className="panel" key={vehicle.name}><h2>{vehicle.name}</h2><p>{vehicle.type} · {vehicle.miles.toLocaleString()} miles</p><h3>Urgent</h3>{vehicle.urgent.map((item) => <div className="brief-item urgent" key={item}>{item}</div>)}<h3>Okay</h3>{vehicle.ok.map((item) => <div className="brief-item good" key={item}>{item}</div>)}</section>)}</div></>;
}

function Suggestions() {
  return <><Header title="Home Suggestions" sub="Tenant-only Canton/Georgia-aware home care." />{homeSuggestions.map((item) => <section className={`panel suggestion ${item.urgency}`} key={item.title}><h2>{item.title}</h2><p>{item.reason}</p><small>{item.effort}</small></section>)}</>;
}

function Students({ students, createStudent, markCopied }: { students: Student[]; createStudent: (student: Omit<Student, 'id' | 'copied'>) => void; markCopied: (id: string, note: string) => void }) {
  const [form, setForm] = useState({ display_name: '', goal: '', risk: 'Watch', grow_note: '' });
  return <><Header title="Students" sub="FERPA-safe GROW notes. Clipboard copy only."><button className="btn primary" onClick={() => { if (!form.display_name.trim()) return; createStudent(form); setForm({ display_name: '', goal: '', risk: 'Watch', grow_note: '' }); }}><Plus size={16} /> Add student</button></Header><Stats items={[["Students", String(students.length)], ["Need copy", String(students.filter((s) => !s.copied).length)], ["IDs stored", "0"], ["Salesforce", "Manual"]]} /><section className="panel"><h2>Add / update student note</h2><div className="form-grid"><input placeholder="First name or nickname only" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /><input placeholder="Weekly goal" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} /><input placeholder="Risk label" value={form.risk} onChange={(e) => setForm({ ...form, risk: e.target.value })} /><textarea placeholder="GROW note" value={form.grow_note} onChange={(e) => setForm({ ...form, grow_note: e.target.value })} /></div></section><div className="grid two">{students.map((student) => <section className="panel" key={student.id}><h2>{student.display_name}</h2><p>{student.goal}</p><span className={`status ${student.copied ? 'good' : 'warning'}`}>{student.copied ? 'Copied' : 'Needs copy'}</span><textarea readOnly value={student.grow_note} /><button className="btn primary" onClick={() => markCopied(student.id, student.grow_note)}><Copy size={15} /> Copy to Salesforce</button></section>)}</div></>;
}

function Placeholder({ title, sub }: { title: string; sub: string }) {
  return <section className="panel"><h2>{title}</h2><p>{sub}</p></section>;
}

export default App;
