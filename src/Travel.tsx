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

type TravelItem = {
  id: string;
  trip_id: string;
  user_id: string;
  type: ItemType;
  title: string;
  provider: string | null;
  confirmation_number: string | null;
  start_date: string | null;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
  location: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  price: string | null;
  notes: string | null;
  email_subject: string | null;
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

const BLANK_ITEM: Omit<TravelItem, 'id' | 'trip_id' | 'user_id' | 'created_at'> = {
  type: 'flight', title: '', provider: null, confirmation_number: null,
  start_date: null, start_time: null, end_date: null, end_time: null,
  location: null, address: null, phone: null, website: null,
  price: null, notes: null, email_subject: null,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(date: string | null, time?: string | null) {
  if (!date) return null;
  const d = new Date(date + 'T00:00:00');
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return time ? `${dateStr} at ${time}` : dateStr;
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

// ── Main Component ─────────────────────────────────────────────────────────

export default function Travel({ userId }: { userId: string }) {
  const [trips, setTrips]               = useState<Trip[]>([]);
  const [items, setItems]               = useState<Record<string, TravelItem[]>>({});
  const [loading, setLoading]           = useState(true);
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);
  const [scanning, setScanning]         = useState(false);
  const [scanMsg, setScanMsg]           = useState('');
  const [statusFilter, setStatusFilter] = useState<TripStatus | 'all'>('all');

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
          .order('start_date', { ascending: true });
        if (itemData) {
          const grouped: Record<string, TravelItem[]> = {};
          for (const item of itemData as TravelItem[]) {
            if (!grouped[item.trip_id]) grouped[item.trip_id] = [];
            grouped[item.trip_id].push(item);
          }
          setItems(grouped);
        }
      }
    }
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

  // ── Filtered trips ────────────────────────────────────────────────────
  const filtered = trips.filter(t => statusFilter === 'all' || t.status === statusFilter);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Travel</h1>
          <p>{trips.length} trips · {Object.values(items).flat().length} reservations</p>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={scanGmail} disabled={scanning} style={{ color: '#059669', borderColor: '#059669' }}>
            {scanning ? <RefreshCw size={15} className="spin" /> : <Mail size={15} />}
            {scanning ? 'Scanning…' : 'Scan Gmail'}
          </button>
          <button className="btn primary" onClick={() => setShowNewTrip(v => !v)}>
            <Plus size={15} /> New Trip
          </button>
        </div>
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

      {/* New Trip Form */}
      {showNewTrip && (
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

                {tripItems.map(item => <TravelItemCard key={item.id} item={item} onDelete={() => deleteItem(trip.id, item.id)} />)}

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
  const cfg = ITEM_CONFIG[item.type];
  const Icon = cfg.icon;

  return (
    <div style={{ borderRadius: 8, border: '1px solid var(--border, rgba(0,0,0,0.07))', marginBottom: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: `${cfg.color}08`, border: 'none', padding: '10px 12px', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${cfg.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={16} style={{ color: cfg.color }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {item.provider && <span>{item.provider}</span>}
            {item.start_date && <span><Clock size={9} style={{ marginRight: 2 }} />{fmt(item.start_date, item.start_time)}</span>}
            {item.confirmation_number && <span style={{ fontFamily: 'monospace', fontWeight: 700, color: cfg.color }}>#{item.confirmation_number}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          {item.price && <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>{item.price}</span>}
          <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4 }}><Trash2 size={12} /></button>
          {expanded ? <ChevronUp size={13} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={13} style={{ color: 'var(--muted)' }} />}
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '10px 12px 12px', borderTop: '1px solid var(--border, rgba(0,0,0,0.07))', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {item.location && <div style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'flex-start' }}><MapPin size={13} style={{ color: cfg.color, flexShrink: 0, marginTop: 1 }} /><span>{item.location}</span></div>}
          {item.address && <div style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'flex-start' }}><Globe size={13} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 1 }} /><span>{item.address}</span></div>}
          {item.end_date && <div style={{ fontSize: 13, display: 'flex', gap: 6 }}><Clock size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} /><span>Until {fmt(item.end_date, item.end_time)}{item.type === 'hotel' ? ` (${nightsBetween(item.start_date, item.end_date)} nights)` : ''}</span></div>}
          {item.phone && <div style={{ fontSize: 13, display: 'flex', gap: 6 }}><Phone size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} /><a href={`tel:${item.phone}`} style={{ color: 'var(--link)' }}>{item.phone}</a></div>}
          {item.website && <div style={{ fontSize: 13, display: 'flex', gap: 6 }}><Globe size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} /><a href={item.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--link)' }}>{item.website}</a></div>}
          {item.notes && <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', marginTop: 4, padding: '6px 8px', background: 'var(--surface-2)', borderRadius: 4 }}>{item.notes}</div>}
          {item.email_subject && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, display: 'flex', gap: 4 }}><Mail size={10} /><span>From email: {item.email_subject}</span></div>}
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
