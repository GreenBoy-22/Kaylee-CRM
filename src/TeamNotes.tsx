import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { NotebookText } from 'lucide-react';
import { supabase } from './lib/supabase';

const ARMY_GREEN = '#4B5320';

const CATEGORIES = [
  { value: 'policy', label: 'Policy' },
  { value: 'sap_progression', label: 'SAP / Progression' },
  { value: 'escalation_contact', label: 'Escalation Contact' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'workflow_tip', label: 'Workflow Tip' },
  { value: 'general', label: 'General' },
];

interface TeamNote {
  id: string;
  category: string;
  title: string;
  content: string;
  source_note: string | null;
  status: string;
  created_at: string;
}

export default function TeamNotes() {
  const [notes, setNotes] = useState<TeamNote[]>([]);
  const [filter, setFilter] = useState<string>('pending');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotes();
  }, []);

  async function loadNotes() {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('team_notes')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setNotes(data as TeamNote[]);
    setLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    if (!supabase) return;
    await supabase.from('team_notes').update({ status }).eq('id', id);
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, status } : n)));
  }

  async function moveToCourseNotes(note: TeamNote) {
    if (!supabase) return;
    await supabase.from('course_notes').insert({
      course_code: 'TEAM',
      note_type: note.category,
      content: `${note.title}: ${note.content}`,
    });
    await updateStatus(note.id, 'moved_to_course_notes');
  }

  const filtered = notes.filter((n) => (filter === 'all' ? true : n.status === filter));

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '1.5rem' }}>
      <h1 style={{ color: ARMY_GREEN, fontSize: '1.5rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <NotebookText size={22} /> Team Notes
      </h1>
      <p style={{ color: '#666', marginBottom: '1rem', fontSize: '0.9rem' }}>
        Useful info pulled from Team Giraldi chat. Review each and decide where it belongs.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {['pending', 'approved', 'moved_to_course_notes', 'dismissed', 'all'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? ARMY_GREEN : 'white',
              color: filter === f ? 'white' : ARMY_GREEN,
              border: `1px solid ${ARMY_GREEN}`,
              borderRadius: 6,
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {f.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {loading && <p>Loading...</p>}
      {!loading && filtered.length === 0 && <p style={{ color: '#999' }}>Nothing here yet.</p>}

      {filtered.map((note) => (
        <div
          key={note.id}
          style={{
            padding: '1rem',
            border: '1px solid #eee',
            borderLeft: `4px solid ${ARMY_GREEN}`,
            borderRadius: 6,
            marginBottom: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: ARMY_GREEN, fontWeight: 600 }}>
              {CATEGORIES.find((c) => c.value === note.category)?.label || note.category}
            </span>
            <span style={{ fontSize: '0.7rem', color: '#999' }}>
              {new Date(note.created_at).toLocaleDateString()}
            </span>
          </div>
          <h3 style={{ margin: '0.4rem 0 0.2rem', fontSize: '1rem' }}>{note.title}</h3>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#333' }}>{note.content}</p>
          {note.source_note && (
            <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.3rem' }}>
              Source: {note.source_note}
            </p>
          )}

          {note.status === 'pending' && (
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={() => updateStatus(note.id, 'approved')} style={btnStyle(ARMY_GREEN, true)}>
                Keep as Team Note
              </button>
              <button onClick={() => moveToCourseNotes(note)} style={btnStyle(ARMY_GREEN, false)}>
                Move to Course Notes
              </button>
              <button onClick={() => updateStatus(note.id, 'dismissed')} style={btnStyle('#b00020', false)}>
                Dismiss
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function btnStyle(color: string, filled: boolean): CSSProperties {
  return {
    background: filled ? color : 'white',
    color: filled ? 'white' : color,
    border: `1px solid ${color}`,
    borderRadius: 6,
    padding: '0.35rem 0.75rem',
    fontSize: '0.8rem',
    cursor: 'pointer',
  };
}
