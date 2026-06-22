// src/Contacts.tsx
//
// Contacts tab — reads from Google People API using the same OAuth token
// stored by the google-calendar-auth flow. Requires contacts.readonly scope.
// Displays all contacts grouped by first letter, with search and label filter.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, Search, Phone, Mail, RefreshCw, ExternalLink } from 'lucide-react';
import { supabase } from './lib/supabase';

type ContactPhone = { value: string; type?: string };
type ContactEmail = { value: string; type?: string };

type Contact = {
  resourceName: string;
  displayName: string;
  givenName?: string;
  familyName?: string;
  phones: ContactPhone[];
  emails: ContactEmail[];
  labels: string[];
  photoUrl?: string | null;
};

type LoadState = 'idle' | 'loading' | 'loaded' | 'error' | 'no_auth';

async function fetchGoogleContacts(accessToken: string): Promise<Contact[]> {
  const params = new URLSearchParams({
    personFields: 'names,emailAddresses,phoneNumbers,memberships,photos',
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
  const connections = json.connections ?? [];

  return connections
    .map((p: any): Contact | null => {
      const primaryName = p.names?.find((n: any) => n.metadata?.primary) ?? p.names?.[0];
      if (!primaryName?.displayName) return null;

      const phones: ContactPhone[] = (p.phoneNumbers ?? []).map((ph: any) => ({
        value: ph.value,
        type: ph.formattedType ?? ph.type,
      }));

      const emails: ContactEmail[] = (p.emailAddresses ?? []).map((em: any) => ({
        value: em.value,
        type: em.formattedType ?? em.type,
      }));

      const labels: string[] = (p.memberships ?? [])
        .filter((m: any) => m.contactGroupMembership)
        .map((m: any) => m.contactGroupMembership.contactGroupResourceName ?? '')
        .filter(Boolean);

      const photo = p.photos?.find((ph: any) => ph.metadata?.primary && !ph.default);

      return {
        resourceName: p.resourceName,
        displayName: primaryName.displayName,
        givenName: primaryName.givenName,
        familyName: primaryName.familyName,
        phones,
        emails,
        labels,
        photoUrl: photo?.url ?? null,
      };
    })
    .filter(Boolean) as Contact[];
}

async function fetchContactGroups(accessToken: string): Promise<Map<string, string>> {
  const resp = await fetch(
    'https://people.googleapis.com/v1/contactGroups?pageSize=200',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok) return new Map();
  const json = await resp.json();
  const map = new Map<string, string>();
  for (const g of json.contactGroups ?? []) {
    map.set(g.resourceName, g.formattedName ?? g.name);
  }
  return map;
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

function initials(contact: Contact): string {
  const g = contact.givenName?.[0] ?? '';
  const f = contact.familyName?.[0] ?? '';
  return (g + f).toUpperCase() || contact.displayName[0].toUpperCase();
}

function avatarColor(name: string): string {
  const colors = [
    '#7C3AED', '#2563EB', '#059669', '#D97706',
    '#DC2626', '#7C3AED', '#0891B2', '#65A30D',
  ];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groupMap, setGroupMap] = useState<Map<string, string>>(new Map());
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedLabel, setSelectedLabel] = useState<string>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoadState('no_auth'); return; }
    setLoadState('loading');
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      // We need the Google OAuth access token, not the Supabase JWT.
      // It's stored in google_calendar_cache alongside the calendar data.
      const userId = sessionData.session?.user?.id;
      if (!userId) { setLoadState('no_auth'); return; }

      const supabaseJwt = sessionData.session?.access_token;
      if (!supabaseJwt) { setLoadState('no_auth'); return; }

      // Fetch the Google access token from our edge function
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-contacts-token`,
        { headers: { Authorization: `Bearer ${supabaseJwt}` } }
      );

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        if (body?.error === 'not_connected') {
          setLoadState('no_auth');
          return;
        }
        throw new Error(body?.error ?? `Token fetch failed: ${resp.status}`);
      }

      const { access_token: googleToken } = await resp.json();
      if (!googleToken) { setLoadState('no_auth'); return; }

      const [fetchedContacts, fetchedGroups] = await Promise.all([
        fetchGoogleContacts(googleToken),
        fetchContactGroups(googleToken),
      ]);

      setContacts(fetchedContacts);
      setGroupMap(fetchedGroups);
      setLoadState('loaded');
    } catch (e: any) {
      if (e?.message === 'no_contacts_scope') {
        setError('Contacts permission not granted. Go to Settings → Reconnect Google Account and approve Contacts access.');
        setLoadState('error');
      } else {
        setError(e?.message ?? 'Could not load contacts.');
        setLoadState('error');
      }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Unique user-created label names (skip system groups like "myContacts", "starred")
  const labelOptions = useMemo(() => {
    const systemPrefixes = ['contactGroups/myContacts', 'contactGroups/starred', 'contactGroups/all', 'contactGroups/friends', 'contactGroups/family', 'contactGroups/coworkers'];
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
      if (selectedLabel !== 'all' && !c.labels.includes(selectedLabel)) return false;
      if (!q) return true;
      return (
        c.displayName.toLowerCase().includes(q) ||
        c.phones.some(p => p.value.replace(/\D/g, '').includes(q.replace(/\D/g, ''))) ||
        c.emails.some(e => e.value.toLowerCase().includes(q))
      );
    });
  }, [contacts, search, selectedLabel]);

  // Group alphabetically
  const grouped = useMemo(() => {
    const map = new Map<string, Contact[]>();
    for (const c of filtered) {
      const letter = (c.familyName?.[0] ?? c.displayName[0] ?? '#').toUpperCase();
      const key = /[A-Z]/.test(letter) ? letter : '#';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // ── Loading / error states ──────────────────────────────────────────
  if (loadState === 'idle' || loadState === 'loading') {
    return (
      <section className="panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)' }}>
          <RefreshCw size={16} className="spin" />
          <span>Loading contacts from Google…</span>
        </div>
      </section>
    );
  }

  if (loadState === 'no_auth') {
    return (
      <section className="panel">
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <Users size={28} style={{ marginBottom: 10, color: 'var(--muted)' }} />
          <p style={{ margin: '0 0 8px' }}>
            Connect your Google account to see your contacts here.
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>
            Go to <strong>Settings → Reconnect Google Account</strong> and approve the Contacts permission.
          </p>
        </div>
      </section>
    );
  }

  if (loadState === 'error') {
    return (
      <section className="panel">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
          <p style={{ color: '#e5484d', margin: 0 }}>{error}</p>
          <button className="btn ghost" onClick={load}><RefreshCw size={14} /> Retry</button>
        </div>
      </section>
    );
  }

  // ── Main UI ────────────────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Contacts</h1>
          <p>Your Google Contacts — {contacts.length} total</p>
        </div>
        <div className="actions">
          <a
            href="https://contacts.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn ghost"
          >
            <ExternalLink size={14} /> Open Google Contacts
          </a>
          <button className="btn ghost" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Search + label filter */}
      <section className="panel" style={{ paddingBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              placeholder="Search name, phone, or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32, width: '100%' }}
            />
          </div>
          {labelOptions.length > 0 && (
            <select
              value={selectedLabel}
              onChange={e => setSelectedLabel(e.target.value)}
              style={{ minWidth: 140 }}
            >
              <option value="all">All contacts</option>
              {labelOptions.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          )}
        </div>
        {filtered.length !== contacts.length && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>
            Showing {filtered.length} of {contacts.length}
          </p>
        )}
      </section>

      {/* Contact list */}
      {grouped.length === 0 && (
        <section className="panel">
          <div className="brief-item">No contacts match your search.</div>
        </section>
      )}

      {grouped.map(([letter, group]) => (
        <section className="panel" key={letter} style={{ paddingBottom: 4 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--muted)',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}>
            {letter}
          </div>
          {group.map(contact => {
            const isOpen = expanded === contact.resourceName;
            const color = avatarColor(contact.displayName);
            return (
              <div key={contact.resourceName}>
                <button
                  onClick={() => setExpanded(isOpen ? null : contact.resourceName)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    padding: '8px 4px',
                    borderBottom: '1px solid var(--border, rgba(0,0,0,0.07))',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {/* Avatar */}
                  {contact.photoUrl ? (
                    <img
                      src={contact.photoUrl}
                      alt={contact.displayName}
                      style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: color,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      {initials(contact)}
                    </div>
                  )}

                  {/* Name + preview */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                      {contact.displayName}
                    </div>
                    {!isOpen && (contact.phones[0] || contact.emails[0]) && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
                        {contact.phones[0]
                          ? formatPhone(contact.phones[0].value)
                          : contact.emails[0]?.value}
                      </div>
                    )}
                  </div>

                  {/* Quick action icons */}
                  {contact.phones[0] && (
                    <a
                      href={`tel:${contact.phones[0].value}`}
                      onClick={e => e.stopPropagation()}
                      style={{ color: 'var(--muted)', padding: 4 }}
                      title={`Call ${formatPhone(contact.phones[0].value)}`}
                    >
                      <Phone size={15} />
                    </a>
                  )}
                  {contact.emails[0] && (
                    <a
                      href={`mailto:${contact.emails[0].value}`}
                      onClick={e => e.stopPropagation()}
                      style={{ color: 'var(--muted)', padding: 4 }}
                      title={`Email ${contact.emails[0].value}`}
                    >
                      <Mail size={15} />
                    </a>
                  )}
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{
                    padding: '10px 52px 14px',
                    borderBottom: '1px solid var(--border, rgba(0,0,0,0.07))',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}>
                    {contact.phones.map((ph, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <Phone size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                        <a href={`tel:${ph.value}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                          {formatPhone(ph.value)}
                        </a>
                        {ph.type && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{ph.type}</span>}
                      </div>
                    ))}
                    {contact.emails.map((em, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <Mail size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                        <a href={`mailto:${em.value}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                          {em.value}
                        </a>
                        {em.type && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{em.type}</span>}
                      </div>
                    ))}
                    {contact.phones.length === 0 && contact.emails.length === 0 && (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>No phone or email on file.</span>
                    )}
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
