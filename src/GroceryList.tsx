import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Printer, Plus, Trash2, X, Check } from 'lucide-react';
import { supabase } from './lib/supabase';

const ARMY_GREEN = '#4B5320';

interface GroceryItem {
  id: string;
  name: string;
  note: string | null;
  source: 'manual' | 'inventory' | 'recipe';
  source_label: string | null;
  is_checked: boolean;
  created_at: string;
}

const SOURCE_LABEL: Record<GroceryItem['source'], string> = {
  manual: 'Added by hand',
  inventory: 'From Inventory',
  recipe: 'From a recipe',
};

export default function GroceryList() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from('grocery_list_items')
      .select('*')
      .order('is_checked', { ascending: true })
      .order('created_at', { ascending: true });
    setItems((data as GroceryItem[]) || []);
    setLoading(false);
  }

  async function toggleChecked(item: GroceryItem) {
    setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, is_checked: !i.is_checked } : i)));
    if (!supabase) return;
    await supabase.from('grocery_list_items').update({ is_checked: !item.is_checked }).eq('id', item.id);
  }

  async function deleteItem(id: string) {
    setItems((cur) => cur.filter((i) => i.id !== id));
    if (!supabase) return;
    await supabase.from('grocery_list_items').delete().eq('id', id);
  }

  async function addManual() {
    const name = newItem.trim();
    if (!name || !supabase) return;
    setAdding(true);
    const { data, error } = await supabase
      .from('grocery_list_items')
      .insert({ name, source: 'manual' })
      .select()
      .single();
    if (!error && data) {
      setItems((cur) => [...cur, data as GroceryItem]);
      setNewItem('');
    }
    setAdding(false);
  }

  async function clearChecked() {
    const checkedIds = items.filter((i) => i.is_checked).map((i) => i.id);
    if (checkedIds.length === 0 || !supabase) return;
    setItems((cur) => cur.filter((i) => !i.is_checked));
    await supabase.from('grocery_list_items').delete().in('id', checkedIds);
  }

  async function clearAll() {
    if (items.length === 0 || !supabase) return;
    if (!window.confirm('Clear the entire grocery list?')) return;
    setItems([]);
    await supabase.from('grocery_list_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }

  const grouped = useMemo(() => {
    const unchecked = items.filter((i) => !i.is_checked);
    const checked = items.filter((i) => i.is_checked);
    return { unchecked, checked };
  }, [items]);

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '1.5rem' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body * { visibility: hidden; }
          #grocery-print-area, #grocery-print-area * { visibility: visible; }
          #grocery-print-area { position: absolute; top: 0; left: 0; width: 100%; padding: 0.5in; }
        }
      `}</style>

      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ color: ARMY_GREEN, fontSize: '1.5rem', margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingCart size={22} /> Grocery List
          </h1>
          <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>
            {grouped.unchecked.length} to get{grouped.checked.length > 0 ? ` · ${grouped.checked.length} checked off` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => window.print()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: ARMY_GREEN, color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            <Printer size={15} /> Print
          </button>
          {grouped.checked.length > 0 && (
            <button
              onClick={clearChecked}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'white', color: '#555', border: '1px solid #ccc', borderRadius: 8, padding: '0.5rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              <Check size={15} /> Clear checked
            </button>
          )}
          {items.length > 0 && (
            <button
              onClick={clearAll}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'white', color: '#c0392b', border: '1px solid #f3c6c0', borderRadius: 8, padding: '0.5rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              <Trash2 size={15} /> Clear all
            </button>
          )}
        </div>
      </div>

      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: '1.25rem' }}>
        <input
          placeholder="Add an item..."
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addManual(); }}
          style={{ flex: 1, padding: '0.55rem 0.7rem', borderRadius: 8, border: '1px solid #ccc' }}
        />
        <button
          onClick={addManual}
          disabled={!newItem.trim() || adding}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: ARMY_GREEN, color: 'white', border: 'none', borderRadius: 8, padding: '0.55rem 0.9rem', cursor: 'pointer', opacity: newItem.trim() ? 1 : 0.5 }}
        >
          <Plus size={15} /> Add
        </button>
      </div>

      <div id="grocery-print-area">
        <h2 style={{ display: 'none' }} className="print-only">Grocery List</h2>

        {loading && <p style={{ color: '#999' }}>Loading...</p>}
        {!loading && items.length === 0 && (
          <p style={{ color: '#999', fontSize: '0.9rem' }}>Nothing on the list yet — add items by hand, or from Inventory / Recipe Book.</p>
        )}

        {grouped.unchecked.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: grouped.checked.length > 0 ? 18 : 0 }}>
            {grouped.unchecked.map((item) => (
              <div
                key={item.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0.75rem', background: 'white', border: '1px solid #e5e5e5', borderRadius: 8 }}
              >
                <button
                  className="no-print"
                  onClick={() => toggleChecked(item)}
                  style={{ width: 20, height: 20, borderRadius: 5, border: '2px solid #ccc', background: 'white', cursor: 'pointer', flexShrink: 0 }}
                  aria-label="Check off"
                />
                <span className="print-only" style={{ display: 'none', width: 14, height: 14, border: '1.5px solid #333', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.92rem', fontWeight: 600 }}>{item.name}</div>
                  {(item.note || item.source_label) && (
                    <div style={{ fontSize: '0.75rem', color: '#888' }}>
                      {item.note}{item.note && item.source_label ? ' · ' : ''}{item.source_label}
                    </div>
                  )}
                </div>
                <span className="no-print" style={{ fontSize: '0.68rem', color: '#aaa', flexShrink: 0 }}>{SOURCE_LABEL[item.source]}</span>
                <button
                  className="no-print"
                  onClick={() => deleteItem(item.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', flexShrink: 0 }}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {grouped.checked.length > 0 && (
          <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#999', textTransform: 'uppercase', marginBottom: 2 }}>
              Checked off
            </div>
            {grouped.checked.map((item) => (
              <div
                key={item.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0.75rem', background: '#f7f7f5', border: '1px solid #eee', borderRadius: 8, opacity: 0.65 }}
              >
                <button
                  onClick={() => toggleChecked(item)}
                  style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${ARMY_GREEN}`, background: ARMY_GREEN, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Check size={13} color="white" />
                </button>
                <div style={{ flex: 1, minWidth: 0, textDecoration: 'line-through', fontSize: '0.9rem' }}>{item.name}</div>
                <button onClick={() => deleteItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', flexShrink: 0 }}>
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @media print {
          .print-only { display: block !important; }
        }
      `}</style>
    </div>
  );
}
