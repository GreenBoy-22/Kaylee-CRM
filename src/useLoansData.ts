// src/useLoansData.ts
//
// Loan payoff tracking: real balances, rates, and payments, with standard
// amortization math to project months-to-payoff and total interest paid
// at the current payment amount.

import { useCallback, useEffect, useState } from 'react';
import { supabase, hasSupabase } from './lib/supabase';

export interface Loan {
  id: string;
  name: string;
  lender: string | null;
  loan_type: 'student' | 'personal' | 'auto' | 'mortgage' | 'other';
  current_balance: number;
  interest_rate: number; // percentage, e.g. 17.49
  monthly_payment: number;
  origination_date: string | null;
  origination_balance: number | null;
  maturity_date: string | null;
  budget_rule_id: string | null;
  balance_updated_at: string;
  active: boolean;
  notes: string | null;
  // lowercase substring matched against cached calendar event titles to
  // find this loan's real payment dates (e.g. "loan payment" or "student loan")
  calendar_keyword: string | null;
}

export interface BalanceHistoryEntry {
  id: string;
  loan_id: string;
  balance: number;
  recorded_date: string;
  notes: string | null;
}

export interface PayoffProjection {
  monthsToPayoff: number | null; // null if payment doesn't cover interest (never pays off)
  payoffDate: string | null;
  totalInterestRemaining: number | null;
  totalPaidRemaining: number | null;
  percentPaidOff: number | null; // null if origination_balance unknown
}

/**
 * Standard amortization projection: given balance, annual rate, and a
 * fixed monthly payment, estimates months to payoff and total interest
 * paid over that remaining term. Returns monthsToPayoff: null if the
 * payment doesn't even cover monthly interest (balance would grow forever).
 */
export function calculatePayoffProjection(loan: Loan): PayoffProjection {
  const { current_balance, interest_rate, monthly_payment, origination_balance } = loan;
  const monthlyRate = interest_rate / 100 / 12;
  const monthlyInterest = current_balance * monthlyRate;

  if (monthly_payment <= monthlyInterest) {
    return {
      monthsToPayoff: null, payoffDate: null,
      totalInterestRemaining: null, totalPaidRemaining: null,
      percentPaidOff: origination_balance ? Math.max(0, Math.min(100, ((origination_balance - current_balance) / origination_balance) * 100)) : null,
    };
  }

  // n = -log(1 - (r*P)/M) / log(1+r), standard amortization formula
  let months: number;
  if (monthlyRate === 0) {
    months = current_balance / monthly_payment;
  } else {
    months = -Math.log(1 - (monthlyRate * current_balance) / monthly_payment) / Math.log(1 + monthlyRate);
  }
  months = Math.ceil(months);

  const totalPaid = months * monthly_payment;
  // Last payment is likely partial; approximate by capping total paid at
  // balance + reasonable interest estimate rather than overshooting.
  const totalInterest = Math.max(0, totalPaid - current_balance);

  const payoffDate = new Date();
  payoffDate.setMonth(payoffDate.getMonth() + months);

  return {
    monthsToPayoff: months,
    payoffDate: `${payoffDate.getFullYear()}-${String(payoffDate.getMonth() + 1).padStart(2, '0')}-${String(payoffDate.getDate()).padStart(2, '0')}`,
    totalInterestRemaining: totalInterest,
    totalPaidRemaining: totalPaid,
    percentPaidOff: origination_balance ? Math.max(0, Math.min(100, ((origination_balance - current_balance) / origination_balance) * 100)) : null,
  };
}

export interface BalanceEstimate {
  estimatedBalance: number;
  paymentsSinceUpdate: number;
  isStale: boolean; // true if at least one calendar-confirmed payment has occurred since the last real update
  usedCalendarData: boolean; // false if no calendar events matched - falls back to month-counting
}

interface CalendarEventLike {
  title: string;
  start: string; // YYYY-MM-DD or ISO
  allDay: boolean;
}

/**
 * Counts how many of this loan's payments have actually occurred (per the
 * household's Google Calendar "Loan Payment $1600" / "Student Loan
 * Payment- $175" events) since the last logged balance, then applies
 * amortization once per real payment date rather than once per calendar
 * month. Falls back to month-counting if no calendar events are available
 * or the loan has no calendar_keyword set.
 */
