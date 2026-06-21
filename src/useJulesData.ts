// src/useJulesData.ts
//
// Data layer for Jules' info tab: profile, medical/vaccine log (annual
// recurrence), and a separate grooming log (roughly every 6 weeks, cut
// type varies seasonally). Due-date logic mirrors the Vehicles tab's
// mileage-based pattern, but time-based here instead.

import { useCallback, useEffect, useState } from 'react';
import { supabase, hasSupabase } from './lib/supabase';

export type MedicalItemType =
  | 'vaccine_dapp' | 'vaccine_rabies' | 'vaccine_bordetella' | 'vaccine_lepto'
  | 'heartworm_injection' | 'heartworm_test' | 'fecal_exam' | 'vet_visit'
  | 'flea_tick_prevention' | 'other';

export interface PetInfo {
  id: string;
  name: string;
  breed: string | null;
  color: string | null;
  sex: string | null;
  weight_lbs: number | null;
  birthdate: string | null;
  microchip_provider: string | null;
  microchip_id: string | null;
  insurance_provider: string | null;
  insurance_policy_number: string | null;
  insurance_policy_url: string | null;
  vet_name: string | null;
  vet_clinic: string | null;
  vet_phone: string | null;
  groomer_name: string | null;
  groomer_address: string | null;
  notes: string | null;
}

export interface MedicalLogEntry {
  id: string;
  pet_id: string;
  item_type: MedicalItemType;
  description: string | null;
  service_date: string;
  recurrence_months: number | null;
  cost: number | null;
  vet_name: string | null;
  notes: string | null;
}

export interface GroomingLogEntry {
  id: string;
  pet_id: string;
  groom_date: string;
  cut_type: 'short_summer' | 'trim_face_feet_fanny' | 'full_groom' | 'other' | null;
  services: string | null;
  cost: number | null;
  groomer_name: string | null;
  notes: string | null;
}

export interface MedicalUpcomingItem {
  itemType: MedicalItemType;
  label: string;
  lastDate: string;
  dueDate: string;
  status: 'overdue' | 'due-soon' | 'good';
  daysUntilDue: number;
}

const MEDICAL_LABELS: Record<MedicalItemType, string> = {
  vaccine_dapp: 'DAPP vaccine', vaccine_rabies: 'Rabies vaccine',
  vaccine_bordetella: 'Bordetella vaccine', vaccine_lepto: 'Leptospirosis vaccine',
  heartworm_injection: 'ProHeart injection', heartworm_test: 'Heartworm lab test',
  fecal_exam: 'Fecal exam', vet_visit: 'Vet visit',
  flea_tick_prevention: 'Flea/tick prevention', other: 'Other',
};

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * For each recurring medical item type, finds the most recent entry and
 * projects the next due date from its recurrence_months. Non-recurring
 * entries (recurrence_months null, e.g. a one-off ear infection visit)
 * are excluded from this projection.
 */
export function calculateMedicalUpcoming(log: MedicalLogEntry[], today: Date = new Date()): MedicalUpcomingItem[] {
  const byType = new Map<MedicalItemType, MedicalLogEntry[]>();
  for (const entry of log) {
    if (!entry.recurrence_months) continue;
    const arr = byType.get(entry.item_type) ?? [];
    arr.push(entry);
    byType.set(entry.item_type, arr);
  }

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const items: MedicalUpcomingItem[] = [];

  for (const [itemType, entries] of byType) {
    const mostRecent = entries.sort((a, b) => b.service_date.localeCompare(a.service_date))[0];
    const dueDate = addMonths(mostRecent.service_date, mostRecent.recurrence_months!);
    const daysUntilDue = Math.round((new Date(dueDate + 'T00:00:00').getTime() - new Date(todayKey + 'T00:00:00').getTime()) / 86400000);

    let status: MedicalUpcomingItem['status'] = 'good';
    if (daysUntilDue <= 0) status = 'overdue';
    else if (daysUntilDue <= 14) status = 'due-soon';

    items.push({
      itemType,
      label: MEDICAL_LABELS[itemType],
      lastDate: mostRecent.service_date,
      dueDate,
      status,
      daysUntilDue,
    });
  }

  const order = { overdue: 0, 'due-soon': 1, good: 2 };
  return items.sort((a, b) => order[a.status] - order[b.status] || a.daysUntilDue - b.daysUntilDue);
}

export interface GroomingStatus {
  hasData: boolean;
  lastGroomDate: string | null;
  daysSinceGroom: number | null;
  nextDueDate: string | null;
  daysUntilDue: number | null;
  status: 'overdue' | 'due-soon' | 'good' | 'unknown';
  suggestedCutType: 'short_summer' | 'trim_face_feet_fanny';
}

const GROOM_INTERVAL_DAYS = 42; // ~6 weeks

