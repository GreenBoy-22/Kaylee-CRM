// src/FTOTracker.tsx
//
// Rolling FTO (Flexible Time Off) tracker for Kaylee's work side.
//
// Rules:
//   - Rolling window: today − 365 days through today (used balance)
//   - Future entries: logged but shown separately, don't count until date arrives
//   - 8 hrs = 1 day; display always in days with hours in parens
//   - Target: 24 days (192 hrs) per rolling year
//   - Categories: Vacation, Sick
//   - Cancelled entries stay visible but are struck through and excluded from totals

import { useCallback, useEffect, useState } from 'react';
import { Plus, X, RefreshCw, RotateCcw, Calendar, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from './lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

type Category = 'vacation' | 'sick';

type FTOEntry = {
  id: string;
  entry_date: string;   // YYYY-MM-DD
  hours: number;
  category: Category;
  comment: string | null;
  cancelled: boolean;
  created_at: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

const HOURS_PER_DAY = 8;

function toDays(hours: number): string {
  const days = hours / HOURS_PER_DAY;
  return days % 1 === 0 ? `${days}d` : `${days.toFixed(2)}d`;
}

function toHrsLabel(hours: number): string {
  return `${hours}h`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function windowStart(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  d.setDate(d.getDate() + 1); // exclusive: exactly 365 days back
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CATEGORY_LABELS: Record<Category, string> = {
  vacation: 'Vacation',
  sick: 'Sick',
};

const CATEGORY_COLORS: Record<Category, string> = {
  vacation: 'var(--purple)',
  sick: 'var(--amber)',
};

const CATEGORY_BG: Record<Category, string> = {
  vacation: 'var(--purple-bg)',
  sick: 'var(--amber-bg)',
};

// ── Main component ─────────────────────────────────────────────────────────

export default function FTOTracker() {
  const [entries, setEntries]     = useState<FTOEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [message, setMessage]     = useState('');

  // Form state
  const [formDate, setFormDate]       = useState(todayKey());
  const [formHours, setFormHours]     = useState('8');
  const [formCategory, setFormCategory] = useState<Category>('vacation');
  const [formComment, setFormComment] = useState('');

  // ── Load ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from('fto_entries')
      .select('*')
      .order('entry_date', { ascending: false });
    if (data) setEntries(data as FTOEntry[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Add entry ──────────────────────────────────────────────────────────
  async function handleAdd() {
    if (!supabase || !formDate || !formHours) return;
    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) { setSaving(false); return; }

    const { error } = await supabase.from('fto_entries').insert({
      user_id: userId,
      entry_date: formDate,
      hours: parseFloat(formHours),
      category: formCategory,
      comment: formComment.trim() || null,
      cancelled: false,
    });

    if (!error) {
      setFormDate(todayKey());
      setFormHours('8');
      setFormComment('');
      setShowAdd(false);
      await load();
      setMessage('Entry saved.');
    } else {
      setMessage(`Save failed: ${error.message}`);
    }
    setSaving(false);
  }

  // ── Cancel / restore ───────────────────────────────────────────────────
  async function toggleCancel(entry: FTOEntry) {
    if (!supabase) return;
    await supabase.from('fto_entries').update({
      cancelled: !entry.cancelled,
      updated_at: new Date().toISOString(),
    }).eq('id', entry.id);
    await load();
  }

  // ── Delete ─────────────────────────────────────────────────────────────
  async function deleteEntry(id: string) {
    if (!supabase) return;
    if (!confirm('Delete this entry permanently?')) return;
    await supabase.from('fto_entries').delete().eq('id', id);
    await load();
  }

  // ── Derived data ───────────────────────────────────────────────────────
  const today  = todayKey();
  const winStart = windowStart();

  // Split entries into 3 buckets
  const usedEntries   = entries.filter(e => !e.cancelled && e.entry_date >= winStart && e.entry_date <= today);
  const futureEntries = entries.filter(e => !e.cancelled && e.entry_date > today);
  const cancelledEntries = entries.filter(e => e.cancelled);
  const pastOutOfWindow  = entries.filter(e => !e.cancelled && e.entry_date < winStart);

  const usedVacHours  = usedEntries.filter(e => e.category === 'vacation').reduce((s, e) => s + e.hours, 0);
  const usedSickHours = usedEntries.filter(e => e.category === 'sick').reduce((s, e) => s + e.hours, 0);
  const usedTotalHours = usedVacHours + usedSickHours;
  const usedTotalDays  = usedTotalHours / HOURS_PER_DAY;

  const futureVacHours  = futureEntries.filter(e => e.category === 'vacation').reduce((s, e) => s + e.hours, 0);
  const futureSickHours = futureEntries.filter(e => e.category === 'sick').reduce((s, e) => s + e.hours, 0);
  const futureTotalHours = futureVacHours + futureSickHours;

  const TARGET_DAYS = 24;
  const TARGET_HOURS = TARGET_DAYS * HOURS_PER_DAY;
  const remainingHours = TARGET_HOURS - usedTotalHours;
  const remainingDays  = remainingHours / HOURS_PER_DAY;
  const pctUsed = Math.min(100, (usedTotalHours / TARGET_HOURS) * 100);

  const statusColor = pctUsed >= 90 ? 'var(--red)' : pctUsed >= 70 ? 'var(--amber)' : 'var(--green)';

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return <section className="panel"><div style={{ display: 'flex', gap: 8, color: 'var(--muted)' }}><RefreshCw size={14} className="spin" /> Loading FTO data…</div></section>;
  }

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>FTO Tracker</h1>
          <p>Rolling 365-day window · {fmtDate(winStart)} → {fmtDate(today)}</p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setShowAdd(v => !v)}>
            <Plus size={15} /> Log time off
          </button>
        </div>
      </div>

      {/* Status message */}
      {message && (
        <div className="brief-item" style={{ marginBottom: 10, color: 'var(--muted)', fontSize: 12 }}>{message}</div>
      )}

      {/* Summary stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Used (rolling year)</div>
          <div className="stat-val" style={{ color: statusColor }}>{toDays(usedTotalHours)}</div>
          <small>{toHrsLabel(usedTotalHours)} of {TARGET_HOURS}h target</small>
        </div>
        <div className="stat-card">
          <div className="stat-label">Remaining</div>
          <div className="stat-val" style={{ color: remainingDays >= 5 ? 'var(--green)' : remainingDays >= 2 ? 'var(--amber)' : 'var(--red)' }}>
            {toDays(Math.max(0, remainingHours))}
          </div>
          <small>{toHrsLabel(Math.max(0, remainingHours))} left in window</small>
        </div>
        <div className="stat-card">
          <div className="stat-label">Vacation used</div>
          <div className="stat-val">{toDays(usedVacHours)}</div>
          <small>{toHrsLabel(usedVacHours)}</small>
        </div>
        <div className="stat-card">
          <div className="stat-label">Sick used</div>
          <div className="stat-val">{toDays(usedSickHours)}</div>
          <small>{toHrsLabel(usedSickHours)}</small>
        </div>
      </div>

      {/* Progress bar */}
      <div className="panel" style={{ paddingBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
          <span>FTO used this year</span>
          <span style={{ fontWeight: 600, color: statusColor }}>{pctUsed.toFixed(0)}% of {TARGET_DAYS}-day target</span>
        </div>
        <div style={{ height: 10, background: 'var(--border)', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ height: '100%', width: `${pctUsed}%`, background: statusColor, borderRadius: 999, transition: 'width 0.4s' }} />
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap' }}>
          <span>🟣 Vacation: {toDays(usedVacHours)}</span>
          <span>🟡 Sick: {toDays(usedSickHours)}</span>
          {futureTotalHours > 0 && (
            <span style={{ marginLeft: 'auto', color: 'var(--purple)' }}>
              📅 {toDays(futureTotalHours)} planned ahead (not counted yet)
            </span>
          )}
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <section className="panel">
          <div className="panel-head">
            <h2>Log time off</h2>
            <button className="btn ghost" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
          <div className="form-grid">
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              Date
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              Hours
              <select value={formHours} onChange={e => setFormHours(e.target.value)}>
                <option value="8">8h — Full day</option>
                <option value="4">4h — Half day</option>
                <option value="3">3h</option>
                <option value="2">2h</option>
                <option value="1">1h</option>
                <option value="custom">Custom…</option>
              </select>
            </label>
            {formHours === 'custom' && (
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                Custom hours
                <input type="number" min="0.5" max="8" step="0.5" placeholder="e.g. 5" onChange={e => setFormHours(e.target.value)} />
              </label>
            )}
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              Type
              <select value={formCategory} onChange={e => setFormCategory(e.target.value as Category)}>
                <option value="vacation">Vacation</option>
                <option value="sick">Sick</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
              Comment (optional)
              <input placeholder="e.g. Beach trip, Doctor appointment" value={formComment} onChange={e => setFormComment(e.target.value)} />
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn primary" onClick={handleAdd} disabled={saving || !formDate || !formHours || formHours === 'custom'}>
              {saving ? <><RefreshCw size={13} className="spin" /> Saving…</> : <><Plus size={13} /> Save entry</>}
            </button>
          </div>
          {formDate > today && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--purple)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Calendar size={12} /> This is a future date — it will sit in the upcoming queue until it arrives.
            </div>
          )}
        </section>
      )}

      {/* Future / upcoming entries */}
      {futureEntries.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Clock size={15} style={{ color: 'var(--purple)' }} />
              Upcoming ({toDays(futureTotalHours)} planned)
            </h2>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Not counted until date arrives</span>
          </div>
          {futureEntries.map(entry => (
            <EntryRow key={entry.id} entry={entry} onToggleCancel={toggleCancel} onDelete={deleteEntry} isFuture />
          ))}
        </section>
      )}

      {/* Used entries — in window */}
      <section className="panel">
        <div className="panel-head">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <CheckCircle2 size={15} style={{ color: 'var(--green)' }} />
            Used in rolling window ({toDays(usedTotalHours)})
          </h2>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(winStart)} → today</span>
        </div>
        {usedEntries.length === 0 && (
          <div className="brief-item">No entries in the rolling window yet.</div>
        )}
        {usedEntries.map(entry => (
          <EntryRow key={entry.id} entry={entry} onToggleCancel={toggleCancel} onDelete={deleteEntry} />
        ))}
      </section>

      {/* Cancelled entries */}
      {cancelledEntries.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <X size={15} style={{ color: 'var(--muted)' }} />
              Cancelled
            </h2>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Not counted — restore if plans change back</span>
          </div>
          {cancelledEntries.map(entry => (
            <EntryRow key={entry.id} entry={entry} onToggleCancel={toggleCancel} onDelete={deleteEntry} isCancelled />
          ))}
        </section>
      )}

      {/* Past / out of window — informational only */}
      {pastOutOfWindow.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <AlertCircle size={15} style={{ color: 'var(--muted)' }} />
              Rolled off ({toDays(pastOutOfWindow.reduce((s, e) => s + e.hours, 0))})
            </h2>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Before {fmtDate(winStart)} — no longer counted</span>
          </div>
          {pastOutOfWindow.map(entry => (
            <EntryRow key={entry.id} entry={entry} onToggleCancel={toggleCancel} onDelete={deleteEntry} isRolledOff />
          ))}
        </section>
      )}
    </>
  );
}

