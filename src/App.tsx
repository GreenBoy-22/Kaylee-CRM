import { useState } from 'react';
import {
  Home,
  Users,
  LayoutDashboard,
  ClipboardCheck,
  Sparkles,
  CalendarDays,
  WalletCards,
  Inbox,
  ListTodo,
  ShieldCheck,
  Car,
  Plus,
  Copy
} from 'lucide-react';

import {
  inventoryItems,
  todayTasks,
  adamPlan,
  vehicles,
  homeSuggestions,
  briefing,
  students
} from './data';

type Mode = 'home' | 'work';
type Page =
  | 'dashboard'
  | 'today'
  | 'briefing'
  | 'calendar'
  | 'budget'
  | 'inventory'
  | 'chores'
  | 'adam'
  | 'vehicles'
  | 'suggestions'
  | 'students';

function App() {
  const [mode, setMode] = useState<Mode>('home');
  const [page, setPage] = useState<Page>('dashboard');
  const [inventoryAction, setInventoryAction] = useState<'none' | 'scanAdd' | 'manual' | 'scanUse'>('none');

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

  const navItems = mode === 'home' ? homeNav : workNav;

  function switchMode(next: Mode) {
    setMode(next);
    setPage('dashboard');
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="logo">
          <span className="logo-mark">KH</span>
          <span>Kaylee’s Hub</span>
        </div>

        <div className="toggle-wrap">
          <button className={mode === 'home' ? 'active' : ''} onClick={() => switchMode('home')}>
            <Home size={15} /> Home
          </button>
          <button className={mode === 'work' ? 'active' : ''} onClick={() => switchMode('work')}>
            <Users size={15} /> Work
          </button>
        </div>

        <div className="avatars">
          <span className="avatar kaylee">K</span>
          <span className="avatar adam">A</span>
        </div>
      </header>

      <div className="main">
        <aside className="sidebar">
          <div className="nav-label">{mode === 'home' ? 'Home' : 'Work'}</div>
          {navItems.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`nav-item ${page === id ? 'active' : ''}`}
              onClick={() => setPage(id)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}

          <div className="side-note">
            <strong>{mode === 'home' ? 'Canton tenant mode' : 'FERPA-safe mode'}</strong>
            <p>
              {mode === 'home'
                ? 'Tenant-only suggestions. Adam has limited visibility.'
                : 'First name/nickname only. Clipboard copy only.'}
            </p>
          </div>
        </aside>

        <main className="content">
          {page === 'dashboard' && <Dashboard mode={mode} />}
          {page === 'today' && <Today />}
          {page === 'briefing' && <Briefing />}
          {page === 'calendar' && <CalendarPage />}
          {page === 'budget' && <Budget />}
          {page === 'inventory' && (
            <Inventory action={inventoryAction} setAction={setInventoryAction} />
          )}
          {page === 'chores' && <Chores />}
          {page === 'adam' && <Adam />}
          {page === 'vehicles' && <Vehicles />}
          {page === 'suggestions' && <Suggestions />}
          {page === 'students' && <Students />}
        </main>
      </div>
    </div>
  );
}

