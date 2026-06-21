// src/useVehiclesData.ts
//
// Data layer for the Vehicles tab: vehicle records, maintenance log,
// mileage log, and a "what's due" calculation that cross-references each
// vehicle's linked budget_recurring_rules (oil change schedule, registration
// month, etc.) against actual logged service history.

import { useCallback, useEffect, useState } from 'react';
import { supabase, hasSupabase } from './lib/supabase';

export type ServiceType =
  | 'oil_change' | 'tire_rotation' | 'tire_alignment' | 'tires_replaced'
  | 'windshield_wipers' | 'air_filter' | 'registration' | 'emissions'
  | 'inspection' | 'brakes' | 'battery' | 'other';

export interface Vehicle {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  trim: string | null;
  color: string | null;
  current_mileage: number | null;
  current_mileage_updated_at: string | null;
  registration_renewal_month: number | null;
  insurance_renewal_month: number | null;
  tire_rated_miles: number | null;
  tire_replaced_date: string | null;
  tire_replaced_mileage: number | null;
  notes: string | null;
  active: boolean;
}

export interface MaintenanceEntry {
  id: string;
  vehicle_id: string;
  service_type: ServiceType;
  description: string | null;
  service_date: string;
  mileage_at_service: number | null;
  cost: number | null;
  source_rule_id: string | null;
  notes: string | null;
}

export interface MileageEntry {
  id: string;
  vehicle_id: string;
  mileage: number;
  reading_date: string;
  notes: string | null;
}

export interface VehiclePart {
  id: string;
  vehicle_id: string;
  service_type: ServiceType;
  part_label: string;
  brand: string | null;
  part_number: string | null;
  size_spec: string | null;
  amazon_url: string | null;
  notes: string | null;
}

export interface VehicleBudgetRule {
  id: string;
  name: string;
  amount: number;
  recurrence: 'monthly_day' | 'annual' | 'manual';
  month_of_year: number | null;
  months: number[] | null;
  vehicle_id: string | null;
}

export interface UpcomingItem {
  ruleId: string;
  vehicleId: string;
  name: string;
  amount: number;
  month: number; // 1-12, the next occurrence's month
  monthLabel: string;
  status: 'overdue' | 'due-soon' | 'scheduled';
  lastServiceDate: string | null;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * For a vehicle's linked budget rules, figures out the next occurrence of
 * each and whether it looks overdue based on logged maintenance history.
 * "Overdue" = the most recent matching service log entry (by service_type
 * inferred from name) predates the most recent scheduled month that's
 * already passed this year.
 */
export function calculateUpcoming(
  rules: VehicleBudgetRule[],
  maintenanceLog: MaintenanceEntry[],
  vehicleId: string,
  today: Date = new Date()
): UpcomingItem[] {
  const vehicleRules = rules.filter((r) => r.vehicle_id === vehicleId && r.recurrence === 'annual');
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  const items: UpcomingItem[] = [];

  for (const rule of vehicleRules) {
    const months = rule.months && rule.months.length > 0 ? rule.months : (rule.month_of_year ? [rule.month_of_year] : []);
    if (months.length === 0) continue;

    // Find the most recent past-or-current scheduled month, and the next
    // upcoming one, to determine status.
    const sortedMonths = [...months].sort((a, b) => a - b);
    let nextMonth = sortedMonths.find((m) => m >= currentMonth) ?? sortedMonths[0];
    const mostRecentPastMonth = [...sortedMonths].reverse().find((m) => m <= currentMonth) ?? sortedMonths[sortedMonths.length - 1];

    // Find the most recent log entry for this vehicle whose date roughly
    // matches this rule's name (loose match since service_type is a fixed
    // enum but rule names are free text).
    const relatedLogs = maintenanceLog
      .filter((m) => m.vehicle_id === vehicleId && m.source_rule_id === rule.id)
      .sort((a, b) => b.service_date.localeCompare(a.service_date));
    const lastService = relatedLogs[0] ?? null;

    let status: UpcomingItem['status'] = 'scheduled';
    if (currentMonth >= mostRecentPastMonth) {
      const expectedDate = new Date(currentYear, mostRecentPastMonth - 1, 1);
      const wasLoggedThisCycle = lastService && new Date(lastService.service_date) >= expectedDate;
      if (!wasLoggedThisCycle) {
        status = currentMonth === mostRecentPastMonth ? 'due-soon' : 'overdue';
      }
    }
    if (nextMonth === currentMonth && status === 'scheduled') status = 'due-soon';

    items.push({
      ruleId: rule.id,
      vehicleId,
      name: rule.name,
      amount: rule.amount,
      month: nextMonth,
      monthLabel: MONTH_NAMES[nextMonth - 1],
      status,
      lastServiceDate: lastService?.service_date ?? null,
    });
  }

  // Overdue first, then due-soon, then scheduled; within each, by month.
  const statusOrder = { overdue: 0, 'due-soon': 1, scheduled: 2 };
  return items.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.month - b.month);
}

