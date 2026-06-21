// src/useDailyBriefing.ts
//
// Generates real Daily Briefing content from live data across the app:
// Google Calendar (today's busy level), Vehicles (overdue/due-soon
// maintenance), Jules (grooming/medical due), Budget (today's planned
// items), and Chores (overdue tasks). Same output regardless of
// Home/Work toggle, per spec - this is household-wide, not mode-specific.

import { useEffect, useState } from 'react';
import { supabase, hasSupabase } from './lib/supabase';
import { calculateUpcoming, calculateTireStatus, calculateMileageUpcoming } from './useVehiclesData';
import { calculateMedicalUpcoming, calculateGroomingStatus } from './useJulesData';
import { expandRecurringRules, generatePaydays } from './useBudgetData';

export interface BriefingLine {
  id: string;
  text: string;
  severity: 'info' | 'warning' | 'urgent';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function useDailyBriefing() {
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<BriefingLine[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!hasSupabase || !supabase) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const generated: BriefingLine[] = [];
      const today = new Date();
      const todayKey = toKey(today);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id;

        const cacheRes = await supabase.from('google_calendar_cache').select('*').eq('user_id', userId ?? '').maybeSingle();
        if (cacheRes.data) {
          const events = (cacheRes.data as any).events ?? [];
          const todaysEvents = events.filter((e: any) => e.start && e.start.slice(0, 10) === todayKey);
          const timedHours = todaysEvents
            .filter((e: any) => !e.allDay)
            .reduce((sum: number, e: any) => {
              const start = new Date(e.start).getTime();
              const end = new Date(e.end).getTime();
              return sum + Math.max(0, (end - start) / 3600000);
            }, 0);

          if (todaysEvents.length === 0) {
            generated.push({ id: 'cal-empty', text: 'Nothing on the calendar today.', severity: 'info' });
          } else if (timedHours >= 4) {
            generated.push({ id: 'cal-busy', text: `Busy day - about ${timedHours.toFixed(1)} hours scheduled today.`, severity: 'warning' });
          } else if (timedHours >= 2) {
            generated.push({ id: 'cal-moderate', text: `Moderate day - about ${timedHours.toFixed(1)} hours scheduled.`, severity: 'info' });
          } else {
            generated.push({ id: 'cal-light', text: `${todaysEvents.length} event${todaysEvents.length === 1 ? '' : 's'} on the calendar today, fairly light.`, severity: 'info' });
          }
        }

        const vehiclesRes = await supabase.from('vehicles').select('*').eq('active', true);
        if (vehiclesRes.data && vehiclesRes.data.length > 0) {
          const [rulesRes, maintRes, intervalsRes] = await Promise.all([
            supabase.from('budget_recurring_rules').select('id, name, amount, recurrence, month_of_year, months, vehicle_id').eq('category', 'vehicle'),
            supabase.from('vehicle_maintenance_log').select('*'),
            supabase.from('vehicle_service_intervals').select('*').eq('active', true),
          ]);
          const rules = (rulesRes.data ?? []) as any[];
          const maint = (maintRes.data ?? []) as any[];
          const intervals = (intervalsRes.data ?? []) as any[];

          for (const vehicle of vehiclesRes.data as any[]) {
            const upcoming = calculateUpcoming(rules, maint, vehicle.id, today);
            const overdueCalendar = upcoming.filter((u) => u.status === 'overdue');
            if (overdueCalendar.length > 0) {
              generated.push({
                id: `vehicle-overdue-${vehicle.id}`,
                text: `${vehicle.name}: ${overdueCalendar.map((u) => u.name).join(', ')} overdue.`,
                severity: 'urgent',
              });
            }

            const mileageUpcoming = calculateMileageUpcoming(intervals, maint, vehicle);
            const overdueMileage = mileageUpcoming.filter((m) => m.status === 'overdue');
            if (overdueMileage.length > 0) {
              generated.push({
                id: `vehicle-mileage-overdue-${vehicle.id}`,
                text: `${vehicle.name}: ${overdueMileage.map((m) => m.name).join(', ')} overdue by mileage.`,
                severity: 'urgent',
              });
            }

            const tireStatus = calculateTireStatus(vehicle);
            if (tireStatus.hasData && tireStatus.status === 'overdue') {
              generated.push({ id: `vehicle-tires-${vehicle.id}`, text: `${vehicle.name} is past its rated tire life.`, severity: 'warning' });
            } else if (tireStatus.hasData && tireStatus.status === 'due-soon') {
              generated.push({ id: `vehicle-tires-soon-${vehicle.id}`, text: `${vehicle.name}'s tires are nearing the end of their rated life.`, severity: 'info' });
            }
          }
        }

        const petRes = await supabase.from('pet_info').select('*').limit(1).maybeSingle();
        if (petRes.data) {
          const pet = petRes.data as any;
          const [groomRes, medRes] = await Promise.all([
            supabase.from('pet_grooming_log').select('*').eq('pet_id', pet.id),
            supabase.from('pet_medical_log').select('*').eq('pet_id', pet.id),
          ]);
          const groomingStatus = calculateGroomingStatus((groomRes.data ?? []) as any[], today);
          if (groomingStatus.status === 'overdue') {
            generated.push({ id: 'jules-groom-overdue', text: `${pet.name} is overdue for a grooming appointment.`, severity: 'warning' });
          } else if (groomingStatus.status === 'due-soon') {
            generated.push({ id: 'jules-groom-soon', text: `${pet.name}'s grooming is coming up around ${new Date(groomingStatus.nextDueDate! + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`, severity: 'info' });
          }

          const medicalUpcoming = calculateMedicalUpcoming((medRes.data ?? []) as any[], today);
          const overdueMedical = medicalUpcoming.filter((m) => m.status === 'overdue');
          if (overdueMedical.length > 0) {
            generated.push({
              id: 'jules-medical-overdue',
              text: `${pet.name}: ${overdueMedical.map((m) => m.label).join(', ')} overdue.`,
              severity: 'urgent',
            });
          }
        }

        const [budgetRulesRes, commissionRes] = await Promise.all([
          supabase.from('budget_recurring_rules').select('*').eq('active', true),
          supabase.from('budget_commission_months').select('*'),
        ]);
        if (budgetRulesRes.data) {
          const commissionByMonth: Record<string, number> = {};
          for (const c of (commissionRes.data ?? []) as any[]) {
            commissionByMonth[c.month_date.slice(0, 7)] = c.after_tax_amount;
          }
          const todayPlanned = expandRecurringRules(budgetRulesRes.data as any[], today, today);
          const todayPaydays = generatePaydays(today, today, commissionByMonth);

          for (const p of todayPaydays) {
            generated.push({ id: `payday-${p.person}`, text: `${p.person} gets paid today.`, severity: 'info' });
          }
          if (todayPlanned.length > 0) {
            const total = todayPlanned.reduce((s, p) => s + (p.kind === 'expense' ? p.amount : 0), 0);
            if (total > 0) {
              generated.push({
                id: 'budget-due-today',
                text: `${todayPlanned.length} bill${todayPlanned.length === 1 ? '' : 's'} due today: ${todayPlanned.map((p) => p.name).join(', ')} ($${total.toFixed(2)}).`,
                severity: 'info',
              });
            }
          }
        }

        const choresRes = await supabase.from('chore_tasks').select('*').eq('is_completed', false);
        if (choresRes.data) {
          const overdueChores = (choresRes.data as any[]).filter((c) => c.due_date && c.due_date < todayKey);
          if (overdueChores.length > 0) {
            generated.push({
              id: 'chores-overdue',
              text: `${overdueChores.length} chore${overdueChores.length === 1 ? '' : 's'} overdue.`,
              severity: overdueChores.length >= 3 ? 'warning' : 'info',
            });
          }
        }

        if (generated.length === 0) {
          generated.push({ id: 'all-clear', text: 'Nothing urgent today - all caught up.', severity: 'info' });
        }

        const order = { urgent: 0, warning: 1, info: 2 };
        generated.sort((a, b) => order[a.severity] - order[b.severity]);

        if (!cancelled) setLines(generated);
      } catch (err) {
        console.error('Failed to build daily briefing:', err);
        if (!cancelled) setLines([{ id: 'error', text: "Couldn't load today's briefing.", severity: 'info' }]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { loading, lines };
}
