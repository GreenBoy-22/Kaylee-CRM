// src/PlantCatalog.tsx  (Outdoor Guide)
//
// Outdoor Guide -- toggle between: Plants | Moisture Meter | Reference Library | Birds
// Plants: accordion list with care guide sections, household history, inline AI, care log, tasks.
// Moisture Meter: log a reading for any plant and get instant water/wait advice.
// Reference Library: composting, herb harvest, propagation, and general guides.
// Birds: Canton GA backyard bird info.

import { useCallback, useEffect, useState, useMemo } from 'react';
import { Plus, X, Save, RefreshCw, Leaf, ChevronDown, ChevronRight, Sparkles, CheckCircle2, Circle, Trash2, Edit2, Droplets, Sun, Thermometer, Bug, Scissors, FlaskConical, BookOpen, Gauge } from 'lucide-react';
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

interface CareSection {
  label: string;
  icon: React.ReactNode;
  color: string;
  content: string;
}

// __ Constants ___________________________________________________________

const LOCATION_LABELS: Record<Location, string> = {
  indoor:  'Indoor',
  outdoor: 'Outdoor',
  garden:  "Garden (Mom's)",
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

const LOG_TYPE_EMOJI: Record<LogType, string> = {
  watered:     '💧',
  fertilized:  '🌱',
  repotted:    '🪴',
  pruned:      '✂️',
  treated:     '🐛',
  observation: '👁️',
  propagated:  '🌿',
  other:       '📝',
};

const PRIORITY_COLORS: Record<Priority, string> = {
  low:    'var(--green)',
  medium: 'var(--amber)',
  high:   'var(--red)',
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function toKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// __ Parse care guide into named sections ________________________________

function parseCareGuide(guide: string): CareSection[] {
  const sectionDefs = [
    { keys: ['LIGHT'], label: 'Light', icon: <Sun size={13} />, color: '#f59e0b' },
    { keys: ['WATER'], label: 'Water', icon: <Droplets size={13} />, color: '#0891b2' },
    { keys: ['SOIL'], label: 'Soil', icon: <span style={{ fontSize: 13 }}>🪨</span>, color: '#92400e' },
    { keys: ['FERTILIZER', 'FEED'], label: 'Fertilizer', icon: <FlaskConical size={13} />, color: '#16a34a' },
    { keys: ['TEMPERATURE', 'TEMP'], label: 'Temperature', icon: <Thermometer size={13} />, color: '#dc2626' },
    { keys: ['HUMIDITY'], label: 'Humidity', icon: <span style={{ fontSize: 13 }}>💨</span>, color: '#7c3aed' },
    { keys: ['PRUNING', 'HARVEST'], label: 'Pruning & Harvest', icon: <Scissors size={13} />, color: '#059669' },
    { keys: ['REPOTTING', 'PLANTING'], label: 'Repotting', icon: <span style={{ fontSize: 13 }}>🪴</span>, color: '#d97706' },
    { keys: ['PESTS'], label: 'Pests', icon: <Bug size={13} />, color: '#b91c1c' },
    { keys: ['ZONE 7B', 'CANTON', 'GA NOTES'], label: 'Zone 7b / Canton GA Notes', icon: <span style={{ fontSize: 13 }}>🌿</span>, color: '#065f46' },
  ];

  const lines = guide.split('\n');
  const sections: CareSection[] = [];
  let currentDef: typeof sectionDefs[0] | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentDef && currentLines.length > 0) {
      const content = currentLines.join('\n').trim();
      if (content) sections.push({ label: currentDef.label, icon: currentDef.icon, color: currentDef.color, content });
    }
  };

  for (const line of lines) {
    const upper = line.toUpperCase();
    const matched = sectionDefs.find(d => d.keys.some(k => upper.startsWith(k)));
    if (matched) {
      flush();
      currentDef = matched;
      const key = matched.keys.find(k => upper.startsWith(k))!;
      const rest = line.slice(key.length).replace(/^[\s:–-]+/, '');
      currentLines = rest ? [rest] : [];
    } else if (currentDef) {
      currentLines.push(line);
    }
  }
  flush();

  if (sections.length === 0 && guide.trim()) {
    sections.push({ label: 'Care Guide', icon: <Leaf size={13} />, color: 'var(--purple)', content: guide.trim() });
  }

  return sections;
}

// __ Default plants to seed ______________________________________________