export interface ServiceInterval {
  id: string;
  vehicle_id: string;
  service_type: ServiceType | string;
  name: string;
  interval_miles: number;
  source_confidence: 'factory' | 'disputed' | 'community';
  source_note: string | null;
  notes: string | null;
  active: boolean;
}

export interface KnownIssue {
  id: string;
  vehicle_id: string;
  title: string;
  description: string;
  symptoms: string | null;
  source_note: string | null;
  severity: 'minor' | 'moderate' | 'significant';
}

export interface MileageUpcomingItem {
  intervalId: string;
  name: string;
  intervalMiles: number;
  milesSinceService: number | null;
  milesRemaining: number | null;
  percentUsed: number | null;
  status: 'overdue' | 'due-soon' | 'good' | 'unknown';
  sourceConfidence: ServiceInterval['source_confidence'];
  sourceNote: string | null;
  lastServiceDate: string | null;
  lastServiceMileage: number | null;
}

/**
 * Mileage-based equivalent of calculateUpcoming - estimates wear against
 * a service interval using current mileage and the most recent matching
 * maintenance log entry. Falls back to 'unknown' status (not overdue) when
 * there's no current mileage or service history, since we never assume a
 * service was missed without evidence.
 */
export function calculateMileageUpcoming(
  intervals: ServiceInterval[],
  maintenanceLog: MaintenanceEntry[],
  vehicle: Vehicle
): MileageUpcomingItem[] {
  const vehicleIntervals = intervals.filter((i) => i.vehicle_id === vehicle.id && i.active);
  const currentMileage = vehicle.current_mileage;

  return vehicleIntervals
    .map((interval): MileageUpcomingItem => {
      const relatedLogs = maintenanceLog
        .filter((m) => m.vehicle_id === vehicle.id && m.service_type === interval.service_type)
        .sort((a, b) => b.service_date.localeCompare(a.service_date));
      const lastService = relatedLogs[0] ?? null;

      if (!currentMileage || !lastService?.mileage_at_service) {
        return {
          intervalId: interval.id,
          name: interval.name,
          intervalMiles: interval.interval_miles,
          milesSinceService: null,
          milesRemaining: null,
          percentUsed: null,
          status: 'unknown',
          sourceConfidence: interval.source_confidence,
          sourceNote: interval.source_note,
          lastServiceDate: lastService?.service_date ?? null,
          lastServiceMileage: lastService?.mileage_at_service ?? null,
        };
      }

      const milesSinceService = Math.max(0, currentMileage - lastService.mileage_at_service);
      const milesRemaining = interval.interval_miles - milesSinceService;
      const percentUsed = Math.min(100, Math.round((milesSinceService / interval.interval_miles) * 100));
      let status: MileageUpcomingItem['status'] = 'good';
      if (milesRemaining <= 0) status = 'overdue';
      else if (percentUsed >= 85) status = 'due-soon';

      return {
        intervalId: interval.id,
        name: interval.name,
        intervalMiles: interval.interval_miles,
        milesSinceService,
        milesRemaining,
        percentUsed,
        status,
        sourceConfidence: interval.source_confidence,
        sourceNote: interval.source_note,
        lastServiceDate: lastService.service_date,
        lastServiceMileage: lastService.mileage_at_service,
      };
    })
    .sort((a, b) => {
      const order = { overdue: 0, 'due-soon': 1, unknown: 2, good: 3 };
      return order[a.status] - order[b.status];
    });
}

