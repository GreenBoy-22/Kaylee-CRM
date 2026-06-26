// src/PlantCatalog.tsx
//
// Plant Catalog -- track indoor/outdoor plants, log care, get AI suggestions.
// Tabs: My Plants | Care Log | Tasks | AI Suggestions

import { useCallback, useEffect, useState, useMemo } from 'react';
import { Plus, X, Save, RefreshCw, Leaf, ChevronDown, ChevronRight, Sparkles, CheckCircle2, Circle, Trash2, Edit2 } from 'lucide-react';
import { supabase } from './lib/supabase';

// __ Types _______________________________________________________________

type Location = 'indoor' | 'outdoor' | 'garden';
type LogType = 'watered' | 'fertilized' | 'repotted' | 'pruned' | 'treated' | 'observation' | 'propagated' | 'other';
type Priority = 'low' | 'medium' | 'high';
type TaskSource = 'manual' | 'ai' | 'care_guide';

interface Plant {
  id: string;
  name: string;
  scientific_name: string | null;
  nickname: string | null;
  location: Location;
  spot: string | null;
  pot_size: string | null;
  soil_type: string | null;
  photo_url: string | null;
  notes: string | null;
  is_active: boolean;
  care_guide: string | null;
  acquired_date: string | null;
  created_at: string;
}

interface PlantLog {
  id: string;
  plant_id: string;
  log_date: string;
  log_type: LogType;
  notes: string | null;
}

interface PlantTask {
  id: string;
  plant_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: Priority;
  source: TaskSource;
  is_done: boolean;
  done_date: string | null;
}

// __ Constants ___________________________________________________________

const LOCATION_LABELS: Record<Location, string> = {
  indoor:  'Indoor',
  outdoor: 'Outdoor',
  garden:  'Garden (Mom\'s)',
};

const LOCATION_COLORS: Record<Location, string> = {
  indoor:  '#0891b2',
  outdoor: '#16a34a',
  garden:  '#d97706',
};

const LOG_TYPE_LABELS: Record<LogType, string> = {
  watered:     'Watered',
  fertilized:  'Fertilized',
  repotted:    'Repotted',
  pruned:      'Pruned',
  treated:     'Treated (pest/disease)',
  observation: 'Observation',
  propagated:  'Propagated',
  other:       'Other',
};

const LOG_TYPE_ICONS: Record<LogType, string> = {
  watered:     'W',
  fertilized:  'F',
  repotted:    'R',
  pruned:      'P',
  treated:     'T',
  observation: 'O',
  propagated:  'V',
  other:       '*',
};

const PRIORITY_COLORS: Record<Priority, string> = {
  low:    'var(--green)',
  medium: 'var(--amber)',
  high:   'var(--red)',
};

// Months for seasonal advice (June = 5, zero-indexed)
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function toKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// __ Default plants to seed ______________________________________________

