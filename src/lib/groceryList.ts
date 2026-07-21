// src/lib/groceryList.ts
//
// Shared helper so both Inventory (expiring/out-of-stock items) and
// Recipe Book (missing ingredients) can add to the same grocery list
// without duplicating dedupe logic.

import { supabase } from './supabase';

export interface GroceryAddItem {
  name: string;
  note?: string | null;
  source: 'manual' | 'inventory' | 'recipe';
  source_label?: string | null;
}

/**
 * Adds items to the shared grocery list, skipping anything already on
 * the list unchecked with a matching name (case-insensitive) — so
 * re-running "add expiring items" or picking the same recipe twice
 * doesn't pile up duplicate rows.
 */
export async function addGroceryItems(items: GroceryAddItem[]): Promise<{ added: number; skipped: number }> {
  if (!supabase || items.length === 0) return { added: 0, skipped: 0 };

  const { data: existing } = await supabase
    .from('grocery_list_items')
    .select('name')
    .eq('is_checked', false);
  const existingNames = new Set((existing || []).map((r: any) => String(r.name).trim().toLowerCase()));

  const toInsert = items.filter((item) => {
    const key = item.name.trim().toLowerCase();
    if (!key || existingNames.has(key)) return false;
    existingNames.add(key); // also dedupe within this same batch
    return true;
  });

  if (toInsert.length === 0) return { added: 0, skipped: items.length };

  const { error } = await supabase.from('grocery_list_items').insert(
    toInsert.map((item) => ({
      name: item.name.trim(),
      note: item.note ?? null,
      source: item.source,
      source_label: item.source_label ?? null,
    }))
  );
  if (error) {
    console.error('Failed to add grocery items:', error);
    return { added: 0, skipped: items.length };
  }
  return { added: toInsert.length, skipped: items.length - toInsert.length };
}