function Header({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

function Stats({ items }: { items: [string, string, string?][] }) {
  return (
    <div className="stats-row">
      {items.map(([label, value, sub]) => (
        <div className="stat-card" key={label}>
          <div className="stat-label">{label}</div>
          <div className="stat-val">{value}</div>
          {sub && <div className="stat-sub">{sub}</div>}
        </div>
      ))}
    </div>
  );
}

function Dashboard({ mode }: { mode: Mode }) {
  return (
    <>
      <Header
        title={mode === 'home' ? 'Home command center' : 'Work command center'}
        sub={
          mode === 'home'
            ? 'Tasks, approvals, inventory, vehicles, and tenant-safe home care.'
            : 'FERPA-safe student workflow, GROW notes, and daily planning.'
        }
      >
        <button className="btn primary"><Plus size={16} /> Quick add</button>
      </Header>

      <Stats
        items={
          mode === 'home'
            ? [
                ['Open tasks', '8', 'home + shared'],
                ['Adam pending', '3', 'approval needed'],
                ['Expiring soon', '1', 'fridge'],
                ['Vehicle alerts', '4', 'critical/due']
              ]
            : [
                ['Students', '2', 'MVP list'],
                ['Need copy', '1', 'Salesforce'],
                ['FERPA', 'On', 'clipboard only'],
                ['Calls today', '0', 'Outlook later']
              ]
        }
      />

      <div className="grid two">
        <Today compact />
        <Briefing compact />
      </div>
    </>
  );
}

function Today({ compact = false }: { compact?: boolean }) {
  const list = compact ? todayTasks.slice(0, 3) : todayTasks;
  return (
    <section className="panel">
      <h2>Today’s Tasks</h2>
      {list.map((task) => (
        <div className={`task-card ${task.priority}`} key={task.id}>
          <span className="check" />
          <div>
            <strong>{task.title}</strong>
            <p>{task.owner} · {task.minutes} min · {task.mode}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

function Briefing({ compact = false }: { compact?: boolean }) {
  const list = compact ? briefing.slice(0, 2) : briefing;
  return (
    <section className="panel">
      <h2>Daily Briefing</h2>
      {list.map((item) => (
        <div className="brief-item" key={item}>{item}</div>
      ))}
    </section>
  );
}

function Inventory({
  action,
  setAction
}: {
  action: 'none' | 'scanAdd' | 'manual' | 'scanUse';
  setAction: (value: 'none' | 'scanAdd' | 'manual' | 'scanUse') => void;
}) {
  return (
    <>
      <Header
        title="Inventory"
        sub="Scan to add, manual entry, scan to use/remove, and insurance-ready tracking."
      >
        <button className="btn primary" onClick={() => setAction('scanAdd')}>Scan to Add</button>
        <button className="btn ghost" onClick={() => setAction('manual')}>Manual Entry</button>
        <button className="btn warning" onClick={() => setAction('scanUse')}>Scan to Use / Remove</button>
      </Header>

      <Stats
        items={[
          ['Total items', String(inventoryItems.length)],
          ['Estimated value', '$168.94'],
          ['Expiring soon', '1'],
          ['Locations', '15']
        ]}
      />

      {action !== 'none' && (
        <section className={`panel action-panel ${action}`}>
          <div className="panel-head">
            <h2>
              {action === 'scanAdd'
                ? 'Scan to Add'
                : action === 'manual'
                  ? 'Manual Entry'
                  : 'Scan to Use / Remove'}
            </h2>
            <button className="btn ghost" onClick={() => setAction('none')}>Close</button>
          </div>

          {action === 'manual' ? (
            <div className="form-grid">
              <input placeholder="Item name" />
              <input placeholder="Brand" />
              <input placeholder="Location" />
              <input placeholder="Category" />
              <input placeholder="Quantity" />
              <input placeholder="Estimated value" />
            </div>
          ) : (
            <div className="scan-row">
              <input placeholder="Scan or type barcode" />
              <button className={action === 'scanUse' ? 'btn warning' : 'btn primary'}>
                {action === 'scanUse' ? 'Use item' : 'Lookup barcode'}
              </button>
            </div>
          )}
        </section>
      )}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Location</th>
              <th>Category</th>
              <th>Qty</th>
              <th>Expires</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {inventoryItems.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.name}</strong><small>{item.brand}</small></td>
                <td>{item.location}</td>
                <td>{item.category}</td>
                <td>{item.quantity}</td>
                <td>{item.expires ?? '—'}</td>
                <td>${item.value.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Adam() {
  return (
    <>
      <Header title="Adam’s Tasks" sub="ADHD-safe, Kaylee-approved task planning." />
      <Stats items={[['Pending approval', '3'], ['Max/day', '2–3'], ['Heavy day', 'Saturday'], ['Sunday', 'Rest']]} />
      <div className="day-grid">
        {adamPlan.map((day) => (
          <div className="day-card" key={day.day}>
            <h3>{day.day}</h3>
            {day.tasks.map((task) => <p key={task}>{task}</p>)}
            <small>{day.rationale}</small>
          </div>
        ))}
      </div>
    </>
  );
}

function Vehicles() {
  return (
    <>
      <Header title="Vehicles" sub="Maintenance tracking for Corolla and Leaf." />
      <div className="grid two">
        {vehicles.map((vehicle) => (
          <section className="panel" key={vehicle.name}>
            <h2>{vehicle.name}</h2>
            <p>{vehicle.type} · {vehicle.miles.toLocaleString()} miles</p>
            <h3>Urgent</h3>
            {vehicle.urgent.map((item) => <div className="brief-item urgent" key={item}>{item}</div>)}
            <h3>Okay</h3>
            {vehicle.ok.map((item) => <div className="brief-item good" key={item}>{item}</div>)}
          </section>
        ))}
      </div>
    </>
  );
}

function Suggestions() {
  return (
    <>
      <Header title="Home Suggestions" sub="Tenant-only Canton/Georgia-aware home care." />
      {homeSuggestions.map((item) => (
        <section className={`panel suggestion ${item.urgency}`} key={item.title}>
          <h2>{item.title}</h2>
          <p>{item.reason}</p>
          <small>{item.effort}</small>
        </section>
      ))}
    </>
  );
}

function Students() {
  return (
    <>
      <Header title="Students" sub="FERPA-safe GROW notes. Clipboard copy only." />
      <div className="grid two">
        {students.map((student) => (
          <section className="panel" key={student.displayName}>
            <h2>{student.displayName}</h2>
            <p>{student.goal}</p>
            <textarea readOnly value={student.grow} />
            <button className="btn primary" onClick={() => navigator.clipboard?.writeText(student.grow)}>
              <Copy size={15} /> Copy to Salesforce
            </button>
          </section>
        ))}
      </div>
    </>
  );
}

function CalendarPage() {
  return <Placeholder title="Calendar" sub="Google Calendar integration will connect here." />;
}

function Budget() {
  return <Placeholder title="Budget" sub="Calendar-based cashflow page scaffold." />;
}

function Chores() {
  return <Placeholder title="Chores & Tasks" sub="Todoist integration will connect here." />;
}

function Placeholder({ title, sub }: { title: string; sub: string }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <p>{sub}</p>
    </section>
  );
}

export default App;
