import { useState, useEffect, useMemo } from 'react';
import { Phone, Mail, Clock, Plus, X, Search, Building2, User, Trash2 } from 'lucide-react';
import { supabase } from './lib/supabase';

const NAVY = '#1a2744';

interface Department {
  id: string;
  department: string;
  phone: string | null;
  email: string | null;
  hours: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface DeptContact {
  id: string;
  department_id: string;
  contact_name: string | null;
  role: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export default function PhoneDirectory() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [contacts, setContacts] = useState<Record<string, DeptContact[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openDept, setOpenDept] = useState<Department | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addMode, setAddMode] = useState<'new' | 'existing'>('new');
  const [existingDeptId, setExistingDeptId] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formHours, setFormHours] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formContactName, setFormContactName] = useState('');
  const [formContactRole, setFormContactRole] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [dr, cr] = await Promise.all([
      supabase.from('phone_directory').select('*').order('department'),
      supabase.from('phone_directory_contacts').select('*').order('contact_name'),
    ]);
    setDepartments((dr.data as Department[]) || []);
    const grouped: Record<string, DeptContact[]> = {};
    for (const c of (cr.data as DeptContact[]) || []) {
      (grouped[c.department_id] ||= []).push(c);
    }
    setContacts(grouped);
    setLoading(false);
  }

  function resetForm() {
    setAddMode('new');
    setExistingDeptId('');
    setNewDeptName('');
    setFormPhone(''); setFormEmail(''); setFormHours(''); setFormNotes('');
    setFormContactName(''); setFormContactRole('');
  }

  async function handleSave() {
    if (!supabase) return;
    setSaving(true);

    let deptId = existingDeptId;

    if (addMode === 'new') {
      if (!newDeptName.trim()) { setSaving(false); return; }
      const { data, error } = await supabase
        .from('phone_directory')
        .insert({
          department: newDeptName.trim(),
          phone: formPhone.trim() || null,
          email: formEmail.trim() || null,
          hours: formHours.trim() || null,
          notes: formNotes.trim() || null,
        })
        .select()
        .single();
      if (error || !data) { setSaving(false); return; }
      deptId = data.id;
      setDepartments((cur) => [...cur, data as Department].sort((a, b) => a.department.localeCompare(b.department)));
    } else {
      if (!deptId) { setSaving(false); return; }
      // Curate into the existing department — fill in whichever fields
      // were left blank before, and append notes rather than clobbering them.
      const dept = departments.find((d) => d.id === deptId);
      if (dept) {
        const patch: Partial<Department> = { updated_at: new Date().toISOString() };
        if (!dept.phone && formPhone.trim()) patch.phone = formPhone.trim();
        if (!dept.email && formEmail.trim()) patch.email = formEmail.trim();
        if (!dept.hours && formHours.trim()) patch.hours = formHours.trim();
        if (formNotes.trim()) patch.notes = dept.notes ? `${dept.notes}\n${formNotes.trim()}` : formNotes.trim();
        if (Object.keys(patch).length > 1) {
          await supabase.from('phone_directory').update(patch).eq('id', deptId);
          setDepartments((cur) => cur.map((d) => (d.id === deptId ? { ...d, ...patch } as Department : d)));
        }
      }
    }

    // Optional individual contact, attached either way
    if (formContactName.trim()) {
      const { data: contact } = await supabase
        .from('phone_directory_contacts')
        .insert({
          department_id: deptId,
          contact_name: formContactName.trim(),
          role: formContactRole.trim() || null,
          phone: formPhone.trim() || null,
          email: formEmail.trim() || null,
        })
        .select()
        .single();
      if (contact) {
        setContacts((cur) => ({ ...cur, [deptId]: [...(cur[deptId] || []), contact as DeptContact] }));
      }
    }

    setSaving(false);
    setShowAddForm(false);
    resetForm();
  }

  async function deleteDepartment(id: string) {
    if (!supabase) return;
    if (!window.confirm('Remove this department and all its contacts?')) return;
    await supabase.from('phone_directory').delete().eq('id', id);
    setDepartments((cur) => cur.filter((d) => d.id !== id));
    setOpenDept(null);
  }

  async function deleteContact(id: string, deptId: string) {
    if (!supabase) return;
    await supabase.from('phone_directory_contacts').delete().eq('id', id);
    setContacts((cur) => ({ ...cur, [deptId]: (cur[deptId] || []).filter((c) => c.id !== id) }));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((d) => {
      if (d.department.toLowerCase().includes(q)) return true;
      if ((d.notes || '').toLowerCase().includes(q)) return true;
      return (contacts[d.id] || []).some((c) => (c.contact_name || '').toLowerCase().includes(q) || (c.role || '').toLowerCase().includes(q));
    });
  }, [departments, contacts, search]);

  return (
    <div>
      <div className="page-header">
        <div><h1>Phone Directory</h1><p>{departments.length} departments</p></div>
        <button className="btn primary" onClick={() => { resetForm(); setShowAddForm(true); }}>
          <Plus size={14} /> Add Department/Contact
        </button>
      </div>

      <div style={{ position: 'relative', marginBottom: '1.25rem', maxWidth: 400 }}>
        <Search size={14} style={{ position: 'absolute', left: 9, top: 10, color: '#999' }} />
        <input
          placeholder="Search departments or contacts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 1.9rem', borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }}
        />
      </div>

      {loading && <p style={{ color: '#999' }}>Loading...</p>}
      {!loading && filtered.length === 0 && (
        <p style={{ color: '#999' }}>
          {departments.length === 0 ? 'No departments yet — add one to get started.' : 'Nothing matches.'}
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.9rem' }}>
        {filtered.map((dept) => {
          const contactCount = (contacts[dept.id] || []).length;
          return (
            <button
              key={dept.id}
              onClick={() => setOpenDept(dept)}
              style={{
                textAlign: 'left', border: `1px solid ${NAVY}22`, borderRadius: 10, padding: '1rem',
                background: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6,
              }}
            >
              <Building2 size={22} color={NAVY} />
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: NAVY }}>{dept.department}</h3>
              {dept.phone && <span style={{ fontSize: '0.78rem', color: '#666', display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {dept.phone}</span>}
              {contactCount > 0 && <span style={{ fontSize: '0.72rem', color: '#999' }}>{contactCount} contact{contactCount !== 1 ? 's' : ''}</span>}
            </button>
          );
        })}
      </div>

      {/* Department detail popup */}
      {openDept && (
        <div
          onClick={() => setOpenDept(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1.5rem' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'white', borderRadius: 12, padding: '1.5rem', maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <h2 style={{ margin: 0, color: NAVY, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Building2 size={22} /> {openDept.department}
              </h2>
              <button onClick={() => setOpenDept(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {openDept.phone && (
                <a href={`tel:${openDept.phone.replace(/[^\d+]/g, '')}`} style={{ display: 'flex', alignItems: 'center', gap: 8, color: NAVY, textDecoration: 'none', fontSize: '0.95rem' }}>
                  <Phone size={16} /> {openDept.phone}
                </a>
              )}
              {openDept.email && (
                <a href={`mailto:${openDept.email}`} style={{ display: 'flex', alignItems: 'center', gap: 8, color: NAVY, textDecoration: 'none', fontSize: '0.95rem' }}>
                  <Mail size={16} /> {openDept.email}
                </a>
              )}
              {openDept.hours && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#555', fontSize: '0.9rem' }}>
                  <Clock size={16} /> {openDept.hours}
                </span>
              )}
              {openDept.notes && (
                <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: '#555', whiteSpace: 'pre-wrap', background: '#f7f7f5', borderRadius: 6, padding: '0.6rem' }}>
                  {openDept.notes}
                </p>
              )}
              {!openDept.phone && !openDept.email && !openDept.hours && !openDept.notes && (
                <p style={{ color: '#999', fontSize: '0.85rem' }}>No general contact info yet.</p>
              )}
            </div>

            {(contacts[openDept.id] || []).length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <h3 style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: '#999', margin: '0 0 8px' }}>Contacts</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(contacts[openDept.id] || []).map((c) => (
                    <div key={c.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: '0.6rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600, fontSize: '0.9rem' }}><User size={13} /> {c.contact_name}</div>
                        {c.role && <div style={{ fontSize: '0.78rem', color: '#888' }}>{c.role}</div>}
                        {c.phone && <div style={{ fontSize: '0.8rem', color: '#555' }}><Phone size={11} style={{ verticalAlign: -1 }} /> {c.phone}</div>}
                        {c.email && <div style={{ fontSize: '0.8rem', color: '#555' }}><Mail size={11} style={{ verticalAlign: -1 }} /> {c.email}</div>}
                      </div>
                      <button onClick={() => deleteContact(c.id, openDept.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b' }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={() => { resetForm(); setAddMode('existing'); setExistingDeptId(openDept.id); setShowAddForm(true); setOpenDept(null); }}
                style={{ fontSize: '0.8rem', background: NAVY, color: 'white', border: 'none', borderRadius: 6, padding: '0.4rem 0.8rem', cursor: 'pointer' }}
              >
                + Add contact here
              </button>
              <button
                onClick={() => deleteDepartment(openDept.id)}
                style={{ fontSize: '0.8rem', background: 'white', color: '#c0392b', border: '1px solid #f3c6c0', borderRadius: 6, padding: '0.4rem 0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Trash2 size={12} /> Remove department
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add department/contact form */}
      {showAddForm && (
        <div
          onClick={() => setShowAddForm(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1.5rem' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'white', borderRadius: 12, padding: '1.5rem', maxWidth: 460, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: NAVY }}>Add Department / Contact</h2>
              <button onClick={() => setShowAddForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              <button
                onClick={() => setAddMode('new')}
                style={{ flex: 1, padding: '0.5rem', borderRadius: 6, border: `1px solid ${NAVY}`, background: addMode === 'new' ? NAVY : 'white', color: addMode === 'new' ? 'white' : NAVY, cursor: 'pointer', fontSize: '0.85rem' }}
              >
                New department
              </button>
              <button
                onClick={() => setAddMode('existing')}
                style={{ flex: 1, padding: '0.5rem', borderRadius: 6, border: `1px solid ${NAVY}`, background: addMode === 'existing' ? NAVY : 'white', color: addMode === 'existing' ? 'white' : NAVY, cursor: 'pointer', fontSize: '0.85rem' }}
              >
                Add to existing
              </button>
            </div>

            {addMode === 'new' ? (
              <input
                placeholder="Department name (e.g. Financial Aid)"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box', marginBottom: 10 }}
              />
            ) : (
              <select
                value={existingDeptId}
                onChange={(e) => setExistingDeptId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box', marginBottom: 10 }}
              >
                <option value="">Choose a department...</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.department}</option>)}
              </select>
            )}

            <div style={{ fontSize: '0.72rem', color: '#999', textTransform: 'uppercase', margin: '4px 0 6px' }}>
              {addMode === 'new' ? "Department's general info" : "Fill in anything the department is missing"}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input placeholder="Phone" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} style={{ flex: 1, padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} />
              <input placeholder="Email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} style={{ flex: 1, padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} />
            </div>
            <input placeholder="Hours (e.g. Mon–Fri 8am–5pm ET)" value={formHours} onChange={(e) => setFormHours(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box', marginBottom: 8 }} />
            <textarea
              placeholder="Notes — anything about how this department works, what they help with, etc."
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc', fontSize: '0.88rem', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12 }}
            />

            <div style={{ fontSize: '0.72rem', color: '#999', textTransform: 'uppercase', margin: '4px 0 6px' }}>Specific contact (optional)</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input placeholder="Name" value={formContactName} onChange={(e) => setFormContactName(e.target.value)} style={{ flex: 1, padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} />
              <input placeholder="Role/title" value={formContactRole} onChange={(e) => setFormContactRole(e.target.value)} style={{ flex: 1, padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSave}
                disabled={saving || (addMode === 'new' ? !newDeptName.trim() : !existingDeptId)}
                style={{ background: NAVY, color: 'white', border: 'none', borderRadius: 6, padding: '0.55rem 1rem', cursor: 'pointer', fontSize: '0.9rem', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setShowAddForm(false)} style={{ background: 'white', border: '1px solid #ccc', borderRadius: 6, padding: '0.55rem 1rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
