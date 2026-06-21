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
