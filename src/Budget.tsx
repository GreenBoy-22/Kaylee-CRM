// src/Budget.tsx
//
// Budget tab: planned vs actual, week-to-week (pay-period based) and
// month-to-month views, split across the Bills Account / Main Account
// two-account model.

import { useMemo, useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, X, Pencil, Trash2, Repeat } from 'lucide-react';
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
} from './useBudgetData';

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

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Budget() {
  const {
    loading, rules, payPeriods, actuals, isAdmin,
    addActualTransaction, updateActualTransaction, deleteActualTransaction,
    addPayPeriod, addRule,
  } = useBudgetData();
  const [view, setView] = useState<ViewMode>('month');
  const [monthAnchor, setMonthAnchor] = useState(new Date());
  const [periodIndex, setPeriodIndex] = useState(0); // 0 = most recent period
  const [accountFilter, setAccountFilter] = useState<'all' | BudgetAccount>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [editingActual, setEditingActual] = useState<ActualTransaction | null>(null);

  const sortedPeriods = useMemo(
    () => [...payPeriods].sort((a, b) => a.pay_date.localeCompare(b.pay_date)),
    [payPeriods]
  );

  const periodWindows = useMemo(() => {
    const windows: { start: Date; end: Date; payday: typeof sortedPeriods[number] }[] = [];
    for (let i = 0; i < sortedPeriods.length; i++) {
      const start = new Date(sortedPeriods[i].pay_date + 'T00:00:00');
      const next = sortedPeriods[i + 1];
      const end = next
        ? new Date(new Date(next.pay_date + 'T00:00:00').getTime() - 86400000)
        : new Date(start.getTime() + 13 * 86400000);
      windows.push({ start, end, payday: sortedPeriods[i] });
    }
    return windows.reverse();
  }, [sortedPeriods]);

  const currentWindow = periodWindows[periodIndex];

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

  const planned = useMemo(() => {
    const billsAndOneOffs = expandRecurringRules(rules, rangeStart, rangeEnd);
    const paydays = generatePaydays(rangeStart, rangeEnd);
    const paydayItems: PlannedItem[] = paydays.map((p: GeneratedPayday) => ({
      id: p.id,
      ruleId: 'generated-payday',
      name: p.isWifiStipend ? `${p.person} Pay Day (with wifi stipend)` : `${p.person} Pay Day`,
      amount: p.amount,
      kind: 'income',
      account: 'main',
      category: 'income',
      date: p.date,
    }));
    return [...billsAndOneOffs, ...paydayItems].sort((a, b) => a.date.localeCompare(b.date));
  }, [rules, rangeStart, rangeEnd]);

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
    type Row = { date: string; name: string; amount: number; kind: BudgetKind; account: BudgetAccount; category: BudgetCategory; status: 'planned' | 'actual'; id: string; actual?: ActualTransaction };
    const rows: Row[] = [
      ...filteredPlanned.map((p: PlannedItem) => ({ date: p.date, name: p.name, amount: p.amount, kind: p.kind, account: p.account, category: p.category, status: 'planned' as const, id: p.id })),
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
        {isAdmin && (
          <div className="actions">
            <button className="btn ghost" onClick={() => setShowPayForm(true)}>+ Log payday</button>
            <button className="btn primary" onClick={() => setShowAddForm(true)}><Plus size={15} /> Add expense</button>
          </div>
        )}
      </div>

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
                <button className="qty-button" onClick={() => setPeriodIndex((i) => Math.min(i + 1, periodWindows.length - 1))} disabled={periodIndex >= periodWindows.length - 1}><ChevronLeft size={14} /></button>
                <strong>{rangeLabel}</strong>
                <button className="qty-button" onClick={() => setPeriodIndex((i) => Math.max(i - 1, 0))} disabled={periodIndex <= 0}><ChevronRight size={14} /></button>
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
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
