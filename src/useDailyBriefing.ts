// src/useDailyBriefing.ts
//
// Generates personalized Daily Briefing content from live Supabase data.
// Kaylee gets full home + work context.
// Adam gets chores assigned to him, migraine reminder, and his tasks only.
//
// Each section below is wrapped in its own try/catch — a single missing
// table or bad query only drops that one section instead of blanking out
// the entire briefing (which is what made this feel broken/stale before:
// one failure anywhere used to wipe out everything).

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
function daysBetween(fromKey: string, toKeyStr: string): number {
  return Math.round((new Date(toKeyStr + 'T00:00:00').getTime() - new Date(fromKey + 'T00:00:00').getTime()) / 86400000);
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
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
      const weekAheadKey = toKey(new Date(today.getTime() + 7 * 86400000));
      const twoWeekKey = toKey(new Date(today.getTime() + 14 * 86400000));
      const isKaylee = role === 'admin';

      // A section failing only costs that section — never the whole briefing.
      async function section(fn: () => Promise<void>) {
        try { await fn(); } catch (err) { console.error('Briefing section error:', err); }
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) { setLoading(false); return; }

      // ── SHARED: Calendar — list what's actually happening, not just a count ──
      await section(async () => {
        const cacheRes = await supabase!.from('household_calendar_cache').select('events').maybeSingle();
        const events = (cacheRes.data as any)?.events ?? [];
        const todaysEvents = events.filter((e: any) => e.start && e.start.slice(0, 10) === todayKey);
        const timed = todaysEvents.filter((e: any) => !e.allDay).sort((a: any, b: any) => a.start.localeCompare(b.start));
        const timedHours = timed.reduce((sum: number, e: any) => {
          const start = new Date(e.start).getTime();
          const end   = new Date(e.end).getTime();
          return sum + Math.max(0, (end - start) / 3600000);
        }, 0);

        if (todaysEvents.length === 0) {
          generated.push({ id: 'cal-empty', text: 'Nothing on the calendar today.', severity: 'info' });
        } else {
          const preview = timed.slice(0, 3).map((e: any) => `${e.title ?? 'Untitled'} at ${fmtTime(e.start)}`).join('; ');
          const more = todaysEvents.length > 3 ? ` +${todaysEvents.length - 3} more` : '';
          generated.push({
            id: 'cal-today',
            text: timedHours >= 4
              ? `Busy day — ~${timedHours.toFixed(1)}hrs scheduled: ${preview}${more}.`
              : `${todaysEvents.length} event${todaysEvents.length === 1 ? '' : 's'} today: ${preview}${more}.`,
            severity: timedHours >= 4 ? 'warning' : 'info',
          });
        }
      });

      // ── ADAM: chores + migraine only ──────────────────────────────────
      if (!isKaylee) {
        await section(async () => {
          const { data: householdUsers } = await supabase!.from('household_users').select('id, name');
          const adamUser = (householdUsers ?? []).find((u: any) => u.name.toLowerCase().includes('adam'));
          if (!adamUser) return;
          const { data: choreTasks } = await supabase!.from('chore_tasks').select('name, due_date').eq('assigned_to', adamUser.id).eq('is_completed', false);
          const overdue  = (choreTasks ?? []).filter((c: any) => c.due_date && c.due_date < todayKey);
          const dueToday = (choreTasks ?? []).filter((c: any) => c.due_date === todayKey);
          if (overdue.length > 0) generated.push({ id: 'adam-chores-overdue', text: `${overdue.length} overdue chore${overdue.length > 1 ? 's' : ''}: ${overdue.map((c: any) => c.name).join(', ')}.`, severity: 'urgent' });
          if (dueToday.length > 0) generated.push({ id: 'adam-chores-today', text: `${dueToday.length} chore${dueToday.length > 1 ? 's' : ''} due today: ${dueToday.map((c: any) => c.name).join(', ')}.`, severity: 'info' });
          if (overdue.length === 0 && dueToday.length === 0) generated.push({ id: 'adam-chores-clear', text: 'No chores assigned to you today.', severity: 'info' });
        });

        await section(async () => {
          const { data: migraineToday } = await supabase!.from('migraine_log').select('id').eq('entry_date', todayKey).limit(1).maybeSingle();
          generated.push(migraineToday
            ? { id: 'adam-migraine-logged', text: 'Migraine status logged for today ✓', severity: 'info' }
            : { id: 'adam-migraine-reminder', text: "Don't forget to log your migraine status today in the Migraine Tracker.", severity: 'info' });
        });

        await section(async () => {
          const { data: pendingScans } = await supabase!.from('scan_queue').select('id').eq('user_id', userId).eq('status', 'pending');
          if (pendingScans && pendingScans.length > 0) {
            generated.push({ id: 'adam-scanner-pending', text: `${pendingScans.length} scan${pendingScans.length > 1 ? 's' : ''} waiting in the Scanner Inbox.`, severity: 'info' });
          }
        });

        if (!cancelled) { setLines(sortBySeverity(generated)); setLoading(false); }
        return;
      }

      // ── KAYLEE: everything below ───────────────────────────────────────

      await section(async () => {
        const { data: migraineToday } = await supabase!.from('migraine_log').select('severity').eq('entry_date', todayKey).limit(1).maybeSingle();
        if (migraineToday) {
          const sev = (migraineToday as any).severity ?? '';
          const isBad = ['severe', 'unbearable', 'strong'].includes(sev);
          generated.push({
            id: 'migraine-status',
            text: isBad ? `Adam has a ${sev.replace(/_/g, ' ')} migraine today.` : `Adam logged a migraine today (${sev.replace(/_/g, ' ')}).`,
            severity: isBad ? 'urgent' : 'warning',
          });
        }
      });

      await section(async () => {
        const vehiclesRes = await supabase!.from('vehicles').select('*').eq('active', true);
        if (!vehiclesRes.data?.length) return;
        const [rulesRes, maintRes] = await Promise.all([
          supabase!.from('budget_recurring_rules').select('id, name, amount, recurrence, month_of_year, months, vehicle_id').eq('category', 'vehicle'),
          supabase!.from('vehicle_maintenance_log').select('*'),
        ]);
        for (const vehicle of vehiclesRes.data as any[]) {
          const upcoming = calculateUpcoming(rulesRes.data ?? [], maintRes.data ?? [], vehicle.id, today);
          const overdue  = upcoming.filter(u => u.status === 'overdue');
          if (overdue.length) generated.push({ id: `vehicle-overdue-${vehicle.id}`, text: `${vehicle.name}: ${overdue.map(u => u.name).join(', ')} overdue.`, severity: 'urgent' });
          const tires = calculateTireStatus(vehicle);
          if (tires.hasData && tires.status === 'overdue') generated.push({ id: `tires-${vehicle.id}`, text: `${vehicle.name} tires are past their rated life.`, severity: 'warning' });
        }
      });

      await section(async () => {
        const petRes = await supabase!.from('pet_info').select('*').limit(1).maybeSingle();
        if (!petRes.data) return;
        const pet = petRes.data as any;
        const [groomRes, medRes] = await Promise.all([
          supabase!.from('pet_grooming_log').select('*').eq('pet_id', pet.id),
          supabase!.from('pet_medical_log').select('*').eq('pet_id', pet.id),
        ]);
        const groomStatus = calculateGroomingStatus(groomRes.data ?? [], today);
        if (groomStatus.status === 'overdue') generated.push({ id: 'jules-groom-overdue', text: `${pet.name} is overdue for a grooming appointment.`, severity: 'warning' });
        const medUpcoming = calculateMedicalUpcoming(medRes.data ?? [], today);
        const overdueMed  = medUpcoming.filter(m => m.status === 'overdue');
        if (overdueMed.length) generated.push({ id: 'jules-med-overdue', text: `${pet.name}: ${overdueMed.map(m => m.label).join(', ')} overdue.`, severity: 'urgent' });
      });

      // ── Appointments (Kaylee/Adam/Jules health tracker) ────────────────
      await section(async () => {
        const { data: appts } = await supabase!.from('appointment_tracker').select('person, label, due_date, visits');
        if (!appts) return;
        const overdue = (appts as any[]).filter(a => a.due_date < todayKey);
        const dueSoon = (appts as any[]).filter(a => a.due_date >= todayKey && a.due_date <= twoWeekKey);
        if (overdue.length) {
          generated.push({ id: 'appt-overdue', text: `${overdue.length} overdue appointment${overdue.length > 1 ? 's' : ''}: ${overdue.map(a => `${a.person} — ${a.label}`).join(', ')}.`, severity: 'urgent' });
        }
        if (dueSoon.length) {
          generated.push({ id: 'appt-due-soon', text: `${dueSoon.length} appointment${dueSoon.length > 1 ? 's' : ''} due within 2 weeks: ${dueSoon.map(a => `${a.person} — ${a.label}`).join(', ')}.`, severity: 'info' });
        }
      });

      // ── Inventory: expiring items + grocery list (out of stock) ────────
      await section(async () => {
        const { data: items } = await supabase!.from('inventory_items').select('name, quantity, expires, is_perishable, category, location').eq('user_id', userId);
        if (!items) return;
        const expiringSoon = (items as any[]).filter(i => i.expires && i.expires >= todayKey && i.expires <= weekAheadKey);
        const expired = (items as any[]).filter(i => i.expires && i.expires < todayKey);
        if (expired.length) {
          generated.push({ id: 'inv-expired', text: `${expired.length} item${expired.length > 1 ? 's' : ''} expired: ${expired.slice(0, 4).map(i => i.name).join(', ')}${expired.length > 4 ? '…' : ''}.`, severity: 'warning' });
        }
        if (expiringSoon.length) {
          generated.push({ id: 'inv-expiring', text: `${expiringSoon.length} item${expiringSoon.length > 1 ? 's' : ''} expiring this week: ${expiringSoon.slice(0, 4).map(i => i.name).join(', ')}${expiringSoon.length > 4 ? '…' : ''}.`, severity: 'info' });
        }
        const REPLENISH_CATS = ['Cleaning', 'Personal Care'];
        const REPLENISH_LOCS = ['Kitchen', 'Bathroom', 'Laundry Room', 'Garage', 'Backstock Closet'];
        const outOfStock = (items as any[]).filter(i =>
          i.quantity <= 0 && (i.is_perishable || REPLENISH_CATS.includes(i.category ?? '') || REPLENISH_LOCS.includes(i.location ?? ''))
        );
        if (outOfStock.length) {
          generated.push({ id: 'inv-grocery', text: `Grocery list: ${outOfStock.length} item${outOfStock.length > 1 ? 's' : ''} out of stock — ${outOfStock.slice(0, 5).map(i => i.name).join(', ')}${outOfStock.length > 5 ? '…' : ''}.`, severity: 'info' });
        }
      });

      // ── Scanner Inbox: pending scans waiting for review ─────────────────
      await section(async () => {
        const { data: pendingScans } = await supabase!.from('scan_queue').select('id').eq('user_id', userId).eq('status', 'pending');
        if (pendingScans && pendingScans.length > 0) {
          generated.push({ id: 'scanner-pending', text: `${pendingScans.length} scan${pendingScans.length > 1 ? 's' : ''} waiting in the Scanner Inbox for review.`, severity: 'info' });
        }
      });

      // ── Travel & Entertainment: what's coming up in the next 2 weeks ───
      await section(async () => {
        const { data: trips } = await supabase!.from('trips').select('name, start_date').eq('user_id', userId).gte('start_date', todayKey).lte('start_date', twoWeekKey);
        if (trips && trips.length) {
          for (const t of trips as any[]) {
            const d = daysBetween(todayKey, t.start_date);
            generated.push({ id: `trip-${t.name}`, text: `${t.name} starts in ${d} day${d !== 1 ? 's' : ''}.`, severity: d <= 3 ? 'warning' : 'info' });
          }
        }
        const { data: tickets } = await supabase!
          .from('travel_items')
          .select('title, start_date')
          .eq('user_id', userId)
          .eq('category', 'entertainment')
          .gte('start_date', todayKey)
          .lte('start_date', weekAheadKey);
        if (tickets && tickets.length) {
          generated.push({ id: 'tickets-upcoming', text: `Coming up: ${(tickets as any[]).map(t => t.title).join(', ')}.`, severity: 'info' });
        }
      });

      // ── Budget — bills due today + payday ───────────────────────────────
      await section(async () => {
        const [budgetRulesRes, commissionRes] = await Promise.all([
          supabase!.from('budget_recurring_rules').select('*').eq('active', true),
          supabase!.from('budget_commission_months').select('*'),
        ]);
        if (!budgetRulesRes.data) return;
        const commByMonth: Record<string, number> = {};
        for (const c of (commissionRes.data ?? []) as any[]) commByMonth[c.month_date.slice(0, 7)] = c.after_tax_amount;
        const todayPaydays = generatePaydays(today, today, commByMonth);
        for (const p of todayPaydays) generated.push({ id: `payday-${p.person}`, text: `${p.person} gets paid today.`, severity: 'info' });
        const todayPlanned = expandRecurringRules(budgetRulesRes.data as any[], today, today);
        if (todayPlanned.length) {
          const total = todayPlanned.reduce((s, p) => s + (p.kind === 'expense' ? p.amount : 0), 0);
          if (total > 0) generated.push({ id: 'budget-today', text: `${todayPlanned.length} bill${todayPlanned.length > 1 ? 's' : ''} due today: ${todayPlanned.map(p => p.name).join(', ')} ($${total.toFixed(2)}).`, severity: 'info' });
        }
      });

      // ── Contacts overdue for outreach ───────────────────────────────────
      await section(async () => {
        const { data: dueContacts } = await supabase!.from('contact_reminders').select('display_name').eq('user_id', '551642ea-f9e1-41f4-9c37-5482dd56aeea').eq('is_done', false).lte('next_due', todayKey);
        if (dueContacts?.length) generated.push({ id: 'contacts-due', text: `${dueContacts.length} contact${dueContacts.length > 1 ? 's' : ''} due for outreach: ${(dueContacts as any[]).map(c => c.display_name).join(', ')}.`, severity: 'info' });
      });

      // ── Chores overdue ───────────────────────────────────────────────────
      await section(async () => {
        const { data: choreTasks } = await supabase!.from('chore_tasks').select('name, due_date').eq('is_completed', false);
        if (!choreTasks) return;
        const overdue = (choreTasks as any[]).filter(c => c.due_date && c.due_date < todayKey);
        if (overdue.length) generated.push({ id: 'chores-overdue', text: `${overdue.length} chore${overdue.length > 1 ? 's' : ''} overdue.`, severity: overdue.length >= 3 ? 'warning' : 'info' });
      });

      // ── Library — current read ───────────────────────────────────────────
      await section(async () => {
        const { data: currentBook } = await supabase!.from('books').select('title, author').eq('user_id', userId).eq('status', 'reading').limit(1).maybeSingle();
        if (currentBook) generated.push({ id: 'current-book', text: `Currently reading: "${(currentBook as any).title}"${(currentBook as any).author ? ` by ${(currentBook as any).author}` : ''}.`, severity: 'info' });
      });

      // ── WORK: students needing attention today ──────────────────────────
      await section(async () => {
        const { data: students } = await supabase!.from('students').select('display_name, risk, next_call_at').eq('archived', false);
        if (!students) return;
        const highRisk = (students as any[]).filter(s => (s.risk ?? '').toLowerCase().includes('high'));
        if (highRisk.length) {
          generated.push({ id: 'students-high-risk', text: `${highRisk.length} high-risk student${highRisk.length > 1 ? 's' : ''}: ${highRisk.slice(0, 4).map(s => s.display_name).join(', ')}${highRisk.length > 4 ? '…' : ''}.`, severity: 'warning' });
        }
        const callsToday = (students as any[]).filter(s => s.next_call_at && s.next_call_at.slice(0, 10) === todayKey);
        if (callsToday.length) {
          generated.push({ id: 'students-calls-today', text: `${callsToday.length} student call${callsToday.length > 1 ? 's' : ''} scheduled today: ${callsToday.map(s => s.display_name).join(', ')}.`, severity: 'info' });
        }
      });

      if (generated.length === 0) generated.push({ id: 'all-clear', text: 'Nothing urgent today — all caught up!', severity: 'info' });

      if (!cancelled) { setLines(sortBySeverity(generated)); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [role]);

  return { loading, lines };
}

function sortBySeverity(lines: BriefingLine[]): BriefingLine[] {
  const order = { urgent: 0, warning: 1, info: 2 };
  return [...lines].sort((a, b) => order[a.severity] - order[b.severity]);
}