export interface TireStatus {
  hasData: boolean; // false if no replacement date/mileage logged yet
  milesSinceReplacement: number | null;
  milesRemaining: number | null;
  percentUsed: number | null; // 0-100
  status: 'unknown' | 'good' | 'due-soon' | 'overdue';
  replacedDate: string | null;
  replacedMileage: number | null;
  ratedMiles: number | null;
}

/**
 * Estimates tire wear from current mileage vs. mileage at replacement,
 * against the vehicle's rated tire life. Returns hasData: false (status:
 * 'unknown') if replacement mileage/date hasn't been logged yet - this is
 * intentional, not a bug, since we never fabricate that history.
 */
export function calculateTireStatus(vehicle: Vehicle): TireStatus {
  const { tire_rated_miles, tire_replaced_mileage, tire_replaced_date, current_mileage } = vehicle;

  if (!tire_rated_miles || tire_replaced_mileage == null || !current_mileage) {
    return {
      hasData: false,
      milesSinceReplacement: null,
      milesRemaining: null,
      percentUsed: null,
      status: 'unknown',
      replacedDate: tire_replaced_date,
      replacedMileage: tire_replaced_mileage,
      ratedMiles: tire_rated_miles,
    };
  }

  const milesSinceReplacement = Math.max(0, current_mileage - tire_replaced_mileage);
  const milesRemaining = tire_rated_miles - milesSinceReplacement;
  const percentUsed = Math.min(100, Math.round((milesSinceReplacement / tire_rated_miles) * 100));

  let status: TireStatus['status'] = 'good';
  if (milesRemaining <= 0) status = 'overdue';
  else if (percentUsed >= 85) status = 'due-soon';

  return {
    hasData: true,
    milesSinceReplacement,
    milesRemaining,
    percentUsed,
    status,
    replacedDate: tire_replaced_date,
    replacedMileage: tire_replaced_mileage,
    ratedMiles: tire_rated_miles,
  };
}

