// src/useBudgetData.ts
//
// Data layer for the Budget tab. Planned items are computed on-the-fly from
// budget_recurring_rules for whatever date range is requested (never stored
// as rows - editing a rule instantly reflects everywhere). Actual items are
// real rows in budget_transactions. Pay periods anchor the week-to-week view.

import { useCallback, useEffect, useState } from 'react';
import { supabase, hasSupabase } from './lib/supabase';

export type BudgetAccount = 'bills' | 'main';
export type BudgetKind = 'income' | 'expense';
export type BudgetCategory =
  | 'housing' | 'utilities' | 'subscriptions' | 'debt' | 'savings'
  | 'birthday' | 'anniversary' | 'vehicle' | 'pet' | 'holiday'
  | 'vacation' | 'income' | 'other';

export interface RecurringRule {
  id: string;
  name: string;
  amount: number;
  kind: BudgetKind;
  account: BudgetAccount;
  category: BudgetCategory;
  recurrence: 'monthly_day' | 'annual' | 'manual';
  day_of_month: number | null;
  month_of_year: number | null;
  months: number[] | null;
  notes: string | null;
  active: boolean;
}

export interface PayPeriod {
  id: string;
  person: 'Kaylee' | 'Adam';
  pay_date: string;
  gross_amount: number;
  commission_amount: number;
  net_amount: number;
  notes: string | null;
}

export interface ActualTransaction {
  id: string;
  name: string;
  amount: number;
  kind: BudgetKind;
  account: BudgetAccount;
  category: BudgetCategory;
  transaction_date: string;
  status: 'planned' | 'actual';
  pay_period_id: string | null;
  notes: string | null;
}

export interface PlannedItem {
  // Synthetic id: `${ruleId}::${dateKey}` so the same rule on different
  // dates (e.g. multi-month items) gets a stable, unique key.
  id: string;
  ruleId: string;
  name: string;
  amount: number;
  kind: BudgetKind;
  account: BudgetAccount;
  category: BudgetCategory;
  date: string; // YYYY-MM-DD
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Expands recurring rules into concrete planned items for a given date range.
 * - monthly_day rules fire once per calendar month on day_of_month (clamped
 *   to the last day of shorter months, e.g. day 31 in February -> Feb 28/29).
 * - annual rules fire on month_of_year + day_of_month each year that falls
 *   in range, OR for each month in `months` (using day_of_month if set,
 *   otherwise day 1) for multi-occurrence items like oil changes.
 */
export function expandRecurringRules(
  rules: RecurringRule[],
  rangeStart: Date,
  rangeEnd: Date
): PlannedItem[] {
  const items: PlannedItem[] = [];
  const start = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
  const end = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());

  for (const rule of rules) {
    if (!rule.active) continue;

    if (rule.recurrence === 'monthly_day' && rule.day_of_month) {
      // Walk every month overlapping the range.
      let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cursor <= end) {
        const y = cursor.getFullYear();
        const m = cursor.getMonth(); // 0-indexed
        const day = Math.min(rule.day_of_month, daysInMonth(y, m + 1));
        const occurDate = new Date(y, m, day);
        if (occurDate >= start && occurDate <= end) {
          items.push({
            id: `${rule.id}::${y}-${pad(m + 1)}-${pad(day)}`,
            ruleId: rule.id,
            name: rule.name,
            amount: rule.amount,
            kind: rule.kind,
            account: rule.account,
            category: rule.category,
            date: `${y}-${pad(m + 1)}-${pad(day)}`,
          });
        }
        cursor = new Date(y, m + 1, 1);
      }
    } else if (rule.recurrence === 'annual') {
      const monthsToUse = rule.months && rule.months.length > 0 ? rule.months : (rule.month_of_year ? [rule.month_of_year] : []);
      if (monthsToUse.length === 0) continue; // unscheduled - no month known yet

      const startYear = start.getFullYear();
      const endYear = end.getFullYear();
      for (let y = startYear; y <= endYear; y++) {
        for (const m of monthsToUse) {
          const day = rule.day_of_month ? Math.min(rule.day_of_month, daysInMonth(y, m)) : 1;
          const occurDate = new Date(y, m - 1, day);
          if (occurDate >= start && occurDate <= end) {
            items.push({
              id: `${rule.id}::${y}-${pad(m)}-${pad(day)}`,
              ruleId: rule.id,
              name: rule.name,
              amount: rule.amount,
              kind: rule.kind,
              account: rule.account,
              category: rule.category,
              date: `${y}-${pad(m)}-${pad(day)}`,
            });
          }
        }
      }
    }
    // 'manual' rules never auto-generate.
  }

  return items.sort((a, b) => a.date.localeCompare(b.date));
}

