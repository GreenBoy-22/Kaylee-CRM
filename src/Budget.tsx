// src/Budget.tsx
//
// Budget tab: planned vs actual, week-to-week (pay-period based) and
// month-to-month views, split across the Bills Account / Main Account
// two-account model.

import { useEffect, useMemo, useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, X, Pencil, Trash2, Repeat, Check } from 'lucide-react';
import {
  useBudgetData,
  expandRecurringRules,
  generatePaydays,
  summarizeTotals,
  type BudgetAccount,
  type BudgetKind,
  type BudgetCategory,
  type PlannedItem,
  type ActualTransaction,
  type GeneratedPayday,
  type RecurringRule,
  type CommissionMonth,
} from './useBudgetData';
import { useLoansData, calculatePayoffProjection, calculateEstimatedCurrentBalance, type Loan } from './useLoansData';

type ViewMode = 'period' | 'month';

const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  housing: 'Housing', utilities: 'Utilities', subscriptions: 'Subscriptions',
  debt: 'Debt', savings: 'Savings', birthday: 'Birthday', anniversary: 'Anniversary',
  vehicle: 'Vehicle', pet: 'Pet', holiday: 'Holiday', vacation: 'Vacation',
  income: 'Income', other: 'Other',
};

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Budget() {
  const {
    loading, rules, payPeriods, actuals, commissionMonths, isAdmin,
    addActualTransaction, updateActualTransaction, deleteActualTransaction,
    addPayPeriod, addRule, updateRule, upsertCommissionMonth,
  } = useBudgetData();
  const [page, setPage] = useState<'overview' | 'commission' | 'event-budgets' | 'loans'>('overview');
  const [view, setView] = useState<ViewMode>('month');
  const [monthAnchor, setMonthAnchor] = useState(new Date());
  const [periodIndex, setPeriodIndex] = useState<number | null>(null); // null = not yet resolved to "this week"
  const [accountFilter, setAccountFilter] = useState<'all' | BudgetAccount>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [editingActual, setEditingActual] = useState<ActualTransaction | null>(null);
  const [editingPlanned, setEditingPlanned] = useState<PlannedItem | null>(null);

  // Build a "YYYY-MM" -> after-tax commission $ lookup for the payday generator.
  const commissionByMonth = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of commissionMonths) {
      const key = c.month_date.slice(0, 7); // "YYYY-MM-01" -> "YYYY-MM"
      map[key] = c.after_tax_amount;
    }
    return map;
  }, [commissionMonths]);

  // Pay-period windows now come from the auto-generated Friday paydays
  // (income is calculated, not manually logged anymore), not from the
  // manual budget_pay_periods log - that table is now just for one-off
  // corrections, and is usually empty.
  const periodWindows = useMemo(() => {
    const today = new Date();
    // Wide enough to navigate ~6 months back and ~2 months forward.
    const rangeStart = new Date(today.getFullYear(), today.getMonth() - 6, 1);
    const rangeEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    const paydays = generatePaydays(rangeStart, rangeEnd, commissionByMonth);

    const windows: { start: Date; end: Date; payday: GeneratedPayday }[] = [];
    for (let i = 0; i < paydays.length; i++) {
      const start = new Date(paydays[i].date + 'T00:00:00');
      const next = paydays[i + 1];
      const end = next
        ? new Date(new Date(next.date + 'T00:00:00').getTime() - 86400000)
        : new Date(start.getTime() + 6 * 86400000); // Fri -> next Thu, 7 days
      windows.push({ start, end, payday: paydays[i] });
    }
    return windows.reverse(); // newest first, so periodIndex=0 is most recent
  }, [commissionByMonth]);

  // Index of the window that actually contains today's date - this is what
  // "current week" means, not just index 0 (which can be a future window
  // since periodWindows is generated up to 2 months ahead for navigation).
  const currentWeekIndex = useMemo(() => {
    const todayKey = toKey(new Date());
    const idx = periodWindows.findIndex(
      (w) => toKey(w.start) <= todayKey && todayKey <= toKey(w.end)
    );
    return idx === -1 ? 0 : idx;
  }, [periodWindows]);

  // Default the Pay Period view to the current week on first load, but
  // don't override the user's own navigation once they've moved away from it.
  const [hasInitializedPeriod, setHasInitializedPeriod] = useState(false);
  useEffect(() => {
    if (periodIndex === null && periodWindows.length > 0 && !hasInitializedPeriod) {
      setPeriodIndex(currentWeekIndex);
      setHasInitializedPeriod(true);
    }
  }, [periodIndex, periodWindows.length, hasInitializedPeriod, currentWeekIndex]);
  const resolvedPeriodIndex = periodIndex ?? currentWeekIndex;

  const currentWindow = periodWindows[resolvedPeriodIndex];

  const { rangeStart, rangeEnd, rangeLabel } = useMemo(() => {
    if (view === 'month') {
      const s = startOfMonth(monthAnchor);
      const e = endOfMonth(monthAnchor);
      return { rangeStart: s, rangeEnd: e, rangeLabel: `${MONTH_NAMES[monthAnchor.getMonth()]} ${monthAnchor.getFullYear()}` };
    }
    if (currentWindow) {
      const s = currentWindow.start;
      const e = currentWindow.end;
      const label = `${currentWindow.payday.person} payday ${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      return { rangeStart: s, rangeEnd: e, rangeLabel: label };
    }
    const today = new Date();
    return { rangeStart: today, rangeEnd: today, rangeLabel: 'No pay periods logged yet' };
  }, [view, monthAnchor, currentWindow]);

  // Any actual transaction tied to a rule (via source_rule_id) represents a
  // one-time override of that rule's occurrence on that date - suppress the
  // computed planned row so it doesn't show twice.
  const overriddenOccurrenceIds = useMemo(() => {
    const set = new Set<string>();
    for (const a of actuals) {
      if (a.source_rule_id) {
        set.add(`${a.source_rule_id}::${a.transaction_date}`);
      }
    }
    return set;
  }, [actuals]);

  const planned = useMemo(() => {
    const billsAndOneOffs = expandRecurringRules(rules, rangeStart, rangeEnd, overriddenOccurrenceIds);
    const paydays = generatePaydays(rangeStart, rangeEnd, commissionByMonth);
    const paydayItems: PlannedItem[] = paydays.map((p: GeneratedPayday) => {
      let label = `${p.person} Pay Day`;
      if (p.isWifiStipend) label += ' (with wifi stipend)';
      if (p.commissionAmount > 0) label += ` (with commission)`;
      return {
        id: p.id,
        ruleId: 'generated-payday',
        name: label,
        amount: p.amount,
        kind: 'income',
        account: 'main',
        category: 'income',
        date: p.date,
      };
    });
    return [...billsAndOneOffs, ...paydayItems].sort((a, b) => a.date.localeCompare(b.date));
  }, [rules, rangeStart, rangeEnd, overriddenOccurrenceIds, commissionByMonth]);

  const actualsInRange = useMemo(() => {
    const startKey = toKey(rangeStart);
    const endKey = toKey(rangeEnd);
    return actuals.filter((a) => a.transaction_date >= startKey && a.transaction_date <= endKey);
  }, [actuals, rangeStart, rangeEnd]);

  const filteredPlanned = useMemo(
    () => (accountFilter === 'all' ? planned : planned.filter((p) => p.account === accountFilter)),
    [planned, accountFilter]
  );
  const filteredActuals = useMemo(
    () => (accountFilter === 'all' ? actualsInRange : actualsInRange.filter((a) => a.account === accountFilter)),
    [actualsInRange, accountFilter]
  );

  const totals = summarizeTotals(filteredPlanned, filteredActuals);

  const combinedRows = useMemo(() => {
    type Row = { date: string; name: string; amount: number; kind: BudgetKind; account: BudgetAccount; category: BudgetCategory; status: 'planned' | 'actual'; id: string; actual?: ActualTransaction; planned?: PlannedItem };
    const rows: Row[] = [
      ...filteredPlanned.map((p: PlannedItem) => ({ date: p.date, name: p.name, amount: p.amount, kind: p.kind, account: p.account, category: p.category, status: 'planned' as const, id: p.id, planned: p })),
      ...filteredActuals.map((a: ActualTransaction) => ({ date: a.transaction_date, name: a.name, amount: a.amount, kind: a.kind, account: a.account, category: a.category, status: 'actual' as const, id: a.id, actual: a })),
    ];
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredPlanned, filteredActuals]);

  if (loading) {
    return <section className="panel"><h2>Budget</h2><p>Loading budget data...</p></section>;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Budget</h1>
          <p>Planned vs actual, split across the Bills Account and Main Account.</p>
        </div>
        {isAdmin && page === 'overview' && (
          <div className="actions">
            <button className="btn ghost" onClick={() => setShowPayForm(true)}>+ Log payday</button>
            <button className="btn primary" onClick={() => setShowAddForm(true)}><Plus size={15} /> Add expense</button>
          </div>
        )}
      </div>

      <div className="toggle-wrap" style={{ marginBottom: 16 }}>
        <button className={page === 'overview' ? 'active' : ''} onClick={() => setPage('overview')}>Overview</button>
        <button className={page === 'commission' ? 'active' : ''} onClick={() => setPage('commission')}>Adam's Commission</button>
        <button className={page === 'event-budgets' ? 'active' : ''} onClick={() => setPage('event-budgets')}>Event Budgets</button>
        <button className={page === 'loans' ? 'active' : ''} onClick={() => setPage('loans')}>Loans</button>
      </div>

      {page === 'loans' ? (
        <LoansPanel />
      ) : page === 'event-budgets' ? (
        <EventBudgetsPanel rules={rules} isAdmin={isAdmin} onUpdateRule={updateRule} />
      ) : page === 'commission' ? (
        <CommissionPanel commissionMonths={commissionMonths} isAdmin={isAdmin} onSave={upsertCommissionMonth} />
      ) : (
      <div className="panel">
        <div className="panel-head">
          <div className="toggle-wrap">
            <button className={view === 'period' ? 'active' : ''} onClick={() => setView('period')}>Pay period</button>
            <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {view === 'month' ? (
              <>
                <button className="qty-button" onClick={() => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1))}><ChevronLeft size={14} /></button>
                <strong>{rangeLabel}</strong>
                <button className="qty-button" onClick={() => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1))}><ChevronRight size={14} /></button>
              </>
            ) : (
              <>
                <button className="qty-button" onClick={() => setPeriodIndex(Math.min(resolvedPeriodIndex + 1, periodWindows.length - 1))} disabled={resolvedPeriodIndex >= periodWindows.length - 1}><ChevronLeft size={14} /></button>
                <strong>{rangeLabel}</strong>
                <button className="qty-button" onClick={() => setPeriodIndex(Math.max(resolvedPeriodIndex - 1, 0))} disabled={resolvedPeriodIndex <= 0}><ChevronRight size={14} /></button>
              </>
            )}
          </div>
        </div>

        <div className="toggle-wrap" style={{ marginTop: 10 }}>
          <button className={accountFilter === 'all' ? 'active' : ''} onClick={() => setAccountFilter('all')}>Both accounts</button>
          <button className={accountFilter === 'bills' ? 'active' : ''} onClick={() => setAccountFilter('bills')}>Bills Account</button>
          <button className={accountFilter === 'main' ? 'active' : ''} onClick={() => setAccountFilter('main')}>Main Account</button>
        </div>

        <div className="stats-row" style={{ marginTop: 16 }}>
          <div className="stat-card">
            <div className="stat-label">Planned income</div>
            <div className="stat-val" style={{ color: 'var(--green)' }}>{fmtMoney(totals.plannedIncome)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Planned expenses</div>
            <div className="stat-val" style={{ color: 'var(--red)' }}>{fmtMoney(totals.plannedExpense)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Actual income</div>
            <div className="stat-val" style={{ color: 'var(--green)' }}>{fmtMoney(totals.actualIncome)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Actual expenses</div>
            <div className="stat-val" style={{ color: 'var(--red)' }}>{fmtMoney(totals.actualExpense)}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 4, marginBottom: 16 }}>
          <div className="brief-item" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            {totals.plannedNet >= 0 ? <TrendingUp size={16} color="var(--green)" /> : <TrendingDown size={16} color="var(--red)" />}
            <span>Planned net: <strong>{fmtMoney(totals.plannedNet)}</strong></span>
          </div>
          <div className="brief-item" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            {totals.actualNet >= 0 ? <TrendingUp size={16} color="var(--green)" /> : <TrendingDown size={16} color="var(--red)" />}
            <span>Actual net: <strong>{fmtMoney(totals.actualNet)}</strong></span>
          </div>
        </div>

        {combinedRows.length === 0 && (
          <div className="brief-item">Nothing planned or logged for this range.</div>
        )}

        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Item</th>
                <th>Category</th>
                <th>Account</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {combinedRows.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                  <td>{row.name}</td>
                  <td><small>{CATEGORY_LABELS[row.category]}</small></td>
                  <td><small>{row.account === 'bills' ? 'Bills' : 'Main'}</small></td>
                  <td>
                    <span className={`copy-pill ${row.status === 'actual' ? 'done' : ''}`}>
                      {row.status === 'actual' ? 'Logged' : 'Planned'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', color: row.kind === 'income' ? 'var(--green)' : 'var(--text)' }}>
                    {row.kind === 'income' ? '+' : '-'}{fmtMoney(row.amount)}
                  </td>
                  {isAdmin && (
                    <td>
                      {row.status === 'actual' && row.actual && (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="qty-button" onClick={() => setEditingActual(row.actual!)} aria-label="Edit">
                            <Pencil size={12} />
                          </button>
                          <button
                            className="qty-button"
                            onClick={() => {
                              if (confirm(`Delete "${row.name}"?`)) deleteActualTransaction(row.id);
                            }}
                            aria-label="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                      {row.status === 'planned' && row.planned && row.planned.ruleId !== 'generated-payday' && (
                        <button className="qty-button" onClick={() => setEditingPlanned(row.planned!)} aria-label="Edit" style={{ marginLeft: 'auto', display: 'block' }}>
                          <Pencil size={12} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {showAddForm && (
        <AddExpenseModal
          onClose={() => setShowAddForm(false)}
          onSubmitActual={async (input) => {
            await addActualTransaction(input);
            setShowAddForm(false);
          }}
          onSubmitRecurring={async (input) => {
            await addRule(input);
            setShowAddForm(false);
          }}
        />
      )}

      {editingActual && (
        <EditActualModal
          transaction={editingActual}
          onClose={() => setEditingActual(null)}
          onSave={async (patch) => {
            await updateActualTransaction(editingActual.id, patch);
            setEditingActual(null);
          }}
        />
      )}

      {editingPlanned && (
        <EditPlannedModal
          item={editingPlanned}
          rule={rules.find((r) => r.id === editingPlanned.ruleId) ?? null}
          onClose={() => setEditingPlanned(null)}
          onSaveRule={async (patch) => {
            await updateRule(editingPlanned.ruleId, patch);
            setEditingPlanned(null);
          }}
          onSaveOverride={async (input) => {
            // Writes an actual row tied to this rule+date, which suppresses
            // the computed planned occurrence going forward (see
            // overriddenOccurrenceIds above).
            await addActualTransaction({
              ...input,
              transaction_date: editingPlanned.date,
              account: editingPlanned.account,
              kind: editingPlanned.kind,
              category: editingPlanned.category,
              pay_period_id: null,
              source_rule_id: editingPlanned.ruleId,
              notes: null,
            });
            setEditingPlanned(null);
          }}
        />
      )}

      {showPayForm && (
        <AddPayPeriodModal
          onClose={() => setShowPayForm(false)}
          onSubmit={async (input) => {
            await addPayPeriod(input);
            setShowPayForm(false);
          }}
        />
      )}
    </>
  );
}

function AddExpenseModal({
  onClose,
  onSubmitActual,
  onSubmitRecurring,
}: {
  onClose: () => void;
  onSubmitActual: (input: {
    name: string;
    amount: number;
    kind: BudgetKind;
    account: BudgetAccount;
    category: BudgetCategory;
    transaction_date: string;
    pay_period_id: string | null;
    source_rule_id: string | null;
    notes: string | null;
  }) => Promise<void>;
  onSubmitRecurring: (input: {
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
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<BudgetKind>('expense');
  const [account, setAccount] = useState<BudgetAccount>('bills');
  const [category, setCategory] = useState<BudgetCategory>('other');
  const [isRecurring, setIsRecurring] = useState(false);
  const [date, setDate] = useState(() => toKey(new Date()));
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !amount) return;
    setSubmitting(true);
    try {
      if (isRecurring) {
        await onSubmitRecurring({
          name: name.trim(),
          amount: Math.abs(parseFloat(amount)),
          kind,
          account,
          category,
          recurrence: 'monthly_day',
          day_of_month: Math.min(31, Math.max(1, parseInt(dayOfMonth, 10) || 1)),
          month_of_year: null,
          months: null,
          notes: null,
          active: true,
        });
      } else {
        await onSubmitActual({
          name: name.trim(),
          amount: Math.abs(parseFloat(amount)),
          kind,
          account,
          category,
          transaction_date: date,
          pay_period_id: null,
          source_rule_id: null,
          notes: null,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="panel" style={{ width: 420, margin: 0 }}>
        <div className="panel-head">
          <h2>Add expense</h2>
          <button className="qty-button" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <input placeholder="What was it?" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="form-grid">
            <input placeholder="Amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <select value={kind} onChange={(e) => setKind(e.target.value as BudgetKind)}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div className="form-grid">
            <select value={account} onChange={(e) => setAccount(e.target.value as BudgetAccount)}>
              <option value="bills">Bills Account</option>
              <option value="main">Main Account</option>
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value as BudgetCategory)}>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
            <Repeat size={13} /> This repeats every month
          </label>

          {isRecurring ? (
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Day of month it's due</label>
              <input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          ) : (
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: '100%' }} />
            </div>
          )}

          {isRecurring && (
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>
              This creates a recurring rule (like Rent or Netflix) that auto-fills every month going forward. For yearly items like birthdays, add them as a one-time date for now.
            </p>
          )}
        </div>
        <div className="form-actions">
          <button className="btn primary" onClick={handleSubmit} disabled={submitting || !name.trim() || !amount}>
            {submitting ? 'Saving...' : isRecurring ? 'Save recurring expense' : 'Save expense'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditActualModal({
  transaction,
  onClose,
  onSave,
}: {
  transaction: ActualTransaction;
  onClose: () => void;
  onSave: (patch: Partial<Omit<ActualTransaction, 'id' | 'status'>>) => Promise<void>;
}) {
  const [name, setName] = useState(transaction.name);
  const [amount, setAmount] = useState(String(transaction.amount));
  const [kind, setKind] = useState<BudgetKind>(transaction.kind);
  const [account, setAccount] = useState<BudgetAccount>(transaction.account);
  const [category, setCategory] = useState<BudgetCategory>(transaction.category);
  const [date, setDate] = useState(transaction.transaction_date);
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !amount) return;
    setSubmitting(true);
    try {
      await onSave({
        name: name.trim(),
        amount: Math.abs(parseFloat(amount)),
        kind,
        account,
        category,
        transaction_date: date,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="panel" style={{ width: 420, margin: 0 }}>
        <div className="panel-head">
          <h2>Edit transaction</h2>
          <button className="qty-button" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <input placeholder="What was it?" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="form-grid">
            <input placeholder="Amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-grid">
            <select value={kind} onChange={(e) => setKind(e.target.value as BudgetKind)}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <select value={account} onChange={(e) => setAccount(e.target.value as BudgetAccount)}>
              <option value="bills">Bills Account</option>
              <option value="main">Main Account</option>
            </select>
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value as BudgetCategory)}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="form-actions">
          <button className="btn primary" onClick={handleSave} disabled={submitting || !name.trim() || !amount}>
            {submitting ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddPayPeriodModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: {
    person: 'Kaylee' | 'Adam';
    pay_date: string;
    gross_amount: number;
    commission_amount: number;
    net_amount: number;
    notes: string | null;
  }) => Promise<void>;
}) {
  const [person, setPerson] = useState<'Kaylee' | 'Adam'>('Kaylee');
  const [payDate, setPayDate] = useState(() => toKey(new Date()));
  const [gross, setGross] = useState('');
  const [commission, setCommission] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const grossNum = parseFloat(gross) || 0;
  const commissionNum = parseFloat(commission) || 0;
  const netNum = grossNum + commissionNum;

  const handleSubmit = async () => {
    if (!gross) return;
    setSubmitting(true);
    try {
      await onSubmit({
        person,
        pay_date: payDate,
        gross_amount: grossNum,
        commission_amount: commissionNum,
        net_amount: netNum,
        notes: null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="panel" style={{ width: 380, margin: 0 }}>
        <div className="panel-head">
          <h2>Log a payday</h2>
          <button className="qty-button" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="form-grid">
            <select value={person} onChange={(e) => setPerson(e.target.value as 'Kaylee' | 'Adam')}>
              <option value="Kaylee">Kaylee</option>
              <option value="Adam">Adam</option>
            </select>
            <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </div>
          <div className="form-grid">
            <input placeholder="Gross / base pay" type="number" step="0.01" value={gross} onChange={(e) => setGross(e.target.value)} />
            <input placeholder="Commission (if any)" type="number" step="0.01" value={commission} onChange={(e) => setCommission(e.target.value)} />
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Net for this paycheck: <strong style={{ color: 'var(--text)' }}>{fmtMoney(netNum)}</strong></p>
        </div>
        <div className="form-actions">
          <button className="btn primary" onClick={handleSubmit} disabled={submitting || !gross}>
            {submitting ? 'Saving...' : 'Save payday'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditPlannedModal({
  item,
  rule,
  onClose,
  onSaveRule,
  onSaveOverride,
}: {
  item: PlannedItem;
  rule: RecurringRule | null;
  onClose: () => void;
  onSaveRule: (patch: Partial<RecurringRule>) => Promise<void>;
  onSaveOverride: (input: {
    name: string;
    amount: number;
  }) => Promise<void>;
}) {
  const [scope, setScope] = useState<'choose' | 'rule' | 'occurrence'>('choose');
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState(String(item.amount));
  const [dayOfMonth, setDayOfMonth] = useState(String(rule?.day_of_month ?? 1));
  const [submitting, setSubmitting] = useState(false);

  const occurrenceDateLabel = new Date(item.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const handleSaveRule = async () => {
    if (!name.trim() || !amount) return;
    setSubmitting(true);
    try {
      const patch: Partial<RecurringRule> = {
        name: name.trim(),
        amount: Math.abs(parseFloat(amount)),
      };
      if (rule?.recurrence === 'monthly_day') {
        patch.day_of_month = Math.min(31, Math.max(1, parseInt(dayOfMonth, 10) || 1));
      }
      await onSaveRule(patch);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveOverride = async () => {
    if (!name.trim() || !amount) return;
    setSubmitting(true);
    try {
      await onSaveOverride({ name: name.trim(), amount: Math.abs(parseFloat(amount)) });
    } finally {
      setSubmitting(false);
    }
  };

  if (scope === 'choose') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
        <div className="panel" style={{ width: 420, margin: 0 }}>
          <div className="panel-head">
            <h2>Edit "{item.name}"</h2>
            <button className="qty-button" onClick={onClose}><X size={14} /></button>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: -4 }}>
            This is a recurring planned item. What do you want to change?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            <button
              className="btn ghost"
              style={{ textAlign: 'left', padding: '12px 14px' }}
              onClick={() => setScope('rule')}
            >
              <strong>Change it going forward</strong>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                Updates the amount (and schedule) for every future occurrence.
              </div>
            </button>
            <button
              className="btn ghost"
              style={{ textAlign: 'left', padding: '12px 14px' }}
              onClick={() => setScope('occurrence')}
            >
              <strong>Just this one ({occurrenceDateLabel})</strong>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                Logs a one-time actual amount for this date only. Future months stay the same.
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (scope === 'rule') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
        <div className="panel" style={{ width: 420, margin: 0 }}>
          <div className="panel-head">
            <h2>Edit going forward</h2>
            <button className="qty-button" onClick={onClose}><X size={14} /></button>
          </div>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
            <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <input placeholder="Amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {rule?.recurrence === 'monthly_day' && (
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>Day of month it's due</label>
                <input type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} style={{ width: '100%' }} />
              </div>
            )}
            {rule?.recurrence === 'annual' && (
              <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>
                This is an annual item ({rule.category}). Changing the month/day requires editing the household data directly for now - this form updates the name and amount.
              </p>
            )}
          </div>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setScope('choose')}>Back</button>
            <button className="btn primary" onClick={handleSaveRule} disabled={submitting || !name.trim() || !amount}>
              {submitting ? 'Saving...' : 'Save for all future occurrences'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="panel" style={{ width: 420, margin: 0 }}>
        <div className="panel-head">
          <h2>Edit just this one</h2>
          <button className="qty-button" onClick={onClose}><X size={14} /></button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: -4 }}>{occurrenceDateLabel} only. Future months keep the regular amount.</p>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="form-actions">
          <button className="btn ghost" onClick={() => setScope('choose')}>Back</button>
          <button className="btn primary" onClick={handleSaveOverride} disabled={submitting || !name.trim() || !amount}>
            {submitting ? 'Saving...' : 'Save for this date only'}
          </button>
        </div>
      </div>
    </div>
  );
}


function CommissionPanel({
  commissionMonths,
  isAdmin,
  onSave,
}: {
  commissionMonths: CommissionMonth[];
  isAdmin: boolean;
  onSave: (input: { month_date: string; monthly_revenue: number; commission_rate?: number; tax_rate?: number; notes?: string | null }) => Promise<void>;
}) {
  const currentMonthKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  }, []);

  const existingForCurrentMonth = commissionMonths.find((c) => c.month_date === currentMonthKey);

  const [editingMonth, setEditingMonth] = useState<string>(currentMonthKey);
  const [revenue, setRevenue] = useState(existingForCurrentMonth ? String(existingForCurrentMonth.monthly_revenue) : '');
  const [rate, setRate] = useState(existingForCurrentMonth ? String(existingForCurrentMonth.commission_rate * 100) : '2');
  const [taxRate, setTaxRate] = useState(existingForCurrentMonth ? String(existingForCurrentMonth.tax_rate * 100) : '28.5');
  const [submitting, setSubmitting] = useState(false);

  const revenueNum = parseFloat(revenue) || 0;
  const rateNum = (parseFloat(rate) || 0) / 100;
  const taxRateNum = (parseFloat(taxRate) || 0) / 100;
  const commissionRaw = revenueNum * rateNum;
  const commissionAfterTax = commissionRaw * (1 - taxRateNum);

  const monthLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  };

  const handleSave = async () => {
    if (!revenue) return;
    setSubmitting(true);
    try {
      await onSave({
        month_date: editingMonth,
        monthly_revenue: revenueNum,
        commission_rate: rateNum,
        tax_rate: taxRateNum,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Adam's Commission</h2>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: -8 }}>
        Once a month (Adam's 2nd payday), commission gets added on top of his base pay. Enter the month's revenue and it calculates automatically: revenue &times; rate, then reduced by the commission tax rate.
      </p>

      {isAdmin && (
        <div className="form-grid" style={{ marginTop: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Month</label>
            <input
              type="month"
              value={editingMonth.slice(0, 7)}
              onChange={(e) => setEditingMonth(`${e.target.value}-01`)}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>How much they brought in</label>
            <input
              type="number"
              step="0.01"
              placeholder="e.g. 83000"
              value={revenue}
              onChange={(e) => setRevenue(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Commission %</label>
            <input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Tax rate on commission %</label>
            <input type="number" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>
      )}

      <div className="stats-row" style={{ marginTop: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Commission (before tax)</div>
          <div className="stat-val">{fmtMoney(commissionRaw)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">After-tax commission</div>
          <div className="stat-val" style={{ color: 'var(--green)' }}>{fmtMoney(commissionAfterTax)}</div>
        </div>
      </div>

      {isAdmin && (
        <div className="form-actions" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={handleSave} disabled={submitting || !revenue}>
            {submitting ? 'Saving...' : `Save for ${monthLabel(editingMonth)}`}
          </button>
        </div>
      )}

      <div className="table-card" style={{ marginTop: 20 }}>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th style={{ textAlign: 'right' }}>Revenue</th>
              <th style={{ textAlign: 'right' }}>Rate</th>
              <th style={{ textAlign: 'right' }}>Commission</th>
              <th style={{ textAlign: 'right' }}>After tax</th>
            </tr>
          </thead>
          <tbody>
            {commissionMonths.length === 0 && (
              <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No commission months logged yet.</td></tr>
            )}
            {commissionMonths.map((c) => (
              <tr key={c.id}>
                <td>{monthLabel(c.month_date)}</td>
                <td style={{ textAlign: 'right' }}>{fmtMoney(c.monthly_revenue)}</td>
                <td style={{ textAlign: 'right' }}>{(c.commission_rate * 100).toFixed(2)}%</td>
                <td style={{ textAlign: 'right' }}>{fmtMoney(c.commission_amount)}</td>
                <td style={{ textAlign: 'right', color: 'var(--green)' }}>{fmtMoney(c.after_tax_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type EventCategory = 'holiday' | 'birthday' | 'anniversary' | 'pet' | 'vehicle';

/**
 * Pulls a "person" out of a rule name when one is reasonably extractable:
 *   "Christmas Gift: Adam" -> "Adam"
 *   "Kaylee's Birthday" -> "Kaylee"
 *   "Lynn & Lamar's Anniversary" -> "Lynn & Lamar"
 * Falls back to the full rule name as the "person" column when no clean
 * extraction is possible (e.g. "Christmas Yard Decoration").
 */
function extractPersonAndEvent(name: string, category: EventCategory): { person: string; event: string } {
  const giftMatch = name.match(/^Christmas Gift:\s*(.+)$/);
  if (giftMatch) return { person: giftMatch[1], event: 'Christmas Gift' };

  const possessiveMatch = name.match(/^(.+?)'s?\s+(Birthday|Anniversary|Half Birthday)$/i);
  if (possessiveMatch) return { person: possessiveMatch[1], event: possessiveMatch[2] };

  if (category === 'anniversary' || category === 'birthday') {
    return { person: name, event: category === 'anniversary' ? 'Anniversary' : 'Birthday' };
  }

  return { person: '—', event: name };
}

function EventBudgetsPanel({
  rules,
  isAdmin,
  onUpdateRule,
}: {
  rules: RecurringRule[];
  isAdmin: boolean;
  onUpdateRule: (id: string, patch: Partial<RecurringRule>) => Promise<void>;
}) {
  const [tab, setTab] = useState<'holiday' | 'birthday_anniversary' | 'pet' | 'vehicle'>('holiday');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const categoryRules = useMemo(() => {
    if (tab === 'holiday') return rules.filter((r) => r.category === 'holiday' && r.active);
    if (tab === 'birthday_anniversary') return rules.filter((r) => (r.category === 'birthday' || r.category === 'anniversary') && r.active);
    if (tab === 'pet') return rules.filter((r) => r.category === 'pet' && r.active);
    return rules.filter((r) => r.category === 'vehicle' && r.active);
  }, [rules, tab]);

  const sortedRules = useMemo(
    () => [...categoryRules].sort((a, b) => a.name.localeCompare(b.name)),
    [categoryRules]
  );

  const annualTotal = sortedRules.reduce((sum, r) => sum + r.amount, 0);

  // Reference-only ABC Fund comparison, shown on the relevant tabs.
  // Holiday + Birthday + Anniversary combined, evenly split over 12 months.
  const giftFundTotal = useMemo(() => {
    return rules
      .filter((r) => (r.category === 'holiday' || r.category === 'birthday' || r.category === 'anniversary') && r.active)
      .reduce((sum, r) => sum + r.amount, 0);
  }, [rules]);
  const giftFundMonthly = giftFundTotal / 12;
  const currentAbcFundRule = rules.find((r) => r.name === 'ABC Fund');

  const startEdit = (rule: RecurringRule) => {
    setEditingId(rule.id);
    setEditValue(String(rule.amount));
  };

  const saveEdit = async (rule: RecurringRule) => {
    const newAmount = parseFloat(editValue);
    if (isNaN(newAmount) || newAmount < 0) return;
    setSavingId(rule.id);
    try {
      await onUpdateRule(rule.id, { amount: newAmount });
      setEditingId(null);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Event Budgets</h2>
        {!isAdmin && <span style={{ fontSize: 12, color: 'var(--muted)' }}>View only</span>}
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: -8 }}>
        Editing an amount here updates the same recurring rule the Budget overview uses — future occurrences will reflect the new amount.
      </p>

      <div className="toggle-wrap" style={{ marginBottom: 14 }}>
        <button className={tab === 'holiday' ? 'active' : ''} onClick={() => setTab('holiday')}>Holiday</button>
        <button className={tab === 'birthday_anniversary' ? 'active' : ''} onClick={() => setTab('birthday_anniversary')}>Birthday & Anniversary</button>
        <button className={tab === 'pet' ? 'active' : ''} onClick={() => setTab('pet')}>Jules</button>
        <button className={tab === 'vehicle' ? 'active' : ''} onClick={() => setTab('vehicle')}>Vehicles</button>
      </div>

      <div className="stats-row" style={{ marginBottom: 14 }}>
        <div className="stat-card">
          <div className="stat-label">Annual total (this tab)</div>
          <div className="stat-val">{fmtMoney(annualTotal)}</div>
        </div>
        {(tab === 'holiday' || tab === 'birthday_anniversary') && (
          <>
            <div className="stat-card">
              <div className="stat-label">Holiday + Birthday + Anniversary / year</div>
              <div className="stat-val" style={{ fontSize: 18 }}>{fmtMoney(giftFundTotal)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Even monthly split (reference)</div>
              <div className="stat-val" style={{ fontSize: 18 }}>{fmtMoney(giftFundMonthly)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Current ABC Fund</div>
              <div className="stat-val" style={{ fontSize: 18 }}>
                {currentAbcFundRule ? fmtMoney(currentAbcFundRule.amount) : 'Not set'}
                <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block', fontWeight: 400 }}>
                  not auto-updated — for reference only
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>{tab === 'pet' || tab === 'vehicle' ? 'Item' : 'Event'}</th>
              {tab !== 'pet' && tab !== 'vehicle' && <th>Full name</th>}
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {sortedRules.length === 0 && (
              <tr><td colSpan={4} style={{ color: 'var(--muted)' }}>Nothing in this category yet.</td></tr>
            )}
            {sortedRules.map((rule) => {
              const { person, event } = extractPersonAndEvent(rule.name, rule.category as EventCategory);
              const isEditing = editingId === rule.id;
              return (
                <tr key={rule.id}>
                  {(tab === 'pet' || tab === 'vehicle') ? (
                    <td colSpan={2}>{rule.name}</td>
                  ) : (
                    <>
                      <td>{person}</td>
                      <td><small>{event}</small></td>
                      <td><small style={{ color: 'var(--muted)' }}>{rule.name}</small></td>
                    </>
                  )}
                  <td style={{ textAlign: 'right' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <input
                          type="number"
                          step="0.01"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          style={{ width: 90, textAlign: 'right' }}
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(rule); if (e.key === 'Escape') setEditingId(null); }}
                        />
                        <button className="qty-button" onClick={() => saveEdit(rule)} disabled={savingId === rule.id} aria-label="Save">
                          <Check size={12} color="var(--green)" />
                        </button>
                        <button className="qty-button" onClick={() => setEditingId(null)} aria-label="Cancel">
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <span
                        onClick={() => isAdmin && startEdit(rule)}
                        style={{ cursor: isAdmin ? 'pointer' : 'default', borderBottom: isAdmin ? '1px dashed var(--muted)' : 'none' }}
                      >
                        {fmtMoney(rule.amount)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const LOAN_TYPE_LABELS: Record<Loan['loan_type'], string> = {
  student: 'Student Loan', personal: 'Personal Loan', auto: 'Auto Loan', mortgage: 'Mortgage', other: 'Loan',
};

function LoansPanel() {
  const { loading, loans, history, isAdmin, updateBalance, updateLoan } = useLoansData();
  const [editingBalanceId, setEditingBalanceId] = useState<string | null>(null);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);

  if (loading) {
    return <div className="panel"><h2>Loans</h2><p>Loading...</p></div>;
  }

  if (loans.length === 0) {
    return <div className="panel"><h2>Loans</h2><p style={{ color: 'var(--muted)' }}>No loans tracked yet.</p></div>;
  }

  const totalBalance = loans.reduce((s, l) => s + l.current_balance, 0);
  const totalMonthly = loans.reduce((s, l) => s + l.monthly_payment, 0);

  return (
    <div className="panel">
      <div className="panel-head"><h2>Loans</h2></div>
      <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: -8, marginBottom: 14 }}>
        Balances update when you log a real statement number. Between updates, the balance shown is an estimate
        based on payment minus interest each month — log the real number whenever you get a new statement to keep it accurate.
      </p>

      <div className="stats-row" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Total debt</div>
          <div className="stat-val" style={{ color: 'var(--red)' }}>{fmtMoney(totalBalance)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total monthly payments</div>
          <div className="stat-val">{fmtMoney(totalMonthly)}</div>
        </div>
      </div>

      {loans.map((loan) => {
        const estimate = calculateEstimatedCurrentBalance(loan);
        // Projection uses the estimated balance when stale, so payoff math
        // stays current between manual updates - but the logged balance
        // itself is never overwritten by this, only displayed alongside it.
        const projectionLoan = estimate.isStale ? { ...loan, current_balance: estimate.estimatedBalance } : loan;
        const projection = calculatePayoffProjection(projectionLoan);
        const loanHistory = history.filter((h) => h.loan_id === loan.id).slice(-6);

        return (
          <div key={loan.id} className="brief-item" style={{ marginBottom: 16, borderLeft: '3px solid var(--purple)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{loan.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{LOAN_TYPE_LABELS[loan.loan_type]}{loan.lender ? ` · ${loan.lender}` : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {estimate.isStale ? (
                  <>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>
                      {fmtMoney(estimate.estimatedBalance)}
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--amber)', border: '1px solid var(--amber)', borderRadius: 4, padding: '1px 5px', marginLeft: 6, verticalAlign: 'middle' }}>
                        ESTIMATE
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      Last logged {fmtMoney(loan.current_balance)} on {fmtDate(loan.balance_updated_at)} ({estimate.monthsSinceUpdate} mo ago)
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtMoney(loan.current_balance)}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>as of {fmtDate(loan.balance_updated_at)}</div>
                  </>
                )}
              </div>
            </div>

            <div className="stats-row" style={{ marginBottom: 10 }}>
              <div className="stat-card">
                <div className="stat-label">Interest rate</div>
                {isAdmin && editingRateId === loan.id ? (
                  <InlineNumberEdit
                    initial={loan.interest_rate}
                    suffix="%"
                    onSave={async (val) => { await updateLoan(loan.id, { interest_rate: val }); setEditingRateId(null); }}
                    onCancel={() => setEditingRateId(null)}
                  />
                ) : (
                  <div
                    className="stat-val"
                    style={{ fontSize: 16, cursor: isAdmin ? 'pointer' : 'default', borderBottom: isAdmin ? '1px dashed var(--muted)' : 'none', display: 'inline-block' }}
                    onClick={() => isAdmin && setEditingRateId(loan.id)}
                  >
                    {loan.interest_rate}%
                  </div>
                )}
              </div>
              <div className="stat-card">
                <div className="stat-label">Monthly payment</div>
                <div className="stat-val" style={{ fontSize: 16 }}>{fmtMoney(loan.monthly_payment)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Months to payoff</div>
                <div className="stat-val" style={{ fontSize: 16 }}>
                  {projection.monthsToPayoff != null ? `${projection.monthsToPayoff} mo (${(projection.monthsToPayoff / 12).toFixed(1)} yr)` : 'N/A'}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Payoff date</div>
                <div className="stat-val" style={{ fontSize: 16 }}>{projection.payoffDate ? fmtDate(projection.payoffDate) : 'N/A'}</div>
              </div>
            </div>

            {projection.monthsToPayoff == null && (
              <p style={{ fontSize: 12, color: 'var(--red)', marginTop: -4, marginBottom: 10 }}>
                Current payment doesn't cover monthly interest — balance will grow at this payment level.
              </p>
            )}

            {projection.totalInterestRemaining != null && (
              <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>
                Estimated remaining interest: <strong style={{ color: 'var(--text)' }}>{fmtMoney(projection.totalInterestRemaining)}</strong>
                {' · '}total remaining payments: <strong style={{ color: 'var(--text)' }}>{fmtMoney(projection.totalPaidRemaining!)}</strong>
              </p>
            )}

            {projection.percentPaidOff != null && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ height: 8, background: '#f0f0f4', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${projection.percentPaidOff}%`, background: 'var(--green)' }} />
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>{projection.percentPaidOff.toFixed(0)}% paid off of {fmtMoney(loan.origination_balance!)} original</div>
              </div>
            )}

            {isAdmin && (
              <div>
                {editingBalanceId === loan.id ? (
                  <UpdateBalanceForm
                    onSave={async (balance, date) => { await updateBalance(loan.id, balance, date); setEditingBalanceId(null); }}
                    onCancel={() => setEditingBalanceId(null)}
                  />
                ) : (
                  <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => setEditingBalanceId(loan.id)}>Update balance</button>
                )}
              </div>
            )}

            {loanHistory.length > 1 && (
              <div className="table-card" style={{ marginTop: 10 }}>
                <table>
                  <thead><tr><th>Date</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead>
                  <tbody>
                    {loanHistory.slice().reverse().map((h) => (
                      <tr key={h.id}><td>{fmtDate(h.recorded_date)}</td><td style={{ textAlign: 'right' }}>{fmtMoney(h.balance)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function InlineNumberEdit({
  initial,
  suffix,
  onSave,
  onCancel,
}: {
  initial: number;
  suffix?: string;
  onSave: (value: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(String(initial));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    setSaving(true);
    try {
      await onSave(num);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ width: 70 }}
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel(); }}
      />
      {suffix}
      <button className="qty-button" onClick={handleSave} disabled={saving} aria-label="Save"><Check size={11} color="var(--green)" /></button>
      <button className="qty-button" onClick={onCancel} aria-label="Cancel"><X size={11} /></button>
    </div>
  );
}

function UpdateBalanceForm({
  onSave,
  onCancel,
}: {
  onSave: (balance: number, date: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [balance, setBalance] = useState('');
  const [date, setDate] = useState(() => toKey(new Date()));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const num = parseFloat(balance);
    if (isNaN(num) || num < 0) return;
    setSaving(true);
    try {
      await onSave(num, date);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input placeholder="New balance" type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} style={{ width: 120 }} autoFocus />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <button className="btn primary" style={{ fontSize: 12, padding: '6px 10px' }} onClick={handleSave} disabled={saving || !balance}>
        {saving ? 'Saving...' : 'Save'}
      </button>
      <button className="btn ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={onCancel}>Cancel</button>
    </div>
  );
}
