// src/useDailyBriefing.ts
//
// Generates personalized Daily Briefing content from live Supabase data.
// Kaylee gets full home + work context.
// Adam gets chores assigned to him, migraine reminder, and his tasks only.

import { useEffect, useState } from 'react';
import { supabase, hasSupabase } from './lib/supabase';
import { calculateUpcoming, calculateTireStatus, calculateMileageUpcoming } from './useVehiclesData';
import { calculateMedicalUpcoming, calculateGroomingStatus } from './useJulesData';
import { expandRecurringRules, generatePaydays } from './useBudgetData';

export type Role = 'admin' | 'limited';

export interface BriefingLine {
  id: string;
  text: string;
  severity: 'info' | 'warning' | 'urgent';
}

function pad(n: number): string { return String(n).padStart(2, '0'); }
function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function useDailyBriefing(role: Role = 'admin') {
  const [loading, setLoading] = useState(true);
  const [lines, setLines]     = useState<BriefingLine[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasSupabase || !supabase) { setLoading(false); return; }
      setLoading(true);
      const generated: BriefingLine[] = [];
      const today = new Date();
      const todayKey = toKey(today);
      const isKaylee = role === 'admin';

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id;
        if (!userId) { setLoading(false); return; }

        // ── SHARED: Calendar ─────────────────────────────────────────────
        // Use household view — returns most recent cache regardless of which user owns it
        const cacheRes = await supabase.from('household_calendar_cache').select('events').maybeSingle();
        if (cacheRes.data?.events) {
          const events = (cacheRes.data as any).events ?? [];
          const todaysEvents = events.filter((e: any) => e.start && e.start.slice(0, 10) === todayKey);
          const timedHours = todaysEvents.filter((e: any) => !e.allDay).reduce((sum: number, e: any) => {
            const start = new Date(e.start).getTime();
            const end   = new Date(e.end).getTime();
            return sum + Math.max(0, (end - start) / 3600000);
          }, 0);

          if (todaysEvents.length === 0) {
            generated.push({ id: 'cal-empty', text: 'Nothing on the calendar today.', severity: 'info' });
          } else if (timedHours >= 4) {
            generated.push({ id: 'cal-busy', text: `Busy day — about ${timedHours.toFixed(1)} hours of events scheduled.`, severity: 'warning' });
          } else {
            generated.push({ id: 'cal-light', text: `${todaysEvents.length} event${todaysEvents.length === 1 ? '' : 's'} today — fairly light.`, severity: 'info' });
          }
        }

        // ── ADAM: Chores assigned to him ─────────────────────────────────
        if (!isKaylee) {
          const { data: householdUsers } = await supabase.from('household_users').select('id, name');
          const adamUser = (householdUsers ?? []).find((u: any) => u.name.toLowerCase().includes('adam'));
          if (adamUser) {
            const { data: choreTasks } = await supabase.from('chore_tasks').select('title, due_date, is_completed').eq('assigned_to', adamUser.id).eq('is_completed', false);
            const overdue  = (choreTasks ?? []).filter((c: any) => c.due_date && c.due_date < todayKey);
            const dueToday = (choreTasks ?? []).filter((c: any) => c.due_date === todayKey);
            if (overdue.length > 0) generated.push({ id: 'adam-chores-overdue', text: `${overdue.length} overdue chore${overdue.length > 1 ? 's' : ''}: ${overdue.map((c: any) => c.name).join(', ')}.`, severity: 'urgent' });
            if (dueToday.length > 0) generated.push({ id: 'adam-chores-today', text: `${dueToday.length} chore${dueToday.length > 1 ? 's' : ''} due today: ${dueToday.map((c: any) => c.name).join(', ')}.`, severity: 'info' });
            if (overdue.length === 0 && dueToday.length === 0) generated.push({ id: 'adam-chores-clear', text: 'No chores assigned to you today.', severity: 'info' });
          }

          // ── ADAM: Migraine check-in reminder ──────────────────────────
          const { data: migraineToday } = await supabase.from('migraine_log').select('id').eq('entry_date', todayKey).limit(1).maybeSingle();
          if (!migraineToday) {
            generated.push({ id: 'adam-migraine-reminder', text: 'Don\'t forget to log your migraine status today in the Migraine Tracker.', severity: 'info' });
          } else {
            generated.push({ id: 'adam-migraine-logged', text: 'Migraine status logged for today ✓', severity: 'info' });
          }

          if (!cancelled) { setLines(generated); setLoading(false); }
          return;
        }

        // ── KAYLEE ONLY from here ────────────────────────────────────────

        // Migraine status (is Adam OK?)
        const { data: migraineToday } = await supabase.from('migraine_log').select('severity').eq('entry_date', todayKey).limit(1).maybeSingle();
        if (migraineToday) {
          const sev = (migraineToday as any).severity ?? '';
          const isBad = ['severe', 'unbearable', 'strong'].includes(sev);
          generated.push({
            id: 'migraine-status',
            text: isBad ? `Adam has a ${sev.replace(/_/g,' ')} migraine today.` : `Adam logged a migraine today (${sev.replace(/_/g,' ')}).`,
            severity: isBad ? 'urgent' : 'warning',
          });
        }

        // Vehicles
        const vehiclesRes = await supabase.from('vehicles').select('*').eq('active', true);
        if (vehiclesRes.data?.length) {
          const [rulesRes, maintRes, intervalsRes] = await Promise.all([
            supabase.from('budget_recurring_rules').select('id, name, amount, recurrence, month_of_year, months, vehicle_id').eq('category', 'vehicle'),
            supabase.from('vehicle_maintenance_log').select('*'),
            supabase.from('vehicle_service_intervals').select('*').eq('active', true),
          ]);
          for (const vehicle of vehiclesRes.data as any[]) {
            const upcoming = calculateUpcoming(rulesRes.data ?? [], maintRes.data ?? [], vehicle.id, today);
            const overdue  = upcoming.filter(u => u.status === 'overdue');
            if (overdue.length) generated.push({ id: `vehicle-overdue-${vehicle.id}`, text: `${vehicle.name}: ${overdue.map(u => u.name).join(', ')} overdue.`, severity: 'urgent' });
            const tires = calculateTireStatus(vehicle);
            if (tires.hasData && tires.status === 'overdue') generated.push({ id: `tires-${vehicle.id}`, text: `${vehicle.name} tires are past their rated life.`, severity: 'warning' });
          }
        }

        // Jules
        const petRes = await supabase.from('pet_info').select('*').limit(1).maybeSingle();
        if (petRes.data) {
          const pet = petRes.data as any;
          const [groomRes, medRes] = await Promise.all([
            supabase.from('pet_grooming_log').select('*').eq('pet_id', pet.id),
            supabase.from('pet_medical_log').select('*').eq('pet_id', pet.id),
          ]);
          const groomStatus = calculateGroomingStatus(groomRes.data ?? [], today);
          if (groomStatus.status === 'overdue') generated.push({ id: 'jules-groom-overdue', text: `${pet.name} is overdue for a grooming appointment.`, severity: 'warning' });
          const medUpcoming = calculateMedicalUpcoming(medRes.data ?? [], today);
          const overdueMed  = medUpcoming.filter(m => m.status === 'overdue');
          if (overdueMed.length) generated.push({ id: 'jules-med-overdue', text: `${pet.name}: ${overdueMed.map(m => m.label).join(', ')} overdue.`, severity: 'urgent' });
        }

        // Budget — bills due today + payday
        const [budgetRulesRes, commissionRes] = await Promise.all([
          supabase.from('budget_recurring_rules').select('*').eq('active', true),
          supabase.from('budget_commission_months').select('*'),
        ]);
        if (budgetRulesRes.data) {
          const commByMonth: Record<string, number> = {};
          for (const c of (commissionRes.data ?? []) as any[]) commByMonth[c.month_date.slice(0, 7)] = c.after_tax_amount;
          const todayPaydays = generatePaydays(today, today, commByMonth);
          for (const p of todayPaydays) generated.push({ id: `payday-${p.person}`, text: `${p.person} gets paid today.`, severity: 'info' });
          const todayPlanned = expandRecurringRules(budgetRulesRes.data as any[], today, today);
          if (todayPlanned.length) {
            const total = todayPlanned.reduce((s, p) => s + (p.kind === 'expense' ? p.amount : 0), 0);
            if (total > 0) generated.push({ id: 'budget-today', text: `${todayPlanned.length} bill${todayPlanned.length > 1 ? 's' : ''} due today: ${todayPlanned.map(p => p.name).join(', ')} ($${total.toFixed(2)}).`, severity: 'info' });
          }
        }

        // Contacts overdue for outreach
        const { data: dueContacts } = await supabase.from('contact_reminders').select('display_name').eq('user_id', '551642ea-f9e1-41f4-9c37-5482dd56aeea').eq('is_done', false).lte('next_due', todayKey);
        if (dueContacts?.length) generated.push({ id: 'contacts-due', text: `${dueContacts.length} contact${dueContacts.length > 1 ? 's' : ''} due for outreach: ${(dueContacts as any[]).map(c => c.display_name).join(', ')}.`, severity: 'info' });

        // Chores overdue
        const { data: choreTasks } = await supabase.from('chore_tasks').select('title').eq('is_completed', false);
        if (choreTasks) {
          const overdue = (choreTasks as any[]).filter(c => c.due_date && c.due_date < todayKey);
          if (overdue.length) generated.push({ id: 'chores-overdue', text: `${overdue.length} chore${overdue.length > 1 ? 's' : ''} overdue.`, severity: overdue.length >= 3 ? 'warning' : 'info' });
        }

        // Library — current read
        const { data: currentBook } = await supabase.from('books').select('title, author').eq('user_id', userId).eq('status', 'reading').limit(1).maybeSingle();
        if (currentBook) generated.push({ id: 'current-book', text: `Currently reading: "${(currentBook as any).title}"${(currentBook as any).author ? ` by ${(currentBook as any).author}` : ''}.`, severity: 'info' });

        if (generated.length === 0) generated.push({ id: 'all-clear', text: 'Nothing urgent today — all caught up!', severity: 'info' });

        const order = { urgent: 0, warning: 1, info: 2 };
        generated.sort((a, b) => order[a.severity] - order[b.severity]);

        if (!cancelled) setLines(generated);
      } catch (err) {
        console.error('Daily briefing error:', err);
        if (!cancelled) setLines([{ id: 'error', text: "Couldn't load today's briefing.", severity: 'info' }]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [role]);

  return { loading, lines };
}