export function calculateEstimatedCurrentBalance(
  loan: Loan,
  calendarEvents: CalendarEventLike[] = [],
  today: Date = new Date()
): BalanceEstimate {
  const lastUpdateKey = loan.balance_updated_at;
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  let paymentDates: string[] = [];
  let usedCalendarData = false;

  if (loan.calendar_keyword) {
    const keyword = loan.calendar_keyword.toLowerCase();
    const matches = calendarEvents.filter((e) => {
      const titleLower = e.title.toLowerCase();
      const dateKey = e.start.slice(0, 10);
      return titleLower.includes(keyword) && dateKey > lastUpdateKey && dateKey <= todayKey;
    });
    if (matches.length > 0 || calendarEvents.length > 0) {
      // We have calendar data to work with (even if zero matches found in
      // range, that's still a real answer, not a fallback situation).
      usedCalendarData = true;
      paymentDates = matches.map((e) => e.start.slice(0, 10)).sort();
    }
  }

  if (!usedCalendarData) {
    // Fallback: estimate one payment per calendar month since last update.
    const lastUpdate = new Date(lastUpdateKey + 'T00:00:00');
    const monthsSinceUpdate = Math.max(
      0,
      (today.getFullYear() - lastUpdate.getFullYear()) * 12 + (today.getMonth() - lastUpdate.getMonth()) - (today.getDate() < lastUpdate.getDate() ? 1 : 0)
    );
    paymentDates = Array(monthsSinceUpdate).fill(lastUpdateKey); // dates unused in fallback path, just count matters
  }

  const paymentsSinceUpdate = paymentDates.length;

  if (paymentsSinceUpdate === 0) {
    return { estimatedBalance: loan.current_balance, paymentsSinceUpdate: 0, isStale: false, usedCalendarData };
  }

  const monthlyRate = loan.interest_rate / 100 / 12;
  let balance = loan.current_balance;

  for (let i = 0; i < paymentsSinceUpdate; i++) {
    const interest = balance * monthlyRate;
    const principalPortion = loan.monthly_payment - interest;
    balance = Math.max(0, balance - principalPortion);
  }

  return {
    estimatedBalance: Math.round(balance * 100) / 100,
    paymentsSinceUpdate,
    isStale: true,
    usedCalendarData,
  };
}

export function useLoansData() {
  const [loading, setLoading] = useState(true);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [history, setHistory] = useState<BalanceHistoryEntry[]>([]);
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

      const [loansRes, historyRes, userRes] = await Promise.all([
        supabase.from('loans').select('*').eq('active', true).order('name'),
        supabase.from('loan_balance_history').select('*').order('recorded_date', { ascending: true }),
        userId ? supabase.from('users').select('role').eq('id', userId).maybeSingle() : Promise.resolve({ data: null as any }),
      ]);

      if (loansRes.data) setLoans(loansRes.data as Loan[]);
      if (historyRes.data) setHistory(historyRes.data as BalanceHistoryEntry[]);
      setIsAdmin((userRes.data as any)?.role === 'admin');
    } catch (err) {
      console.error('Failed to load loans data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const updateBalance = useCallback(
    async (loanId: string, newBalance: number, recordedDate: string, notes?: string) => {
      if (!supabase) return;
      const { error: updateError } = await supabase
        .from('loans')
        .update({ current_balance: newBalance, balance_updated_at: recordedDate })
        .eq('id', loanId);
      if (updateError) throw updateError;

      const { error: historyError } = await supabase
        .from('loan_balance_history')
        .insert({ loan_id: loanId, balance: newBalance, recorded_date: recordedDate, notes: notes ?? null });
      if (historyError) throw historyError;

      await loadAll();
    },
    [loadAll]
  );

  const updateLoan = useCallback(
    async (loanId: string, patch: Partial<Loan>) => {
      if (!supabase) return;
      const { error } = await supabase.from('loans').update(patch).eq('id', loanId);
      if (error) throw error;
      await loadAll();
    },
    [loadAll]
  );

  return {
    loading,
    loans,
    history,
    isAdmin,
    refresh: loadAll,
    updateBalance,
    updateLoan,
  };
}
