// src/Travel.tsx — Travel itinerary builder with Gmail scanning

import { useCallback, useEffect, useState } from 'react';
import {
  Plane, Hotel, Car, MapPin, Calendar, Search, Plus, X,
  RefreshCw, ChevronDown, ChevronUp, Edit2, Trash2,
  Clock, Phone, Globe, DollarSign, FileText, Ticket,
  Ship, Train, Utensils, Star, Mail,
} from 'lucide-react';
import { supabase } from './lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

type TripStatus = 'planning' | 'upcoming' | 'active' | 'past';
type ItemType = 'flight' | 'hotel' | 'car' | 'activity' | 'restaurant' | 'cruise' | 'train' | 'other';

type Trip = {
  id: string;
  user_id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  status: TripStatus;
  notes: string | null;
  cover_image: string | null;
  created_at: string;
};

type HistoryEntry = {
  at: string;
  note: string;
  source?: string;
  changes?: Record<string, { old: any; new: any }>;
};

type TravelItem = {
  id: string;
  trip_id: string | null;
  user_id: string;
  category: 'travel' | 'entertainment';
  type: ItemType;
  title: string;
  provider: string | null;
  confirmation_number: string | null;
  flight_number: string | null;
  start_date: string | null;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
  location: string | null;
  origin_code: string | null;
  origin_city: string | null;
  destination_code: string | null;
  destination_city: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  price: string | null;
  notes: string | null;
  passenger_name: string | null;
  leg_order: number | null;
  details: Record<string, string>;
  email_subject: string | null;
  history: HistoryEntry[];
  created_at: string;
};

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TripStatus, { label: string; color: string; emoji: string }> = {
  planning:  { label: 'Planning',  color: '#6366f1', emoji: '✏️' },
  upcoming:  { label: 'Upcoming',  color: '#7C3AED', emoji: '🗓️' },
  active:    { label: 'Active',    color: '#059669', emoji: '✈️' },
  past:      { label: 'Past',      color: '#6b7280', emoji: '📸' },
};

const ITEM_CONFIG: Record<ItemType, { label: string; icon: React.ElementType; color: string; emoji: string }> = {
  flight:     { label: 'Flight',      icon: Plane,    color: '#2563EB', emoji: '✈️' },
  hotel:      { label: 'Hotel',       icon: Hotel,    color: '#7C3AED', emoji: '🏨' },
  car:        { label: 'Car Rental',  icon: Car,      color: '#D97706', emoji: '🚗' },
  activity:   { label: 'Activity',    icon: Ticket,   color: '#059669', emoji: '🎟️' },
  restaurant: { label: 'Restaurant',  icon: Utensils, color: '#DC2626', emoji: '🍽️' },
  cruise:     { label: 'Cruise',      icon: Ship,     color: '#0891b2', emoji: '🚢' },
  train:      { label: 'Train',       icon: Train,    color: '#4f46e5', emoji: '🚆' },
  other:      { label: 'Other',       icon: MapPin,   color: '#6b7280', emoji: '📍' },
};

const BLANK_ITEM: Omit<TravelItem, 'id' | 'trip_id' | 'user_id' | 'created_at' | 'history'> = {
  category: 'travel',
  type: 'flight', title: '', provider: null, confirmation_number: null, flight_number: null,
  start_date: null, start_time: null, end_date: null, end_time: null,
  location: null, origin_code: null, origin_city: null, destination_code: null, destination_city: null,
  address: null, phone: null, website: null,
  price: null, notes: null, passenger_name: null, leg_order: null, details: {}, email_subject: null,
};

// ── Helpers ────────────────────────────────────────────────────────────────