export function useVehiclesData() {
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [maintenanceLog, setMaintenanceLog] = useState<MaintenanceEntry[]>([]);
  const [mileageLog, setMileageLog] = useState<MileageEntry[]>([]);
  const [vehicleRules, setVehicleRules] = useState<VehicleBudgetRule[]>([]);
  const [parts, setParts] = useState<VehiclePart[]>([]);
  const [serviceIntervals, setServiceIntervals] = useState<ServiceInterval[]>([]);
  const [knownIssues, setKnownIssues] = useState<KnownIssue[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadAll = useCallback(async () => {
    if (!hasSupabase || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      const [vehiclesRes, maintenanceRes, mileageRes, rulesRes, partsRes, intervalsRes, issuesRes, userRes] = await Promise.all([
        supabase.from('vehicles').select('*').eq('active', true).order('name'),
        supabase.from('vehicle_maintenance_log').select('*').order('service_date', { ascending: false }),
        supabase.from('vehicle_mileage_log').select('*').order('reading_date', { ascending: false }),
        supabase.from('budget_recurring_rules').select('id, name, amount, recurrence, month_of_year, months, vehicle_id').eq('category', 'vehicle'),
        supabase.from('vehicle_parts').select('*').order('service_type'),
        supabase.from('vehicle_service_intervals').select('*').eq('active', true),
        supabase.from('vehicle_known_issues').select('*'),
        userId ? supabase.from('users').select('role').eq('id', userId).maybeSingle() : Promise.resolve({ data: null as any }),
      ]);

      if (vehiclesRes.data) setVehicles(vehiclesRes.data as Vehicle[]);
      if (maintenanceRes.data) setMaintenanceLog(maintenanceRes.data as MaintenanceEntry[]);
      if (mileageRes.data) setMileageLog(mileageRes.data as MileageEntry[]);
      if (rulesRes.data) setVehicleRules(rulesRes.data as VehicleBudgetRule[]);
      if (partsRes.data) setParts(partsRes.data as VehiclePart[]);
      if (intervalsRes.data) setServiceIntervals(intervalsRes.data as ServiceInterval[]);
      if (issuesRes.data) setKnownIssues(issuesRes.data as KnownIssue[]);
      setIsAdmin((userRes.data as any)?.role === 'admin');
    } catch (err) {
      console.error('Failed to load vehicles data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const addVehicle = useCallback(
    async (input: Omit<Vehicle, 'id' | 'active'>) => {
      if (!supabase) return;
      const { error } = await supabase.from('vehicles').insert({ ...input, active: true });
      if (error) throw error;
      await loadAll();
    },
    [loadAll]
  );

  const updateVehicle = useCallback(
    async (id: string, patch: Partial<Vehicle>) => {
      if (!supabase) return;
      const { error } = await supabase.from('vehicles').update(patch).eq('id', id);
      if (error) throw error;
      await loadAll();
    },
    [loadAll]
  );

  const logMaintenance = useCallback(
    async (input: Omit<MaintenanceEntry, 'id'>) => {
      if (!supabase) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      const { error } = await supabase.from('vehicle_maintenance_log').insert({ ...input, logged_by: userId });
      if (error) throw error;
      await loadAll();
    },
    [loadAll]
  );

  const deleteMaintenanceEntry = useCallback(
    async (id: string) => {
      if (!supabase) return;
      const { error } = await supabase.from('vehicle_maintenance_log').delete().eq('id', id);
      if (error) throw error;
      await loadAll();
    },
    [loadAll]
  );

  const logMileage = useCallback(
    async (input: Omit<MileageEntry, 'id'>) => {
      if (!supabase) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      const { error } = await supabase.from('vehicle_mileage_log').insert({ ...input, logged_by: userId });
      if (error) throw error;
      // Also bump the vehicle's current_mileage if this is a newer reading.
      const vehicle = vehicles.find((v) => v.id === input.vehicle_id);
      if (vehicle && (!vehicle.current_mileage || input.mileage > vehicle.current_mileage)) {
        await supabase
          .from('vehicles')
          .update({ current_mileage: input.mileage, current_mileage_updated_at: input.reading_date })
          .eq('id', input.vehicle_id);
      }
      await loadAll();
    },
    [loadAll, vehicles]
  );

  /** Average miles/year for a vehicle, estimated from its mileage log. */
  const estimateMilesPerYear = useCallback(
    (vehicleId: string): number | null => {
      const entries = mileageLog
        .filter((m) => m.vehicle_id === vehicleId)
        .sort((a, b) => a.reading_date.localeCompare(b.reading_date));
      if (entries.length < 2) return null;
      const first = entries[0];
      const last = entries[entries.length - 1];
      const daysDiff = (new Date(last.reading_date).getTime() - new Date(first.reading_date).getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff < 30) return null; // not enough spread to estimate meaningfully
      const milesDiff = last.mileage - first.mileage;
      return Math.round((milesDiff / daysDiff) * 365);
    },
    [mileageLog]
  );

  return {
    loading,
    vehicles,
    maintenanceLog,
    mileageLog,
    vehicleRules,
    parts,
    serviceIntervals,
    knownIssues,
    isAdmin,
    refresh: loadAll,
    addVehicle,
    updateVehicle,
    logMaintenance,
    deleteMaintenanceEntry,
    logMileage,
    estimateMilesPerYear,
  };
}
