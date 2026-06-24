// src/Contacts.tsx
//
// Contacts tab — Google People API + per-contact check-in reminders.
// Reminders are stored in contact_reminders (Supabase).
// Due reminders surface on the Dashboard and create Todoist tasks.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, Search, Phone, Mail, RefreshCw, ExternalLink,
  MapPin, Cake, Calendar, FileText, Star, Bell, BellOff,
  CheckCircle2, Clock, ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase } from './lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

type ContactPhone   = { value: string; type?: string };
type ContactEmail   = { value: string; type?: string };
type ContactAddress = { formatted: string; type?: string };
type ContactDate    = { label: string; month: number; day: number; year?: number };

type Contact = {
  resourceName: string;
  displayName: string;
  givenName?: string;
  familyName?: string;
  phones: ContactPhone[];
  emails: ContactEmail[];
  addresses: ContactAddress[];
  birthday?: ContactDate | null;
  importantDates: ContactDate[];
  notes: string[];
  organization?: string | null;
  jobTitle?: string | null;
  labels: string[];
  photoUrl?: string | null;
};

type Reminder = {
  id: string;
  resource_name: string;
  display_name: string;
  frequency: string;
  reminder_type: string;
  last_contacted_at: string | null;
  next_due_at: string;
  snoozed_until: string | null;
  todoist_task_id: string | null;
};

type LoadState = 'idle' | 'loading' | 'loaded' | 'error' | 'no_auth' | 'reminders_only';

const FREQUENCIES = [
  { value: 'weekly',     label: 'Weekly' },
  { value: 'biweekly',  label: 'Every 2 weeks' },
  { value: 'monthly',   label: 'Monthly' },
  { value: 'bimonthly', label: 'Every 2 months' },
  { value: 'quarterly', label: 'Quarterly' },
];

