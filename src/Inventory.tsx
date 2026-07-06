// src/Inventory.tsx
//
// Smart Home Inventory
// - Barcode scanner support (Tera HW0009 & any USB/BT HID scanner)
// - Scan in / scan out quantity tracking
// - Bulk add mode (scan multiple without clicking save)
// - Expiration tracking + use-before list
// - AI recipe suggestions for expiring items
// - Average cost reference for Canton, GA
// - Perishable / food item flagging

import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { Plus, X, Search, RefreshCw, Sparkles, Trash2, AlertTriangle, ShoppingCart, BarChart3, Package } from 'lucide-react';
import { supabase } from './lib/supabase';

// __ Types _______________________________________________________________

interface InventoryItem {
  id: string;
  name: string;
  brand: string | null;
  location: string | null;
  category: string | null;
  quantity: number;
  unit: string;
  expires: string | null;
  import_date: string | null;
  value: number | null;
  avg_cost_canton: number | null;
  barcode: string | null;
  notes: string | null;
  is_perishable: boolean;
  scan_count: number;
  created_at: string;
  updated_at: string | null;
}

interface InventoryTransaction {
  id: string;
  item_id: string;
  transaction_type: 'scan_in' | 'scan_out' | 'manual_adjust' | 'bulk_add';
  quantity_change: number;
  barcode: string | null;
  notes: string | null;
  created_at: string;
}

// __ Constants ___________________________________________________________

const CATEGORIES = [
  'Pantry', 'Refrigerator', 'Freezer', 'Cleaning', 'Personal Care',
  'Pet Supplies', 'Medicine', 'Garden', 'Paper Products', 'Beverages',
  'Snacks', 'Baking', 'Canned Goods', 'Condiments', 'Other',
];

const UNITS = ['each', 'oz', 'lbs', 'gal', 'qt', 'pint', 'fl oz', 'cups', 'count', 'pkg', 'box', 'can', 'jar', 'bottle'];

