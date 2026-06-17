import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarDays, Car, ClipboardCheck, Home, Inbox, LayoutDashboard, ShieldCheck, Sparkles, Users, WalletCards } from 'lucide-react';
import { adamPlan, briefing, homeSuggestions, inventoryItems, inventoryLocations, students, todayTasks, users, vehicles } from './data/seed';
import './styles.css';

type Mode = 'home' | 'work';
type Page = 'dashboard' | 'inventory' | 'today' | 'briefing' | 'adam' | 'vehicles' | 'suggestions' | 'calendar' | 'budget' | 'students';

const pageMeta: Record<Page, { label: string; icon: React.ReactNode; modes: Mode[] | 'shared' }> = {
  dashboard: { label: 'Dashboard', icon: <LayoutDashboard size={18}/>, modes: 'shared' },
  today: { label: "Today's Tasks", icon: <ClipboardCheck size={18}/>, modes: 'shared' },
  briefing: { label: 'Daily Briefing', icon: <Sparkles size={18}/>, modes: 'shared' },
  inventory: { label: 'Inventory', icon: <Inbox size={18}/>, modes: ['home'] },
  adam: { label: "Adam's Tasks", icon: <ShieldCheck size={18}/>, modes: ['home'] },
  vehicles: { label: 'Vehicles', icon: <Car size={18}/>, modes: ['home'] },
  suggestions: { label: 'Home Suggestions', icon: <Home size={18}/>, modes: ['home'] },
  calendar: { label: 'Calendar', icon: <CalendarDays size={18}/>, modes: 'shared' },
  budget: { label: 'Budget', icon: <WalletCards size={18}/>, modes: 'shared' },
  students: { label: 'Students', icon: <Users size={18}/>, modes: ['work'] },
};

function App() {
  const [mode, setMode] = useState<Mode>('home');
  const [page, setPage] = useState<Page>('dashboard');
  const navPages = useMemo(() => Object.entries(pageMeta).filter(([, meta]) => meta.modes === 'shared' || meta.modes.includes(mode)) as [Page, typeof pageMeta[Page]][], [mode]);

  function switchMode(next: Mode) {
    setMode(next);
    if (!navPages.some(([key]) => key === page)) setPage('dashboard');
  }

  return <div className="app">
    <aside className="sidebar">
      <div className="logo"><span>KH</span><div><strong>Kaylee's Hub</strong><small>Home + Work CRM</small></div></div>
      <div className="modeToggle" aria-label="Mode toggle">
        <button className={mode === 'home' ? 'active' : ''} onClick={() => switchMode('home')}>Home</button>
        <button className={mode === 'work' ? 'active' : ''} onClick={() => switchMode('work')}>Work</button>
      </div>
      <nav>
        {navPages.map(([key, meta]) => <button key={key} className={page === key ? 'nav active' : 'nav'} onClick={() => setPage(key)}>{meta.icon}<span>{meta.label}</span></button>)}
      </nav>
      <div className="profileCard"><strong>{mode === 'home' ? 'Tenant-safe Canton home' : 'FERPA-safe WGU mode'}</strong><p>{mode === 'home' ? 'Adam is limited to his tasks only. No finances.' : 'First name/nickname only. GROW notes only.'}</p></div>
    </aside>
    <main>
      <Topbar mode={mode}/>
      {page === 'dashboard' && <Dashboard mode={mode}/>} {page === 'inventory' && <Inventory/>} {page === 'today' && <Today/>} {page === 'briefing' && <Briefing/>} {page === 'adam' && <AdamTasks/>} {page === 'vehicles' && <Vehicles/>} {page === 'suggestions' && <Suggestions/>} {page === 'calendar' && <Placeholder title="Calendar" text="Google Calendar OAuth route comes later. This page is ready for all 9 calendar sources, agenda/month/money tabs, and Budget dependency."/>} {page === 'budget' && <Placeholder title="Budget" text="Dedicated cashflow page scaffold. Next step: import Expenses + Pay Day calendar events into Supabase budget_events_cache."/>} {page === 'students' && <Students/>}
    </main>
  </div>;
}

function Topbar({ mode }: { mode: Mode }) { return <header><div><h1>{mode === 'home' ? 'Home command center' : 'Work command center'}</h1><p>Dual-mode shell with role boundaries, brand palette, and Phase 1 module scaffolding.</p></div><div className="userPills"><span className="pill purple">{users.kaylee.name} Admin</span><span className="pill green">{users.adam.name} Limited</span></div></header>; }
function Card({ children, className='' }: React.PropsWithChildren<{ className?: string }>) { return <section className={`card ${className}`}>{children}</section>; }
function Stat({ label, value }: { label:string; value:string|number }) { return <div className="stat"><strong>{value}</strong><span>{label}</span></div>; }