export interface BudgetTotals {
  plannedIncome: number;
  plannedExpense: number;
  actualIncome: number;
  actualExpense: number;
  plannedNet: number;
  actualNet: number;
}

export function summarizeTotals(
  planned: PlannedItem[],
  actuals: ActualTransaction[]
): BudgetTotals {
  const plannedIncome = planned.filter((p) => p.kind === 'income').reduce((s, p) => s + p.amount, 0);
  const plannedExpense = planned.filter((p) => p.kind === 'expense').reduce((s, p) => s + p.amount, 0);
  const actualIncome = actuals.filter((a) => a.kind === 'income').reduce((s, a) => s + a.amount, 0);
  const actualExpense = actuals.filter((a) => a.kind === 'expense').reduce((s, a) => s + a.amount, 0);
  return {
    plannedIncome,
    plannedExpense,
    actualIncome,
    actualExpense,
    plannedNet: plannedIncome - plannedExpense,
    actualNet: actualIncome - actualExpense,
  };
}

export function useBudgetData() {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [payPeriods, setPayPeriods] = useState<PayPeriod[]>([]);
  const [actuals, setActuals] = useState<ActualTransaction[]>([]);
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

      const [rulesRes, periodsRes, actualsRes, userRes] = await Promise.all([
        supabase.from('budget_recurring_rules').select('*').order('name'),
        supabase.from('budget_pay_periods').select('*').order('pay_date', { ascending: false }),
        supabase.from('budget_transactions').select('*').eq('status', 'actual').order('transaction_date', { ascending: false }),
        userId ? supabase.from('users').select('role').eq('id', userId).maybeSingle() : Promise.resolve({ data: null as any }),
      ]);
      if (rulesRes.data) setRules(rulesRes.data as RecurringRule[]);
      if (periodsRes.data) setPayPeriods(periodsRes.data as PayPeriod[]);
      if (actualsRes.data) setActuals(actualsRes.data as ActualTransaction[]);
      setIsAdmin((userRes.data as any)?.role === 'admin');
    } catch (err) {
      console.error('Failed to load budget data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const addPayPeriod = useCallback(
    async (period: Omit<PayPeriod, 'id'>) => {
      if (!supabase) return;
      const { error } = await supabase.from('budget_pay_periods').insert(period);
      if (error) {
        console.error('Failed to add pay period:', error);
        throw error;
      }
      await loadAll();
    },
    [loadAll]
  );

  const addActualTransaction = useCallback(
    async (tx: Omit<ActualTransaction, 'id' | 'status'>) => {
      if (!supabase) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      const { error } = await supabase.from('budget_transactions').insert({
        ...tx,
        status: 'actual',
        created_by: userId,
      });
      if (error) {
        console.error('Failed to add transaction:', error);
        throw error;
      }
      await loadAll();
    },
    [loadAll]
  );

  const deleteActualTransaction = useCallback(
    async (id: string) => {
      if (!supabase) return;
      const { error } = await supabase.from('budget_transactions').delete().eq('id', id);
      if (error) {
        console.error('Failed to delete transaction:', error);
        throw error;
      }
      await loadAll();
    },
    [loadAll]
  );

  const updateRule = useCallback(
    async (id: string, patch: Partial<RecurringRule>) => {
      if (!supabase) return;
      const { error } = await supabase.from('budget_recurring_rules').update(patch).eq('id', id);
      if (error) {
        console.error('Failed to update rule:', error);
        throw error;
      }
      await loadAll();
    },
    [loadAll]
  );

  return {
    loading,
    rules,
    payPeriods,
    actuals,
    isAdmin,
    refresh: loadAll,
    addPayPeriod,
    addActualTransaction,
    deleteActualTransaction,
    updateRule,
  };
}
