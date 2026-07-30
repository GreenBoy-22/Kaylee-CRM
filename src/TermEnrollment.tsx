import { useState, useEffect } from 'react';
import { Check, X, Mail, RefreshCw, UserPlus, Search } from 'lucide-react';
import { supabase } from './lib/supabase';

const ARMY_GREEN = '#4B5320';
const NAVY = '#1e3a5f';
const GOLD = '#d4a017';

const STATUS_COLORS: Record<string, string> = {
  none: 'transparent',
  degree_plan_made: '#a8d5ba',
  term_break: '#f4a6a6',
  term_break_requested: '#a6c8f4',
  registered: '#f5d76e',
};
const STATUS_LABELS: Record<string, string> = {
  none: '—',
  degree_plan_made: 'Degree Plan Made',
  term_break: 'Term Break (Approved)',
  term_break_requested: 'Term Break Requested',
  registered: 'Registered',
  new_student: '0 — New Student',
  returning_from_break: 'Returning from Term Break',
};
// Students with either of these statuses weren't actually in a term last
// term (brand new, or just coming back off a break), so there's no prior
// coursework to have been on-time or behind on — they shouldn't count
// toward the OTP percentage at all, in either direction.
const OTP_EXCLUDED_STATUSES = new Set(['new_student', 'returning_from_break']);

interface EnrollmentList {
  id: string;
  label: string;
  target_month: string;
  is_active: boolean;
  created_at: string;
}

interface EnrollmentEntry {
  id: string;
  list_id: string;
  student_id: string | null;
  term_number: number | null;
  student_name: string;
  otp_met: boolean;
  email_sent: boolean;
  appt_email_sent: boolean;
  appt_made: boolean;
  row_status: string;
  degree_plan_made: boolean;
  notes: string | null;
}

interface RosterStudent {
  id: string;
  display_name: string;
  contact_term: number | null;
  on_term_break: boolean | null;
  course: string | null;
}

function monthLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function TermEnrollment() {
  const [activeList, setActiveList] = useState<EnrollmentList | null>(null);
  const [entries, setEntries] = useState<EnrollmentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [adding, setAdding] = useState<string | null>(null);

  // Which month's list is currently being viewed — defaults to the
  // current calendar month, but Kaylee can pick any month directly
  // (not locked to "whichever list was generated most recently").
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });

  useEffect(() => {
    load(selectedMonthKey);
    loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonthKey]);

  async function loadRoster() {
    if (!supabase) return;
    const { data } = await supabase
      .from('students')
      .select('id, display_name, contact_term, on_term_break, course')
      .eq('archived', false)
      .order('display_name', { ascending: true });
    setRoster((data as RosterStudent[]) || []);
  }

  async function load(monthKey: string) {
    if (!supabase) return;
    setLoading(true);
    const { data: lists } = await supabase
      .from('term_enrollment_lists')
      .select('*')
      .eq('target_month', monthKey)
      .order('created_at', { ascending: false })
      .limit(1);
    const list = (lists?.[0] as EnrollmentList) || null;
    setActiveList(list);
    if (list) {
      const { data: entryData } = await supabase
        .from('term_enrollment_entries')
        .select('*')
        .eq('list_id', list.id)
        .order('student_name', { ascending: true });
      setEntries((entryData as EnrollmentEntry[]) || []);
    } else {
      setEntries([]);
    }
    setLoading(false);
  }

  // Options for the month picker: 3 months back through 6 months ahead
  // of today, so both "catching up on a past month" and "getting ahead
  // on an upcoming one" are just a click away.
  const monthOptions = (() => {
    const now = new Date();
    const opts: { key: string; label: string }[] = [];
    for (let i = -3; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      opts.push({ key, label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) });
    }
    return opts;
  })();

  // Finds (or creates) the list for the selected month, then adds any
  // student whose CURRENT term_end_date falls within that SAME month —
  // merged in alongside whatever's already there (e.g. students added
  // via "Verify Term Starts"), never duplicating or wiping existing rows.
  async function populateSelectedMonth() {
    if (!supabase) return;
    setGenerating(true);

    const monthStart = new Date(`${selectedMonthKey}T00:00:00`);
    const start = selectedMonthKey;
    const end = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).toISOString().slice(0, 10);
    const label = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // upsert on target_month rather than a plain insert — combined with
    // the unique constraint on term_enrollment_lists.target_month, this
    // makes it impossible to end up with two lists for the same month
    // even if `activeList` happened to be stale (which is exactly what
    // caused this month's data to get fragmented across several
    // duplicate lists before).
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    const { data: upsertedList, error: listError } = await supabase
      .from('term_enrollment_lists')
      .upsert(
        { user_id: uid, label: `Term Enrollment: ${label}`, target_month: selectedMonthKey, is_active: true },
        { onConflict: 'target_month', ignoreDuplicates: false }
      )
      .select()
      .single();
    if (listError || !upsertedList) { setGenerating(false); return; }
    const list = upsertedList as EnrollmentList;

    // Students whose current term ends within the selected month.
    const { data: matchingStudents } = await supabase
      .from('students')
      .select('id, display_name, contact_term, term_end_date')
      .eq('archived', false)
      .gte('term_end_date', start)
      .lte('term_end_date', end);

    const alreadyOnList = new Set(entries.map((e) => e.student_id).filter(Boolean));
    const toInsert = (matchingStudents || []).filter((s) => !alreadyOnList.has(s.id));

    if (toInsert.length > 0) {
      const rows = toInsert.map((s) => ({
        list_id: list!.id,
        student_id: s.id,
        student_name: s.display_name,
        term_number: s.contact_term,
      }));
      await supabase.from('term_enrollment_entries').insert(rows);
    }

    await load(selectedMonthKey);
    setGenerating(false);
  }

  const [askingBreakDateId, setAskingBreakDateId] = useState<string | null>(null);
  const [breakDateInput, setBreakDateInput] = useState('');

  async function updateEntry(id: string, patch: Partial<EnrollmentEntry>) {
    setEntries((current) => current.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    if (!supabase) return;
    await supabase.from('term_enrollment_entries').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  }

  // Marking a student "Term Break" here should behave exactly like
  // marking it from their profile — flip on_term_break on the actual
  // student record, and immediately ask when they're expected back so
  // that date is ready and waiting in "Verify Term Starts" instead of
  // showing up blank. Moving them OFF term break status clears both.
  async function handleStatusChange(entry: EnrollmentEntry, newStatus: string) {
    updateEntry(entry.id, { row_status: newStatus });
    if (!supabase || !entry.student_id) return;
    if (newStatus === 'term_break') {
      await supabase.from('students').update({ on_term_break: true }).eq('id', entry.student_id);
      setAskingBreakDateId(entry.id);
      setBreakDateInput('');
    } else {
      await supabase.from('students').update({ on_term_break: false, term_break_expected_back: null }).eq('id', entry.student_id);
      if (askingBreakDateId === entry.id) { setAskingBreakDateId(null); setBreakDateInput(''); }
    }
  }

  async function saveBreakDate(entry: EnrollmentEntry) {
    if (!supabase || !entry.student_id || !breakDateInput) return;
    await supabase.from('students').update({ term_break_expected_back: breakDateInput }).eq('id', entry.student_id);
    setAskingBreakDateId(null);
    setBreakDateInput('');
  }

  async function addStudentToList(student: RosterStudent) {
    if (!supabase || !activeList) return;
    setAdding(student.id);
    // If this student is coming off a term break, clear the flag so they
    // drop out of the Term Break filter on the Students page too.
    if (student.on_term_break) {
      await supabase.from('students').update({ on_term_break: false }).eq('id', student.id);
    }
    await supabase.from('term_enrollment_entries').insert({
      list_id: activeList.id,
      student_id: student.id,
      student_name: student.display_name,
      term_number: student.contact_term,
    });
    await load(selectedMonthKey);
    await loadRoster();
    setAdding(null);
    setAddSearch('');
  }

  const alreadyOnList = new Set(entries.map((e) => e.student_id).filter(Boolean));
  const addFiltered = roster
    .filter((s) => !alreadyOnList.has(s.id))
    .filter((s) => s.display_name.toLowerCase().includes(addSearch.trim().toLowerCase()))
    .slice(0, 8);

  // Only students who actually had a term to be on/off pace in count
  // toward OTP — excludes anyone marked "0 — New Student" or "Returning
  // from Term Break," since there's no prior coursework to measure.
  const otpEligible = entries.filter((e) => !OTP_EXCLUDED_STATUSES.has(e.row_status));
  const otpCount = otpEligible.filter((e) => e.otp_met).length;
  // Split into the main OTP-tracked roster and the "New / Returning"
  // group — kept as a visually separate section instead of a color-coded
  // row, since which section a student is in is exactly the signal that
  // matters (not a color to remember). Changing a row's status via the
  // SAME dropdown in either section moves it between sections
  // automatically — no separate "move back" action needed.
  const mainEntries = entries.filter((e) => !OTP_EXCLUDED_STATUSES.has(e.row_status));
  const specialEntries = entries.filter((e) => OTP_EXCLUDED_STATUSES.has(e.row_status));

  function renderEntryRow(e: EnrollmentEntry) {
    return (
      <tr key={e.id} style={{ background: STATUS_COLORS[e.row_status], borderBottom: '1px solid #eee' }}>
        <td style={{ padding: '5px 8px' }}>{e.term_number ?? ''}</td>
        <td style={{ padding: '5px 8px', fontWeight: 600 }}>{e.student_name}</td>
        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
          <input type="checkbox" checked={e.otp_met} onChange={(ev) => updateEntry(e.id, { otp_met: ev.target.checked })} />
        </td>
        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
          <input type="checkbox" checked={e.email_sent} onChange={(ev) => updateEntry(e.id, { email_sent: ev.target.checked })} />
        </td>
        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
          <input type="checkbox" checked={e.appt_email_sent} onChange={(ev) => updateEntry(e.id, { appt_email_sent: ev.target.checked })} />
        </td>
        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
          <input type="checkbox" checked={e.appt_made} onChange={(ev) => updateEntry(e.id, { appt_made: ev.target.checked })} />
        </td>
        <td style={{ padding: '5px 8px' }}>
          <select
            value={e.row_status}
            onChange={(ev) => handleStatusChange(e, ev.target.value)}
            style={{ width: '100%', fontSize: '0.8rem', padding: '2px 4px', background: 'transparent', border: '1px solid #ccc', borderRadius: 4 }}
          >
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          {askingBreakDateId === e.id && (
            <div style={{ marginTop: 4, display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                type="date"
                value={breakDateInput}
                onChange={(ev) => setBreakDateInput(ev.target.value)}
                style={{ fontSize: '0.75rem', padding: '2px 4px', border: '1px solid #ccc', borderRadius: 3 }}
              />
              <button
                onClick={() => saveBreakDate(e)}
                disabled={!breakDateInput}
                style={{ fontSize: '0.7rem', padding: '2px 8px', background: ARMY_GREEN, color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', opacity: breakDateInput ? 1 : 0.5 }}
              >
                Save
              </button>
            </div>
          )}
        </td>
      </tr>
    );
  }

  const degreePlanCount = entries.filter((e) => e.row_status === 'degree_plan_made').length;
  const registeredCount = entries.filter((e) => e.row_status === 'registered').length;
  const termBreakCount = entries.filter((e) => e.row_status === 'term_break').length;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: NAVY, fontSize: '1.5rem', margin: '0 0 0.25rem' }}>Term Enrollment Tracker</h1>
          <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>
            Digital version of your OTP / registration tracking sheet.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedMonthKey}
            onChange={(e) => setSelectedMonthKey(e.target.value)}
            style={{ padding: '0.5rem 0.7rem', borderRadius: 8, border: `1px solid ${NAVY}`, fontSize: '0.9rem', fontWeight: 600, color: NAVY }}
          >
            {monthOptions.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <button
            onClick={populateSelectedMonth}
            disabled={generating}
            title="Adds any student whose current term ends in this month, and anyone new who isn't on the list yet — never removes or duplicates what's already here."
            style={{ background: GOLD, color: '#1a1a1a', border: 'none', borderRadius: 8, padding: '0.6rem 1.1rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={15} /> {generating ? 'Populating...' : 'Populate This Month'}
          </button>
        </div>
      </div>

      {loading && <p style={{ marginTop: 24 }}>Loading...</p>}

      {!loading && !activeList && (
        <div style={{ marginTop: 24, padding: '1.5rem', background: '#f4f5f0', borderRadius: 10, textAlign: 'center' }}>
          <p style={{ margin: 0, color: '#555' }}>
            No list for {monthOptions.find((m) => m.key === selectedMonthKey)?.label} yet. Click "Populate This Month" to pull in students whose current term ends this month — anyone already added via Verify Term Starts will show up here too once it's created.
          </p>
        </div>
      )}

      {!loading && activeList && (
        <div style={{ marginTop: '1.25rem', display: 'grid', gridTemplateColumns: '1fr 260px', gap: '1.25rem' }}>
          {/* Main table */}
          <div style={{ border: `3px solid ${NAVY}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: NAVY, color: GOLD, padding: '0.75rem 1rem', fontWeight: 800, fontSize: '1.1rem', textTransform: 'uppercase' }}>
              Term Enrollment: {monthLabel(activeList.target_month)}
              <span style={{ float: 'right', fontSize: '0.85rem', fontWeight: 600 }}># {entries.length}</span>
            </div>
            <div style={{ padding: '0.6rem 1rem', background: '#f4f5f0', borderBottom: `2px solid ${GOLD}` }}>
              {!showAddForm ? (
                <button
                  onClick={() => setShowAddForm(true)}
                  style={{ background: 'white', border: `1px solid ${NAVY}`, color: NAVY, borderRadius: 8, padding: '0.4rem 0.8rem', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <UserPlus size={14} /> Add Student
                </button>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Search size={14} color="#888" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search your roster by name..."
                      value={addSearch}
                      onChange={(e) => setAddSearch(e.target.value)}
                      style={{ flex: 1, fontSize: '0.8rem', padding: '5px 8px' }}
                    />
                    <button
                      onClick={() => { setShowAddForm(false); setAddSearch(''); }}
                      style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                      Close
                    </button>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#888', marginBottom: 6 }}>
                    New students who don't have a term-end date this month, or students whose term break just ended, won't show up automatically — search and add them here. Adding someone flagged "on break" also clears their term-break status.
                  </div>
                  {addFiltered.length === 0 && (
                    <div style={{ fontSize: '0.78rem', color: '#999', padding: '4px 2px' }}>
                      {addSearch.trim() ? 'No matching students (or already on this list).' : 'Start typing a name to search your roster.'}
                    </div>
                  )}
                  {addFiltered.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => addStudentToList(s)}
                      disabled={adding === s.id}
                      style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', border: '1px solid #ddd', borderRadius: 6, padding: '6px 8px', marginBottom: 4, cursor: 'pointer', textAlign: 'left' }}
                    >
                      <span>
                        <strong style={{ fontSize: '0.82rem' }}>{s.display_name}</strong>
                        <span style={{ fontSize: '0.72rem', color: '#888', marginLeft: 6 }}>{s.course || 'No course'}</span>
                      </span>
                      {s.on_term_break && (
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#c0392b', background: STATUS_COLORS.term_break, borderRadius: 4, padding: '2px 6px' }}>
                          ☕ Break ending
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f4f5f0' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: `2px solid ${GOLD}`, width: 50 }}>Term</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: `2px solid ${GOLD}` }}>Student Name</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: `2px solid ${GOLD}`, width: 60 }}>OTP Met</th>
                  <th title="Email sent" style={{ padding: '6px 8px', textAlign: 'center', borderBottom: `2px solid ${GOLD}`, width: 44 }}>*</th>
                  <th title="Appt email sent" style={{ padding: '6px 8px', textAlign: 'center', borderBottom: `2px solid ${GOLD}`, width: 44 }}>✓</th>
                  <th title="Appt made" style={{ padding: '6px 8px', textAlign: 'center', borderBottom: `2px solid ${GOLD}`, width: 44 }}>✗</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: `2px solid ${GOLD}`, width: 150 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {mainEntries.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: '1rem', textAlign: 'center', color: '#999' }}>No students have a term ending this month.</td></tr>
                )}
                {mainEntries.map((e) => renderEntryRow(e))}
              </tbody>
            </table>

            {specialEntries.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h3 style={{ fontSize: '0.95rem', color: NAVY, margin: '0 0 6px' }}>
                  New / Returning Students <span style={{ fontWeight: 400, color: '#888', fontSize: '0.8rem' }}>— not counted toward OTP</span>
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f4f5f0' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: `2px solid ${GOLD}`, width: 50 }}>Term</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: `2px solid ${GOLD}` }}>Student Name</th>
                      <th title="Degree plan made" style={{ padding: '6px 8px', textAlign: 'center', borderBottom: `2px solid ${GOLD}`, width: 100 }}>Degree Plan</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: `2px solid ${GOLD}`, width: 150 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {specialEntries.map((e) => (
                      <tr key={e.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '5px 8px' }}>{e.term_number ?? ''}</td>
                        <td style={{ padding: '5px 8px', fontWeight: 600 }}>{e.student_name}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={e.degree_plan_made}
                            onChange={(ev) => updateEntry(e.id, { degree_plan_made: ev.target.checked })}
                            title="Degree plan made — stays in this section, still not counted for OTP"
                          />
                        </td>
                        <td style={{ padding: '5px 8px' }}>
                          <select
                            value={e.row_status}
                            onChange={(ev) => handleStatusChange(e, ev.target.value)}
                            style={{ width: '100%', fontSize: '0.8rem', padding: '2px 4px', background: 'transparent', border: '1px solid #ccc', borderRadius: 4 }}
                          >
                            {Object.entries(STATUS_LABELS).map(([val, label]) => (
                              <option key={val} value={val}>{label}</option>
                            ))}
                          </select>
                          {askingBreakDateId === e.id && (
                            <div style={{ marginTop: 4, display: 'flex', gap: 4, alignItems: 'center' }}>
                              <input
                                type="date"
                                value={breakDateInput}
                                onChange={(ev) => setBreakDateInput(ev.target.value)}
                                style={{ fontSize: '0.75rem', padding: '2px 4px', border: '1px solid #ccc', borderRadius: 3 }}
                              />
                              <button
                                onClick={() => saveBreakDate(e)}
                                disabled={!breakDateInput}
                                style={{ fontSize: '0.7rem', padding: '2px 8px', background: ARMY_GREEN, color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', opacity: breakDateInput ? 1 : 0.5 }}
                              >
                                Save
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div style={{ border: `3px solid ${NAVY}`, borderRadius: 10, padding: '0.9rem', textAlign: 'center' }}>
              <div style={{ color: GOLD, fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', writingMode: 'vertical-rl', display: 'inline-block', marginRight: 8 }}>OTP</div>
              <div style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: NAVY }}>{otpCount}/{otpEligible.length}</div>
                <div style={{ fontSize: '0.75rem', color: '#888' }}>OTP met</div>
              </div>
            </div>
            <div style={{ border: `3px solid ${NAVY}`, borderRadius: 10, padding: '0.9rem' }}>
              <div style={{ color: GOLD, fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', textDecoration: 'underline', marginBottom: 6 }}>Degree Plan Made</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: NAVY }}>{degreePlanCount}</div>
            </div>
            <div style={{ border: `3px solid ${NAVY}`, borderRadius: 10, padding: '0.9rem' }}>
              <div style={{ color: GOLD, fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', textDecoration: 'underline', marginBottom: 6 }}>Registered</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: NAVY }}>{registeredCount}</div>
              {termBreakCount > 0 && <div style={{ fontSize: '0.75rem', color: '#c0392b', marginTop: 4 }}>{termBreakCount} on term break</div>}
            </div>
            <div style={{ border: `3px solid ${NAVY}`, borderRadius: 10, padding: '0.9rem' }}>
              <div style={{ color: GOLD, fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', textDecoration: 'underline', marginBottom: 8, textAlign: 'center' }}>Key</div>
              <div style={{ fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div><Mail size={12} style={{ verticalAlign: 'middle' }} /> * – Email Sent</div>
                <div><Check size={12} style={{ verticalAlign: 'middle' }} /> ✓ – Appt Email Sent</div>
                <div><X size={12} style={{ verticalAlign: 'middle' }} /> ✗ – Appt Made</div>
                <div style={{ background: STATUS_COLORS.degree_plan_made, padding: '2px 6px', borderRadius: 4, marginTop: 4 }}>Degree Plan Made</div>
                <div style={{ background: STATUS_COLORS.term_break, padding: '2px 6px', borderRadius: 4 }}>Term Break (Approved)</div>
                <div style={{ background: STATUS_COLORS.term_break_requested, padding: '2px 6px', borderRadius: 4 }}>Term Break Requested</div>
                <div style={{ background: STATUS_COLORS.registered, padding: '2px 6px', borderRadius: 4 }}>Registered</div>
                <div style={{ marginTop: 4, color: '#666' }}>"0 — New Student" and "Returning from Term Break" move a student into their own section below the table, not counted toward OTP.</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