function Dashboard({ mode }: { mode: Mode }) { return <div className="grid"><Card><h2>Phase 1 build status</h2><div className="stats"><Stat value="7" label="Completed prototype modules"/><Stat value="4" label="Immediate priorities"/><Stat value="2" label="Users"/></div><p className="muted">This starter app is deployable now and leaves integrations behind clean API boundaries for Phase 2.</p></Card><Card><h2>{mode === 'home' ? 'Home rules locked' : 'Work rules locked'}</h2><ul className="checklist">{mode === 'home' ? ['Adam: max 2–3 tasks/day','Saturday heavy only','Sunday always rest','Tenant-only suggestions'] : ['FERPA-safe student data','GROW notes only','No Salesforce auto-sync','Clipboard copy only'].map(x => <li key={x}>{x}</li>)}</ul></Card><Today compact/><Briefing compact/></div>; }
function Today({ compact=false }: { compact?: boolean }) { const visible = compact ? todayTasks.slice(0,3) : todayTasks; return <Card><h2>Today's Tasks</h2><div className="taskList">{visible.map(t => <div className={`task ${t.priority}`} key={t.id}><div><strong>{t.title}</strong><p>{t.owner} • {t.minutes} min • {t.mode}</p></div><button>Done</button></div>)}</div></Card>; }
function Briefing({ compact=false }: { compact?: boolean }) { return <Card><h2>Daily Briefing</h2>{briefing.slice(0, compact ? 3 : briefing.length).map((b, i) => <p className="brief" key={i}>{b}</p>)}</Card>; }
function Inventory() { const total = inventoryItems.reduce((s,i)=>s+i.value,0); return <div className="grid"><Card><h2>Inventory</h2><div className="stats"><Stat value={inventoryItems.length} label="Items seeded"/><Stat value={`$${total.toFixed(2)}`} label="Estimated value"/><Stat value={inventoryLocations.length} label="Locations"/></div><div className="scanBox"><strong>Barcode lookup ready</strong><p>Production route should proxy Open Food Facts first, then Open Beauty Facts.</p></div></Card><Card><h2>Items</h2><table><tbody>{inventoryItems.map(i=><tr key={i.id}><td><strong>{i.name}</strong><br/><small>{i.brand}</small></td><td>{i.location}</td><td>Qty {i.quantity}</td><td>${i.value.toFixed(2)}</td></tr>)}</tbody></table></Card></div>; }
function AdamTasks() { return <div className="grid"><Card><h2>Adam's ADHD-safe week</h2><p className="muted">Kaylee approval is required before anything goes to Todoist.</p><div className="week">{adamPlan.map(d => <div className={d.day === 'Sun' ? 'day rest' : 'day'} key={d.day}><strong>{d.day}</strong>{d.tasks.map(t=><span key={t}>{t}</span>)}<small>{d.rationale}</small></div>)}</div></Card></div>; }
function Vehicles() { return <div className="grid two">{vehicles.map(v => <Card key={v.name}><h2>{v.name}</h2><div className="stats"><Stat value={v.miles.toLocaleString()} label="Miles"/><Stat value={v.type} label="Type"/></div><h3>Critical</h3>{v.urgent.map(x => <p className="alert" key={x}>{x}</p>)}<h3>Logged</h3>{v.ok.map(x => <p className="ok" key={x}>{x}</p>)}</Card>)}</div>; }
function Suggestions() { return <Card><h2>Tenant-only Home Suggestions</h2><div className="suggestions">{homeSuggestions.map(s => <div className={`suggestion ${s.urgency}`} key={s.title}><strong>{s.title}</strong><p>{s.reason}</p><small>{s.effort}</small><button>Add to my tasks</button></div>)}</div></Card>; }
function Students() { function copyNote(text:string){ navigator.clipboard?.writeText(text); } return <Card><h2>Students — FERPA-safe</h2><p className="muted">No IDs, legal names, grades, or enrollment data. Copy-to-Salesforce is clipboard only.</p>{students.map(s => <div className="student" key={s.displayName}><strong>{s.displayName}</strong><p>{s.grow}</p><button onClick={() => copyNote(s.grow)}>{s.copied ? 'Copied once' : 'Copy to Salesforce'}</button></div>)}</Card>; }
function Placeholder({ title, text }: { title:string; text:string }) { return <Card><h2>{title}</h2><p>{text}</p><div className="placeholder">Coming in the next implementation session</div></Card>; }

createRoot(document.getElementById('root')!).render(<App />);