const LOCATIONS = ['Kitchen', 'Cabinet', 'Bathroom', 'Laundry Room', 'Garage', 'Storage'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function toKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function daysUntil(iso: string): number {
  const exp = new Date(iso + 'T00:00:00');
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.round((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// __ Main Component ______________________________________________________

export default function Inventory() {
  const [items, setItems]               = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [tab, setTab]                   = useState<'items' | 'expiring' | 'scan' | 'add' | 'history'>('items');

  // Search / filter
  const [searchQuery, setSearchQuery]   = useState('');
  const [filterCat, setFilterCat]       = useState('all');
  const [filterLoc, setFilterLoc]       = useState('all');

  // Add/edit form
  const [editingItem, setEditingItem]   = useState<InventoryItem | null>(null);
  const [fName, setFName]               = useState('');
  const [fBrand, setFBrand]             = useState('');
  const [fCat, setFCat]                 = useState('Pantry');
  const [fLoc, setFLoc]                 = useState('Kitchen');
  const [fQty, setFQty]                 = useState(1);
  const [fUnit, setFUnit]               = useState('each');
  const [fExpires, setFExpires]         = useState('');
  const [fImport, setFImport]           = useState(toKey(new Date()));
  const [fCost, setFCost]               = useState('');
  const [fBarcode, setFBarcode]         = useState('');
  const [fNotes, setFNotes]             = useState('');
  const [fPerishable, setFPerishable]   = useState(false);
  const [saving, setSaving]             = useState(false);

  // Scan mode
  const [scanMode, setScanMode]         = useState<'in' | 'out'>('in');
  const [bulkMode, setBulkMode]         = useState(false);
  const [scanInput, setScanInput]       = useState('');
  const [scanLog, setScanLog]           = useState<{barcode:string;name:string;qty:number;action:string;time:string}[]>([]);
  const [scanStatus, setScanStatus]     = useState<string>('');
  const [pendingBulk, setPendingBulk]   = useState<{barcode:string;name:string;count:number}[]>([]);
  const scanRef = useRef<HTMLInputElement>(null);

  // AI recipe state
  const [aiRecipes, setAiRecipes]       = useState('');
  const [aiLoading, setAiLoading]       = useState(false);

  const today = toKey(new Date());

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) { setLoading(false); return; }

    const [itemsRes, txRes] = await Promise.all([
      supabase.from('inventory_items').select('*').eq('user_id', userId).order('name'),
      supabase.from('inventory_transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
    ]);
    setItems((itemsRes.data as InventoryItem[]) ?? []);
    setTransactions((txRes.data as InventoryTransaction[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Focus scan input when on scan tab
  useEffect(() => {
    if (tab === 'scan' && scanRef.current) {
      scanRef.current.focus();
    }
  }, [tab]);

  function resetForm() {
    setFName(''); setFBrand(''); setFCat('Pantry'); setFLoc('Kitchen');
    setFQty(1); setFUnit('each'); setFExpires(''); setFImport(toKey(new Date()));
    setFCost(''); setFBarcode(''); setFNotes(''); setFPerishable(false);
    setEditingItem(null);
  }

  function startEdit(item: InventoryItem) {
    setEditingItem(item);
    setFName(item.name); setFBrand(item.brand ?? ''); setFCat(item.category ?? 'Pantry');
    setFLoc(item.location ?? 'Kitchen'); setFQty(item.quantity); setFUnit(item.unit ?? 'each');
    setFExpires(item.expires ?? ''); setFImport(item.import_date ?? toKey(new Date()));
    setFCost(item.avg_cost_canton?.toString() ?? ''); setFBarcode(item.barcode ?? '');
    setFNotes(item.notes ?? ''); setFPerishable(item.is_perishable ?? false);
    setTab('add');
  }

  async function saveItem() {
    if (!supabase || !fName.trim()) return;
    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) { setSaving(false); return; }

    const payload = {
      name: fName.trim(),
      brand: fBrand.trim() || null,
      category: fCat,
      location: fLoc,
      quantity: fQty,
      unit: fUnit,
      expires: fExpires || null,
      import_date: fImport || null,
      avg_cost_canton: fCost ? parseFloat(fCost) : null,
      barcode: fBarcode.trim() || null,
      notes: fNotes.trim() || null,
      is_perishable: fPerishable,
      user_id: userId,
      updated_at: new Date().toISOString(),
    };

    if (editingItem) {
      await supabase.from('inventory_items').update(payload).eq('id', editingItem.id);
      // Log manual adjust if qty changed
      if (editingItem.quantity !== fQty) {
        await supabase.from('inventory_transactions').insert({
          item_id: editingItem.id, user_id: userId,
          transaction_type: 'manual_adjust',
          quantity_change: fQty - editingItem.quantity,
          notes: 'Manual edit',
        });
      }
    } else {
      const { data: newItem } = await supabase.from('inventory_items').insert([payload]).select().single();
      if (newItem) {
        await supabase.from('inventory_transactions').insert({
          item_id: newItem.id, user_id: userId,
          transaction_type: 'manual_adjust',
          quantity_change: fQty,
          notes: 'Item added',
        });
      }
    }
    await load();
    resetForm();
    setSaving(false);
    setTab('items');
  }

  async function deleteItem(id: string) {
    if (!supabase || !confirm('Delete this item from inventory?')) return;
    await supabase.from('inventory_items').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  // __ Barcode scanner handler ____________________________________________
  // Tera HW0009 and most USB/BT HID scanners send barcode + Enter key
  async function handleScanSubmit(barcode: string) {
    if (!supabase || !barcode.trim()) return;
    const code = barcode.trim();
    setScanInput('');

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return;

    // Look up item by barcode
    const existing = items.find(i => i.barcode === code);

    if (bulkMode) {
      // In bulk mode: tally scans, save all at once
      // Unknown barcodes still get queued — user can resolve at Save All time
      setPendingBulk(prev => {
        const found = prev.find(p => p.barcode === code);
        if (found) {
          return prev.map(p => p.barcode === code ? { ...p, count: p.count + 1 } : p);
        }
        return [...prev, { barcode: code, name: existing?.name ?? `⚠️ Unknown (${code})`, count: 1 }];
      });
      setScanStatus(`📦 ${existing?.name ?? 'Unknown item'} — queued. Keep scanning!`);
      // Refocus immediately — no async delay needed in bulk mode
      scanRef.current?.focus();
      return;
    }

    const qtyChange = scanMode === 'in' ? 1 : -1;
    const txType = scanMode === 'in' ? 'scan_in' : 'scan_out';

    if (existing) {
      const newQty = Math.max(0, existing.quantity + qtyChange);
      await supabase.from('inventory_items').update({
        quantity: newQty,
        scan_count: (existing.scan_count ?? 0) + 1,
        last_scanned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
      await supabase.from('inventory_transactions').insert({
        item_id: existing.id, user_id: userId,
        transaction_type: txType,
        quantity_change: qtyChange,
        barcode: code,
      });
      // Update local state immediately (no full reload needed)
      setItems(prev => prev.map(i => i.id === existing.id ? { ...i, quantity: newQty, scan_count: (i.scan_count ?? 0) + 1 } : i));
      setScanStatus(`✅ ${scanMode === 'in' ? '↑ Added' : '↓ Removed'}: ${existing.name} → Qty: ${newQty}`);
      setScanLog(prev => [{
        barcode: code, name: existing.name,
        qty: newQty, action: scanMode === 'in' ? 'Scanned In' : 'Scanned Out',
        time: new Date().toLocaleTimeString(),
      }, ...prev.slice(0, 29)]);
    } else {
      // Unknown barcode — prompt to add
      setScanStatus(`⚠️ Unknown barcode: ${code} — fill in the form below and save.`);
      setFBarcode(code);
      setTab('add');
      return;
    }

    // Refocus for next scan
    requestAnimationFrame(() => scanRef.current?.focus());
  }

  // Save all bulk pending scans
  async function saveBulkScans() {
    if (!supabase || pendingBulk.length === 0) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return;

    const totalScans = pendingBulk.reduce((s, p) => s + p.count, 0);
    let saved = 0;
    const unknown: string[] = [];

    for (const pending of pendingBulk) {
      const item = items.find(i => i.barcode === pending.barcode);
      if (item) {
        const newQty = scanMode === 'in'
          ? item.quantity + pending.count
          : Math.max(0, item.quantity - pending.count);
        await supabase.from('inventory_items').update({
          quantity: newQty,
          scan_count: (item.scan_count ?? 0) + pending.count,
          last_scanned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', item.id);
        await supabase.from('inventory_transactions').insert({
          item_id: item.id, user_id: userId,
          transaction_type: 'bulk_add',
          quantity_change: scanMode === 'in' ? pending.count : -pending.count,
          barcode: pending.barcode,
          notes: `Bulk ${scanMode}: ${pending.count} units`,
        });
        saved += pending.count;
      } else {
        unknown.push(pending.barcode);
      }
    }

    setPendingBulk([]);
    const msg = unknown.length > 0
      ? `✅ Saved ${saved} scans. ⚠️ ${unknown.length} unknown barcode(s) skipped: ${unknown.join(', ')}`
      : `✅ Bulk save complete — ${saved} scan(s) across ${pendingBulk.length} item(s) updated`;
    setScanStatus(msg);
    await load();
    scanRef.current?.focus();
  }

  // __ AI recipe generator ________________________________________________
  async function generateRecipes() {
    const expiringSoon = expiringItems.filter(i => (i._days ?? 99) <= 7);
    if (expiringSoon.length === 0) return;
    setAiLoading(true); setAiRecipes('');
    const itemList = expiringSoon.map(i => `${i.name}${i.brand ? ` (${i.brand})` : ''} — expires in ${i._days} day${i._days !== 1 ? 's' : ''}`).join('\n');
    const prompt = `You are a helpful home cook assistant for a family in Canton, Georgia.

The following items are expiring soon and need to be used up:
${itemList}

Suggest 3–4 practical, family-friendly recipes or meal ideas that use these ingredients. Keep suggestions simple and achievable on a weeknight. Format each as:
🍽️ [Recipe Name]
Uses: [which expiring items it uses]
Quick tip: [1-sentence cooking note]`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 800,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await response.json();
      setAiRecipes(data.content?.[0]?.text ?? 'Could not generate recipes. Try again.');
    } catch {
      setAiRecipes('Error generating recipes. Please try again.');
    }
    setAiLoading(false);
  }

  // __ Computed ____________________________________________________________
  const filteredItems = useMemo(() => {
    let list = items;
    if (filterCat !== 'all') list = list.filter(i => i.category === filterCat);
    if (filterLoc !== 'all') list = list.filter(i => i.location === filterLoc);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.brand ?? '').toLowerCase().includes(q) ||
        (i.barcode ?? '').includes(q)
      );
    }
    return list;
  }, [items, filterCat, filterLoc, searchQuery]);

  const expiringItems = useMemo(() =>
    items
      .filter(i => i.expires && i.is_perishable)
      .map(i => ({ ...i, _days: daysUntil(i.expires!) }))
      .sort((a, b) => (a._days ?? 999) - (b._days ?? 999)),
    [items]
  );

  const expiredCount  = expiringItems.filter(i => (i._days ?? 0) < 0).length;
  const urgentCount   = expiringItems.filter(i => (i._days ?? 99) >= 0 && (i._days ?? 99) <= 3).length;
  const soonCount     = expiringItems.filter(i => (i._days ?? 99) >= 4 && (i._days ?? 99) <= 7).length;
  const lowStockCount = items.filter(i => i.quantity <= 1).length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Inventory</h1>
          <p>{items.length} items tracked · Canton, GA</p>
        </div>
        <button className="btn primary" onClick={() => { resetForm(); setTab('add'); }}>
          <Plus size={14} /> Add Item
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Total Items',  value: items.length,   color: 'var(--purple)' },
          { label: 'Expired',      value: expiredCount,   color: 'var(--red)' },
          { label: 'Expiring Soon', value: urgentCount + soonCount, color: 'var(--amber)' },
          { label: 'Low Stock',    value: lowStockCount,  color: '#0891b2' },
        ].map(s => (
          <section key={s.label} className="panel" style={{ textAlign: 'center', padding: '10px 8px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
          </section>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={tab === 'items'    ? 'active' : ''} onClick={() => setTab('items')}>All Items ({items.length})</button>
        <button className={tab === 'expiring' ? 'active' : ''} onClick={() => setTab('expiring')} style={{ color: expiredCount > 0 ? 'var(--red)' : undefined }}>
          Expiring{expiringItems.length > 0 ? ` (${expiringItems.length})` : ''}
        </button>
        <button className={tab === 'scan'     ? 'active' : ''} onClick={() => setTab('scan')}>📷 Scanner</button>
        <button className={tab === 'add'      ? 'active' : ''} onClick={() => setTab('add')}>{editingItem ? 'Edit Item' : '+ Add'}</button>
        <button className={tab === 'history'  ? 'active' : ''} onClick={() => setTab('history')}>History</button>
      </div>

      {/* ── ITEMS TAB ── */}
      {tab === 'items' && (
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name, brand, barcode..."
                style={{ flex: '1 1 200px', fontSize: 13 }}
              />
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ fontSize: 12 }}>
                <option value="all">All categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Location toggle */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['all', ...LOCATIONS].map(loc => (
                <button
                  key={loc}
                  onClick={() => setFilterLoc(loc)}
                  style={{
                    padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: filterLoc === loc ? 700 : 500,
                    border: `1.5px solid ${filterLoc === loc ? 'var(--green)' : 'var(--border)'}`,
                    background: filterLoc === loc ? 'var(--green)' : 'transparent',
                    color: filterLoc === loc ? '#fff' : 'var(--muted)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {loc === 'all' ? 'All Rooms' : loc}
                </button>
              ))}
            </div>
          </div>

          {loading && <div style={{ color: 'var(--muted)', fontSize: 13, padding: 20 }}>Loading inventory...</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredItems.map(item => {
              const expDays = item.expires ? daysUntil(item.expires) : null;
              const isExpired = expDays !== null && expDays < 0;
              const isUrgent  = expDays !== null && expDays >= 0 && expDays <= 3;
              const isSoon    = expDays !== null && expDays >= 4 && expDays <= 7;
              const accentColor = isExpired ? 'var(--red)' : isUrgent ? '#f97316' : isSoon ? 'var(--amber)' : 'var(--border)';

              return (
                <div key={item.id} style={{
                  background: 'var(--surface-0)', border: `1px solid ${accentColor}`,
                  borderLeft: `4px solid ${accentColor}`, borderRadius: 8, padding: '10px 14px',
                  display: 'flex', gap: 12, alignItems: 'center',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{item.name}</span>
                      {item.brand && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.brand}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: item.quantity <= 1 ? 'var(--red)' : 'var(--text)' }}>
                        {item.quantity} {item.unit}
                      </span>
                      {item.category && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.category}</span>}
                      {item.location && <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {item.location}</span>}
                      {item.avg_cost_canton && <span style={{ fontSize: 11, color: 'var(--muted)' }}>· ~${item.avg_cost_canton.toFixed(2)}</span>}
                      {item.expires && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: isExpired ? 'var(--red)' : isUrgent ? '#f97316' : isSoon ? 'var(--amber)' : 'var(--muted)' }}>
                          {isExpired ? `⚠️ EXPIRED ${Math.abs(expDays!)} day${Math.abs(expDays!) !== 1 ? 's' : ''} ago`
                            : `Exp: ${fmtDate(item.expires)} (${expDays}d)`}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Quick +/- qty buttons */}
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                    <button className="qty-button" onClick={async () => {
                      if (!supabase) return;
                      const newQty = Math.max(0, item.quantity - 1);
                      await supabase.from('inventory_items').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', item.id);
                      setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: newQty } : i));
                    }}>−</button>
                    <span style={{ fontSize: 13, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{item.quantity}</span>
                    <button className="qty-button" onClick={async () => {
                      if (!supabase) return;
                      const newQty = item.quantity + 1;
                      await supabase.from('inventory_items').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', item.id);
                      setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: newQty } : i));
                    }}>+</button>
                    <button className="qty-button" onClick={() => startEdit(item)} title="Edit"><Package size={12} /></button>
                    <button className="qty-button" style={{ color: 'var(--red)' }} onClick={() => deleteItem(item.id)} title="Delete"><Trash2 size={12} /></button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredItems.length === 0 && !loading && (
            <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
              <ShoppingCart size={32} style={{ color: 'var(--muted)', marginBottom: 12 }} />
              <p style={{ color: 'var(--muted)' }}>No items found. Add items or adjust your filters.</p>
            </section>
          )}
        </div>
      )}

      {/* ── EXPIRING TAB ── */}
      {tab === 'expiring' && (
        <div>
          {expiredCount > 0 && (
            <div style={{ background: '#fee2e2', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, fontWeight: 600, color: 'var(--red)' }}>
              ⚠️ {expiredCount} item{expiredCount !== 1 ? 's' : ''} already expired — check and discard.
            </div>
          )}

          {expiringItems.filter(i => (i._days ?? 99) <= 7).length > 0 && (
            <section className="panel" style={{ borderTop: '3px solid var(--amber)', marginBottom: 14 }}>
              <div className="panel-head">
                <h2>🍽️ Use These Up First — AI Recipe Ideas</h2>
              </div>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
                Items expiring within 7 days. Get recipe suggestions to help use them up before they go bad.
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {expiringItems.filter(i => (i._days ?? 99) <= 7).map(i => (
                  <span key={i.id} style={{ fontSize: 12, background: (i._days ?? 99) < 0 ? '#fee2e2' : (i._days ?? 99) <= 3 ? '#ffedd5' : '#fef9c3', color: 'var(--text)', padding: '4px 10px', borderRadius: 999, fontWeight: 600 }}>
                    {i.name} ({(i._days ?? 0) < 0 ? 'EXPIRED' : `${i._days}d`})
                  </span>
                ))}
              </div>
              <button className="btn primary" onClick={generateRecipes} disabled={aiLoading}>
                {aiLoading ? <><RefreshCw size={13} className="spin" /> Generating...</> : <><Sparkles size={13} /> Get Recipe Ideas</>}
              </button>
              {aiRecipes && (
                <div style={{ marginTop: 14, background: 'var(--surface-1)', borderRadius: 8, padding: '12px 14px', fontSize: 13, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                  {aiRecipes}
                </div>
              )}
            </section>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {expiringItems.length === 0 && (
              <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
                <p style={{ color: 'var(--muted)' }}>No perishable items with expiration dates tracked. Add items and mark them as perishable with an expiration date.</p>
              </section>
            )}
            {expiringItems.map(item => {
              const days = item._days ?? 0;
              const color = days < 0 ? 'var(--red)' : days <= 3 ? '#f97316' : days <= 7 ? 'var(--amber)' : 'var(--green)';
              return (
                <div key={item.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', background: 'var(--surface-0)', border: `1px solid ${color}`, borderLeft: `4px solid ${color}`, borderRadius: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      {item.quantity} {item.unit} · {item.location ?? 'No location'} · Imported: {item.import_date ? fmtDate(item.import_date) : 'Unknown'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color }}>
                      {days < 0 ? `${Math.abs(days)}d EXPIRED` : days === 0 ? 'TODAY' : `${days}d left`}
                    </div>
                    {item.expires && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDate(item.expires)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SCANNER TAB ── */}
      {tab === 'scan' && (
        <div>
          <section className="panel" style={{ borderTop: '3px solid #16a34a', marginBottom: 14 }}>
            <div className="panel-head">
              <h2>📷 Barcode Scanner</h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
              Compatible with Tera HW0009 and any USB/Bluetooth HID barcode scanner. Keep this field focused — scanner sends barcode + Enter automatically. Works on mobile too.
            </p>

            {/* Scan mode + bulk toggle */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['in', 'out'] as const).map(m => (
                  <button key={m} onClick={() => setScanMode(m)} style={{
                    padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                    border: `2px solid ${scanMode === m ? (m === 'in' ? '#16a34a' : '#ef4444') : 'var(--border)'}`,
                    background: scanMode === m ? (m === 'in' ? '#dcfce7' : '#fee2e2') : 'transparent',
                    color: scanMode === m ? (m === 'in' ? '#16a34a' : '#ef4444') : 'var(--muted)',
                  }}>
                    {m === 'in' ? '↑ Scan In (+)' : '↓ Scan Out (−)'}
                  </button>
                ))}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginLeft: 'auto' }}>
                <input type="checkbox" checked={bulkMode} onChange={e => { setBulkMode(e.target.checked); setPendingBulk([]); }} />
                <span style={{ fontWeight: bulkMode ? 700 : 400, color: bulkMode ? 'var(--purple)' : 'var(--muted)' }}>
                  Bulk Mode (scan multiple, save all at once)
                </span>
              </label>
            </div>

            {/* Scanner input — this is what receives barcode scanner input */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 600 }}>
                Scan here (click to focus, then scan):
              </label>
              <input
                ref={scanRef}
                value={scanInput}
                onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && scanInput.trim()) {
                    handleScanSubmit(scanInput.trim());
                  }
                }}
                onBlur={() => {
                  // Auto-refocus after a short delay so clicks on buttons still work
                  setTimeout(() => {
                    if (document.activeElement?.tagName !== 'BUTTON' &&
                        document.activeElement?.tagName !== 'INPUT' &&
                        document.activeElement?.tagName !== 'SELECT') {
                      scanRef.current?.focus();
                    }
                  }, 150);
                }}
                placeholder="Click here, then scan a barcode — or type and press Enter"
                style={{ fontSize: 16, fontWeight: 600, background: 'var(--surface-1)', border: '2px solid var(--green)', letterSpacing: 2 }}
                autoComplete="off"
                autoFocus
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                💡 Tip: Keep this field focused. Your scanner sends the code + Enter automatically. For manual entry, type the barcode and press Enter.
              </div>
            </div>

            {/* Status message */}
            {scanStatus && (
              <div style={{ background: 'var(--surface-1)', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 14, fontWeight: 600 }}>
                {scanStatus}
              </div>
            )}

            {/* Bulk pending list */}
            {bulkMode && pendingBulk.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>PENDING SCANS ({pendingBulk.reduce((s, p) => s + p.count, 0)} total)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                  {pendingBulk.map(p => (
                    <div key={p.barcode} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--surface-1)', borderRadius: 6, fontSize: 13 }}>
                      <span>{p.name}</span>
                      <span style={{ fontWeight: 700 }}>×{p.count}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn primary" onClick={saveBulkScans}>
                    ✅ Save All ({pendingBulk.reduce((s, p) => s + p.count, 0)} scans)
                  </button>
                  <button className="btn ghost" onClick={() => { setPendingBulk([]); setScanStatus(''); }}>Clear</button>
                </div>
              </div>
            )}
          </section>

          {/* Recent scan log */}
          {scanLog.length > 0 && (
            <section className="panel">
              <div className="panel-head"><h2>This Session</h2><span className="readonly-pill">{scanLog.length} scans</span></div>
              {scanLog.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: s.action === 'Scanned In' ? '#16a34a' : '#ef4444' }}>
                    {s.action === 'Scanned In' ? '↑' : '↓'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.barcode} · {s.time}</div>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Qty: {s.qty}</span>
                </div>
              ))}
            </section>
          )}
        </div>
      )}

      {/* ── ADD / EDIT ITEM TAB ── */}
      {tab === 'add' && (
        <section className="panel" style={{ borderLeft: '4px solid var(--green)' }}>
          <div className="panel-head">
            <h2>{editingItem ? `Edit — ${editingItem.name}` : 'Add Item'}</h2>
            <button className="btn ghost" onClick={() => { resetForm(); setTab('items'); }}><X size={14} /> Cancel</button>
          </div>

          <div className="form-grid" style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Item name *<input value={fName} onChange={e => setFName(e.target.value)} placeholder="e.g. Canned Tomatoes" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Brand<input value={fBrand} onChange={e => setFBrand(e.target.value)} placeholder="e.g. Hunt's" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Category
              <select value={fCat} onChange={e => setFCat(e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Quantity<input type="number" min={0} value={fQty} onChange={e => setFQty(parseInt(e.target.value) || 0)} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Unit
              <select value={fUnit} onChange={e => setFUnit(e.target.value)}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Barcode (scan or type)<input value={fBarcode} onChange={e => setFBarcode(e.target.value)} placeholder="UPC / EAN" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Avg. cost (Canton, GA)<input type="number" step="0.01" value={fCost} onChange={e => setFCost(e.target.value)} placeholder="e.g. 2.49" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Import / Purchase date<input type="date" value={fImport} onChange={e => setFImport(e.target.value)} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Expiration date<input type="date" value={fExpires} onChange={e => setFExpires(e.target.value)} />
            </label>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Room</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {LOCATIONS.map(loc => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setFLoc(loc)}
                  style={{
                    padding: '7px 16px', borderRadius: 999, fontSize: 13, fontWeight: fLoc === loc ? 700 : 500,
                    border: `1.5px solid ${fLoc === loc ? 'var(--green)' : 'var(--border)'}`,
                    background: fLoc === loc ? 'var(--green)' : 'transparent',
                    color: fLoc === loc ? '#fff' : 'var(--text)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer', marginBottom: 12, padding: '8px 12px', background: fPerishable ? '#fef9c3' : 'var(--surface-1)', borderRadius: 8, border: `1px solid ${fPerishable ? '#eab308' : 'var(--border)'}` }}>
            <input type="checkbox" checked={fPerishable} onChange={e => setFPerishable(e.target.checked)} style={{ accentColor: '#eab308' }} />
            <span>This is a perishable / food item (tracks expiration alerts)</span>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
            Notes<textarea value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="Any notes about this item..." style={{ minHeight: 50 }} />
          </label>

          <button className="btn primary" onClick={saveItem} disabled={saving || !fName.trim()}>
            {saving ? 'Saving...' : editingItem ? 'Save Changes' : 'Add to Inventory'}
          </button>
        </section>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <section className="panel">
          <div className="panel-head"><h2>Transaction History</h2><span className="readonly-pill">{transactions.length}</span></div>
          {transactions.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>No transactions yet. Scan items or adjust quantities to build history.</div>}
          {transactions.map(tx => {
            const item = items.find(i => i.id === tx.item_id);
            const isIn = tx.quantity_change > 0;
            return (
              <div key={tx.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: isIn ? '#16a34a' : '#ef4444', flexShrink: 0 }}>
                  {isIn ? '↑' : '↓'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{item?.name ?? 'Unknown item'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {tx.transaction_type.replace('_', ' ')} · {isIn ? '+' : ''}{tx.quantity_change} ·{' '}
                    {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </div>
                  {tx.notes && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{tx.notes}</div>}
                </div>
                {tx.barcode && <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{tx.barcode}</span>}
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