const DEFAULT_PLANTS: Omit<Plant, 'id' | 'created_at'>[] = [
  { name: 'Fiddle Leaf Fig', scientific_name: 'Ficus lyrata',        nickname: null, location: 'indoor',  spot: null, pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Monstera',        scientific_name: 'Monstera deliciosa',   nickname: null, location: 'indoor',  spot: null, pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Lime Tree',       scientific_name: 'Citrus aurantiifolia', nickname: null, location: 'indoor',  spot: 'Indoors (warm season)', pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Rosemary',        scientific_name: 'Salvia rosmarinus',    nickname: null, location: 'outdoor', spot: 'Herb garden', pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Clematis',        scientific_name: 'Clematis spp.',        nickname: null, location: 'outdoor', spot: null, pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Lavender',        scientific_name: 'Lavandula spp.',       nickname: null, location: 'outdoor', spot: null, pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
  { name: 'Azalea',          scientific_name: 'Rhododendron spp.',    nickname: null, location: 'outdoor', spot: null, pot_size: null, soil_type: null, photo_url: null, notes: null, is_active: true, care_guide: null, acquired_date: null },
];

// __ AI suggestion helper ________________________________________________

async function getAISuggestions(plant: Plant, recentLogs: PlantLog[]): Promise<string> {
  const today = new Date();
  const month = MONTH_NAMES[today.getMonth()];
  const season = today.getMonth() >= 2 && today.getMonth() <= 4 ? 'Spring'
    : today.getMonth() >= 5 && today.getMonth() <= 7 ? 'Summer'
    : today.getMonth() >= 8 && today.getMonth() <= 10 ? 'Fall' : 'Winter';

  const lastWatered    = recentLogs.filter(l => l.log_type === 'watered').sort((a,b) => b.log_date.localeCompare(a.log_date))[0];
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
  if (data.content?.[0]?.text) return data.content[0].text;
  throw new Error('No response from AI');
}

// __ Main component ______________________________________________________

export default function PlantCatalog() {
  // Top-level section toggle
  const [section, setSection] = useState<'plants' | 'moisture' | 'library' | 'birds'>('plants');

  const [plants, setPlants]   = useState<Plant[]>([]);
  const [logs, setLogs]       = useState<PlantLog[]>([]);
  const [tasks, setTasks]     = useState<PlantTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeded, setSeeded]   = useState(false);
  const [tab, setTab]         = useState<'plants' | 'log' | 'tasks' | 'ai'>('plants');

  // Accordion + per-plant AI
  const [expandedPlant, setExpandedPlant]       = useState<string | null>(null);
  const [plantAiResults, setPlantAiResults]     = useState<Record<string, string>>({});
  const [plantAiLoading, setPlantAiLoading]     = useState<Record<string, boolean>>({});

  // Add/edit plant form
  const [showAddPlant, setShowAddPlant]   = useState(false);
  const [editingPlant, setEditingPlant]   = useState<Plant | null>(null);
  const [pName, setPName]   = useState('');
  const [pSci, setPSci]     = useState('');
  const [pNick, setPNick]   = useState('');
  const [pLoc, setPLoc]     = useState<Location>('indoor');
  const [pSpot, setPSpot]   = useState('');
  const [pPot, setPPot]     = useState('');
  const [pNotes, setPNotes] = useState('');
  const [pGuide, setPGuide] = useState('');
  const [pSaving, setPSaving] = useState(false);

  // Care log form
  const [selectedPlantId, setSelectedPlantId] = useState('');
  const [logDate, setLogDate]   = useState(toKey(new Date()));
  const [logType, setLogType]   = useState<LogType>('watered');
  const [logNotes, setLogNotes] = useState('');
  const [logSaving, setLogSaving] = useState(false);

  // Task form
  const [showAddTask, setShowAddTask]       = useState(false);
  const [taskPlantId, setTaskPlantId]       = useState('');
  const [taskTitle, setTaskTitle]           = useState('');
  const [taskDesc, setTaskDesc]             = useState('');
  const [taskDue, setTaskDue]               = useState('');
  const [taskPriority, setTaskPriority]     = useState<Priority>('medium');
  const [taskSaving, setTaskSaving]         = useState(false);

  // Legacy standalone AI tab
  const [aiPlantId, setAiPlantId] = useState('');
  const [aiResult, setAiResult]   = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // Moisture Meter state
  const [moisturePlantId, setMoisturePlantId]   = useState('');
  const [moistureReading, setMoistureReading]   = useState<number>(5);
  const [moistureSaving, setMoistureSaving]     = useState(false);
  const [moistureHistory, setMoistureHistory]   = useState<{plant_id:string;reading:number;logged_at:string;notes:string|null}[]>([]);

  // Reference Library state
  const [libSection, setLibSection] = useState<string>('all');
  const [libArticles, setLibArticles] = useState<{id:string;section:string;title:string;content:string;tags:string[]}[]>([]);
  const [libLoading, setLibLoading]   = useState(false);
  const [libExpanded, setLibExpanded] = useState<string | null>(null);

  // Filters
  const [filterLoc, setFilterLoc]     = useState<Location | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

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

  // Load reference library articles
  const loadLibrary = useCallback(async () => {
    if (!supabase) return;
    setLibLoading(true);
    const { data } = await supabase
      .from('outdoor_guide_articles')
      .select('*')
      .order('section')
      .order('title');
    setLibArticles((data as typeof libArticles) ?? []);
    setLibLoading(false);
  }, []);

  // Load moisture history
  const loadMoistureHistory = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('plant_moisture_log')
      .select('*')
      .order('logged_at', { ascending: false })
      .limit(50);
    setMoistureHistory((data as typeof moistureHistory) ?? []);
  }, []);

  useEffect(() => {
    if (section === 'library') loadLibrary();
    if (section === 'moisture') loadMoistureHistory();
  }, [section, loadLibrary, loadMoistureHistory]);

  // Moisture meter advice engine
  function getMoistureAdvice(reading: number, plant: Plant): { action: string; color: string; targetRange: string; detail: string } {
    const guide = plant.care_guide?.toUpperCase() ?? '';

    // Detect plant type from name/guide for targeted advice
    const isDrought = /succulent|cactus|snake plant|zz plant|string of pearl|lavender|rosemary|thyme/i.test(plant.name + plant.care_guide);
    const isMoist   = /monstera|philodendron|fern|mint|basil|strawberry|tomato|calla/i.test(plant.name + plant.care_guide);

    // Parse ideal range from care guide if present
    const rangeMatch = guide.match(/IDEAL[^\d]*(\d)[^\d]*[–-](\d)/);
    const waterMatch = guide.match(/WATER (?:AT|WHEN)[^\d]*(\d)/);
    const guideTarget = rangeMatch ? `${rangeMatch[1]}–${rangeMatch[2]}` : null;
    const guideWaterAt = waterMatch ? parseInt(waterMatch[1]) : null;

    const droughtRange = '1–3';
    const normalRange  = '4–6';
    const moistRange   = '4–6';
    const targetRange  = guideTarget ?? (isDrought ? droughtRange : isMoist ? moistRange : normalRange);
    const waterAt      = guideWaterAt ?? (isDrought ? 2 : 3);

    if (reading <= waterAt) {
      return {
        action: '💧 WATER NOW',
        color: '#ef4444',
        targetRange,
        detail: `Reading of ${reading} is at or below the water threshold (${waterAt}) for ${plant.name}. Water thoroughly until drainage flows. Target range: ${targetRange}.`,
      };
    } else if (reading <= parseInt(targetRange.split('–')[0]) + 1) {
      return {
        action: '💧 WATER SOON',
        color: '#f97316',
        targetRange,
        detail: `Reading of ${reading} is getting low. Check again in 1–2 days. Water when it drops to ${waterAt}. Target range: ${targetRange}.`,
      };
    } else if (reading <= parseInt(targetRange.split('–')[1] ?? '6')) {
      return {
        action: '✅ ALL GOOD',
        color: '#16a34a',
        targetRange,
        detail: `Reading of ${reading} is in the ideal range for ${plant.name}. No action needed. Target range: ${targetRange}.`,
      };
    } else if (reading <= 7) {
      return {
        action: '⏳ WAIT — SLIGHTLY WET',
        color: '#eab308',
        targetRange,
        detail: `Reading of ${reading} is a bit high. Skip watering and check again in 2–3 days. Target range: ${targetRange}.`,
      };
    } else {
      return {
        action: '🚫 DO NOT WATER — TOO WET',
        color: '#dc2626',
        targetRange,
        detail: `Reading of ${reading} indicates overwatering risk. Allow soil to dry significantly before watering again. Check for drainage issues. Target range: ${targetRange}.`,
      };
    }
  }

  async function saveMoistureReading() {
    if (!supabase || !moisturePlantId) return;
    setMoistureSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) { setMoistureSaving(false); return; }
    await supabase.from('plant_moisture_log').insert({
      plant_id: moisturePlantId,
      user_id: userId,
      reading: moistureReading,
      logged_at: new Date().toISOString(),
    });
    await loadMoistureHistory();
    setMoistureSaving(false);
  }
    setPName(''); setPSci(''); setPNick(''); setPLoc('indoor');
    setPSpot(''); setPPot(''); setPNotes(''); setPGuide('');
  }

  function startEdit(p: Plant) {
    setEditingPlant(p);
    setPName(p.name); setPSci(p.scientific_name ?? ''); setPNick(p.nickname ?? '');
    setPLoc(p.location); setPSpot(p.spot ?? ''); setPPot(p.pot_size ?? '');
    setPNotes(p.notes ?? ''); setPGuide(p.care_guide ?? '');
    setShowAddPlant(true);
  }

  async function savePlant() {
    if (!supabase || !pName.trim()) return;
    setPSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) { setPSaving(false); return; }
    const payload = {
      name: pName.trim(), scientific_name: pSci.trim() || null, nickname: pNick.trim() || null,
      location: pLoc, spot: pSpot.trim() || null, pot_size: pPot.trim() || null,
      notes: pNotes.trim() || null, care_guide: pGuide.trim() || null, is_active: true,
    };
    if (editingPlant) {
      await supabase.from('plants').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingPlant.id);
    } else {
      await supabase.from('plants').insert([{ ...payload, user_id: userId }]);
    }
    await load();
    setShowAddPlant(false); setEditingPlant(null); resetPlantForm(); setPSaving(false);
  }

  async function archivePlant(id: string) {
    if (!supabase) return;
    await supabase.from('plants').update({ is_active: false }).eq('id', id);
    setPlants(prev => prev.filter(p => p.id !== id));
  }

  async function saveLog() {
    if (!supabase || !selectedPlantId) return;
    setLogSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) { setLogSaving(false); return; }
    await supabase.from('plant_log').insert([{
      plant_id: selectedPlantId, user_id: userId, log_date: logDate,
      log_type: logType, notes: logNotes.trim() || null,
    }]);
    setLogNotes(''); setLogDate(toKey(new Date()));
    await load(); setLogSaving(false);
  }

  async function saveTask() {
    if (!supabase || !taskTitle.trim()) return;
    setTaskSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) { setTaskSaving(false); return; }
    await supabase.from('plant_tasks').insert([{
      plant_id: taskPlantId || null, user_id: userId, title: taskTitle.trim(),
      description: taskDesc.trim() || null, due_date: taskDue || null,
      priority: taskPriority, source: 'manual' as TaskSource, is_done: false,
    }]);
    setTaskTitle(''); setTaskDesc(''); setTaskDue(''); setTaskPlantId(''); setTaskPriority('medium');
    setShowAddTask(false); await load(); setTaskSaving(false);
  }

  async function toggleTask(t: PlantTask) {
    if (!supabase) return;
    await supabase.from('plant_tasks').update({ is_done: !t.is_done, done_date: !t.is_done ? toKey(new Date()) : null }).eq('id', t.id);
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, is_done: !x.is_done } : x));
  }

  async function deleteTask(id: string) {
    if (!supabase) return;
    await supabase.from('plant_tasks').delete().eq('id', id);
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  async function generateInlineAI(plant: Plant) {
    setPlantAiLoading(prev => ({ ...prev, [plant.id]: true }));
    try {
      const result = await getAISuggestions(plant, logs.filter(l => l.plant_id === plant.id));
      setPlantAiResults(prev => ({ ...prev, [plant.id]: result }));
    } catch {
      setPlantAiResults(prev => ({ ...prev, [plant.id]: 'Sorry, could not generate suggestions. Try again.' }));
    }
    setPlantAiLoading(prev => ({ ...prev, [plant.id]: false }));
  }

  async function generateSuggestions() {
    if (!aiPlantId) return;
    setAiLoading(true); setAiResult('');
    try {
      const plant = plants.find(p => p.id === aiPlantId);
      if (!plant) throw new Error('Plant not found');
      setAiResult(await getAISuggestions(plant, logs.filter(l => l.plant_id === aiPlantId)));
    } catch { setAiResult('Sorry, could not generate suggestions. Please try again.'); }
    setAiLoading(false);
  }

  // __ Computed ____________________________________________________________
  const today        = toKey(new Date());
  const currentMonth = MONTH_NAMES[new Date().getMonth()];

  const filteredPlants = useMemo(() => {
    let list = filterLoc === 'all' ? plants : plants.filter(p => p.location === filterLoc);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.nickname ?? '').toLowerCase().includes(q) ||
        (p.scientific_name ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [plants, filterLoc, searchQuery]);

  const overdueTasks  = tasks.filter(t => !t.is_done && t.due_date && t.due_date < today);
  const dueSoonTasks  = tasks.filter(t => !t.is_done && t.due_date && t.due_date >= today && t.due_date <= toKey(new Date(Date.now() + 7*24*60*60*1000)));
  const pendingTasks  = tasks.filter(t => !t.is_done);

  const lastCareMap = useMemo(() => {
    const m: Record<string, Record<LogType, string>> = {};
    for (const log of logs) {
      if (!m[log.plant_id]) m[log.plant_id] = {} as Record<LogType, string>;
      if (!m[log.plant_id][log.log_type]) m[log.plant_id][log.log_type] = log.log_date;
    }
    return m;
  }, [logs]);

  // __ Render ______________________________________________________________
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Outdoor Guide</h1>
          <p>{section === 'plants' ? `${plants.length} plants · ` : ''}{currentMonth} · Canton, GA Zone 7b</p>
        </div>
        {section === 'plants' && (
          <button className="btn primary" onClick={() => { resetPlantForm(); setEditingPlant(null); setShowAddPlant(true); }}>
            <Plus size={14} /> Add Plant
          </button>
        )}
      </div>

      {/* ── Top-level section toggle ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'plants',   label: '🌿 Plants',            color: '#16a34a' },
          { key: 'moisture', label: '💧 Moisture Meter',     color: '#0891b2' },
          { key: 'library',  label: '📚 Reference Library',  color: '#7c3aed' },
          { key: 'birds',    label: '🐦 Birds',              color: '#d97706' },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => setSection(s.key as typeof section)}
            style={{
              padding: '10px 8px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              border: `2px solid ${section === s.key ? s.color : 'var(--border)'}`,
              background: section === s.key ? `${s.color}18` : 'transparent',
              color: section === s.key ? s.color : 'var(--muted)',
              transition: 'all 0.15s',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── MOISTURE METER SECTION ── */}
      {section === 'moisture' && (
        <div>
          <section className="panel" style={{ borderTop: '3px solid #0891b2', marginBottom: 14 }}>
            <div className="panel-head">
              <h2><Gauge size={15} style={{ verticalAlign: 'middle', marginRight: 6, color: '#0891b2' }} />Log a Moisture Reading</h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
              Select a plant, enter the current moisture meter reading (1–10), and get instant advice on whether to water.
            </p>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                Plant
                <select value={moisturePlantId} onChange={e => { setMoisturePlantId(e.target.value); }} style={{ fontSize: 13 }}>
                  <option value="">-- Select a plant --</option>
                  {plants.map(p => <option key={p.id} value={p.id}>{p.nickname || p.name} ({LOCATION_LABELS[p.location]})</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                Meter Reading (1–10)
                <input
                  type="number" min={1} max={10} value={moistureReading}
                  onChange={e => { setMoistureReading(Math.min(10, Math.max(1, parseInt(e.target.value) || 1))); }}
                  style={{ fontSize: 20, fontWeight: 800, textAlign: 'center', color: moistureReading <= 2 ? '#ef4444' : moistureReading <= 4 ? '#f97316' : moistureReading <= 6 ? '#16a34a' : moistureReading <= 7 ? '#eab308' : '#dc2626' }}
                />
              </label>
            </div>

            {/* Visual meter */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                  <div
                    key={n}
                    onClick={() => { setMoistureReading(n); }}
                    style={{
                      flex: 1, height: 32, borderRadius: 4, cursor: 'pointer',
                      background: n <= moistureReading
                        ? n <= 2 ? '#ef4444' : n <= 3 ? '#f97316' : n <= 6 ? '#16a34a' : n <= 7 ? '#eab308' : '#dc2626'
                        : 'var(--surface-2)',
                      border: n === moistureReading ? '2px solid var(--text)' : '2px solid transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700,
                      color: n <= moistureReading ? '#fff' : 'var(--muted)',
                      transition: 'all 0.1s',
                    }}
                  >
                    {n}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)' }}>
                <span>DRY</span>
                <span>← IDEAL ZONE →</span>
                <span>WET</span>
              </div>
            </div>

            {/* Instant advice */}
            {moisturePlantId && (() => {
              const plant = plants.find(p => p.id === moisturePlantId);
              if (!plant) return null;
              const advice = getMoistureAdvice(moistureReading, plant);
              return (
                <div style={{ background: `${advice.color}15`, border: `2px solid ${advice.color}`, borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: advice.color, marginBottom: 6 }}>{advice.action}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>{advice.detail}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                    Target range for {plant.name}: <strong>{advice.targetRange}</strong>
                  </div>
                </div>
              );
            })()}

            <button
              className="btn primary"
              onClick={saveMoistureReading}
              disabled={moistureSaving || !moisturePlantId}
            >
              {moistureSaving ? 'Saving...' : '💾 Save Reading to Log'}
            </button>
          </section>

          {/* Moisture quick reference */}
          <section className="panel" style={{ marginBottom: 14 }}>
            <div className="panel-head"><h2>Moisture Meter Scale Reference</h2></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { range: '1–2', label: 'DRY', detail: 'Water thoroughly — plant is moisture stressed', bg: '#fee2e2', color: '#ef4444' },
                { range: '3–5', label: 'SLIGHTLY MOIST', detail: 'Generally suitable — monitor and check again soon', bg: '#ffedd5', color: '#f97316' },
                { range: '6–8', label: 'MOIST', detail: 'Ideal for most houseplants — keep up your routine', bg: '#dcfce7', color: '#16a34a' },
                { range: '9–10', label: 'WET', detail: 'Do not water — risk of root rot and fungal issues', bg: '#dbeafe', color: '#1d4ed8' },
              ].map(r => (
                <div key={r.range} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 12px', background: r.bg, borderRadius: 8, borderLeft: `4px solid ${r.color}` }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: r.color, minWidth: 36 }}>{r.range}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: r.color }}>{r.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text)' }}>{r.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Recent moisture history */}
          {moistureHistory.length > 0 && (
            <section className="panel">
              <div className="panel-head"><h2>Recent Readings</h2><span className="readonly-pill">{moistureHistory.length}</span></div>
              {moistureHistory.slice(0, 20).map((r, i) => {
                const plant = plants.find(p => p.id === r.plant_id);
                const color = r.reading <= 2 ? '#ef4444' : r.reading <= 4 ? '#f97316' : r.reading <= 6 ? '#16a34a' : r.reading <= 7 ? '#eab308' : '#dc2626';
                return (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color, minWidth: 30, textAlign: 'center' }}>{r.reading}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{plant?.nickname || plant?.name || 'Unknown plant'}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(r.logged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                    </div>
                    {r.notes && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.notes}</div>}
                  </div>
                );
              })}
            </section>
          )}
        </div>
      )}

      {/* ── REFERENCE LIBRARY SECTION ── */}
      {section === 'library' && (
        <div>
          {/* Section filter pills */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {[
              { key: 'all',           label: 'All' },
              { key: 'composting',    label: '♻️ Composting' },
              { key: 'moisture_meter',label: '💧 Moisture Meter' },
              { key: 'herb_harvest',  label: '🌿 Herb Harvest & Drying' },
              { key: 'propagation',   label: '✂️ Propagation' },
              { key: 'birds',         label: '🐦 Birds' },
            ].map(s => (
              <button key={s.key} onClick={() => setLibSection(s.key)} style={{
                padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `2px solid ${libSection === s.key ? 'var(--purple)' : 'var(--border)'}`,
                background: libSection === s.key ? 'var(--purple-bg)' : 'transparent',
                color: libSection === s.key ? 'var(--purple)' : 'var(--muted)',
              }}>{s.label}</button>
            ))}
          </div>

          {libLoading && <div style={{ color: 'var(--muted)', fontSize: 13, padding: 20 }}>Loading library...</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {libArticles
              .filter(a => libSection === 'all' || a.section === libSection)
              .map(a => (
                <section key={a.id} className="panel" style={{ padding: 0, overflow: 'hidden' }}>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', cursor: 'pointer' }}
                    onClick={() => setLibExpanded(libExpanded === a.id ? null : a.id)}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{a.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, textTransform: 'capitalize' }}>
                        {a.section.replace(/_/g, ' ')}
                        {a.tags?.length > 0 && ` · ${a.tags.slice(0, 3).join(', ')}`}
                      </div>
                    </div>
                    {libExpanded === a.id ? <ChevronDown size={16} color="var(--muted)" /> : <ChevronRight size={16} color="var(--muted)" />}
                  </div>
                  {libExpanded === a.id && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px', fontSize: 13, lineHeight: 1.75, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
                      {a.content}
                    </div>
                  )}
                </section>
              ))}
            {libArticles.filter(a => libSection === 'all' || a.section === libSection).length === 0 && !libLoading && (
              <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
                <BookOpen size={32} style={{ color: 'var(--muted)', marginBottom: 12 }} />
                <p style={{ color: 'var(--muted)' }}>No articles in this section yet.</p>
              </section>
            )}
          </div>
        </div>
      )}

      {/* ── BIRDS SECTION ── */}
      {section === 'birds' && (
        <div>
          <section className="panel" style={{ borderTop: '3px solid #d97706', marginBottom: 14 }}>
            <div className="panel-head">
              <h2>🐦 Canton GA Backyard Birds</h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
              Bird info for Canton, GA (Zone 7b) — species, feeders, and habitat plants. Expand the Reference Library for full details.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {[
                { name: 'Northern Cardinal', status: '🟢 Year-round', feeder: 'Sunflower seeds', color: '#dc2626' },
                { name: 'Carolina Chickadee', status: '🟢 Year-round', feeder: 'Sunflower, suet', color: '#374151' },
                { name: 'Ruby-throated Hummingbird', status: '🟡 Apr–Oct', feeder: '4:1 sugar water', color: '#059669' },
                { name: 'Tufted Titmouse', status: '🟢 Year-round', feeder: 'Sunflower, peanuts', color: '#6b7280' },
                { name: 'Downy Woodpecker', status: '🟢 Year-round', feeder: 'Suet, sunflower', color: '#1f2937' },
                { name: 'American Goldfinch', status: '🔵 Winter visitor', feeder: 'Nyjer/thistle', color: '#eab308' },
                { name: 'Eastern Bluebird', status: '🟢 Year-round', feeder: 'Mealworms, nest box', color: '#1d4ed8' },
                { name: 'Carolina Wren', status: '🟢 Year-round', feeder: 'Suet, peanut butter', color: '#92400e' },
              ].map(b => (
                <div key={b.name} style={{ background: 'var(--surface-1)', borderRadius: 8, padding: '10px 12px', borderLeft: `3px solid ${b.color}` }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{b.status}</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>🪺 {b.feeder}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 13, color: 'var(--muted)', background: 'var(--surface-1)', borderRadius: 8, padding: '10px 12px' }}>
              💡 See Reference Library → Birds for full Canton GA species list, feeder types, and plants that attract birds.
            </div>
          </section>
        </div>
      )}

      {/* ── PLANTS SECTION ── */}
      {section === 'plants' && (
      <div className="plants-section-wrapper">

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Total Plants', value: plants.length,                                     color: 'var(--purple)' },
          { label: 'Indoor',       value: plants.filter(p => p.location === 'indoor').length, color: LOCATION_COLORS.indoor },
          { label: 'Outdoor',      value: plants.filter(p => p.location === 'outdoor').length,color: LOCATION_COLORS.outdoor },
          { label: 'Tasks Due',    value: overdueTasks.length + dueSoonTasks.length,           color: overdueTasks.length > 0 ? 'var(--red)' : 'var(--amber)' },
        ].map(s => (
          <section key={s.label} className="panel" style={{ textAlign: 'center', padding: '10px 8px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
          </section>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={tab === 'plants' ? 'active' : ''} onClick={() => setTab('plants')}>My Plants ({plants.length})</button>
        <button className={tab === 'log'    ? 'active' : ''} onClick={() => setTab('log')}>Care Log ({logs.length})</button>
        <button className={tab === 'tasks'  ? 'active' : ''} onClick={() => setTab('tasks')}>Tasks{pendingTasks.length > 0 ? ` (${pendingTasks.length})` : ''}</button>
        <button className={tab === 'ai'     ? 'active' : ''} onClick={() => setTab('ai')}>AI Suggestions</button>
      </div>

      {/* Add/Edit Plant Form */}
      {showAddPlant && (
        <section className="panel" style={{ borderLeft: '4px solid var(--green)', marginBottom: 14 }}>
          <div className="panel-head">
            <h2>{editingPlant ? `Edit — ${editingPlant.name}` : 'Add a Plant'}</h2>
            <button className="btn ghost" onClick={() => { setShowAddPlant(false); setEditingPlant(null); resetPlantForm(); }}><X size={14} /> Cancel</button>
          </div>
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Plant name *<input value={pName} onChange={e => setPName(e.target.value)} placeholder="e.g. Monstera" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Scientific name<input value={pSci} onChange={e => setPSci(e.target.value)} placeholder="e.g. Monstera deliciosa" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Nickname<input value={pNick} onChange={e => setPNick(e.target.value)} placeholder="e.g. Big Leaf Lady" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Location
              <select value={pLoc} onChange={e => setPLoc(e.target.value as Location)}>
                {(Object.entries(LOCATION_LABELS) as [Location, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Spot / Where it lives<input value={pSpot} onChange={e => setPSpot(e.target.value)} placeholder="e.g. kitchen windowsill" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Pot size<input value={pPot} onChange={e => setPPot(e.target.value)} placeholder="e.g. 6 inch" />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
            Notes / Observations
            <textarea value={pNotes} onChange={e => setPNotes(e.target.value)} placeholder="Current health, issues, special care notes..." style={{ minHeight: 60 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            Care guide
            <textarea value={pGuide} onChange={e => setPGuide(e.target.value)} placeholder="Paste care guide info here — watering frequency, light needs, fertilizing schedule, etc." style={{ minHeight: 100 }} />
          </label>
          <button className="btn primary" onClick={savePlant} disabled={pSaving || !pName.trim()}>
            <Save size={13} /> {pSaving ? 'Saving...' : editingPlant ? 'Save Changes' : 'Add Plant'}
          </button>
        </section>
      )}

      {/* ── MY PLANTS TAB ── */}
      {tab === 'plants' && (
        <div>
          {/* Filters + Search */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {(['all', 'indoor', 'outdoor', 'garden'] as const).map(loc => (
              <button key={loc} onClick={() => setFilterLoc(loc)} style={{
                padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `2px solid ${filterLoc === loc ? (loc === 'all' ? 'var(--purple)' : LOCATION_COLORS[loc as Location]) : 'var(--border)'}`,
                background: filterLoc === loc ? (loc === 'all' ? 'var(--purple-bg)' : 'transparent') : 'transparent',
                color: filterLoc === loc ? (loc === 'all' ? 'var(--purple)' : LOCATION_COLORS[loc as Location]) : 'var(--muted)',
              }}>
                {loc === 'all' ? 'All Plants' : LOCATION_LABELS[loc as Location]}
                {' '}({loc === 'all' ? plants.length : plants.filter(p => p.location === loc).length})
              </button>
            ))}
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search plants..." style={{ marginLeft: 'auto', width: 180, fontSize: 12 }} />
          </div>

          {loading && <div style={{ color: 'var(--muted)', fontSize: 13, padding: 20 }}>Loading plants...</div>}

          {/* Accordion plant list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredPlants.map(p => {
              const care           = lastCareMap[p.id] ?? ({} as Record<LogType, string>);
              const plantLogs      = logs.filter(l => l.plant_id === p.id);
              const plantTasks     = tasks.filter(t => t.plant_id === p.id && !t.is_done);
              const isExpanded     = expandedPlant === p.id;
              const accentColor    = LOCATION_COLORS[p.location];
              const careGuide      = p.care_guide ? parseCareGuide(p.care_guide) : [];
              const inlineAI       = plantAiResults[p.id];
              const inlineAILoading = plantAiLoading[p.id];

              return (
                <section key={p.id} className="panel" style={{ borderLeft: `4px solid ${accentColor}`, padding: 0, overflow: 'hidden' }}>

                  {/* Header row — always visible, click to expand */}
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', cursor: 'pointer' }}
                    onClick={() => setExpandedPlant(isExpanded ? null : p.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                      <Leaf size={16} color={accentColor} style={{ flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{p.nickname || p.name}</span>
                          {p.nickname && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{p.name}</span>}
                          {p.scientific_name && <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>{p.scientific_name}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: accentColor, background: `${accentColor}22`, padding: '2px 8px', borderRadius: 999 }}>
                            {LOCATION_LABELS[p.location]}
                          </span>
                          {p.spot && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.spot}</span>}
                          {care.watered    && <span style={{ fontSize: 11, color: 'var(--muted)' }}>💧 {fmtDate(care.watered)}</span>}
                          {care.fertilized && <span style={{ fontSize: 11, color: 'var(--muted)' }}>🌱 {fmtDate(care.fertilized)}</span>}
                          {!care.watered && !care.fertilized && <span style={{ fontSize: 11, color: 'var(--amber)' }}>⚠️ No care logged</span>}
                          {plantTasks.length > 0 && (
                            <span style={{ fontSize: 11, color: plantTasks.some(t => t.due_date && t.due_date < today) ? 'var(--red)' : 'var(--amber)' }}>
                              📋 {plantTasks.length} task{plantTasks.length !== 1 ? 's' : ''} pending
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      <button className="qty-button" title="Edit plant" onClick={e => { e.stopPropagation(); startEdit(p); }}>
                        <Edit2 size={12} />
                      </button>
                      {isExpanded ? <ChevronDown size={16} color="var(--muted)" /> : <ChevronRight size={16} color="var(--muted)" />}
                    </div>
                  </div>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '0 16px 20px' }}>

                      {/* Action bar */}
                      <div style={{ display: 'flex', gap: 8, padding: '12px 0 16px', flexWrap: 'wrap' }}>
                        <button className="btn ghost tiny" onClick={() => { setSelectedPlantId(p.id); setTab('log'); }}>💧 Log Care</button>
                        <button
                          className="btn ghost tiny"
                          style={{ color: 'var(--purple)' }}
                          onClick={() => !inlineAILoading && generateInlineAI(p)}
                          disabled={inlineAILoading}
                        >
                          <Sparkles size={11} /> {inlineAILoading ? 'Thinking...' : inlineAI ? 'Refresh AI Tips' : 'Get AI Tips'}
                        </button>
                        <button className="btn ghost tiny" onClick={() => { setTaskPlantId(p.id); setShowAddTask(true); setTab('tasks'); }}>📋 Add Task</button>
                        <button className="btn ghost tiny" style={{ color: 'var(--red)', marginLeft: 'auto' }} onClick={() => archivePlant(p.id)}>Remove</button>
                      </div>

                      {/* Household Info grid */}
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Household Info</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                          {[
                            { label: 'In Collection Since', value: p.acquired_date ? fmtDate(p.acquired_date) : p.created_at ? fmtDate(p.created_at.slice(0,10)) : 'Unknown' },
                            { label: 'Location',            value: `${LOCATION_LABELS[p.location]}${p.spot ? ` — ${p.spot}` : ''}` },
                            { label: 'Pot Size',            value: p.pot_size || 'Not recorded' },
                            { label: 'Last Watered',        value: care.watered    ? fmtDate(care.watered)    : 'Never logged' },
                            { label: 'Last Fertilized',     value: care.fertilized ? fmtDate(care.fertilized) : 'Never logged' },
                            { label: 'Last Repotted',       value: care.repotted   ? fmtDate(care.repotted)   : 'Never logged' },
                            { label: 'Last Pruned',         value: care.pruned     ? fmtDate(care.pruned)     : 'Never logged' },
                            { label: 'Total Care Entries',  value: plantLogs.length > 0 ? `${plantLogs.length} entries` : 'None yet' },
                            { label: 'Care Guide',          value: p.care_guide ? '✅ Provided' : '⚠️ Not added yet' },
                          ].map(item => (
                            <div key={item.label} style={{ background: 'var(--surface-1)', borderRadius: 8, padding: '8px 10px' }}>
                              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 2 }}>{item.label}</div>
                              <div style={{ fontSize: 12, fontWeight: 600 }}>{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Owner Notes */}
                      {p.notes && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>My Notes</div>
                          <div style={{ background: 'var(--surface-1)', borderRadius: 8, padding: '10px 14px', fontSize: 13, lineHeight: 1.65, borderLeft: `3px solid ${accentColor}` }}>
                            {p.notes}
                          </div>
                        </div>
                      )}

                      {/* Care Guide Sections */}
                      {careGuide.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Care Guide</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                            {careGuide.map((sec, i) => (
                              <div key={i} style={{ background: 'var(--surface-1)', borderRadius: 8, padding: '12px 14px', borderLeft: `3px solid ${sec.color}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                  <span style={{ color: sec.color }}>{sec.icon}</span>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: sec.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{sec.label}</span>
                                </div>
                                <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{sec.content}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {!p.care_guide && (
                        <div style={{ marginBottom: 20, background: 'var(--surface-1)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--muted)', borderLeft: '3px solid var(--amber)' }}>
                          ⚠️ No care guide added yet. Click <strong>Edit</strong> to paste in care guide info — the AI will use it for better suggestions.
                        </div>
                      )}

                      {/* AI Tips (inline) */}
                      {(inlineAI || inlineAILoading) && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Sparkles size={12} color="var(--purple)" /> AI Care Tips — {currentMonth} in Zone 7b
                          </div>
                          {inlineAILoading ? (
                            <div style={{ background: 'var(--surface-1)', borderRadius: 8, padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                              <RefreshCw size={16} className="spin" style={{ display: 'inline-block', marginRight: 8, verticalAlign: 'middle' }} />
                              Generating care tips for {currentMonth}...
                            </div>
                          ) : (
                            <div style={{ background: 'var(--purple-bg)', borderRadius: 8, padding: '12px 14px', borderLeft: '3px solid var(--purple)', fontSize: 13, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                              {inlineAI}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Pending Tasks */}
                      {plantTasks.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Pending Tasks</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {plantTasks.map(t => (
                              <div key={t.id} style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                background: 'var(--surface-1)', borderRadius: 8, padding: '8px 12px',
                                borderLeft: `3px solid ${t.due_date && t.due_date < today ? 'var(--red)' : PRIORITY_COLORS[t.priority]}`,
                              }}>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }} onClick={() => toggleTask(t)}>
                                  <Circle size={15} color={t.due_date && t.due_date < today ? 'var(--red)' : PRIORITY_COLORS[t.priority]} />
                                </button>
                                <div style={{ flex: 1 }}>
                                  <span style={{ fontSize: 12, fontWeight: 600 }}>{t.title}</span>
                                  {t.due_date && (
                                    <span style={{ fontSize: 11, color: t.due_date < today ? 'var(--red)' : 'var(--muted)', marginLeft: 8 }}>
                                      {t.due_date < today ? '⚠️ Overdue: ' : 'Due: '}{t.due_date}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Care History */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                          Care History {plantLogs.length > 0 ? `(${plantLogs.length} entries)` : ''}
                        </div>
                        {plantLogs.length === 0 ? (
                          <div style={{ fontSize: 13, color: 'var(--muted)', padding: '10px 0' }}>
                            No care logged yet.{' '}
                            <button className="btn ghost tiny" onClick={() => { setSelectedPlantId(p.id); setTab('log'); }}>Log your first entry →</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {plantLogs.slice(0, 10).map(l => (
                              <div key={l.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 10px', background: 'var(--surface-1)', borderRadius: 7 }}>
                                <span style={{ fontSize: 14, flexShrink: 0 }}>{LOG_TYPE_EMOJI[l.log_type]}</span>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 12, fontWeight: 600 }}>{LOG_TYPE_LABELS[l.log_type]}</span>
                                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDate(l.log_date)}</span>
                                  </div>
                                  {l.notes && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{l.notes}</div>}
                                </div>
                              </div>
                            ))}
                            {plantLogs.length > 10 && (
                              <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', paddingTop: 6 }}>
                                + {plantLogs.length - 10} more entries — view in Care Log tab
                              </div>
                            )}
                          </div>
                        )}
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

      {/* ── CARE LOG TAB ── */}
      {tab === 'log' && (
        <div>
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
                Date<input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                Activity type
                <select value={logType} onChange={e => setLogType(e.target.value as LogType)}>
                  {(Object.entries(LOG_TYPE_LABELS) as [LogType, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
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
          <section className="panel">
            <div className="panel-head"><h2>Recent Activity</h2><span className="readonly-pill">{logs.length} entries</span></div>
            {logs.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>No care logged yet.</div>}
            {logs.slice(0, 50).map(l => {
              const plant = plants.find(p => p.id === l.plant_id);
              return (
                <div key={l.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{LOG_TYPE_EMOJI[l.log_type]}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{plant?.nickname || plant?.name || 'Unknown'}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{LOG_TYPE_LABELS[l.log_type]} — {fmtDate(l.log_date)}</div>
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

      {/* ── TASKS TAB ── */}
      {tab === 'tasks' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn primary" onClick={() => setShowAddTask(v => !v)}><Plus size={14} /> Add Task</button>
          </div>
          {showAddTask && (
            <section className="panel" style={{ borderLeft: '4px solid var(--purple)', marginBottom: 14 }}>
              <div className="panel-head">
                <h2>New Task</h2>
                <button className="btn ghost" onClick={() => setShowAddTask(false)}><X size={14} /> Cancel</button>
              </div>
              <div className="form-grid" style={{ marginBottom: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Task title *<input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="e.g. Repot monstera" />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Plant (optional)
                  <select value={taskPlantId} onChange={e => setTaskPlantId(e.target.value)}>
                    <option value="">All plants / General</option>
                    {plants.map(p => <option key={p.id} value={p.id}>{p.nickname || p.name}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Due date<input type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Priority
                  <select value={taskPriority} onChange={e => setTaskPriority(e.target.value as Priority)}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                Description<textarea value={taskDesc} onChange={e => setTaskDesc(e.target.value)} placeholder="Details about what to do..." style={{ minHeight: 50 }} />
              </label>
              <button className="btn primary" onClick={saveTask} disabled={taskSaving || !taskTitle.trim()}>
                {taskSaving ? 'Saving...' : 'Save Task'}
              </button>
            </section>
          )}
          {overdueTasks.length > 0 && (
            <section className="panel" style={{ borderLeft: '4px solid var(--red)', marginBottom: 12 }}>
              <div className="panel-head"><h2 style={{ color: 'var(--red)' }}>Overdue ({overdueTasks.length})</h2></div>
              {overdueTasks.map(t => <TaskRow key={t.id} task={t} plants={plants} today={today} onToggle={toggleTask} onDelete={deleteTask} />)}
            </section>
          )}
          {dueSoonTasks.length > 0 && (
            <section className="panel" style={{ borderLeft: '4px solid var(--amber)', marginBottom: 12 }}>
              <div className="panel-head"><h2 style={{ color: 'var(--amber)' }}>Due This Week ({dueSoonTasks.length})</h2></div>
              {dueSoonTasks.map(t => <TaskRow key={t.id} task={t} plants={plants} today={today} onToggle={toggleTask} onDelete={deleteTask} />)}
            </section>
          )}
          <section className="panel">
            <div className="panel-head"><h2>All Pending Tasks</h2><span className="readonly-pill">{pendingTasks.length}</span></div>
            {pendingTasks.length === 0 && <div style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>All caught up! No pending tasks.</div>}
            {pendingTasks.filter(t => !overdueTasks.includes(t) && !dueSoonTasks.includes(t)).map(t => (
              <TaskRow key={t.id} task={t} plants={plants} today={today} onToggle={toggleTask} onDelete={deleteTask} />
            ))}
          </section>
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

      {/* ── AI SUGGESTIONS TAB ── */}
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
              <select value={aiPlantId} onChange={e => { setAiPlantId(e.target.value); setAiResult(''); }} style={{ flex: 1 }}>
                <option value="">-- Select a plant --</option>
                {plants.map(p => <option key={p.id} value={p.id}>{p.nickname || p.name}{p.location ? ` (${LOCATION_LABELS[p.location]})` : ''}</option>)}
              </select>
              <button className="btn primary" onClick={generateSuggestions} disabled={aiLoading || !aiPlantId}>
                {aiLoading ? <><RefreshCw size={13} className="spin" /> Thinking...</> : 'Get Suggestions'}
              </button>
            </div>
            {aiPlantId && !aiResult && !aiLoading && (() => {
              const p = plants.find(pl => pl.id === aiPlantId);
              if (!p) return null;
              const care = lastCareMap[p.id] ?? ({} as Record<LogType, string>);
              return (
                <div style={{ background: 'var(--surface-1)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>{p.nickname || p.name} — Quick Summary</div>
                  <div>Last watered: {care.watered ? fmtDate(care.watered) : 'Never logged'}</div>
                  <div>Last fertilized: {care.fertilized ? fmtDate(care.fertilized) : 'Never logged'}</div>
                  <div>Care guide: {p.care_guide ? '✅ Provided' : '⚠️ Not added — edit plant for better suggestions'}</div>
                  <div>Location: {LOCATION_LABELS[p.location]}{p.spot ? ` — ${p.spot}` : ''}</div>
                </div>
              );
            })()}
            {aiLoading && (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)', fontSize: 13 }}>
                <RefreshCw size={20} className="spin" style={{ display: 'block', margin: '0 auto 12px' }} />
                Generating care suggestions for {currentMonth} in Zone 7b...
              </div>
            )}
            {aiResult && (
              <div style={{ background: 'var(--purple-bg)', borderRadius: 10, padding: '14px 16px', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', borderLeft: '3px solid var(--purple)' }}>
                {aiResult}
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-head"><h2>General {currentMonth} Tips for Canton, GA (Zone 7b)</h2></div>
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              {getSeasonalTips(new Date().getMonth()).map((tip, i) => (
                <div key={i} style={{ marginBottom: 6, paddingLeft: 12, borderLeft: '2px solid var(--green)' }}>{tip}</div>
              ))}
            </div>
          </section>
        </div>
      )}

      </div>
      )} {/* end plants section */}
    </>
  );
}

// __ TaskRow component ____________________________________________________

function TaskRow({ task, plants, today, onToggle, onDelete }: {
  task: PlantTask; plants: Plant[]; today: string;
  onToggle: (t: PlantTask) => void; onDelete: (id: string) => void;
}) {
  const plant = plants.find(p => p.id === task.plant_id);
  const isOverdue = !task.is_done && task.due_date && task.due_date < today;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, marginTop: 1 }} onClick={() => onToggle(task)}>
        {task.is_done ? <CheckCircle2 size={18} color="var(--green)" /> : <Circle size={18} color={isOverdue ? 'var(--red)' : PRIORITY_COLORS[task.priority]} />}
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
    0:  ['Reduce watering for most indoor plants — they are in dormancy.','Check for spider mites on houseplants — indoor heating dries the air.','No fertilizing for most plants this month.','Protect outdoor plants from frost — Zone 7b can see freezes below 10°F.','Good time to plan your spring garden and order seeds.'],
    1:  ['Start seeds indoors for tomatoes and peppers (6-8 weeks before last frost).','Watch for early buds on azaleas — protect from late freezes.','Begin light fertilizing for citrus trees as days get longer.','Check soil moisture more frequently as days warm up.'],
    2:  ['Last frost in Canton area is typically mid-March — wait before planting tender plants outside.','Begin fertilizing houseplants as they exit dormancy.','Repot root-bound plants before the growing season kicks in.','Direct sow cool-season crops: lettuce, spinach, cilantro.','Prune azaleas AFTER they bloom — pruning now removes flower buds.'],
    3:  ['Safe to move most outdoor plants outside after April 15.','Begin regular fertilizing schedule for all actively growing plants.','Water more frequently as temperatures rise — check soil daily.','Watch for aphids on new growth — treat early with neem oil.','Good month to repot and divide perennials.'],
    4:  ['Heat is building — increase watering frequency for outdoor pots.','Fertilize herbs every 2 weeks for best production.','Deadhead petunias and fuchsias regularly to promote blooming.','Watch for fungal issues as humidity rises — ensure good air circulation.','Good month to propagate tradescantia and philodendron cuttings.'],
    5:  ['Georgia summer heat is here — most outdoor plants need water every 1-2 days.','Water deeply in the morning to reduce evaporation and fungal issues.','Mulch outdoor beds to retain moisture and regulate soil temperature.','Pinch back basil flowers to keep leaf production going.','Move lime tree outdoors if temperatures are consistently above 50°F at night.','Fiddle leaf fig and monstera love humidity — mist or use a pebble tray.','Check for spider mites and aphids weekly — populations explode in summer.','Lavender may struggle in high humidity — ensure excellent drainage.'],
    6:  ['Peak summer heat — water outdoor plants daily, possibly twice for containers.','Herbs may bolt in heat — harvest frequently and pinch flowers.','Clematis may take a mid-summer break — normal, do not over-fertilize.','Reduce fertilizing for stressed plants — wait until temperatures drop.','Indoor plants: keep away from AC vents which dry the air drastically.'],
    7:  ['Continue heavy watering — August is often the hottest month.','Watch lime tree for leaf drop from heat stress.','Begin planning fall garden — start seeds for fall herbs.','Deadhead all flowering annuals to extend the season.','Check soil pH in garden beds before fall planting.'],
    8:  ['Temperatures begin to drop — reduce watering frequency slightly.','Good time to fertilize one last time before winter.','Plant cool-season crops: cilantro, spinach, lettuce.','Bring tropical plants like lime tree inside before first frost warning.','Divide and transplant perennials this month.'],
    9:  ['First frost possible late October — watch forecasts.','Bring all tender tropicals indoors before frost.','Stop fertilizing most plants as they prepare for dormancy.','Plant spring bulbs if desired.','Cut back perennials after frost kills the foliage.'],
    10: ['Houseplants: reduce watering significantly as growth slows.','Move fuchsias to a cool but frost-free location for overwintering.','Mulch outdoor plants to protect roots from freeze/thaw cycles.','Azaleas and clematis are dormant — minimal care needed.','Good month for indoor propagation projects.'],
    11: ['Minimal watering for most houseplants — check soil before watering.','Watch for holiday plant pests (poinsettia whitefly can spread).','Good time to clean and organize garden tools and supplies.','Review your plant catalog and plan any additions for spring.','Amaryllis and paperwhites make great winter indoor blooms.'],
  };
  return tips[month] ?? tips[5];
}