const DEFAULT_PLANTS: Omit<Plant, 'id' | 'created_at'>[] = [
  // Indoor houseplants
  { name: 'Fiddle Leaf Fig',  scientific_name: 'Ficus lyrata',            nickname: null,  location: 'indoor',  spot: null, pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Monstera',         scientific_name: 'Monstera deliciosa',       nickname: null,  location: 'indoor',  spot: null, pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Philodendron',     scientific_name: 'Philodendron spp.',        nickname: null,  location: 'indoor',  spot: null, pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Lime Tree',        scientific_name: 'Citrus aurantiifolia',     nickname: null,  location: 'indoor',  spot: 'Indoors (warm season)',  pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Tradescantia',     scientific_name: 'Tradescantia spp.',        nickname: null,  location: 'indoor',  spot: null, pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  // Outdoor herbs
  { name: 'Basil',            scientific_name: 'Ocimum basilicum',         nickname: null,  location: 'outdoor', spot: 'Herb garden', pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Rosemary',         scientific_name: 'Salvia rosmarinus',        nickname: null,  location: 'outdoor', spot: 'Herb garden', pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Thyme',            scientific_name: 'Thymus vulgaris',          nickname: null,  location: 'outdoor', spot: 'Herb garden', pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Oregano',          scientific_name: 'Origanum vulgare',         nickname: null,  location: 'outdoor', spot: 'Herb garden', pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Cilantro',         scientific_name: 'Coriandrum sativum',       nickname: null,  location: 'outdoor', spot: 'Herb garden', pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Peppermint',       scientific_name: 'Mentha x piperita',        nickname: null,  location: 'outdoor', spot: 'Herb garden', pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  // Outdoor ornamentals
  { name: 'Petunias',         scientific_name: 'Petunia spp.',             nickname: null,  location: 'outdoor', spot: null, pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Lavender',         scientific_name: 'Lavandula spp.',           nickname: null,  location: 'outdoor', spot: null, pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Clematis',         scientific_name: 'Clematis spp.',            nickname: null,  location: 'outdoor', spot: null, pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Fuchsia',          scientific_name: 'Fuchsia spp.',             nickname: null,  location: 'outdoor', spot: null, pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Azalea',           scientific_name: 'Rhododendron spp.',        nickname: null,  location: 'outdoor', spot: null, pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
];

// __ AI suggestion helper ________________________________________________

async function getAISuggestions(plant: Plant, recentLogs: PlantLog[]): Promise<string> {
  const today = new Date();
  const month = MONTH_NAMES[today.getMonth()];
  const season = today.getMonth() >= 2 && today.getMonth() <= 4 ? 'Spring'
    : today.getMonth() >= 5 && today.getMonth() <= 7 ? 'Summer'
    : today.getMonth() >= 8 && today.getMonth() <= 10 ? 'Fall' : 'Winter';

  const lastWatered = recentLogs.filter(l => l.log_type === 'watered').sort((a,b) => b.log_date.localeCompare(a.log_date))[0];
  const lastFertilized = recentLogs.filter(l => l.log_type === 'fertilized').sort((a,b) => b.log_date.localeCompare(a.log_date))[0];

  const prompt = `You are a plant care expert helping a home gardener in Canton, Georgia (USDA Zone 7b).

Plant: ${plant.name}${plant.scientific_name ? ` (${plant.scientific_name})` : ''}
Location: ${LOCATION_LABELS[plant.location]}${plant.spot ? ` - ${plant.spot}` : ''}
Current month: ${month}, Season: ${season}
Last watered: ${lastWatered ? fmtDate(lastWatered.log_date) : 'unknown'}
Last fertilized: ${lastFertilized ? fmtDate(lastFertilized.log_date) : 'unknown'}
${plant.care_guide ? `\nCare guide provided:\n${plant.care_guide.slice(0, 800)}` : ''}
${plant.notes ? `\nOwner notes: ${plant.notes}` : ''}

Give 4-6 specific, actionable care suggestions for right now (${month} in Georgia). Include:
- What to do THIS WEEK
- Seasonal considerations for ${season} in Zone 7b
- Watering frequency for current conditions
- Any fertilizing or feeding recommendations
- Watch-outs or common issues this time of year

Be specific and practical. Format as bullet points starting with -.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await response.json();
  return data.content?.[0]?.text ?? 'Could not generate suggestions.';
}

// __ Main Component ______________________________________________________

export default function PlantCatalog() {
  const [tab, setTab] = useState<'plants' | 'log' | 'tasks' | 'ai'>('plants');
  const [plants, setPlants] = useState<Plant[]>([]);
  const [logs, setLogs] = useState<PlantLog[]>([]);
  const [tasks, setTasks] = useState<PlantTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeded, setSeeded] = useState(false);

  // Plant form
  const [showAddPlant, setShowAddPlant] = useState(false);
  const [editingPlant, setEditingPlant] = useState<Plant | null>(null);
  const [pName, setPName] = useState('');
  const [pSci, setPSci] = useState('');
  const [pNick, setPNick] = useState('');
  const [pLoc, setPLoc] = useState<Location>('indoor');
  const [pSpot, setPSpot] = useState('');
  const [pPot, setPPot] = useState('');
  const [pSoil, setPSoil] = useState('');
  const [pNotes, setPNotes] = useState('');
  const [pGuide, setPGuide] = useState('');
  const [pSaving, setPSaving] = useState(false);

  // Log form
  const [selectedPlantId, setSelectedPlantId] = useState<string>('');
  const [logDate, setLogDate] = useState(toKey(new Date()));
  const [logType, setLogType] = useState<LogType>('watered');
  const [logNotes, setLogNotes] = useState('');
  const [logSaving, setLogSaving] = useState(false);

  // Task form
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskPlantId, setTaskPlantId] = useState<string>('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [taskPriority, setTaskPriority] = useState<Priority>('medium');
  const [taskSaving, setTaskSaving] = useState(false);

  // AI
  const [aiPlantId, setAiPlantId] = useState<string>('');
  const [aiResult, setAiResult] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);

  // Filters
  const [filterLoc, setFilterLoc] = useState<Location | 'all'>('all');
  const [expandedPlant, setExpandedPlant] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) { setLoading(false); return; }

    const [plantsRes, logsRes, tasksRes] = await Promise.all([
      supabase.from('plants').select('*').eq('user_id', userId).eq('is_active', true).order('name'),
      supabase.from('plant_log').select('*').eq('user_id', userId).order('log_date', { ascending: false }),
      supabase.from('plant_tasks').select('*').eq('user_id', userId).order('due_date', { ascending: true }),
    ]);

    const loadedPlants = (plantsRes.data as Plant[]) ?? [];
    setPlants(loadedPlants);
    setLogs((logsRes.data as PlantLog[]) ?? []);
    setTasks((tasksRes.data as PlantTask[]) ?? []);

    // Seed default plants if none exist
    if (loadedPlants.length === 0 && !seeded) {
      setSeeded(true);
      const rows = DEFAULT_PLANTS.map(p => ({ ...p, user_id: userId }));
      await supabase.from('plants').insert(rows);
      const { data: fresh } = await supabase.from('plants').select('*').eq('user_id', userId).eq('is_active', true).order('name');
      setPlants((fresh as Plant[]) ?? []);
    }

    setLoading(false);
  }, [seeded]);

  useEffect(() => { load(); }, [load]);

  // __ Save plant __________________________________________________________
  async function savePlant() {
    if (!supabase || !pName.trim()) return;
    setPSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) { setPSaving(false); return; }

    const payload = {
      user_id: userId,
      name: pName.trim(),
      scientific_name: pSci.trim() || null,
      nickname: pNick.trim() || null,
      location: pLoc,
      spot: pSpot.trim() || null,
      pot_size: pPot.trim() || null,
      soil_type: pSoil.trim() || null,
      notes: pNotes.trim() || null,
      care_guide: pGuide.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (editingPlant) {
      await supabase.from('plants').update(payload).eq('id', editingPlant.id);
    } else {
      await supabase.from('plants').insert({ ...payload, is_active: true });
    }

    setShowAddPlant(false);
    setEditingPlant(null);
    resetPlantForm();
    await load();
    setPSaving(false);
  }

  function resetPlantForm() {
    setPName(''); setPSci(''); setPNick(''); setPLoc('indoor');
    setPSpot(''); setPPot(''); setPSoil(''); setPNotes(''); setPGuide('');
  }

  function startEdit(p: Plant) {
    setEditingPlant(p);
    setPName(p.name); setPSci(p.scientific_name ?? ''); setPNick(p.nickname ?? '');
    setPLoc(p.location); setPSpot(p.spot ?? ''); setPPot(p.pot_size ?? '');
    setPSoil(p.soil_type ?? ''); setPNotes(p.notes ?? ''); setPGuide(p.care_guide ?? '');
    setShowAddPlant(true);
  }

  async function archivePlant(id: string) {
    if (!supabase || !confirm('Remove this plant from your catalog?')) return;
    await supabase.from('plants').update({ is_active: false }).eq('id', id);
    await load();
  }

  // __ Save log ____________________________________________________________
  async function saveLog() {
    if (!supabase || !selectedPlantId) return;
    setLogSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) { setLogSaving(false); return; }

    await supabase.from('plant_log').insert({
      user_id: userId,
      plant_id: selectedPlantId,
      log_date: logDate,
      log_type: logType,
      notes: logNotes.trim() || null,
    });

    setLogNotes('');
    setLogType('watered');
    await load();
    setLogSaving(false);
  }

  // __ Save task ___________________________________________________________
  async function saveTask() {
    if (!supabase || !taskTitle.trim()) return;
    setTaskSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) { setTaskSaving(false); return; }

    await supabase.from('plant_tasks').insert({
      user_id: userId,
      plant_id: taskPlantId || null,
      title: taskTitle.trim(),
      description: taskDesc.trim() || null,
      due_date: taskDue || null,
      priority: taskPriority,
      source: 'manual',
    });

    setShowAddTask(false);
    setTaskTitle(''); setTaskDesc(''); setTaskDue(''); setTaskPriority('medium'); setTaskPlantId('');
    await load();
    setTaskSaving(false);
  }

  async function toggleTask(task: PlantTask) {
    if (!supabase) return;
    await supabase.from('plant_tasks').update({
      is_done: !task.is_done,
      done_date: !task.is_done ? toKey(new Date()) : null,
    }).eq('id', task.id);
    await load();
  }

  async function deleteTask(id: string) {
    if (!supabase || !confirm('Delete this task?')) return;
    await supabase.from('plant_tasks').delete().eq('id', id);
    await load();
  }

  // __ AI suggestions ______________________________________________________
  async function generateSuggestions() {
    const plant = plants.find(p => p.id === aiPlantId);
    if (!plant) return;
    setAiLoading(true);
    setAiResult('');
    const plantLogs = logs.filter(l => l.plant_id === plant.id);
    const text = await getAISuggestions(plant, plantLogs);
    setAiResult(text);
    setAiLoading(false);
  }

  // __ Computed ____________________________________________________________
  const today = toKey(new Date());
  const currentMonth = MONTH_NAMES[new Date().getMonth()];

  const filteredPlants = useMemo(() =>
    filterLoc === 'all' ? plants : plants.filter(p => p.location === filterLoc),
    [plants, filterLoc]
  );

  const overdueTasks = tasks.filter(t => !t.is_done && t.due_date && t.due_date < today);
  const dueSoonTasks = tasks.filter(t => !t.is_done && t.due_date && t.due_date >= today && t.due_date <= toKey(new Date(Date.now() + 7*24*60*60*1000)));
  const pendingTasks = tasks.filter(t => !t.is_done);

  const lastCareMap = useMemo(() => {
    const m: Record<string, Record<LogType, string>> = {};
    for (const log of logs) {
      if (!m[log.plant_id]) m[log.plant_id] = {} as Record<LogType, string>;
      if (!m[log.plant_id][log.log_type]) m[log.plant_id][log.log_type] = log.log_date;
    }
    return m;
  }, [logs]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Plant Catalog</h1>
          <p>{plants.length} plants -- {currentMonth} care tracker</p>
        </div>
        <button className="btn primary" onClick={() => { resetPlantForm(); setEditingPlant(null); setShowAddPlant(true); }}>
          <Plus size={14} /> Add Plant
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Total plants', value: plants.length, color: 'var(--purple)' },
          { label: 'Indoor', value: plants.filter(p => p.location === 'indoor').length, color: LOCATION_COLORS.indoor },
          { label: 'Outdoor', value: plants.filter(p => p.location === 'outdoor').length, color: LOCATION_COLORS.outdoor },
          { label: 'Tasks due', value: overdueTasks.length + dueSoonTasks.length, color: overdueTasks.length > 0 ? 'var(--red)' : 'var(--amber)' },
        ].map(s => (
          <section key={s.label} className="panel" style={{ textAlign: 'center', padding: '10px 8px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
          </section>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={tab === 'plants' ? 'active' : ''} onClick={() => setTab('plants')}>
          My Plants ({plants.length})
        </button>
        <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>
          Care Log ({logs.length})
        </button>
        <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
          Tasks{pendingTasks.length > 0 ? ` (${pendingTasks.length})` : ''}
        </button>
        <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>
          AI Suggestions
        </button>
      </div>

      {/* ── Add/Edit Plant Form ─────────────────────────────────────────── */}
      {showAddPlant && (
        <section className="panel" style={{ borderLeft: '4px solid var(--green)', marginBottom: 14 }}>
          <div className="panel-head">
            <h2>{editingPlant ? `Edit -- ${editingPlant.name}` : 'Add a Plant'}</h2>
            <button className="btn ghost" onClick={() => { setShowAddPlant(false); setEditingPlant(null); resetPlantForm(); }}>
              <X size={14} /> Cancel
            </button>
          </div>
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Plant name *
              <input value={pName} onChange={e => setPName(e.target.value)} placeholder="e.g. Monstera" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Scientific name
              <input value={pSci} onChange={e => setPSci(e.target.value)} placeholder="e.g. Monstera deliciosa" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Nickname
              <input value={pNick} onChange={e => setPNick(e.target.value)} placeholder="e.g. Big Leaf Lady" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Location
              <select value={pLoc} onChange={e => setPLoc(e.target.value as Location)}>
                {(Object.entries(LOCATION_LABELS) as [Location, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Spot / Where it lives
              <input value={pSpot} onChange={e => setPSpot(e.target.value)} placeholder="e.g. kitchen windowsill" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Pot size
              <input value={pPot} onChange={e => setPPot(e.target.value)} placeholder="e.g. 6 inch" />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
            Notes / Observations
            <textarea value={pNotes} onChange={e => setPNotes(e.target.value)} placeholder="Current health, issues, special care notes..." style={{ minHeight: 60 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            Care guide (paste from your care guides or tag instructions)
            <textarea value={pGuide} onChange={e => setPGuide(e.target.value)} placeholder="Paste care guide info here -- watering frequency, light needs, fertilizing schedule, etc. AI will use this to make suggestions." style={{ minHeight: 100 }} />
          </label>
          <button className="btn primary" onClick={savePlant} disabled={pSaving || !pName.trim()}>
            {pSaving ? 'Saving...' : editingPlant ? 'Save Changes' : 'Add Plant'}
          </button>
        </section>
      )}

      {/* ── MY PLANTS TAB ───────────────────────────────────────────────── */}
      {tab === 'plants' && (
        <div>
          {/* Location filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {(['all', 'indoor', 'outdoor', 'garden'] as const).map(loc => (
              <button
                key={loc}
                onClick={() => setFilterLoc(loc)}
                style={{
                  padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                  border: `2px solid ${filterLoc === loc ? (loc === 'all' ? 'var(--purple)' : LOCATION_COLORS[loc as Location]) : 'var(--border)'}`,
                  background: filterLoc === loc ? (loc === 'all' ? 'var(--purple-bg)' : 'transparent') : 'transparent',
                  color: filterLoc === loc ? (loc === 'all' ? 'var(--purple)' : LOCATION_COLORS[loc as Location]) : 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                {loc === 'all' ? 'All Plants' : LOCATION_LABELS[loc as Location]}
                {' '}({loc === 'all' ? plants.length : plants.filter(p => p.location === loc).length})
              </button>
            ))}
          </div>

          {loading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading plants...</div>}

          {/* Plant cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {filteredPlants.map(p => {
              const care = lastCareMap[p.id] ?? {};
              const plantLogs = logs.filter(l => l.plant_id === p.id).slice(0, 3);
              const plantTasks = tasks.filter(t => t.plant_id === p.id && !t.is_done);
              const isExpanded = expandedPlant === p.id;

              return (
                <section key={p.id} className="panel" style={{ borderLeft: `4px solid ${LOCATION_COLORS[p.location]}` }}>
                  {/* Card header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Leaf size={14} color={LOCATION_COLORS[p.location]} />
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{p.nickname || p.name}</span>
                        {p.nickname && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.name}</span>}
                      </div>
                      {p.scientific_name && <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginTop: 2 }}>{p.scientific_name}</div>}
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: LOCATION_COLORS[p.location], background: `${LOCATION_COLORS[p.location]}22`, padding: '1px 7px', borderRadius: 999 }}>
                          {LOCATION_LABELS[p.location]}
                        </span>
                        {p.spot && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{p.spot}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="qty-button" title="Edit" onClick={() => startEdit(p)}><Edit2 size={12} /></button>
                      <button className="qty-button" style={{ color: 'var(--muted)' }} onClick={() => setExpandedPlant(isExpanded ? null : p.id)}>
                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* Last care summary */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    {care.watered && (
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                        Watered: <strong style={{ color: 'var(--text)' }}>{fmtDate(care.watered)}</strong>
                      </div>
                    )}
                    {care.fertilized && (
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                        Fed: <strong style={{ color: 'var(--text)' }}>{fmtDate(care.fertilized)}</strong>
                      </div>
                    )}
                    {!care.watered && !care.fertilized && (
                      <div style={{ fontSize: 10, color: 'var(--amber)' }}>No care logged yet</div>
                    )}
                  </div>

                  {/* Pending tasks */}
                  {plantTasks.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {plantTasks.slice(0, 2).map(t => (
                        <div key={t.id} style={{ fontSize: 11, color: t.due_date && t.due_date < today ? 'var(--red)' : 'var(--amber)', marginTop: 2 }}>
                          {t.due_date && t.due_date < today ? 'OVERDUE: ' : 'Due: '}{t.title}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Expanded section */}
                  {isExpanded && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      {p.notes && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>NOTES</div>
                          <div style={{ fontSize: 12 }}>{p.notes}</div>
                        </div>
                      )}
                      {p.care_guide && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>CARE GUIDE</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', maxHeight: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.care_guide.slice(0, 300)}{p.care_guide.length > 300 ? '...' : ''}</div>
                        </div>
                      )}
                      {plantLogs.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>RECENT CARE</div>
                          {plantLogs.map(l => (
                            <div key={l.id} style={{ fontSize: 11, display: 'flex', gap: 8, marginBottom: 3 }}>
                              <span style={{ background: 'var(--surface-2)', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>{LOG_TYPE_ICONS[l.log_type]}</span>
                              <span style={{ color: 'var(--muted)' }}>{fmtDate(l.log_date)}</span>
                              <span>{LOG_TYPE_LABELS[l.log_type]}</span>
                              {l.notes && <span style={{ color: 'var(--muted)' }}>-- {l.notes}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button className="btn ghost tiny" onClick={() => { setSelectedPlantId(p.id); setTab('log'); }}>Log care</button>
                        <button className="btn ghost tiny" onClick={() => { setAiPlantId(p.id); setTab('ai'); }}>AI suggestions</button>
                        <button className="btn ghost tiny" style={{ color: 'var(--red)', marginLeft: 'auto' }} onClick={() => archivePlant(p.id)}>Remove</button>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {filteredPlants.length === 0 && !loading && (
            <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
              <Leaf size={32} style={{ color: 'var(--muted)', marginBottom: 12 }} />
              <p style={{ color: 'var(--muted)' }}>No plants found. Click "Add Plant" to get started.</p>
            </section>
          )}
        </div>
      )}

      {/* ── CARE LOG TAB ────────────────────────────────────────────────── */}
      {tab === 'log' && (
        <div>
          {/* Log entry form */}
          <section className="panel" style={{ marginBottom: 14, borderLeft: '4px solid var(--green)' }}>
            <div className="panel-head"><h2>Log Care Activity</h2></div>
            <div className="form-grid" style={{ marginBottom: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                Plant
                <select value={selectedPlantId} onChange={e => setSelectedPlantId(e.target.value)}>
                  <option value="">-- Select a plant --</option>
                  {plants.map(p => <option key={p.id} value={p.id}>{p.nickname || p.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                Date
                <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                Activity type
                <select value={logType} onChange={e => setLogType(e.target.value as LogType)}>
                  {(Object.entries(LOG_TYPE_LABELS) as [LogType, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
              Notes (optional)
              <textarea value={logNotes} onChange={e => setLogNotes(e.target.value)} placeholder="How did it look? Any concerns? What product did you use?" style={{ minHeight: 60 }} />
            </label>
            <button className="btn primary" onClick={saveLog} disabled={logSaving || !selectedPlantId}>
              {logSaving ? 'Saving...' : 'Log Activity'}
            </button>
          </section>

          {/* Log history */}
          <section className="panel">
            <div className="panel-head"><h2>Recent Activity</h2><span className="readonly-pill">{logs.length} entries</span></div>
            {logs.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>No care logged yet.</div>}
            {logs.slice(0, 50).map(l => {
              const plant = plants.find(p => p.id === l.plant_id);
              return (
                <div key={l.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--surface-2)', borderRadius: 5, padding: '2px 6px', flexShrink: 0 }}>
                    {LOG_TYPE_ICONS[l.log_type]}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{plant?.nickname || plant?.name || 'Unknown'}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{LOG_TYPE_LABELS[l.log_type]} -- {fmtDate(l.log_date)}</div>
                    {l.notes && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{l.notes}</div>}
                  </div>
                  {plant && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: LOCATION_COLORS[plant.location], background: `${LOCATION_COLORS[plant.location]}22`, padding: '1px 6px', borderRadius: 999, flexShrink: 0 }}>
                      {LOCATION_LABELS[plant.location]}
                    </span>
                  )}
                </div>
              );
            })}
          </section>
        </div>
      )}

      {/* ── TASKS TAB ───────────────────────────────────────────────────── */}
      {tab === 'tasks' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn primary" onClick={() => setShowAddTask(v => !v)}>
              <Plus size={14} /> Add Task
            </button>
          </div>

          {showAddTask && (
            <section className="panel" style={{ borderLeft: '4px solid var(--purple)', marginBottom: 14 }}>
              <div className="panel-head">
                <h2>New Task</h2>
                <button className="btn ghost" onClick={() => setShowAddTask(false)}><X size={14} /> Cancel</button>
              </div>
              <div className="form-grid" style={{ marginBottom: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Task title *
                  <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="e.g. Repot monstera" />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Plant (optional)
                  <select value={taskPlantId} onChange={e => setTaskPlantId(e.target.value)}>
                    <option value="">All plants / General</option>
                    {plants.map(p => <option key={p.id} value={p.id}>{p.nickname || p.name}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Due date
                  <input type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Priority
                  <select value={taskPriority} onChange={e => setTaskPriority(e.target.value as Priority)}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                Description
                <textarea value={taskDesc} onChange={e => setTaskDesc(e.target.value)} placeholder="Details about what to do..." style={{ minHeight: 50 }} />
              </label>
              <button className="btn primary" onClick={saveTask} disabled={taskSaving || !taskTitle.trim()}>
                {taskSaving ? 'Saving...' : 'Save Task'}
              </button>
            </section>
          )}

          {/* Overdue */}
          {overdueTasks.length > 0 && (
            <section className="panel" style={{ borderLeft: '4px solid var(--red)', marginBottom: 12 }}>
              <div className="panel-head"><h2 style={{ color: 'var(--red)' }}>Overdue ({overdueTasks.length})</h2></div>
              {overdueTasks.map(t => <TaskRow key={t.id} task={t} plants={plants} today={today} onToggle={toggleTask} onDelete={deleteTask} />)}
            </section>
          )}

          {/* Due soon */}
          {dueSoonTasks.length > 0 && (
            <section className="panel" style={{ borderLeft: '4px solid var(--amber)', marginBottom: 12 }}>
              <div className="panel-head"><h2 style={{ color: 'var(--amber)' }}>Due This Week ({dueSoonTasks.length})</h2></div>
              {dueSoonTasks.map(t => <TaskRow key={t.id} task={t} plants={plants} today={today} onToggle={toggleTask} onDelete={deleteTask} />)}
            </section>
          )}

          {/* All pending */}
          <section className="panel">
            <div className="panel-head"><h2>All Pending Tasks</h2><span className="readonly-pill">{pendingTasks.length}</span></div>
            {pendingTasks.length === 0 && <div style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>All caught up! No pending tasks.</div>}
            {pendingTasks.filter(t => !overdueTasks.includes(t) && !dueSoonTasks.includes(t)).map(t => (
              <TaskRow key={t.id} task={t} plants={plants} today={today} onToggle={toggleTask} onDelete={deleteTask} />
            ))}
          </section>

          {/* Completed */}
          {tasks.filter(t => t.is_done).length > 0 && (
            <section className="panel" style={{ marginTop: 12, opacity: 0.7 }}>
              <div className="panel-head"><h2>Completed</h2><span className="readonly-pill">{tasks.filter(t => t.is_done).length}</span></div>
              {tasks.filter(t => t.is_done).slice(0, 10).map(t => (
                <TaskRow key={t.id} task={t} plants={plants} today={today} onToggle={toggleTask} onDelete={deleteTask} />
              ))}
            </section>
          )}
        </div>
      )}

      {/* ── AI SUGGESTIONS TAB ──────────────────────────────────────────── */}
      {tab === 'ai' && (
        <div>
          <section className="panel" style={{ marginBottom: 14 }}>
            <div className="panel-head">
              <h2><Sparkles size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />AI Care Suggestions</h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              Select a plant and get personalized care advice based on your care guide, recent activity, and {currentMonth} conditions in Canton, GA (Zone 7b).
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
              <select
                value={aiPlantId}
                onChange={e => { setAiPlantId(e.target.value); setAiResult(''); }}
                style={{ flex: 1 }}
              >
                <option value="">-- Select a plant --</option>
                {plants.map(p => <option key={p.id} value={p.id}>{p.nickname || p.name}{p.location ? ` (${LOCATION_LABELS[p.location]})` : ''}</option>)}
              </select>
              <button className="btn primary" onClick={generateSuggestions} disabled={aiLoading || !aiPlantId}>
                {aiLoading ? <><RefreshCw size={13} className="spin" /> Thinking...</> : 'Get Suggestions'}
              </button>
            </div>

            {aiPlantId && !aiResult && !aiLoading && (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {(() => {
                  const p = plants.find(pl => pl.id === aiPlantId);
                  if (!p) return null;
                  const care = lastCareMap[p.id] ?? {};
                  return (
                    <div style={{ background: 'var(--surface-1)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>{p.nickname || p.name} -- Quick Summary</div>
                      <div>Last watered: {care.watered ? fmtDate(care.watered) : 'Never logged'}</div>
                      <div>Last fertilized: {care.fertilized ? fmtDate(care.fertilized) : 'Never logged'}</div>
                      <div>Care guide: {p.care_guide ? 'Provided' : 'None -- add one in Edit Plant for better suggestions'}</div>
                      <div>Location: {LOCATION_LABELS[p.location]}{p.spot ? ` -- ${p.spot}` : ''}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {aiLoading && (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)', fontSize: 13 }}>
                <RefreshCw size={20} className="spin" style={{ display: 'block', margin: '0 auto 12px' }} />
                Generating care suggestions for {currentMonth} in Zone 7b...
              </div>
            )}

            {aiResult && (
              <div style={{ background: 'var(--surface-1)', borderRadius: 10, padding: '14px 16px', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                {aiResult}
              </div>
            )}
          </section>

          {/* Seasonal tips for all plants */}
          <section className="panel">
            <div className="panel-head"><h2>General {currentMonth} Tips for Canton, GA (Zone 7b)</h2></div>
            <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text)' }}>
              {getSeasonalTips(new Date().getMonth()).map((tip, i) => (
                <div key={i} style={{ marginBottom: 6, paddingLeft: 12, borderLeft: '2px solid var(--green)' }}>{tip}</div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

// __ TaskRow component ____________________________________________________

function TaskRow({ task, plants, today, onToggle, onDelete }: {
  task: PlantTask;
  plants: Plant[];
  today: string;
  onToggle: (t: PlantTask) => void;
  onDelete: (id: string) => void;
}) {
  const plant = plants.find(p => p.id === task.plant_id);
  const isOverdue = !task.is_done && task.due_date && task.due_date < today;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, marginTop: 1 }} onClick={() => onToggle(task)}>
        {task.is_done
          ? <CheckCircle2 size={18} color="var(--green)" />
          : <Circle size={18} color={isOverdue ? 'var(--red)' : PRIORITY_COLORS[task.priority]} />
        }
      </button>
      <div style={{ flex: 1, opacity: task.is_done ? 0.5 : 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, textDecoration: task.is_done ? 'line-through' : 'none' }}>{task.title}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
          {plant && <span style={{ color: LOCATION_COLORS[plant.location], marginRight: 8 }}>{plant.nickname || plant.name}</span>}
          {task.due_date && <span style={{ color: isOverdue ? 'var(--red)' : 'var(--muted)' }}>Due {task.due_date}</span>}
          {task.source === 'ai' && <span style={{ marginLeft: 8, color: 'var(--purple)' }}>AI suggested</span>}
        </div>
        {task.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{task.description}</div>}
      </div>
      <button className="qty-button" style={{ color: 'var(--red)', flexShrink: 0 }} onClick={() => onDelete(task.id)}>
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// __ Seasonal tips ________________________________________________________

function getSeasonalTips(month: number): string[] {
  const tips: Record<number, string[]> = {
    0: [ // January
      'Reduce watering for most indoor plants -- they are in dormancy.',
      'Check for spider mites on houseplants -- indoor heating dries the air.',
      'No fertilizing for most plants this month.',
      'Protect outdoor plants from frost -- Zone 7b can see freezes below 10F.',
      'Good time to plan your spring garden and order seeds.',
    ],
    1: [ // February
      'Start seeds indoors for tomatoes and peppers (6-8 weeks before last frost).',
      'Watch for early buds on azaleas -- protect from late freezes.',
      'Begin light fertilizing for citrus trees as days get longer.',
      'Check soil moisture more frequently as days warm up.',
    ],
    2: [ // March
      'Last frost in Canton area is typically mid-March -- wait before planting tender plants outside.',
      'Begin fertilizing houseplants as they exit dormancy.',
      'Repot root-bound plants before the growing season kicks in.',
      'Direct sow cool-season crops: lettuce, spinach, cilantro.',
      'Prune azaleas AFTER they bloom -- pruning now removes flower buds.',
    ],
    3: [ // April
      'Safe to move most outdoor plants outside after April 15.',
      'Begin regular fertilizing schedule for all actively growing plants.',
      'Water more frequently as temperatures rise -- check soil daily.',
      'Watch for aphids on new growth -- treat early with neem oil.',
      'Good month to repot and divide perennials.',
    ],
    4: [ // May
      'Heat is building -- increase watering frequency for outdoor pots.',
      'Fertilize herbs every 2 weeks for best production.',
      'Deadhead petunias and fuchsias regularly to promote blooming.',
      'Watch for fungal issues as humidity rises -- ensure good air circulation.',
      'Good month to propagate tradescantia and philodendron cuttings.',
    ],
    5: [ // June
      'Georgia summer heat is here -- most outdoor plants need water every 1-2 days.',
      'Water deeply in the morning to reduce evaporation and fungal issues.',
      'Mulch outdoor beds to retain moisture and regulate soil temperature.',
      'Pinch back basil flowers to keep leaf production going.',
      'Move lime tree outdoors if temperatures are consistently above 50F at night.',
      'Fiddle leaf fig and monstera love humidity -- mist or use a pebble tray.',
      'Check for spider mites and aphids weekly -- populations explode in summer.',
      'Lavender may struggle in high humidity -- ensure excellent drainage.',
    ],
    6: [ // July
      'Peak summer heat -- water outdoor plants daily, possibly twice for containers.',
      'Herbs may bolt in heat -- harvest frequently and pinch flowers.',
      'Clematis may take a mid-summer break -- normal, do not over-fertilize.',
      'Reduce fertilizing for stressed plants -- wait until temperatures drop.',
      'Indoor plants: keep away from AC vents which dry the air drastically.',
    ],
    7: [ // August
      'Continue heavy watering -- August is often the hottest month.',
      'Watch lime tree for leaf drop from heat stress.',
      'Begin planning fall garden -- start seeds for fall herbs.',
      'Deadhead all flowering annuals to extend the season.',
      'Check soil pH in garden beds before fall planting.',
    ],
    8: [ // September
      'Temperatures begin to drop -- reduce watering frequency slightly.',
      'Good time to fertilize one last time before winter.',
      'Plant cool-season crops: cilantro, spinach, lettuce.',
      'Bring tropical plants like lime tree inside before first frost warning.',
      'Divide and transplant perennials this month.',
    ],
    9: [ // October
      'First frost possible late October -- watch forecasts.',
      'Bring all tender tropicals indoors before frost.',
      'Stop fertilizing most plants as they prepare for dormancy.',
      'Plant spring bulbs if desired.',
      'Cut back perennials after frost kills the foliage.',
    ],
    10: [ // November
      'Houseplants: reduce watering significantly as growth slows.',
      'Move fuchsias to a cool but frost-free location for overwintering.',
      'Mulch outdoor plants to protect roots from freeze/thaw cycles.',
      'Azaleas and clematis are dormant -- minimal care needed.',
      'Good month for indoor propagation projects.',
    ],
    11: [ // December
      'Minimal watering for most houseplants -- check soil before watering.',
      'Watch for holiday plant pests (poinsettia whitefly can spread).',
      'Good time to clean and organize garden tools and supplies.',
      'Review your plant catalog and plan any additions for spring.',
      'Amaryllis and paperwhites make great winter indoor blooms.',
    ],
  };
  return tips[month] ?? tips[5];
}