const REMINDER_TYPES = [
  { value: 'text',    label: 'Text check-in' },
  { value: 'hangout', label: 'Plan a hangout' },
  { value: 'both',    label: 'Text or hang out' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(d: ContactDate): string {
  const month = MONTH_NAMES[(d.month - 1) % 12] ?? String(d.month);
  return d.year ? `${month} ${d.day}, ${d.year}` : `${month} ${d.day}`;
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  return raw;
}

function initials(contact: Contact): string {
  const g = contact.givenName?.[0] ?? '';
  const f = contact.familyName?.[0] ?? '';
  return (g + f).toUpperCase() || contact.displayName[0].toUpperCase();
}

function avatarColor(name: string): string {
  const colors = ['#7C3AED','#2563EB','#059669','#D97706','#DC2626','#0891B2','#65A30D','#9333EA'];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

function parseDate(raw: any): ContactDate | null {
  if (!raw) return null;
  const { month, day } = raw;
  if (!month || !day) return null;
  return { label: '', month, day, year: raw.year ?? undefined };
}

function nextDueFromFrequency(frequency: string, from: Date = new Date()): string {
  const d = new Date(from);
  switch (frequency) {
    case 'weekly':     d.setDate(d.getDate() + 7);   break;
    case 'biweekly':   d.setDate(d.getDate() + 14);  break;
    case 'monthly':    d.setMonth(d.getMonth() + 1); break;
    case 'bimonthly':  d.setMonth(d.getMonth() + 2); break;
    case 'quarterly':  d.setMonth(d.getMonth() + 3); break;
    default:           d.setMonth(d.getMonth() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}

function isOverdue(dateStr: string): boolean {
  return dateStr < new Date().toISOString().slice(0, 10);
}

function isDueToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().slice(0, 10);
}

function isSnoozed(reminder: Reminder): boolean {
  if (!reminder.snoozed_until) return false;
  return reminder.snoozed_until >= new Date().toISOString().slice(0, 10);
}

// ── API fetchers ───────────────────────────────────────────────────────────

async function fetchGoogleContacts(accessToken: string): Promise<Contact[]> {
  const fields = [
    'names','emailAddresses','phoneNumbers','memberships','photos',
    'addresses','birthdays','events','biographies','organizations',
  ].join(',');

  const params = new URLSearchParams({
    personFields: fields,
    pageSize: '1000',
    sortOrder: 'FIRST_NAME_ASCENDING',
  });

  const resp = await fetch(
    `https://people.googleapis.com/v1/people/me/connections?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (resp.status === 403) throw new Error('no_contacts_scope');
  if (!resp.ok) throw new Error(`People API error: ${resp.status}`);

  const json = await resp.json();
  return (json.connections ?? [])
    .map((p: any): Contact | null => {
      const primaryName = p.names?.find((n: any) => n.metadata?.primary) ?? p.names?.[0];
      if (!primaryName?.displayName) return null;

      const phones: ContactPhone[] = (p.phoneNumbers ?? []).map((ph: any) => ({ value: ph.value, type: ph.formattedType ?? ph.type }));
      const emails: ContactEmail[] = (p.emailAddresses ?? []).map((em: any) => ({ value: em.value, type: em.formattedType ?? em.type }));
      const addresses: ContactAddress[] = (p.addresses ?? []).map((a: any) => ({
        formatted: a.formattedValue ?? [a.streetAddress, a.city, a.region, a.postalCode, a.country].filter(Boolean).join(', '),
        type: a.formattedType ?? a.type,
      })).filter((a: ContactAddress) => a.formatted);
      const rawBirthday = p.birthdays?.find((b: any) => b.metadata?.primary) ?? p.birthdays?.[0];
      const birthday = rawBirthday ? parseDate(rawBirthday.date) : null;
      const importantDates: ContactDate[] = (p.events ?? []).map((ev: any): ContactDate | null => {
        const parsed = parseDate(ev.date);
        if (!parsed) return null;
        return { ...parsed, label: ev.formattedType ?? ev.type ?? 'Event' };
      }).filter(Boolean) as ContactDate[];
      const notes: string[] = (p.biographies ?? []).map((b: any) => (b.value ?? '').trim()).filter(Boolean);
      const primaryOrg = p.organizations?.find((o: any) => o.metadata?.primary) ?? p.organizations?.[0];
      const labels: string[] = (p.memberships ?? []).filter((m: any) => m.contactGroupMembership)
        .map((m: any) => m.contactGroupMembership.contactGroupResourceName ?? '').filter(Boolean);
      const photo = p.photos?.find((ph: any) => ph.metadata?.primary && !ph.default);

      return {
        resourceName: p.resourceName,
        displayName: primaryName.displayName,
        givenName: primaryName.givenName,
        familyName: primaryName.familyName,
        phones, emails, addresses, birthday, importantDates, notes,
        organization: primaryOrg?.name ?? null,
        jobTitle: primaryOrg?.title ?? null,
        labels,
        photoUrl: photo?.url ?? null,
      };
    })
    .filter(Boolean) as Contact[];
}

async function fetchContactGroups(accessToken: string): Promise<Map<string, string>> {
  const resp = await fetch('https://people.googleapis.com/v1/contactGroups?pageSize=200', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) return new Map();
  const json = await resp.json();
  const map = new Map<string, string>();
  for (const g of json.contactGroups ?? []) map.set(g.resourceName, g.formattedName ?? g.name);
  return map;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function DetailRow({ icon, children, href, type }: { icon: React.ReactNode; children: React.ReactNode; href?: string; type?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
      <span style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <span style={{ flex: 1 }}>
        {href
          ? <a href={href} style={{ color: 'var(--text)', textDecoration: 'none' }}>{children}</a>
          : <span style={{ color: 'var(--text)' }}>{children}</span>}
      </span>
      {type && <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{type}</span>}
    </div>
  );
}

function Avatar({ contact }: { contact: Contact }) {
  const color = avatarColor(contact.displayName);
  return contact.photoUrl
    ? <img src={contact.photoUrl} alt={contact.displayName} style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
    : <div style={{ width: 36, height: 36, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{initials(contact)}</div>;
}

// ── ReminderPanel — shown inside expanded contact ──────────────────────────

function ReminderPanel({ contact, reminder, onSave, onRemove, onDone, onSnooze, saving }: {
  contact: Contact;
  reminder: Reminder | null;
  onSave: (frequency: string, type: string) => void;
  onRemove: () => void;
  onDone: () => void;
  onSnooze: (days: number) => void;
  saving: boolean;
}) {
  const [freq, setFreq]       = useState(reminder?.frequency ?? 'monthly');
  const [rtype, setRtype]     = useState(reminder?.reminder_type ?? 'both');
  const [editing, setEditing] = useState(!reminder);
  const enabled = !!reminder;

  const due       = reminder ? reminder.next_due_at : null;
  const snoozedOk = reminder ? isSnoozed(reminder) : false;
  const overdue   = due && !snoozedOk && isOverdue(due);
  const today     = due && !snoozedOk && isDueToday(due);

  return (
    <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2, rgba(0,0,0,0.04))', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 13 }}>
          {enabled ? <Bell size={14} style={{ color: 'var(--purple, #7C3AED)' }} /> : <BellOff size={14} style={{ color: 'var(--muted)' }} />}
          {enabled ? 'Reminder on' : 'No reminder set'}
        </div>
        {enabled && !editing && (
          <button className="btn ghost tiny" onClick={() => setEditing(true)}>Edit</button>
        )}
      </div>

      {/* Status pill when active and due */}
      {enabled && !editing && (overdue || today) && !snoozedOk && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: overdue ? '#e5484d' : '#2f9e44', fontWeight: 600 }}>
          <Clock size={12} />
          {overdue ? `Overdue since ${due}` : 'Due today!'}
        </div>
      )}
      {enabled && !editing && snoozedOk && (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Snoozed until {reminder!.snoozed_until}</div>
      )}
      {enabled && !editing && !overdue && !today && !snoozedOk && due && (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Next: {due}</div>
      )}

      {/* Action buttons when due */}
      {enabled && !editing && (overdue || today) && !snoozedOk && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button className="btn primary tiny" onClick={onDone} disabled={saving}>
            <CheckCircle2 size={12} /> Done — I reached out
          </button>
          <button className="btn ghost tiny" onClick={() => onSnooze(3)} disabled={saving}>
            <Clock size={12} /> 3 days
          </button>
          <button className="btn ghost tiny" onClick={() => onSnooze(7)} disabled={saving}>
            <Clock size={12} /> 1 week
          </button>
          <button className="btn ghost tiny" onClick={() => onSnooze(14)} disabled={saving}>
            <Clock size={12} /> 2 weeks
          </button>
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              Frequency
              <select value={freq} onChange={e => setFreq(e.target.value)} style={{ fontSize: 13 }}>
                {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              Reminder type
              <select value={rtype} onChange={e => setRtype(e.target.value)} style={{ fontSize: 13 }}>
                {REMINDER_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn primary tiny" onClick={() => { onSave(freq, rtype); setEditing(false); }} disabled={saving}>
              <Bell size={12} /> {enabled ? 'Save' : 'Enable reminder'}
            </button>
            {enabled && <button className="btn ghost tiny" onClick={() => setEditing(false)}>Cancel</button>}
            {enabled && (
              <button className="btn warning tiny" onClick={onRemove} disabled={saving}>
                <BellOff size={12} /> Remove
              </button>
            )}
          </div>
        </div>
      )}

      {/* Turn on button when not set */}
      {!enabled && !editing && (
        <button className="btn ghost tiny" onClick={() => setEditing(true)}>
          <Bell size={12} /> Set up reminder
        </button>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Contacts() {
  const [contacts, setContacts]         = useState<Contact[]>([]);
  const [groupMap, setGroupMap]         = useState<Map<string, string>>(new Map());
  const [reminders, setReminders]       = useState<Reminder[]>([]);
  const [loadState, setLoadState]       = useState<LoadState>('idle');
  const [error, setError]               = useState<string | null>(null);
  const [search, setSearch]             = useState('');
  const [selectedLabel, setSelectedLabel] = useState<string>('all');
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [saving, setSaving]             = useState<string | null>(null); // resourceName being saved
  const [showDueOnly, setShowDueOnly]   = useState(false);

  // ── Load Google token ────────────────────────────────────────────────
  const getGoogleToken = useCallback(async (): Promise<string | null> => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    const jwt = data.session?.access_token;
    if (!jwt) return null;
    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-contacts-token`,
      { headers: { Authorization: `Bearer ${jwt}` } }
    );
    if (!resp.ok) return null;
    const { access_token } = await resp.json();
    return access_token ?? null;
  }, []);

  // ── Load reminders from Supabase ─────────────────────────────────────
  const loadReminders = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('contact_reminders').select('*').order('next_due_at');
    if (data) setReminders(data as Reminder[]);
  }, []);

  // ── Main load ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!supabase) { setLoadState('no_auth'); return; }
    setLoadState('loading');
    setError(null);
    try {
      const googleToken = await getGoogleToken();
      if (!googleToken) {
        // No Google token for this user (e.g. Adam) — load from Supabase cache
        await loadReminders();
        if (supabase) {
          const { data: cached } = await supabase
            .from('cached_contacts')
            .select('*')
            .order('display_name', { ascending: true });
          if (cached && cached.length > 0) {
            // Convert cached rows back to Contact shape
            const contactsFromCache: Contact[] = (cached as any[]).map(row => ({
              resourceName: row.resource_name,
              displayName: row.display_name,
              phones: row.phones ?? [],
              emails: row.emails ?? [],
              addresses: row.addresses ?? [],
              photoUrl: row.photo_url ?? null,
              birthday: row.birthday ?? null,
              importantDates: row.important_dates ?? [],
              notes: row.notes ?? null,
              organization: row.organization ?? null,
              jobTitle: row.job_title ?? null,
              labels: row.labels ?? [],
            }));
            setContacts(contactsFromCache);
            setLoadState('loaded');
          } else {
            setLoadState('reminders_only');
          }
        } else {
          setLoadState('reminders_only');
        }
        return;
      }
      const [fetchedContacts, fetchedGroups] = await Promise.all([
        fetchGoogleContacts(googleToken),
        fetchContactGroups(googleToken),
      ]);
      setContacts(fetchedContacts);
      setGroupMap(fetchedGroups);
      await loadReminders();
      setLoadState('loaded');
      // Cache contacts in Supabase so other household members can see them
      if (supabase && fetchedContacts.length > 0) {
        const { data: sessionData } = await supabase.auth.getSession();
        const ownerId = sessionData.session?.user?.id;
        if (ownerId) {
          const rows = fetchedContacts.map((c: Contact) => ({
            owner_user_id: ownerId,
            resource_name: c.resourceName,
            display_name: c.displayName,
            phones: c.phones ?? null,
            emails: c.emails ?? null,
            addresses: c.addresses ?? null,
            photo_url: c.photoUrl ?? null,
            birthday: c.birthday ?? null,
            important_dates: c.importantDates ?? null,
            notes: c.notes ?? null,
            organization: c.organization ?? null,
            job_title: c.jobTitle ?? null,
            labels: c.labels ?? [],
            updated_at: new Date().toISOString(),
          }));
          // Upsert in batches of 100
          for (let i = 0; i < rows.length; i += 100) {
            await supabase.from('cached_contacts').upsert(
              rows.slice(i, i + 100),
              { onConflict: 'owner_user_id,resource_name' }
            );
          }
        }
      }
    } catch (e: any) {
      if (e?.message === 'no_contacts_scope') {
        setError('Contacts permission not granted. Go to Settings → Reconnect Google Account.');
        setLoadState('error');
      } else {
        setError(e?.message ?? 'Could not load contacts.');
        setLoadState('error');
      }
    }
  }, [getGoogleToken, loadReminders]);

  useEffect(() => { load(); }, [load]);

  // ── Reminder CRUD ────────────────────────────────────────────────────
  const saveReminder = useCallback(async (contact: Contact, frequency: string, reminderType: string) => {
    if (!supabase) return;
    setSaving(contact.resourceName);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(null); return; }
    const row = {
      user_id: session.user.id,
      resource_name: contact.resourceName,
      display_name: contact.displayName,
      frequency,
      reminder_type: reminderType,
      next_due_at: new Date().toISOString().slice(0, 10),
      snoozed_until: null,
    };
    const { error } = await supabase.from('contact_reminders').upsert(row, { onConflict: 'user_id,resource_name' });
    if (!error) await loadReminders();
    setSaving(null);
  }, [loadReminders]);

  const removeReminder = useCallback(async (resourceName: string) => {
    if (!supabase) return;
    setSaving(resourceName);
    await supabase.from('contact_reminders').delete().eq('resource_name', resourceName);
    await loadReminders();
    setSaving(null);
  }, [loadReminders]);

  const markDone = useCallback(async (reminder: Reminder) => {
    if (!supabase) return;
    setSaving(reminder.resource_name);
    const today = new Date().toISOString().slice(0, 10);
    const next  = nextDueFromFrequency(reminder.frequency);
    await supabase.from('contact_reminders').update({
      last_contacted_at: today,
      next_due_at: next,
      snoozed_until: null,
      todoist_task_id: null,
      updated_at: new Date().toISOString(),
    }).eq('id', reminder.id);
    await loadReminders();
    setSaving(null);
  }, [loadReminders]);

  const snoozeReminder = useCallback(async (reminder: Reminder, days: number) => {
    if (!supabase) return;
    setSaving(reminder.resource_name);
    const snoozed = new Date();
    snoozed.setDate(snoozed.getDate() + days);
    await supabase.from('contact_reminders').update({
      snoozed_until: snoozed.toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    }).eq('id', reminder.id);
    await loadReminders();
    setSaving(null);
  }, [loadReminders]);

  // ── Derived data ─────────────────────────────────────────────────────
  const reminderMap = useMemo(() => {
    const m = new Map<string, Reminder>();
    for (const r of reminders) m.set(r.resource_name, r);
    return m;
  }, [reminders]);

  const dueReminders = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return reminders.filter(r => {
      if (isSnoozed(r)) return false;
      return r.next_due_at <= today;
    });
  }, [reminders]);

  const labelOptions = useMemo(() => {
    const systemPrefixes = ['contactGroups/myContacts','contactGroups/starred','contactGroups/all','contactGroups/friends','contactGroups/family','contactGroups/coworkers'];
    const seen = new Set<string>();
    const opts: { key: string; label: string }[] = [];
    for (const c of contacts) {
      for (const l of c.labels) {
        if (!seen.has(l) && !systemPrefixes.some(s => l.startsWith(s))) {
          seen.add(l);
          opts.push({ key: l, label: groupMap.get(l) ?? l.split('/').pop() ?? l });
        }
      }
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [contacts, groupMap]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter(c => {
      if (showDueOnly && !dueReminders.some(r => r.resource_name === c.resourceName)) return false;
      if (selectedLabel !== 'all' && !c.labels.includes(selectedLabel)) return false;
      if (!q) return true;
      return (
        c.displayName.toLowerCase().includes(q) ||
        (c.organization ?? '').toLowerCase().includes(q) ||
        c.phones.some(p => p.value.replace(/\D/g,'').includes(q.replace(/\D/g,''))) ||
        c.emails.some(e => e.value.toLowerCase().includes(q)) ||
        c.addresses.some(a => a.formatted.toLowerCase().includes(q))
      );
    });
  }, [contacts, search, selectedLabel, showDueOnly, dueReminders]);

  const grouped = useMemo(() => {
    const map = new Map<string, Contact[]>();
    for (const c of filtered) {
      const letter = (c.familyName?.[0] ?? c.displayName[0] ?? '#').toUpperCase();
      const key = /[A-Z]/.test(letter) ? letter : '#';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.entries()].sort(([a],[b]) => a.localeCompare(b));
  }, [filtered]);

  // ── Loading/error states ──────────────────────────────────────────────

  if (loadState === 'idle' || loadState === 'loading') {
    return <section className="panel"><div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)' }}><RefreshCw size={16} className="spin" /><span>Loading contacts from Google…</span></div></section>;
  }

  if (loadState === 'reminders_only') {
    const today = new Date().toISOString().slice(0, 10);
    const remindersWithContacts = reminders.filter(r => r.display_name);
    return (
      <>
        <div className="page-header">
          <div><h1>Contacts</h1><p>Outreach reminders — contacts from Kaylee's account</p></div>
        </div>
        <section className="panel">
          <div className="panel-head"><h2>Outreach Reminders</h2></div>
          {remindersWithContacts.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>No contact reminders set yet.</p>
            : remindersWithContacts.map(r => (
              <div key={r.id} className="brief-item" style={{
                borderLeft: `3px solid ${r.next_due_at && r.next_due_at <= today ? 'var(--amber)' : 'var(--green)'}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{r.display_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {r.reminder_type} · every {r.frequency}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: r.next_due_at && r.next_due_at <= today ? 'var(--amber)' : 'var(--muted)' }}>
                  {r.next_due_at && r.next_due_at <= today ? 'Due now' : r.next_due_at ? `Next: ${r.next_due_at}` : ''}
                </span>
              </div>
            ))
          }
        </section>
      </>
    );
  }

  if (loadState === 'no_auth') {
    return (
      <section className="panel">
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <Users size={28} style={{ marginBottom: 10, color: 'var(--muted)' }} />
          <p style={{ margin: '0 0 8px' }}>Connect your Google account to see your contacts here.</p>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Go to <strong>Settings → Reconnect Google Account</strong> and approve Contacts access.</p>
        </div>
      </section>
    );
  }

  if (loadState === 'error') {
    return (
      <section className="panel">
        <p style={{ color: '#e5484d', margin: '0 0 10px' }}>{error}</p>
        <button className="btn ghost" onClick={load}><RefreshCw size={14} /> Retry</button>
      </section>
    );
  }

  // ── Main UI ───────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Contacts</h1>
          <p>Your Google Contacts — {contacts.length} total · {reminders.length} with reminders</p>
        </div>
        <div className="actions">
          <a href="https://contacts.google.com" target="_blank" rel="noopener noreferrer" className="btn ghost">
            <ExternalLink size={14} /> Google Contacts
          </a>
          <button className="btn ghost" onClick={load}><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      {/* Due reminders banner */}
      {dueReminders.length > 0 && (
        <section className="panel" style={{ borderLeft: '3px solid var(--purple, #7C3AED)' }}>
          <div className="panel-head">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Bell size={16} style={{ color: 'var(--purple, #7C3AED)' }} />
              {dueReminders.length} check-in{dueReminders.length > 1 ? 's' : ''} due
            </h2>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              Thursday is a great day to plan a hangout 🎲
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {dueReminders.map(r => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                background: 'var(--surface-2, rgba(0,0,0,0.04))', borderRadius: 8,
                fontSize: 13,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: avatarColor(r.display_name), color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>
                  {r.display_name[0].toUpperCase()}
                </div>
                <div>
                  <strong style={{ display: 'block' }}>{r.display_name}</strong>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {REMINDER_TYPES.find(t => t.value === r.reminder_type)?.label ?? r.reminder_type}
                    {' · '}{isOverdue(r.next_due_at) ? `overdue since ${r.next_due_at}` : 'today'}
                  </span>
                </div>
                <button className="btn primary tiny" onClick={() => markDone(r)} disabled={saving === r.resource_name}>
                  <CheckCircle2 size={12} /> Done
                </button>
                <button className="btn ghost tiny" onClick={() => snoozeReminder(r, 7)} disabled={saving === r.resource_name}>
                  <Clock size={12} /> 1 wk
                </button>
                <button className="btn ghost tiny" onClick={() => { setExpanded(r.resource_name); setShowDueOnly(false); }} style={{ fontSize: 11 }}>
                  Open
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Search + filter */}
      <section className="panel" style={{ paddingBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              placeholder="Search name, phone, email, address…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32, width: '100%' }}
            />
          </div>
          {labelOptions.length > 0 && (
            <select value={selectedLabel} onChange={e => setSelectedLabel(e.target.value)} style={{ minWidth: 140 }}>
              <option value="all">All contacts</option>
              {labelOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          )}
          <button
            className={showDueOnly ? 'btn primary' : 'btn ghost'}
            onClick={() => setShowDueOnly(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}
          >
            <Bell size={13} /> Due only {dueReminders.length > 0 && `(${dueReminders.length})`}
          </button>
        </div>
        {filtered.length !== contacts.length && !showDueOnly && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>
            Showing {filtered.length} of {contacts.length}
          </p>
        )}
      </section>

      {grouped.length === 0 && (
        <section className="panel"><div className="brief-item">No contacts match.</div></section>
      )}

      {grouped.map(([letter, group]) => (
        <section className="panel" key={letter} style={{ paddingBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>
            {letter}
          </div>

          {group.map(contact => {
            const isOpen   = expanded === contact.resourceName;
            const reminder = reminderMap.get(contact.resourceName) ?? null;
            const isDue    = reminder && !isSnoozed(reminder) && reminder.next_due_at <= new Date().toISOString().slice(0, 10);

            return (
              <div key={contact.resourceName}>
                <button
                  onClick={() => setExpanded(isOpen ? null : contact.resourceName)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', background: 'none', border: 'none',
                    padding: '8px 4px',
                    borderBottom: isOpen ? 'none' : '1px solid var(--border, rgba(0,0,0,0.07))',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <Avatar contact={contact} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {contact.displayName}
                      {contact.birthday && <span title={`Birthday: ${formatDate(contact.birthday)}`} style={{ color: 'var(--muted)' }}><Cake size={12} /></span>}
                      {isDue && <span title="Check-in due" style={{ color: 'var(--purple, #7C3AED)' }}><Bell size={12} /></span>}
                      {reminder && !isDue && <span title="Reminder active" style={{ color: 'var(--muted)' }}><Bell size={12} /></span>}
                    </div>
                    {!isOpen && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
                        {contact.jobTitle && contact.organization
                          ? `${contact.jobTitle} · ${contact.organization}`
                          : contact.organization ?? contact.jobTitle
                          ?? (contact.phones[0] ? formatPhone(contact.phones[0].value) : contact.emails[0]?.value ?? '')}
                      </div>
                    )}
                  </div>

                  {contact.phones[0] && (
                    <a href={`tel:${contact.phones[0].value}`} onClick={e => e.stopPropagation()} style={{ color: 'var(--muted)', padding: 4 }}>
                      <Phone size={15} />
                    </a>
                  )}
                  {contact.emails[0] && (
                    <a href={`mailto:${contact.emails[0].value}`} onClick={e => e.stopPropagation()} style={{ color: 'var(--muted)', padding: 4 }}>
                      <Mail size={15} />
                    </a>
                  )}
                  {isOpen ? <ChevronUp size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
                </button>

                {isOpen && (
                  <div style={{ padding: '10px 4px 14px 52px', borderBottom: '1px solid var(--border, rgba(0,0,0,0.07))', display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {(contact.jobTitle || contact.organization) && (
                      <DetailRow icon={<Star size={13} />}>{[contact.jobTitle, contact.organization].filter(Boolean).join(' · ')}</DetailRow>
                    )}
                    {contact.phones.map((ph, i) => (
                      <DetailRow key={i} icon={<Phone size={13} />} href={`tel:${ph.value}`} type={ph.type}>{formatPhone(ph.value)}</DetailRow>
                    ))}
                    {contact.emails.map((em, i) => (
                      <DetailRow key={i} icon={<Mail size={13} />} href={`mailto:${em.value}`} type={em.type}>{em.value}</DetailRow>
                    ))}
                    {contact.addresses.map((a, i) => (
                      <DetailRow key={i} icon={<MapPin size={13} />} href={`https://maps.google.com/?q=${encodeURIComponent(a.formatted)}`} type={a.type}>{a.formatted}</DetailRow>
                    ))}
                    {contact.birthday && (
                      <DetailRow icon={<Cake size={13} />} type="Birthday">{formatDate(contact.birthday)}</DetailRow>
                    )}
                    {contact.importantDates.map((d, i) => (
                      <DetailRow key={i} icon={<Calendar size={13} />} type={d.label}>{formatDate(d)}</DetailRow>
                    ))}
                    {contact.notes.map((note, i) => (
                      <DetailRow key={i} icon={<FileText size={13} />}><span style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{note}</span></DetailRow>
                    ))}

                    {/* Reminder panel */}
                    <ReminderPanel
                      contact={contact}
                      reminder={reminder}
                      saving={saving === contact.resourceName}
                      onSave={(freq, type) => saveReminder(contact, freq, type)}
                      onRemove={() => removeReminder(contact.resourceName)}
                      onDone={() => reminder && markDone(reminder)}
                      onSnooze={(days) => reminder && snoozeReminder(reminder, days)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