// Times are stored as 24h "HH:MM" strings; always display as 12h with AM/PM.
function formatTime12h(time: string | null | undefined): string | null {
  if (!time) return null;
  const match = time.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return time;
  let h = parseInt(match[1], 10);
  const m = match[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

function fmt(date: string | null, time?: string | null) {
  if (!date) return null;
  const d = new Date(date + 'T00:00:00');
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const time12 = formatTime12h(time);
  return time12 ? `${dateStr} at ${time12}` : dateStr;
}

function nightsBetween(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  const nights = Math.round(diff / (1000 * 60 * 60 * 24));
  return nights > 0 ? nights : null;
}

function tripDuration(trip: Trip) {
  const n = nightsBetween(trip.start_date, trip.end_date);
  if (!n) return null;
  return `${n} ${n === 1 ? 'night' : 'nights'}`;
}

// Known provider → domain map, used to pull a real logo/photo for the
// company a reservation is with (via Clearbit's free public logo API).
const PROVIDER_DOMAINS: [RegExp, string][] = [
  [/delta/i, 'delta.com'],
  [/american airlines|\baa\b/i, 'aa.com'],
  [/southwest/i, 'southwest.com'],
  [/united/i, 'united.com'],
  [/jetblue/i, 'jetblue.com'],
  [/spirit/i, 'spirit.com'],
  [/frontier/i, 'flyfrontier.com'],
  [/marriott/i, 'marriott.com'],
  [/hilton/i, 'hilton.com'],
  [/holiday inn|intercontinental|\bihg\b/i, 'ihg.com'],
  [/hyatt/i, 'hyatt.com'],
  [/airbnb/i, 'airbnb.com'],
  [/vrbo/i, 'vrbo.com'],
  [/hotels\.com/i, 'hotels.com'],
  [/booking\.com/i, 'booking.com'],
  [/expedia/i, 'expedia.com'],
  [/enterprise/i, 'enterprise.com'],
  [/hertz/i, 'hertz.com'],
  [/\bbudget\b/i, 'budget.com'],
  [/\bavis\b/i, 'avis.com'],
  [/national car|nationalcar/i, 'nationalcar.com'],
  [/alamo/i, 'alamo.com'],
  [/carnival/i, 'carnival.com'],
  [/royal caribbean/i, 'royalcaribbean.com'],
  [/norwegian cruise|\bncl\b/i, 'ncl.com'],
  [/disney/i, 'disney.com'],
  [/universal/i, 'universalorlando.com'],
  [/seaworld/i, 'seaworld.com'],
  [/six flags/i, 'sixflags.com'],
  [/autocamp/i, 'autocamp.com'],
  [/amtrak/i, 'amtrak.com'],
  [/ticketmaster/i, 'ticketmaster.com'],
  [/stubhub/i, 'stubhub.com'],
  [/eventbrite/i, 'eventbrite.com'],
  [/\baxs\b/i, 'axs.com'],
  [/seatgeek/i, 'seatgeek.com'],
  [/vivid ?seats/i, 'vividseats.com'],
  [/live nation|livenation/i, 'livenation.com'],
  [/dice\.fm|\bdice\b/i, 'dice.fm'],
  [/fandango/i, 'fandango.com'],
  [/viator/i, 'viator.com'],
  [/get ?your ?guide/i, 'getyourguide.com'],
  [/opentable/i, 'opentable.com'],
  [/resy/i, 'resy.com'],
];

function getProviderLogo(provider: string | null): string | null {
  if (!provider) return null;
  for (const [re, domain] of PROVIDER_DOMAINS) {
    if (re.test(provider)) return `https://logo.clearbit.com/${domain}?size=96`;
  }
  return null;
}

// Groups flight legs that share a confirmation number into a single
// itinerary card (matching how airlines present multi-leg trips), while
// hotels/cars/other items render individually.
type ItemGroup =
  | { kind: 'flight'; legs: TravelItem[] }
  | { kind: 'single'; item: TravelItem };

function groupTripItems(items: TravelItem[]): ItemGroup[] {
  const flightGroups: Record<string, TravelItem[]> = {};
  const singles: TravelItem[] = [];

  for (const item of items) {
    if (item.type === 'flight' && item.confirmation_number) {
      const key = item.confirmation_number;
      (flightGroups[key] ??= []).push(item);
    } else {
      singles.push(item);
    }
  }

  const groups: ItemGroup[] = [];
  for (const key of Object.keys(flightGroups)) {
    const legs = flightGroups[key].sort((a, b) => {
      if ((a.leg_order ?? 0) !== (b.leg_order ?? 0)) return (a.leg_order ?? 0) - (b.leg_order ?? 0);
      const ad = `${a.start_date ?? ''}${a.start_time ?? ''}`;
      const bd = `${b.start_date ?? ''}${b.start_time ?? ''}`;
      return ad < bd ? -1 : ad > bd ? 1 : 0;
    });
    groups.push({ kind: 'flight', legs });
  }
  for (const item of singles) groups.push({ kind: 'single', item });

  groups.sort((a, b) => {
    const da = a.kind === 'flight' ? (a.legs[0]?.start_date ?? '') : (a.item.start_date ?? '');
    const db = b.kind === 'flight' ? (b.legs[0]?.start_date ?? '') : (b.item.start_date ?? '');
    return da < db ? -1 : da > db ? 1 : 0;
  });
  return groups;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function Travel({ userId }: { userId: string }) {
  const [trips, setTrips]               = useState<Trip[]>([]);
  const [items, setItems]               = useState<Record<string, TravelItem[]>>({});
  const [loading, setLoading]           = useState(true);
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);
  const [scanning, setScanning]         = useState(false);
  const [scanMsg, setScanMsg]           = useState('');
  const [statusFilter, setStatusFilter] = useState<TripStatus | 'all'>('all');

  // Travel vs Entertainment toggle — entertainment tickets (concerts,
  // museums, etc.) aren't tied to a trip and show as a flat list using
  // the same card style as activity tickets within a trip.
  const [viewMode, setViewMode] = useState<'travel' | 'entertainment'>('travel');
  const [entertainmentItems, setEntertainmentItems] = useState<TravelItem[]>([]);
  const [showAddEntertainment, setShowAddEntertainment] = useState(false);
  const [newEntItem, setNewEntItem] = useState({ ...BLANK_ITEM, type: 'activity' as ItemType, category: 'entertainment' as const });
  const [entItemSaving, setEntItemSaving] = useState(false);
  const [newEntDetails, setNewEntDetails] = useState<{ label: string; value: string }[]>([]);
  const [newDetailLabel, setNewDetailLabel] = useState('');
  const [newDetailValue, setNewDetailValue] = useState('');
  const [editingEntId, setEditingEntId] = useState<string | null>(null);

  // New trip form
  const [showNewTrip, setShowNewTrip]   = useState(false);
  const [tName, setTName]               = useState('');
  const [tDest, setTDest]               = useState('');
  const [tStart, setTStart]             = useState('');
  const [tEnd, setTEnd]                 = useState('');
  const [tStatus, setTStatus]           = useState<TripStatus>('upcoming');
  const [tNotes, setTNotes]             = useState('');
  const [saving, setSaving]             = useState(false);

  // New item modal
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null);
  const [newItem, setNewItem]           = useState({ ...BLANK_ITEM });
  const [itemSaving, setItemSaving]     = useState(false);

  // Edit trip
  const [editingTrip, setEditingTrip]   = useState<Trip | null>(null);

  // Paste Email modal
  const [showPasteEmail, setShowPasteEmail] = useState(false);
  const [pasteText, setPasteText]           = useState('');
  const [pasting, setPasting]               = useState(false);
  const [pasteMsg, setPasteMsg]             = useState('');

  // ── Load ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data: tripData } = await supabase
      .from('trips')
      .select('*')
      .eq('user_id', userId)
      .order('start_date', { ascending: true, nullsFirst: false });

    if (tripData) {
      setTrips(tripData as Trip[]);
      // Load items for all trips
      const tripIds = tripData.map((t: any) => t.id);
      if (tripIds.length > 0) {
        const { data: itemData } = await supabase
          .from('travel_items')
          .select('*')
          .in('trip_id', tripIds)
          .eq('category', 'travel')
          .order('start_date', { ascending: true });
        if (itemData) {
          const grouped: Record<string, TravelItem[]> = {};
          for (const item of itemData as TravelItem[]) {
            if (!grouped[item.trip_id as string]) grouped[item.trip_id as string] = [];
            grouped[item.trip_id as string].push(item);
          }
          setItems(grouped);
        }
      }
    }

    // Entertainment tickets — standalone, not grouped under any trip.
    const { data: entData } = await supabase
      .from('travel_items')
      .select('*')
      .eq('user_id', userId)
      .eq('category', 'entertainment')
      .order('start_date', { ascending: true, nullsFirst: false });
    setEntertainmentItems((entData as TravelItem[]) ?? []);

    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // ── Gmail scan ───────────────────────────────────────────────────────
  async function scanGmail() {
    if (!supabase) return;
    setScanning(true);
    setScanMsg('Scanning your Gmail for travel reservations…');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setScanning(false); return; }
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-travel-emails`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` } }
      );
      const data = await resp.json();
      if (data.error) {
        setScanMsg(`⚠️ ${data.error}`);
      } else {
        setScanMsg(`✅ ${data.message}`);
        await load();
      }
    } catch {
      setScanMsg('Error scanning Gmail. Try again.');
    }
    setScanning(false);
  }

  // ── Paste email ──────────────────────────────────────────────────────
  async function pasteEmail() {
    if (!supabase || !pasteText.trim()) return;
    setPasting(true);
    setPasteMsg('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setPasting(false); return; }
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-pasted-email`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ text: pasteText }),
        }
      );
      const data = await resp.json();
      if (data.error) {
        setPasteMsg(`⚠️ ${data.error}`);
      } else {
        setPasteMsg(`✅ ${data.message}`);
        setPasteText('');
        await load();
      }
    } catch {
      setPasteMsg('Error parsing that email. Try again.');
    }
    setPasting(false);
  }

  // ── Save new trip ─────────────────────────────────────────────────────
  async function saveTrip() {
    if (!supabase || !tName.trim()) return;
    setSaving(true);
    const row = {
      user_id: userId, name: tName.trim(),
      destination: tDest.trim() || null,
      start_date: tStart || null, end_date: tEnd || null,
      status: tStatus, notes: tNotes.trim() || null,
    };
    const { data, error } = await supabase.from('trips').insert(row).select().single();
    if (!error && data) {
      setTrips(prev => [...prev, data as Trip].sort((a, b) =>
        (a.start_date ?? '9999') < (b.start_date ?? '9999') ? -1 : 1));
      setTName(''); setTDest(''); setTStart(''); setTEnd('');
      setTStatus('upcoming'); setTNotes(''); setShowNewTrip(false);
    }
    setSaving(false);
  }

  // ── Update trip ───────────────────────────────────────────────────────
  async function updateTrip(id: string, patch: Partial<Trip>) {
    if (!supabase) return;
    setTrips(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    await supabase.from('trips').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    setEditingTrip(null);
  }

  // ── Delete trip ───────────────────────────────────────────────────────
  async function deleteTrip(id: string) {
    if (!supabase || !confirm('Delete this trip and all its reservations?')) return;
    setTrips(prev => prev.filter(t => t.id !== id));
    setItems(prev => { const n = { ...prev }; delete n[id]; return n; });
    if (expandedTrip === id) setExpandedTrip(null);
    await supabase.from('trips').delete().eq('id', id);
  }

  // ── Save travel item ──────────────────────────────────────────────────
  async function saveItem() {
    if (!supabase || !addingItemTo || !newItem.title.trim()) return;
    setItemSaving(true);
    const row = { ...newItem, trip_id: addingItemTo, user_id: userId, title: newItem.title.trim() };
    const { data, error } = await supabase.from('travel_items').insert(row).select().single();
    if (!error && data) {
      setItems(prev => ({
        ...prev,
        [addingItemTo]: [...(prev[addingItemTo] ?? []), data as TravelItem]
          .sort((a, b) => (a.start_date ?? '') < (b.start_date ?? '') ? -1 : 1),
      }));
      setNewItem({ ...BLANK_ITEM });
      setAddingItemTo(null);
    }
    setItemSaving(false);
  }

  // ── Delete item ───────────────────────────────────────────────────────
  async function deleteItem(tripId: string, itemId: string) {
    if (!supabase || !confirm('Remove this reservation?')) return;
    setItems(prev => ({ ...prev, [tripId]: (prev[tripId] ?? []).filter(i => i.id !== itemId) }));
    await supabase.from('travel_items').delete().eq('id', itemId);
  }

  // ── Entertainment tickets (standalone, no trip) ─────────────────────────
  async function saveEntertainmentItem() {
    if (!supabase || !newEntItem.title.trim()) return;
    setEntItemSaving(true);
    const details = Object.fromEntries(newEntDetails.map(d => [d.label, d.value]));

    if (editingEntId) {
      const { data, error } = await supabase
        .from('travel_items')
        .update({ ...newEntItem, title: newEntItem.title.trim(), details })
        .eq('id', editingEntId)
        .select()
        .single();
      if (!error && data) {
        setEntertainmentItems(prev => [...prev.filter(i => i.id !== editingEntId), data as TravelItem].sort((a, b) => {
          if (!a.start_date && !b.start_date) return 0;
          if (!a.start_date) return 1;
          if (!b.start_date) return -1;
          return a.start_date.localeCompare(b.start_date);
        }));
        setNewEntItem({ ...BLANK_ITEM, type: 'activity', category: 'entertainment' });
        setNewEntDetails([]);
        setNewDetailLabel(''); setNewDetailValue('');
        setEditingEntId(null);
        setShowAddEntertainment(false);
      }
      setEntItemSaving(false);
      return;
    }

    const row = { ...newEntItem, trip_id: null, user_id: userId, title: newEntItem.title.trim(), category: 'entertainment' as const, details };
    const { data, error } = await supabase.from('travel_items').insert(row).select().single();
    if (!error && data) {
      setEntertainmentItems(prev => [...prev, data as TravelItem].sort((a, b) => {
        if (!a.start_date && !b.start_date) return 0;
        if (!a.start_date) return 1;
        if (!b.start_date) return -1;
        return a.start_date.localeCompare(b.start_date);
      }));
      setNewEntItem({ ...BLANK_ITEM, type: 'activity', category: 'entertainment' });
      setNewEntDetails([]);
      setNewDetailLabel('');
      setNewDetailValue('');
      setShowAddEntertainment(false);
    }
    setEntItemSaving(false);
  }

  function startEditEntertainment(item: TravelItem) {
    setEditingEntId(item.id);
    setNewEntItem({
      category: 'entertainment', type: item.type, title: item.title, provider: item.provider,
      confirmation_number: item.confirmation_number, flight_number: item.flight_number,
      start_date: item.start_date, start_time: item.start_time, end_date: item.end_date, end_time: item.end_time,
      location: item.location, origin_code: item.origin_code, origin_city: item.origin_city,
      destination_code: item.destination_code, destination_city: item.destination_city,
      address: item.address, phone: item.phone, website: item.website, price: item.price,
      notes: item.notes, passenger_name: item.passenger_name, leg_order: item.leg_order,
      details: item.details, email_subject: item.email_subject,
    });
    setNewEntDetails(Object.entries(item.details ?? {}).map(([label, value]) => ({ label, value: String(value) })));
    setShowAddEntertainment(true);
  }

  async function deleteEntertainmentItem(itemId: string) {
    if (!supabase || !confirm('Remove this ticket?')) return;
    setEntertainmentItems(prev => prev.filter(i => i.id !== itemId));
    await supabase.from('travel_items').delete().eq('id', itemId);
  }

  // ── Filtered trips ────────────────────────────────────────────────────
  const filtered = trips
    .filter(t => statusFilter === 'all' || t.status === statusFilter)
    .sort((a, b) => {
      if (!a.start_date && !b.start_date) return 0;
      if (!a.start_date) return 1;
      if (!b.start_date) return -1;
      return a.start_date.localeCompare(b.start_date);
    });

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>{viewMode === 'travel' ? 'Travel' : 'Entertainment'}</h1>
          <p>{viewMode === 'travel'
            ? `${trips.length} trips · ${Object.values(items).flat().length} reservations`
            : `${entertainmentItems.length} ticket${entertainmentItems.length !== 1 ? 's' : ''}`}</p>
        </div>
        <div className="actions">
          {viewMode === 'travel' ? (
            <>
              <button className="btn ghost" onClick={scanGmail} disabled={scanning} style={{ color: '#059669', borderColor: '#059669' }}>
                {scanning ? <RefreshCw size={15} className="spin" /> : <Mail size={15} />}
                {scanning ? 'Scanning…' : 'Scan Gmail'}
              </button>
              <button className="btn ghost" onClick={() => { setShowPasteEmail(v => !v); setPasteMsg(''); }} style={{ color: '#2563EB', borderColor: '#2563EB' }}>
                <FileText size={15} /> Paste Email
              </button>
              <button className="btn primary" onClick={() => setShowNewTrip(v => !v)}>
                <Plus size={15} /> New Trip
              </button>
            </>
          ) : (
            <>
              <button className="btn ghost" onClick={() => { setShowPasteEmail(v => !v); setPasteMsg(''); }} style={{ color: '#2563EB', borderColor: '#2563EB' }}>
                <FileText size={15} /> Paste Email
              </button>
              <button className="btn primary" onClick={() => setShowAddEntertainment(v => !v)}>
                <Plus size={15} /> Add Ticket
              </button>
            </>
          )}
        </div>
      </div>

      {/* Travel / Entertainment toggle */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className={viewMode === 'travel' ? 'btn primary tiny' : 'btn ghost tiny'}
          onClick={() => setViewMode('travel')}
        >✈️ Travel</button>
        <button
          className={viewMode === 'entertainment' ? 'btn primary tiny' : 'btn ghost tiny'}
          onClick={() => setViewMode('entertainment')}
        >🎟️ Entertainment{entertainmentItems.length > 0 ? ` (${entertainmentItems.length})` : ''}</button>
      </div>

      {/* Scan message */}
      {scanMsg && (
        <section className="panel" style={{ borderLeft: `3px solid #059669`, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{scanMsg}</span>
            <button onClick={() => setScanMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={14} /></button>
          </div>
        </section>
      )}

      {/* Paste Email panel */}
      {showPasteEmail && (
        <section className="panel" style={{ borderLeft: '3px solid #2563EB' }}>
          <div className="panel-head">
            <h2>Paste an Email</h2>
            <button className="btn ghost" onClick={() => setShowPasteEmail(false)}>Close</button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 10px' }}>
            Copy the full confirmation or update email (select-all / Ctrl+A in the message, then paste below) and I'll pull out the details automatically —
            this skips Gmail search entirely, so it works for anything: forwarded mail, other inboxes, screenshots you've transcribed, etc.
            If it matches an existing reservation, it'll update it in place and log what changed instead of creating a duplicate.
          </p>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder="Paste the full email here, including the subject line and body if possible…"
            style={{ minHeight: 180, resize: 'vertical', width: '100%', fontFamily: 'inherit', fontSize: 13 }}
          />
          {pasteMsg && <div style={{ fontSize: 13, marginTop: 8 }}>{pasteMsg}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn primary" onClick={pasteEmail} disabled={!pasteText.trim() || pasting}>
              {pasting ? <RefreshCw size={13} className="spin" /> : <FileText size={13} />}
              {pasting ? 'Parsing…' : 'Parse & Add'}
            </button>
            <button className="btn ghost" onClick={() => { setShowPasteEmail(false); setPasteText(''); setPasteMsg(''); }}>Cancel</button>
          </div>
        </section>
      )}

      {/* New Trip Form */}
      {viewMode === 'travel' && showNewTrip && (
        <section className="panel" style={{ borderLeft: '3px solid #7C3AED' }}>
          <div className="panel-head">
            <h2>Plan a New Trip</h2>
            <button className="btn ghost" onClick={() => setShowNewTrip(false)}>Close</button>
          </div>
          <div className="form-grid" style={{ gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', gridColumn: 'span 2' }}>
              Trip Name *
              <input value={tName} onChange={e => setTName(e.target.value)} placeholder="Disney World 2025, Japan Cherry Blossom Trip…" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Destination
              <input value={tDest} onChange={e => setTDest(e.target.value)} placeholder="Orlando, FL" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Status
              <select value={tStatus} onChange={e => setTStatus(e.target.value as TripStatus)}>
                {(Object.entries(STATUS_CONFIG) as [TripStatus, any][]).map(([v, c]) => <option key={v} value={v}>{c.emoji} {c.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Start Date
              <input type="date" value={tStart} onChange={e => setTStart(e.target.value)} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              End Date
              <input type="date" value={tEnd} onChange={e => setTEnd(e.target.value)} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', gridColumn: 'span 2' }}>
              Notes
              <textarea value={tNotes} onChange={e => setTNotes(e.target.value)} placeholder="Packing list, reminders, things to do…" style={{ minHeight: 60, resize: 'vertical' }} />
            </label>
          </div>
          <button className="btn primary" onClick={saveTrip} disabled={!tName.trim() || saving} style={{ marginTop: 12 }}>
            {saving ? <RefreshCw size={13} className="spin" /> : <Plus size={13} />} Create Trip
          </button>
        </section>
      )}

      {viewMode === 'travel' && <>
      {/* Status filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className={statusFilter === 'all' ? 'btn primary tiny' : 'btn ghost tiny'} onClick={() => setStatusFilter('all')}>
          All ({trips.length})
        </button>
        {(Object.entries(STATUS_CONFIG) as [TripStatus, any][]).map(([status, cfg]) => {
          const count = trips.filter(t => t.status === status).length;
          if (count === 0) return null;
          return (
            <button key={status} className={statusFilter === status ? 'btn primary tiny' : 'btn ghost tiny'} onClick={() => setStatusFilter(status)}>
              {cfg.emoji} {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {loading && (
        <section className="panel">
          <div style={{ display: 'flex', gap: 8, color: 'var(--muted)' }}><RefreshCw size={14} className="spin" /> Loading trips…</div>
        </section>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <section className="panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <Plane size={40} style={{ color: 'var(--muted)', opacity: 0.4, marginBottom: 12 }} />
          <h3 style={{ margin: '0 0 8px', color: 'var(--muted)' }}>No trips yet!</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 16px' }}>
            Click <strong>Scan Gmail</strong> to auto-import your travel reservations, or create a trip manually.
          </p>
        </section>
      )}

      {/* Trip Cards */}
      {!loading && filtered.map(trip => {
        const tripItems = items[trip.id] ?? [];
        const isExpanded = expandedTrip === trip.id;
        const cfg = STATUS_CONFIG[trip.status];
        const duration = tripDuration(trip);

        // Group items by type for summary icons
        const typeGroups = tripItems.reduce((acc, item) => {
          if (!acc[item.type]) acc[item.type] = 0;
          acc[item.type]++;
          return acc;
        }, {} as Record<string, number>);

        return (
          <section key={trip.id} className="panel" style={{ borderLeft: `3px solid ${cfg.color}`, padding: 0, overflow: 'hidden' }}>
            {/* Trip header */}
            <div
              style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}
              onClick={() => setExpandedTrip(isExpanded ? null : trip.id)}
            >
              {trip.start_date && (
                <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 46 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {new Date(trip.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1, color: 'var(--text)' }}>
                    {new Date(trip.start_date + 'T00:00:00').getDate()}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                    {new Date(trip.start_date + 'T00:00:00').getFullYear()}
                  </div>
                </div>
              )}
              <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{cfg.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{trip.name}</h3>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: `${cfg.color}22`, color: cfg.color }}>
                    {cfg.label}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {trip.destination && <span><MapPin size={11} style={{ marginRight: 3 }} />{trip.destination}</span>}
                  {trip.start_date && <span><Calendar size={11} style={{ marginRight: 3 }} />{fmt(trip.start_date)}{trip.end_date ? ` → ${fmt(trip.end_date)}` : ''}{duration ? ` (${duration})` : ''}</span>}
                </div>
                {/* Type summary icons */}
                {tripItems.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    {(Object.entries(typeGroups) as [ItemType, number][]).map(([type, count]) => {
                      const ic = ITEM_CONFIG[type];
                      const Icon = ic.icon;
                      return (
                        <span key={type} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: ic.color, background: `${ic.color}18`, padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>
                          <Icon size={10} /> {count} {ic.label}{count > 1 ? 's' : ''}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                <button onClick={e => { e.stopPropagation(); setEditingTrip(trip); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }} title="Edit trip"><Edit2 size={13} /></button>
                <button onClick={e => { e.stopPropagation(); deleteTrip(trip.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4 }} title="Delete trip"><Trash2 size={13} /></button>
                {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--muted)' }} />}
              </div>
            </div>

            {/* Expanded itinerary */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid var(--border, rgba(0,0,0,0.07))', padding: '12px 16px 16px' }}>
                {trip.notes && (
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12, fontStyle: 'italic', padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                    📝 {trip.notes}
                  </div>
                )}

                {/* Items sorted by date */}
                {tripItems.length === 0 && (
                  <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>No reservations yet — add them below or scan Gmail.</p>
                )}

                {groupTripItems(tripItems).map(group =>
                  group.kind === 'flight'
                    ? (
                      <FlightItineraryCard
                        key={group.legs[0].confirmation_number ?? group.legs[0].id}
                        legs={group.legs}
                        onDeleteLeg={(itemId) => deleteItem(trip.id, itemId)}
                      />
                    )
                    : group.item.type === 'hotel'
                      ? <HotelItineraryCard key={group.item.id} item={group.item} onDelete={() => deleteItem(trip.id, group.item.id)} />
                      : group.item.type === 'activity'
                        ? <EventTicketCard key={group.item.id} item={group.item} onDelete={() => deleteItem(trip.id, group.item.id)} />
                        : <TravelItemCard key={group.item.id} item={group.item} onDelete={() => deleteItem(trip.id, group.item.id)} />
                )}

                {/* Add item button */}
                <button
                  className="btn ghost"
                  onClick={() => { setAddingItemTo(trip.id); setNewItem({ ...BLANK_ITEM }); }}
                  style={{ marginTop: 8, width: '100%', justifyContent: 'center', color: '#7C3AED', borderColor: '#7C3AED' }}
                >
                  <Plus size={14} /> Add Reservation
                </button>
              </div>
            )}
          </section>
        );
      })}
      </>}

      {/* Entertainment view — standalone tickets, same card treatment as activity tickets in a trip */}
      {viewMode === 'entertainment' && <>
        {showAddEntertainment && (
          <section className="panel" style={{ borderLeft: '3px solid #DB2777' }}>
            <div className="panel-head">
              <h2>{editingEntId ? 'Edit Ticket' : 'Add a Ticket'}</h2>
              <button className="btn ghost" onClick={() => { setShowAddEntertainment(false); setEditingEntId(null); setNewEntItem({ ...BLANK_ITEM, type: 'activity', category: 'entertainment' }); setNewEntDetails([]); }}>Close</button>
            </div>
            <div className="form-grid" style={{ gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', gridColumn: 'span 2' }}>
                Event / Show Name *
                <input value={newEntItem.title} onChange={e => setNewEntItem(p => ({ ...p, title: e.target.value }))} placeholder="Hamilton, MOMA Members Show, Braves vs Mets…" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                Venue / Provider
                <input value={newEntItem.provider ?? ''} onChange={e => setNewEntItem(p => ({ ...p, provider: e.target.value || null }))} placeholder="Fox Theatre, Ticketmaster…" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                Confirmation #
                <input value={newEntItem.confirmation_number ?? ''} onChange={e => setNewEntItem(p => ({ ...p, confirmation_number: e.target.value || null }))} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                Date
                <input type="date" value={newEntItem.start_date ?? ''} onChange={e => setNewEntItem(p => ({ ...p, start_date: e.target.value || null }))} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                Time
                <input type="time" value={newEntItem.start_time ?? ''} onChange={e => setNewEntItem(p => ({ ...p, start_time: e.target.value || null }))} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', gridColumn: 'span 2' }}>
                Address
                <input value={newEntItem.address ?? ''} onChange={e => setNewEntItem(p => ({ ...p, address: e.target.value || null }))} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                Price
                <input value={newEntItem.price ?? ''} onChange={e => setNewEntItem(p => ({ ...p, price: e.target.value || null }))} placeholder="$45.00" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', gridColumn: 'span 2' }}>
                Notes
                <textarea value={newEntItem.notes ?? ''} onChange={e => setNewEntItem(p => ({ ...p, notes: e.target.value || null }))} style={{ minHeight: 50, resize: 'vertical' }} />
              </label>
            </div>

            {/* Details — Section, Row, Seat(s), Quantity, Ticket Type, or anything custom */}
            <div style={{ marginTop: 4, marginBottom: 12, padding: '10px 12px', background: 'var(--surface-1)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>Details</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {['Section', 'Row', 'Seat(s)', 'Quantity', 'Ticket Type'].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setNewDetailLabel(preset)}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, border: `1px solid ${newDetailLabel === preset ? '#DB2777' : 'var(--border)'}`, background: newDetailLabel === preset ? '#DB277722' : 'transparent', color: newDetailLabel === preset ? '#DB2777' : 'var(--muted)', cursor: 'pointer' }}
                  >{preset}</button>
                ))}
              </div>
              {newEntDetails.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                  {newEntDetails.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{ fontWeight: 700, flex: 1 }}>{d.label}</span>
                      <span style={{ color: 'var(--muted)' }}>{d.value}</span>
                      <button type="button" onClick={() => setNewEntDetails(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 14 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input value={newDetailLabel} onChange={e => setNewDetailLabel(e.target.value)} placeholder="Label (e.g. Section)" style={{ flex: '1 1 120px', fontSize: 12, padding: '6px 8px' }} />
                <input value={newDetailValue} onChange={e => setNewDetailValue(e.target.value)} placeholder="Value (e.g. 114)" style={{ flex: '1 1 120px', fontSize: 12, padding: '6px 8px' }} />
                <button
                  type="button"
                  onClick={() => {
                    const label = newDetailLabel.trim();
                    const value = newDetailValue.trim();
                    if (!label || !value) return;
                    setNewEntDetails(prev => [...prev.filter(d => d.label !== label), { label, value }]);
                    setNewDetailLabel(''); setNewDetailValue('');
                  }}
                  style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 6, border: '1px solid #DB2777', background: '#DB2777', color: '#fff', cursor: 'pointer' }}
                >+ Add</button>
              </div>
            </div>

            <button className="btn primary" onClick={saveEntertainmentItem} disabled={!newEntItem.title.trim() || entItemSaving} style={{ marginTop: 12 }}>
              {entItemSaving ? <RefreshCw size={13} className="spin" /> : <Plus size={13} />} {editingEntId ? 'Save Changes' : 'Add Ticket'}
            </button>
          </section>
        )}

        {loading && (
          <section className="panel">
            <div style={{ display: 'flex', gap: 8, color: 'var(--muted)' }}><RefreshCw size={14} className="spin" /> Loading tickets…</div>
          </section>
        )}

        {!loading && entertainmentItems.length === 0 && (
          <section className="panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎟️</div>
            <h3 style={{ margin: '0 0 8px', color: 'var(--muted)' }}>No tickets yet!</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 16px' }}>
              Add a concert, museum visit, game, or show — paste a confirmation email or add one manually.
            </p>
          </section>
        )}

        {!loading && entertainmentItems.map(item => (
          <EventTicketCard key={item.id} item={item} onDelete={() => deleteEntertainmentItem(item.id)} onEdit={() => startEditEntertainment(item)} />
        ))}
      </>}

      {/* Add Item Modal */}
      {addingItemTo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16, overflowY: 'auto' }}>
          <div style={{ background: 'var(--surface, #fff)', borderRadius: 12, padding: 24, maxWidth: 520, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>Add Reservation</h2>
              <button onClick={() => setAddingItemTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', flex: 1 }}>
                  Type
                  <select value={newItem.type} onChange={e => setNewItem(p => ({ ...p, type: e.target.value as ItemType }))}>
                    {(Object.entries(ITEM_CONFIG) as [ItemType, any][]).map(([v, c]) => <option key={v} value={v}>{c.emoji} {c.label}</option>)}
                  </select>
                </label>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                Title *
                <input value={newItem.title} onChange={e => setNewItem(p => ({ ...p, title: e.target.value }))} placeholder={newItem.type === 'flight' ? 'Delta Flight DL1234 ATL→LAX' : newItem.type === 'hotel' ? 'Marriott Grand Flora' : 'Reservation title…'} />
              </label>

              <div className="form-grid">
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Provider / Company
                  <input value={newItem.provider ?? ''} onChange={e => setNewItem(p => ({ ...p, provider: e.target.value || null }))} placeholder="Delta, Marriott, Enterprise…" />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Confirmation #
                  <input value={newItem.confirmation_number ?? ''} onChange={e => setNewItem(p => ({ ...p, confirmation_number: e.target.value || null }))} placeholder="ABC123" />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Start Date
                  <input type="date" value={newItem.start_date ?? ''} onChange={e => setNewItem(p => ({ ...p, start_date: e.target.value || null }))} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Start Time
                  <input type="time" value={newItem.start_time ?? ''} onChange={e => setNewItem(p => ({ ...p, start_time: e.target.value || null }))} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  End Date
                  <input type="date" value={newItem.end_date ?? ''} onChange={e => setNewItem(p => ({ ...p, end_date: e.target.value || null }))} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  End Time
                  <input type="time" value={newItem.end_time ?? ''} onChange={e => setNewItem(p => ({ ...p, end_time: e.target.value || null }))} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Location / Airport / Venue
                  <input value={newItem.location ?? ''} onChange={e => setNewItem(p => ({ ...p, location: e.target.value || null }))} placeholder="ATL, Marriott Downtown, Gate B12…" />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Price
                  <input value={newItem.price ?? ''} onChange={e => setNewItem(p => ({ ...p, price: e.target.value || null }))} placeholder="$249.00" />
                </label>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                Address
                <input value={newItem.address ?? ''} onChange={e => setNewItem(p => ({ ...p, address: e.target.value || null }))} placeholder="123 Main St, Orlando, FL 32830" />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                Notes
                <textarea value={newItem.notes ?? ''} onChange={e => setNewItem(p => ({ ...p, notes: e.target.value || null }))} placeholder="Seat assignments, special requests, pickup instructions…" style={{ minHeight: 60, resize: 'vertical' }} />
              </label>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn primary" onClick={saveItem} disabled={!newItem.title.trim() || itemSaving} style={{ flex: 1 }}>
                  {itemSaving ? <RefreshCw size={13} className="spin" /> : <Plus size={13} />} Add Reservation
                </button>
                <button className="btn ghost" onClick={() => setAddingItemTo(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Trip Modal */}
      {editingTrip && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: 'var(--surface, #fff)', borderRadius: 12, padding: 24, maxWidth: 460, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>Edit Trip</h2>
              <button onClick={() => setEditingTrip(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>
            <EditTripForm trip={editingTrip} onSave={(patch) => updateTrip(editingTrip.id, patch)} onCancel={() => setEditingTrip(null)} />
          </div>
        </div>
      )}
    </>
  );
}

// ── TravelItemCard ─────────────────────────────────────────────────────────

function TravelItemCard({ item, onDelete }: { item: TravelItem; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const cfg = ITEM_CONFIG[item.type];
  const Icon = cfg.icon;
  const logoUrl = getProviderLogo(item.provider);
  const nights = item.type === 'hotel' ? nightsBetween(item.start_date, item.end_date) : null;
  const history = item.history ?? [];
  const updateEntries = history.filter(h => h.changes && Object.keys(h.changes).length > 0);
  const hasUpdates = updateEntries.length > 0;

  return (
    <div style={{ borderRadius: 8, border: '1px solid var(--border, rgba(0,0,0,0.07))', marginBottom: 8, overflow: 'hidden' }}>
      {/* Passenger banner — make it obvious who this reservation is for */}
      {item.passenger_name && (
        <div style={{ padding: '5px 12px', background: '#0891b222', fontSize: 11, fontWeight: 700, color: '#0891b2', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Star size={10} /> FOR: {item.passenger_name.toUpperCase()}
        </div>
      )}
      {/* Updated banner */}
      {hasUpdates && (
        <div style={{ padding: '5px 12px', background: '#D9770622', fontSize: 11, fontWeight: 700, color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>⚠ Updated since it was added</span>
          <button onClick={() => setShowHistory(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D97706', fontWeight: 700, fontSize: 11, textDecoration: 'underline' }}>
            {showHistory ? 'Hide history' : `View history (${updateEntries.length})`}
          </button>
        </div>
      )}
      {showHistory && (
        <div style={{ padding: '8px 12px', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {history.slice().reverse().map((h, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--muted)' }}>
              <span style={{ fontWeight: 700 }}>{new Date(h.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}:</span> {h.note} {h.source ? `(${h.source})` : ''}
            </div>
          ))}
        </div>
      )}

      {/* Header: logo, title, provider, dates, confirmation #, price */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(v => !v)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setExpanded(v => !v); }}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', background: `${cfg.color}08`, border: 'none', padding: '10px 12px', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ width: 40, height: 40, borderRadius: 8, background: '#fff', border: `1px solid ${cfg.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
          {logoUrl && !logoFailed ? (
            <img
              src={logoUrl}
              alt={item.provider ?? ''}
              onError={() => setLogoFailed(true)}
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 5 }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', background: `${cfg.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={17} style={{ color: cfg.color }} />
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {item.provider && <span>{item.provider}</span>}
            {item.start_date && (
              <span>
                <Clock size={9} style={{ marginRight: 2 }} />
                {fmt(item.start_date, item.start_time)}
                {item.end_date && item.end_date !== item.start_date ? ` → ${fmt(item.end_date, item.end_time)}` : ''}
                {nights ? ` (${nights} ${nights === 1 ? 'night' : 'nights'})` : ''}
              </span>
            )}
          </div>
          {/* Always-visible location / address */}
          {(item.location || item.address) && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {item.location && (
                <span style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                  <MapPin size={10} style={{ color: cfg.color, flexShrink: 0, marginTop: 1 }} />
                  {item.location}
                </span>
              )}
              {item.address && (
                <span style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                  <Globe size={10} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 1 }} />
                  {item.address}
                </span>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {item.price && <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>{item.price}</span>}
            <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4 }}><Trash2 size={12} /></button>
            {expanded ? <ChevronUp size={13} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={13} style={{ color: 'var(--muted)' }} />}
          </div>
          {item.confirmation_number && (
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 11, color: cfg.color, background: `${cfg.color}18`, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
              #{item.confirmation_number}
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '10px 12px 12px', borderTop: '1px solid var(--border, rgba(0,0,0,0.07))', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {item.phone && <div style={{ fontSize: 13, display: 'flex', gap: 6 }}><Phone size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} /><a href={`tel:${item.phone}`} style={{ color: 'var(--link)' }}>{item.phone}</a></div>}
          {item.website && <div style={{ fontSize: 13, display: 'flex', gap: 6 }}><Globe size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} /><a href={item.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--link)' }}>{item.website}</a></div>}
          {item.notes && <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', marginTop: 4, padding: '6px 8px', background: 'var(--surface-2)', borderRadius: 4 }}>{item.notes}</div>}
          {item.email_subject && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, display: 'flex', gap: 4 }}><Mail size={10} /><span>From email: {item.email_subject}</span></div>}
          {history.length > 0 && !hasUpdates && (
            <button onClick={() => setShowHistory(v => !v)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 11, textDecoration: 'underline', padding: 0, marginTop: 4 }}>
              {showHistory ? 'Hide history' : 'View history'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── FlightItineraryCard ────────────────────────────────────────────────────
// Renders a full multi-leg itinerary (same confirmation #) the way an
// airline itinerary page does: route header, confirmation, passenger,
// an "updated" banner if anything changed, then each leg with a
// "change planes" divider in between.

function FlightItineraryCard({ legs, onDeleteLeg }: { legs: TravelItem[]; onDeleteLeg: (id: string) => void }) {
  const [showHistory, setShowHistory] = useState(false);
  const first = legs[0];
  const last = legs[legs.length - 1];
  const cfg = ITEM_CONFIG.flight;

  const allHistory = legs.flatMap(l => (l.history ?? []).map(h => ({ ...h, leg: l.flight_number })));
  const updateEntries = allHistory.filter(h => h.changes && Object.keys(h.changes).length > 0);
  const hasUpdates = updateEntries.length > 0;
  const passenger = legs.find(l => l.passenger_name)?.passenger_name;

  const startDate = first.start_date;
  const endDate = last.end_date ?? last.start_date;
  const dateRange = startDate
    ? (endDate && endDate !== startDate
      ? `${new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: '2-digit' })} - ${new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: '2-digit' })}`.toUpperCase()
      : new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' }).toUpperCase())
    : null;

  return (
    <div style={{ borderRadius: 10, border: '1px solid var(--border, rgba(0,0,0,0.08))', marginBottom: 10, overflow: 'hidden', background: 'var(--surface, #fff)' }}>
      {/* Passenger banner */}
      {passenger && (
        <div style={{ padding: '6px 16px', background: '#0891b222', fontSize: 11, fontWeight: 700, color: '#0891b2', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Star size={10} /> FOR: {passenger.toUpperCase()}
        </div>
      )}

      {/* Route header */}
      <div style={{ padding: '16px 16px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          {dateRange && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0.5 }}>{dateRange}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            {legs.map(l => (
              <button key={l.id} onClick={() => onDeleteLeg(l.id)} title={`Remove ${l.flight_number ?? 'leg'}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 2 }}>
                <Trash2 size={13} />
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>{first.origin_code ?? '—'}</span>
          <Plane size={20} style={{ color: cfg.color, transform: 'rotate(90deg)' }} />
          <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>{last.destination_code ?? '—'}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
          {first.origin_city ?? first.location ?? 'Origin'} to {last.destination_city ?? last.location ?? 'Destination'}
        </div>
      </div>

      {/* Confirmation number */}
      {first.confirmation_number && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border, rgba(0,0,0,0.06))', display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Confirmation #</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>{first.confirmation_number}</span>
        </div>
      )}

      {/* Updated banner */}
      {hasUpdates && (
        <div style={{ padding: '8px 16px', background: '#D9770622', fontSize: 12, fontWeight: 700, color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>⚠ Updated flight information</span>
          <button onClick={() => setShowHistory(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D97706', fontWeight: 700, fontSize: 12, textDecoration: 'underline' }}>
            {showHistory ? 'Hide history' : `View history (${updateEntries.length})`}
          </button>
        </div>
      )}
      {showHistory && (
        <div style={{ padding: '8px 16px', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {allHistory.slice().reverse().map((h, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--muted)' }}>
              <span style={{ fontWeight: 700 }}>{new Date(h.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{h.leg ? ` (Flight ${h.leg})` : ''}:</span> {h.note} {h.source ? `(${h.source})` : ''}
            </div>
          ))}
        </div>
      )}

      {/* Legs */}
      <div style={{ padding: '4px 16px 16px' }}>
        {legs.map((leg, idx) => (
          <div key={leg.id}>
            <div style={{ padding: '12px 0', borderTop: idx > 0 ? '1px solid var(--border, rgba(0,0,0,0.06))' : 'none', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ minWidth: 70 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0.5 }}>FLIGHT</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{leg.flight_number ? `#${leg.flight_number}` : '—'}</div>
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0.5 }}>DEPARTS</div>
                <div style={{ fontSize: 14 }}>
                  <span style={{ fontWeight: 700 }}>{leg.origin_code ?? ''}</span>{' '}
                  {leg.start_time && <span style={{ color: '#D97706', fontWeight: 700 }}>{formatTime12h(leg.start_time)}</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{leg.origin_city ?? ''}</div>
              </div>
              <Plane size={16} style={{ color: cfg.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0.5 }}>ARRIVES</div>
                <div style={{ fontSize: 14 }}>
                  <span style={{ fontWeight: 700 }}>{leg.destination_code ?? ''}</span>{' '}
                  {leg.end_time && <span style={{ color: '#D97706', fontWeight: 700 }}>{formatTime12h(leg.end_time)}</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{leg.destination_city ?? ''}</div>
              </div>
              {leg.price && <div style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>{leg.price}</div>}
            </div>
            {leg.notes && <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', paddingBottom: 8 }}>{leg.notes}</div>}
            {idx < legs.length - 1 && (
              <div style={{ margin: '0 0 4px', padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 6, fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Plane size={11} style={{ transform: 'rotate(90deg)' }} /> Stop: Change planes in {leg.destination_city ?? leg.destination_code ?? 'transit'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── HotelItineraryCard ──────────────────────────────────────────────────────
// Styled like a hotel confirmation email: dark header bar with the
// property name, address/phone row, a check-in → nights → check-out strip,
// then a "Room Information"-style details block.

function HotelItineraryCard({ item, onDelete }: { item: TravelItem; onDelete: () => void }) {
  const [showHistory, setShowHistory] = useState(false);
  const history = item.history ?? [];
  const updateEntries = history.filter(h => h.changes && Object.keys(h.changes).length > 0);
  const hasUpdates = updateEntries.length > 0;
  const nights = nightsBetween(item.start_date, item.end_date);
  const detailEntries = Object.entries(item.details ?? {});
  const mapsUrl = item.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}` : null;

  const dayLabel = (date: string | null) => {
    if (!date) return null;
    const d = new Date(date + 'T00:00:00');
    return {
      weekday: d.toLocaleDateString('en-US', { weekday: 'long' }),
      monthDay: d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase(),
    };
  };
  const checkIn = dayLabel(item.start_date);
  const checkOut = dayLabel(item.end_date);

  return (
    <div style={{ borderRadius: 10, border: '1px solid var(--border, rgba(0,0,0,0.08))', marginBottom: 10, overflow: 'hidden', background: 'var(--surface, #fff)' }}>
      {item.passenger_name && (
        <div style={{ padding: '6px 16px', background: '#0891b222', fontSize: 11, fontWeight: 700, color: '#0891b2', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Star size={10} /> FOR: {item.passenger_name.toUpperCase()}
        </div>
      )}

      {/* Dark header bar with hotel name */}
      <div style={{ background: '#3a3a3a', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, textDecoration: 'underline', textAlign: 'center', flex: 1 }}>
          {item.provider || item.title}
        </div>
        <button onClick={onDelete} title="Remove reservation" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', flexShrink: 0 }}>
          <Trash2 size={14} />
        </button>
      </div>

      {/* Address / phone row */}
      {(item.address || item.phone) && (
        <div style={{ padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: 20, borderBottom: '1px solid var(--border, rgba(0,0,0,0.06))' }}>
          {item.address && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flex: 1, minWidth: 180 }}>
              <MapPin size={16} style={{ color: '#7C3AED', flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 13 }}>{item.address}</div>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 700, textDecoration: 'underline', color: 'var(--link)' }}>
                    Maps &amp; Directions »
                  </a>
                )}
              </div>
            </div>
          )}
          {item.phone && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Phone size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <a href={`tel:${item.phone}`} style={{ fontSize: 13, color: 'var(--link)' }}>{item.phone}</a>
            </div>
          )}
        </div>
      )}

      {/* Check-in / nights / check-out */}
      {(checkIn || checkOut) && (
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--border, rgba(0,0,0,0.06))', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'left' }}>
            {checkIn && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{checkIn.weekday}</div>}
            {checkIn && <div style={{ fontSize: 17, fontWeight: 800 }}>{checkIn.monthDay}</div>}
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Check In: {formatTime12h(item.start_time) ?? '—'}</div>
          </div>
          {nights != null && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18 }}>🌙</div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{nights}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{nights === 1 ? 'Night' : 'Nights'}</div>
            </div>
          )}
          <div style={{ textAlign: 'right' }}>
            {checkOut && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{checkOut.weekday}</div>}
            {checkOut && <div style={{ fontSize: 17, fontWeight: 800 }}>{checkOut.monthDay}</div>}
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Check Out: {formatTime12h(item.end_time) ?? '—'}</div>
          </div>
        </div>
      )}

      {/* Updated banner */}
      {hasUpdates && (
        <div style={{ padding: '8px 16px', background: '#D9770622', fontSize: 12, fontWeight: 700, color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>⚠ Updated reservation information</span>
          <button onClick={() => setShowHistory(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D97706', fontWeight: 700, fontSize: 12, textDecoration: 'underline' }}>
            {showHistory ? 'Hide history' : `View history (${updateEntries.length})`}
          </button>
        </div>
      )}
      {showHistory && (
        <div style={{ padding: '8px 16px', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {history.slice().reverse().map((h, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--muted)' }}>
              <span style={{ fontWeight: 700 }}>{new Date(h.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}:</span> {h.note} {h.source ? `(${h.source})` : ''}
            </div>
          ))}
        </div>
      )}

      {/* Room / reservation information */}
      <div style={{ background: '#3a3a3a', color: '#fff', padding: '8px 16px', fontWeight: 700, fontSize: 13 }}>
        Reservation Details
      </div>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {detailEntries.length === 0 && item.notes && (
          <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>{item.notes}</div>
        )}
        {detailEntries.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
            <span style={{ fontWeight: 700, color: 'var(--muted)' }}>{label}</span>
            <span style={{ textAlign: 'right' }}>{value}</span>
          </div>
        ))}
        {item.price && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--border, rgba(0,0,0,0.06))' }}>
            <span>Total price for Stay</span>
            <span style={{ color: '#059669' }}>{item.price}</span>
          </div>
        )}
      </div>

      {/* Footer: confirmation # + website + email source */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border, rgba(0,0,0,0.06))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        {item.confirmation_number && (
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#7C3AED', background: '#7C3AED18', padding: '2px 8px', borderRadius: 4 }}>
            #{item.confirmation_number}
          </span>
        )}
        {item.website && (
          <a href={item.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, textDecoration: 'underline', color: 'var(--link)' }}>
            Modify Your Reservation »
          </a>
        )}
      </div>
      {item.email_subject && (
        <div style={{ padding: '0 16px 10px', fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 4, alignItems: 'center' }}>
          <Mail size={10} /> From email: {item.email_subject}
        </div>
      )}
    </div>
  );
}

// ── EventTicketCard ──────────────────────────────────────────────────────────
// Styled like a ticket stub for concerts, shows, theme park tickets, tours,
// and other "things to do" bookings — event name up top, venue/date front
// and center, a perforated divider, then seat/section-style details.

function EventTicketCard({ item, onDelete, onEdit }: { item: TravelItem; onDelete: () => void; onEdit?: () => void }) {
  const [showHistory, setShowHistory] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const cfg = ITEM_CONFIG.activity;
  const logoUrl = getProviderLogo(item.provider);
  const history = item.history ?? [];
  const updateEntries = history.filter(h => h.changes && Object.keys(h.changes).length > 0);
  const hasUpdates = updateEntries.length > 0;
  const detailEntries = Object.entries(item.details ?? {});
  const mapsUrl = item.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}` : null;

  return (
    <div style={{ borderRadius: 10, border: '1px solid var(--border, rgba(0,0,0,0.08))', marginBottom: 10, overflow: 'hidden', background: 'var(--surface, #fff)' }}>
      {item.passenger_name && (
        <div style={{ padding: '6px 16px', background: '#0891b222', fontSize: 11, fontWeight: 700, color: '#0891b2', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Star size={10} /> FOR: {item.passenger_name.toUpperCase()}
        </div>
      )}

      {/* Ticket header: event name on a colored band */}
      <div style={{ background: `${cfg.color}`, padding: '16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
          {logoUrl && !logoFailed ? (
            <img src={logoUrl} alt={item.provider ?? ''} onError={() => setLogoFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} />
          ) : (
            <Ticket size={18} style={{ color: cfg.color }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>{item.title}</div>
          {item.provider && <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 }}>{item.provider}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {onEdit && (
            <button onClick={onEdit} title="Edit ticket" style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#fff', padding: 5 }}>
              <Edit2 size={13} />
            </button>
          )}
          <button onClick={onDelete} title="Remove ticket" style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#fff', padding: 5 }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Venue + date/time strip */}
      <div style={{ padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: 20, borderBottom: '1px dashed var(--border, rgba(0,0,0,0.15))' }}>
        {(item.location || item.address) && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flex: 1, minWidth: 160 }}>
            <MapPin size={16} style={{ color: cfg.color, flexShrink: 0, marginTop: 2 }} />
            <div>
              {item.location && <div style={{ fontSize: 13, fontWeight: 600 }}>{item.location}</div>}
              {item.address && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{item.address}</div>}
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 700, textDecoration: 'underline', color: 'var(--link)' }}>
                  Maps &amp; Directions »
                </a>
              )}
            </div>
          </div>
        )}
        {item.start_date && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Calendar size={16} style={{ color: cfg.color, flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt(item.start_date)}</div>
              {item.start_time && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{formatTime12h(item.start_time)}{item.end_time ? ` – ${formatTime12h(item.end_time)}` : ''}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Updated banner */}
      {hasUpdates && (
        <div style={{ padding: '8px 16px', background: '#D9770622', fontSize: 12, fontWeight: 700, color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>⚠ Updated ticket information</span>
          <button onClick={() => setShowHistory(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D97706', fontWeight: 700, fontSize: 12, textDecoration: 'underline' }}>
            {showHistory ? 'Hide history' : `View history (${updateEntries.length})`}
          </button>
        </div>
      )}
      {showHistory && (
        <div style={{ padding: '8px 16px', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {history.slice().reverse().map((h, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--muted)' }}>
              <span style={{ fontWeight: 700 }}>{new Date(h.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}:</span> {h.note} {h.source ? `(${h.source})` : ''}
            </div>
          ))}
        </div>
      )}

      {/* Ticket details: section/row/seat, quantity, ticket type, etc. */}
      {(detailEntries.length > 0 || item.notes) && (
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, borderBottom: '1px solid var(--border, rgba(0,0,0,0.06))' }}>
          {detailEntries.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: 'var(--muted)' }}>{label}</span>
              <span style={{ textAlign: 'right' }}>{value}</span>
            </div>
          ))}
          {item.notes && detailEntries.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>{item.notes}</div>
          )}
        </div>
      )}

      {/* Footer: confirmation #, price, manage-tickets link */}
      <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {item.confirmation_number && (
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: cfg.color, background: `${cfg.color}18`, padding: '2px 8px', borderRadius: 4 }}>
              #{item.confirmation_number}
            </span>
          )}
          {item.price && <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>{item.price}</span>}
        </div>
        {item.website && (
          <a href={item.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, textDecoration: 'underline', color: 'var(--link)' }}>
            View / Manage Tickets »
          </a>
        )}
      </div>
      {item.phone && (
        <div style={{ padding: '0 16px 10px', display: 'flex', gap: 6, alignItems: 'center' }}>
          <Phone size={12} style={{ color: 'var(--muted)' }} />
          <a href={`tel:${item.phone}`} style={{ fontSize: 12, color: 'var(--link)' }}>{item.phone}</a>
        </div>
      )}
      {item.email_subject && (
        <div style={{ padding: '0 16px 10px', fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 4, alignItems: 'center' }}>
          <Mail size={10} /> From email: {item.email_subject}
        </div>
      )}
    </div>
  );
}

// ── EditTripForm ───────────────────────────────────────────────────────────

function EditTripForm({ trip, onSave, onCancel }: { trip: Trip; onSave: (patch: Partial<Trip>) => void; onCancel: () => void }) {
  const [name, setName]         = useState(trip.name);
  const [dest, setDest]         = useState(trip.destination ?? '');
  const [start, setStart]       = useState(trip.start_date ?? '');
  const [end, setEnd]           = useState(trip.end_date ?? '');
  const [status, setStatus]     = useState<TripStatus>(trip.status);
  const [notes, setNotes]       = useState(trip.notes ?? '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
        Trip Name
        <input value={name} onChange={e => setName(e.target.value)} />
      </label>
      <div className="form-grid">
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
          Destination<input value={dest} onChange={e => setDest(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
          Status
          <select value={status} onChange={e => setStatus(e.target.value as TripStatus)}>
            {(Object.entries(STATUS_CONFIG) as [TripStatus, any][]).map(([v, c]) => <option key={v} value={v}>{c.emoji} {c.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
          Start<input type="date" value={start} onChange={e => setStart(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
          End<input type="date" value={end} onChange={e => setEnd(e.target.value)} />
        </label>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
        Notes<textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ minHeight: 60, resize: 'vertical' }} />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" onClick={() => onSave({ name, destination: dest || null, start_date: start || null, end_date: end || null, status, notes: notes || null })} disabled={!name.trim()} style={{ flex: 1 }}>Save Changes</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