// ── Entry row ──────────────────────────────────────────────────────────────

function EntryRow({ entry, onToggleCancel, onDelete, isFuture, isCancelled, isRolledOff }: {
  entry: FTOEntry;
  onToggleCancel: (e: FTOEntry) => void;
  onDelete: (id: string) => void;
  isFuture?: boolean;
  isCancelled?: boolean;
  isRolledOff?: boolean;
}) {
  const color = CATEGORY_COLORS[entry.category];
  const bg    = CATEGORY_BG[entry.category];
  const dim   = isCancelled || isRolledOff;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '7px 4px',
      borderBottom: '1px solid var(--border)',
      opacity: dim ? 0.55 : 1,
    }}>
      {/* Category pill */}
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
        background: bg, color, flexShrink: 0, minWidth: 56, textAlign: 'center',
        textDecoration: isCancelled ? 'line-through' : 'none',
      }}>
        {CATEGORY_LABELS[entry.category]}
      </span>

      {/* Date */}
      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 170, color: 'var(--text)', textDecoration: isCancelled ? 'line-through' : 'none' }}>
        {fmtDate(entry.entry_date)}
      </span>

      {/* Hours / days */}
      <span style={{ fontSize: 13, color: 'var(--text)', minWidth: 80 }}>
        {toHrsLabel(entry.hours)} <span style={{ color: 'var(--muted)', fontSize: 11 }}>({toDays(entry.hours)})</span>
      </span>

      {/* Comment */}
      <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {entry.comment || ''}
      </span>

      {/* Future badge */}
      {isFuture && (
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--purple)', background: 'var(--purple-bg)', borderRadius: 999, padding: '2px 7px', flexShrink: 0 }}>
          upcoming
        </span>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button
          className="qty-button"
          title={isCancelled ? 'Restore this entry' : 'Cancel this entry'}
          onClick={() => onToggleCancel(entry)}
        >
          {isCancelled ? <RotateCcw size={12} /> : <X size={12} />}
        </button>
        <button
          className="qty-button"
          title="Delete permanently"
          onClick={() => onDelete(entry.id)}
          style={{ color: 'var(--red)' }}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