/** May through September -> short summer cut; otherwise face/feet/fanny trim. */
function suggestCutType(dateStr: string): 'short_summer' | 'trim_face_feet_fanny' {
  const month = new Date(dateStr + 'T00:00:00').getMonth() + 1;
  return month >= 5 && month <= 9 ? 'short_summer' : 'trim_face_feet_fanny';
}

export function calculateGroomingStatus(log: GroomingLogEntry[], today: Date = new Date()): GroomingStatus {
  if (log.length === 0) {
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return {
      hasData: false, lastGroomDate: null, daysSinceGroom: null,
      nextDueDate: null, daysUntilDue: null, status: 'unknown',
      suggestedCutType: suggestCutType(todayKey),
    };
  }

  const mostRecent = [...log].sort((a, b) => b.groom_date.localeCompare(a.groom_date))[0];
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const daysSinceGroom = Math.round((new Date(todayKey + 'T00:00:00').getTime() - new Date(mostRecent.groom_date + 'T00:00:00').getTime()) / 86400000);

  const nextDue = new Date(mostRecent.groom_date + 'T00:00:00');
  nextDue.setDate(nextDue.getDate() + GROOM_INTERVAL_DAYS);
  const nextDueDate = `${nextDue.getFullYear()}-${String(nextDue.getMonth() + 1).padStart(2, '0')}-${String(nextDue.getDate()).padStart(2, '0')}`;
  const daysUntilDue = Math.round((nextDue.getTime() - new Date(todayKey + 'T00:00:00').getTime()) / 86400000);

  let status: GroomingStatus['status'] = 'good';
  if (daysUntilDue <= 0) status = 'overdue';
  else if (daysUntilDue <= 7) status = 'due-soon';

  return {
    hasData: true,
    lastGroomDate: mostRecent.groom_date,
    daysSinceGroom,
    nextDueDate,
    daysUntilDue,
    status,
    suggestedCutType: suggestCutType(nextDueDate),
  };
}

export function useJulesData() {
  const [loading, setLoading] = useState(true);
  const [pet, setPet] = useState<PetInfo | null>(null);
  const [medicalLog, setMedicalLog] = useState<MedicalLogEntry[]>([]);
  const [groomingLog, setGroomingLog] = useState<GroomingLogEntry[]>([]);

  const loadAll = useCallback(async () => {
    if (!hasSupabase || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const petRes = await supabase.from('pet_info').select('*').limit(1).maybeSingle();
      if (petRes.data) {
        const petData = petRes.data as PetInfo;
        setPet(petData);

        const [medicalRes, groomingRes] = await Promise.all([
          supabase.from('pet_medical_log').select('*').eq('pet_id', petData.id).order('service_date', { ascending: false }),
          supabase.from('pet_grooming_log').select('*').eq('pet_id', petData.id).order('groom_date', { ascending: false }),
        ]);
        if (medicalRes.data) setMedicalLog(medicalRes.data as MedicalLogEntry[]);
        if (groomingRes.data) setGroomingLog(groomingRes.data as GroomingLogEntry[]);
      }
    } catch (err) {
      console.error('Failed to load Jules data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const updatePetInfo = useCallback(
    async (patch: Partial<PetInfo>) => {
      if (!supabase || !pet) return;
      const { error } = await supabase.from('pet_info').update(patch).eq('id', pet.id);
      if (error) throw error;
      await loadAll();
    },
    [loadAll, pet]
  );

  const logMedical = useCallback(
    async (input: Omit<MedicalLogEntry, 'id'>) => {
      if (!supabase) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      const { error } = await supabase.from('pet_medical_log').insert({ ...input, logged_by: userId });
      if (error) throw error;
      await loadAll();
    },
    [loadAll]
  );

  const deleteMedical = useCallback(
    async (id: string) => {
      if (!supabase) return;
      const { error } = await supabase.from('pet_medical_log').delete().eq('id', id);
      if (error) throw error;
      await loadAll();
    },
    [loadAll]
  );

  const logGrooming = useCallback(
    async (input: Omit<GroomingLogEntry, 'id'>) => {
      if (!supabase) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      const { error } = await supabase.from('pet_grooming_log').insert({ ...input, logged_by: userId });
      if (error) throw error;
      await loadAll();
    },
    [loadAll]
  );

  const deleteGrooming = useCallback(
    async (id: string) => {
      if (!supabase) return;
      const { error } = await supabase.from('pet_grooming_log').delete().eq('id', id);
      if (error) throw error;
      await loadAll();
    },
    [loadAll]
  );

  return {
    loading,
    pet,
    medicalLog,
    groomingLog,
    refresh: loadAll,
    updatePetInfo,
    logMedical,
    deleteMedical,
    logGrooming,
    deleteGrooming,
  };
}

export { MEDICAL_LABELS };
