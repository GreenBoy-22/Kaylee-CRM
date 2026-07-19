import { useState, useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { NotebookText, Search, ChevronDown, ChevronRight, Plus, Link2 } from 'lucide-react';
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

interface PendingNote {
  id: string;
  category: string;
  title: string;
  content: string;
  source_note: string | null;
  status: string;
  created_at: string;
}

interface Topic {
  id: string;
  category: string;
  title: string;
  summary: string;
  created_at: string;
  updated_at: string;
}

interface Annotation {
  id: string;
  topic_id: string;
  content: string;
  source_person: string | null;
  source_date: string | null;
  added_manually: boolean;
  created_at: string;
}

interface CourseNoteHit {
  course_code: string;
  content: string;
}

function parseSourceNote(sourceNote: string | null): { person: string; date: string } {
  if (!sourceNote) return { person: '', date: '' };
  const [namePart, ...rest] = sourceNote.split(',');
  const dateMatch = rest.join(',').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  let date = '';
  if (dateMatch) {
    const [, m, d, y] = dateMatch;
    const year = y.length === 2 ? `20${y}` : y;
    date = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return { person: namePart.trim(), date };
}

export default function TeamNotes() {
  const [view, setView] = useState<'guide' | 'pending'>('guide');
  const [pending, setPending] = useState<PendingNote[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [annotations, setAnnotations] = useState<Record<string, Annotation[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [topicSearch, setTopicSearch] = useState('');
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [courseNoteHits, setCourseNoteHits] = useState<CourseNoteHit[]>([]);

  const [addingToTopic, setAddingToTopic] = useState<string | null>(null);
  const [manualContent, setManualContent] = useState('');
  const [manualPerson, setManualPerson] = useState('');
  const [manualDate, setManualDate] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    if (!supabase) return;
    setLoading(true);
    const [{ data: pendingData }, { data: topicData }, { data: annoData }] = await Promise.all([
      supabase.from('team_notes').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('sop_topics').select('*').order('updated_at', { ascending: false }),
      supabase.from('sop_annotations').select('*').order('created_at', { ascending: true }),
    ]);
    setPending((pendingData as PendingNote[]) || []);
    setTopics((topicData as Topic[]) || []);
    const grouped: Record<string, Annotation[]> = {};
    for (const a of (annoData as Annotation[]) || []) {
      (grouped[a.topic_id] ||= []).push(a);
    }
    setAnnotations(grouped);
    setLoading(false);
  }

  async function checkCourseNotes(query: string) {
    if (!supabase || query.trim().length < 3) { setCourseNoteHits([]); return; }
    const { data } = await supabase
      .from('course_notes')
      .select('course_code, content')
      .ilike('content', `%${query}%`)
      .limit(3);
    setCourseNoteHits((data as CourseNoteHit[]) || []);
  }

  function startResolving(note: PendingNote) {
    setResolvingId(note.id);
    setTopicSearch('');
    setNewTopicTitle(note.title);
    checkCourseNotes(note.title);
  }

  async function attachToTopic(note: PendingNote, topic: Topic) {
    if (!supabase) return;
    const { person, date } = parseSourceNote(note.source_note);
    const { data, error } = await supabase
      .from('sop_annotations')
      .insert({ topic_id: topic.id, content: note.content, source_person: person, source_date: date || null })
      .select()
      .single();
    if (error || !data) return;
    await supabase.from('sop_topics').update({ updated_at: new Date().toISOString() }).eq('id', topic.id);
    await supabase.from('team_notes').update({ status: 'attached_to_sop' }).eq('id', note.id);
    setAnnotations((cur) => ({ ...cur, [topic.id]: [...(cur[topic.id] || []), data as Annotation] }));
    setTopics((cur) => cur.map((t) => (t.id === topic.id ? { ...t, updated_at: new Date().toISOString() } : t)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    setPending((cur) => cur.filter((n) => n.id !== note.id));
    setResolvingId(null);
  }

  async function createTopicFromNote(note: PendingNote) {
    if (!supabase || !newTopicTitle.trim()) return;
    const { person, date } = parseSourceNote(note.source_note);
    const { data: topic, error } = await supabase
      .from('sop_topics')
      .insert({ category: note.category, title: newTopicTitle.trim(), summary: note.content })
      .select()
      .single();
    if (error || !topic) return;
    const { data: anno } = await supabase
      .from('sop_annotations')
      .insert({ topic_id: topic.id, content: note.content, source_person: person, source_date: date || null })
      .select()
      .single();
    await supabase.from('team_notes').update({ status: 'attached_to_sop' }).eq('id', note.id);
    setTopics((cur) => [topic as Topic, ...cur]);
    if (anno) setAnnotations((cur) => ({ ...cur, [topic.id]: [anno as Annotation] }));
    setPending((cur) => cur.filter((n) => n.id !== note.id));
    setResolvingId(null);
  }

  async function moveToCourseNotes(note: PendingNote) {
    if (!supabase) return;
    await supabase.from('course_notes').insert({ course_code: 'TEAM', note_type: note.category, content: `${note.title}: ${note.content}` });
    await supabase.from('team_notes').update({ status: 'moved_to_course_notes' }).eq('id', note.id);
    setPending((cur) => cur.filter((n) => n.id !== note.id));
  }

  async function dismissNote(id: string) {
    if (!supabase) return;
    await supabase.from('team_notes').update({ status: 'dismissed' }).eq('id', id);
    setPending((cur) => cur.filter((n) => n.id !== id));
  }

  async function addManualAnnotation(topic: Topic) {
    if (!supabase || !manualContent.trim()) return;
    const { data, error } = await supabase
      .from('sop_annotations')
      .insert({ topic_id: topic.id, content: manualContent.trim(), source_person: manualPerson.trim() || null, source_date: manualDate || null, added_manually: true })
      .select()
      .single();
    if (error || !data) return;
    await supabase.from('sop_topics').update({ updated_at: new Date().toISOString() }).eq('id', topic.id);
    setAnnotations((cur) => ({ ...cur, [topic.id]: [...(cur[topic.id] || []), data as Annotation] }));
    setManualContent(''); setManualPerson(''); setManualDate('');
    setAddingToTopic(null);
  }

  function toggleExpand(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const matchingTopics = useMemo(() => {
    if (!topicSearch.trim()) return topics;
    const q = topicSearch.toLowerCase();
    return topics.filter((t) => t.title.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q));
  }, [topics, topicSearch]);

  const visibleTopics = useMemo(() => {
    let list = topics;
    if (categoryFilter) list = list.filter((t) => t.category === categoryFilter);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      t.summary.toLowerCase().includes(q) ||
      (annotations[t.id] || []).some((a) => a.content.toLowerCase().includes(q) || (a.source_person || '').toLowerCase().includes(q))
    );
  }, [topics, search, categoryFilter, annotations]);

  return (
    <div style={{ maxWidth: 850, margin: '0 auto', padding: '1.5rem' }}>
      <h1 style={{ color: ARMY_GREEN, fontSize: '1.5rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <NotebookText size={22} /> Team SOP Guide
      </h1>
      <p style={{ color: '#666', marginBottom: '1rem', fontSize: '0.9rem' }}>
        A searchable reference built from Team Giraldi chat. New info attaches to what it's about instead of piling up as a flat list.
        Course Notes stays separate — this just checks it for overlap when you're adding something.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem' }}>
        <button
          onClick={() => setView('guide')}
          style={{ ...btnStyle(ARMY_GREEN, view === 'guide'), padding: '0.45rem 1rem' }}
        >
          SOP Guide ({topics.length})
        </button>
        <button
          onClick={() => setView('pending')}
          style={{ ...btnStyle(ARMY_GREEN, view === 'pending'), padding: '0.45rem 1rem' }}
        >
          Pending Review {pending.length > 0 ? `(${pending.length})` : ''}
        </button>
      </div>

      {loading && <p>Loading...</p>}

      {!loading && view === 'guide' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 220px' }}>
              <Search size={14} style={{ position: 'absolute', left: 9, top: 9, color: '#999' }} />
              <input
                placeholder="Search the SOP guide..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', padding: '0.45rem 0.5rem 0.45rem 1.8rem', borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }}
              />
            </div>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ padding: '0.45rem', borderRadius: 6, border: '1px solid #ccc' }}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          {visibleTopics.length === 0 && (
            <p style={{ color: '#999' }}>
              {topics.length === 0 ? 'No topics yet — resolve something from Pending Review to start the guide.' : 'Nothing matches.'}
            </p>
          )}

          {visibleTopics.map((topic) => {
            const isOpen = expanded.has(topic.id);
            const topicAnnotations = annotations[topic.id] || [];
            return (
              <div key={topic.id} style={{ border: '1px solid #eee', borderLeft: `4px solid ${ARMY_GREEN}`, borderRadius: 6, marginBottom: '0.75rem' }}>
                <button
                  onClick={() => toggleExpand(topic.id)}
                  style={{ width: '100%', textAlign: 'left', padding: '0.9rem 1rem', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
                >
                  <div>
                    <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: ARMY_GREEN, fontWeight: 700 }}>
                      {CATEGORIES.find((c) => c.value === topic.category)?.label || topic.category}
                    </span>
                    <h3 style={{ margin: '0.3rem 0 0.2rem', fontSize: '1rem' }}>{topic.title}</h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#555' }}>{topic.summary}</p>
                    {topicAnnotations.length > 0 && (
                      <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: '#999' }}>
                        {topicAnnotations.length} note{topicAnnotations.length > 1 ? 's' : ''} attached · last updated {new Date(topic.updated_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  {isOpen ? <ChevronDown size={18} color="#999" /> : <ChevronRight size={18} color="#999" />}
                </button>

                {isOpen && (
                  <div style={{ padding: '0 1rem 1rem' }}>
                    {topicAnnotations.map((a) => (
                      <div key={a.id} style={{ borderLeft: '2px solid #ddd', paddingLeft: 10, marginBottom: 8 }}>
                        <p style={{ margin: 0, fontSize: '0.85rem' }}>{a.content}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#999' }}>
                          {a.source_person || (a.added_manually ? 'Added manually' : 'Unknown source')}
                          {a.source_date ? ` · ${new Date(a.source_date).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                    ))}

                    {addingToTopic === topic.id ? (
                      <div style={{ background: '#f4f5f0', borderRadius: 6, padding: '0.6rem', marginTop: 8 }}>
                        <textarea
                          placeholder="What's the update?"
                          value={manualContent}
                          onChange={(e) => setManualContent(e.target.value)}
                          rows={2}
                          style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ccc', fontSize: '0.85rem', fontFamily: 'inherit', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <input placeholder="Who said it" value={manualPerson} onChange={(e) => setManualPerson(e.target.value)} style={{ flex: 1, padding: '0.3rem', borderRadius: 4, border: '1px solid #ccc', fontSize: '0.8rem' }} />
                          <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} style={{ padding: '0.3rem', borderRadius: 4, border: '1px solid #ccc', fontSize: '0.8rem' }} />
                          <button onClick={() => addManualAnnotation(topic)} style={btnStyle(ARMY_GREEN, true)}>Add</button>
                          <button onClick={() => setAddingToTopic(null)} style={btnStyle('#999', false)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setAddingToTopic(topic.id)} style={{ ...btnStyle(ARMY_GREEN, false), marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Plus size={13} /> Add a note to this topic
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {!loading && view === 'pending' && (
        <>
          {pending.length === 0 && <p style={{ color: '#999' }}>Nothing pending review.</p>}
          {pending.map((note) => (
            <div key={note.id} style={{ padding: '1rem', border: '1px solid #eee', borderLeft: `4px solid ${ARMY_GREEN}`, borderRadius: 6, marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: ARMY_GREEN, fontWeight: 600 }}>
                  {CATEGORIES.find((c) => c.value === note.category)?.label || note.category}
                </span>
                <span style={{ fontSize: '0.7rem', color: '#999' }}>{new Date(note.created_at).toLocaleDateString()}</span>
              </div>
              <h3 style={{ margin: '0.4rem 0 0.2rem', fontSize: '1rem' }}>{note.title}</h3>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#333' }}>{note.content}</p>
              {note.source_note && <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.3rem' }}>Source: {note.source_note}</p>}

              {resolvingId === note.id ? (
                <div style={{ marginTop: '0.75rem', background: '#f4f5f0', borderRadius: 6, padding: '0.75rem' }}>
                  <p style={{ fontSize: '0.78rem', fontWeight: 700, color: ARMY_GREEN, margin: '0 0 6px' }}>Attach to an existing topic, or create a new one:</p>
                  <input
                    placeholder="Search existing topics..."
                    value={topicSearch}
                    onChange={(e) => setTopicSearch(e.target.value)}
                    style={{ width: '100%', padding: '0.4rem', borderRadius: 4, border: '1px solid #ccc', fontSize: '0.85rem', boxSizing: 'border-box', marginBottom: 6 }}
                  />
                  {topicSearch.trim() && matchingTopics.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      {matchingTopics.slice(0, 5).map((t) => (
                        <button
                          key={t.id}
                          onClick={() => attachToTopic(note, t)}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.4rem 0.5rem', border: '1px solid #ddd', borderRadius: 4, background: 'white', marginBottom: 4, cursor: 'pointer', fontSize: '0.82rem' }}
                        >
                          <Link2 size={12} style={{ verticalAlign: -1, marginRight: 4 }} />{t.title}
                        </button>
                      ))}
                    </div>
                  )}

                  <p style={{ fontSize: '0.78rem', fontWeight: 700, color: ARMY_GREEN, margin: '10px 0 6px' }}>...or create a new topic:</p>
                  <input
                    value={newTopicTitle}
                    onChange={(e) => setNewTopicTitle(e.target.value)}
                    style={{ width: '100%', padding: '0.4rem', borderRadius: 4, border: '1px solid #ccc', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />

                  {courseNoteHits.length > 0 && (
                    <p style={{ fontSize: '0.72rem', color: '#a66', marginTop: 8 }}>
                      Heads up — Course Notes already has {courseNoteHits.length} entr{courseNoteHits.length > 1 ? 'ies' : 'y'} that might overlap ({courseNoteHits.map((h) => h.course_code).join(', ')}). Staying separate is fine, just worth a glance.
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button onClick={() => createTopicFromNote(note)} style={btnStyle(ARMY_GREEN, true)}>Create New Topic</button>
                    <button onClick={() => setResolvingId(null)} style={btnStyle('#999', false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button onClick={() => startResolving(note)} style={btnStyle(ARMY_GREEN, true)}>Add to SOP Guide</button>
                  <button onClick={() => moveToCourseNotes(note)} style={btnStyle(ARMY_GREEN, false)}>Move to Course Notes</button>
                  <button onClick={() => dismissNote(note.id)} style={btnStyle('#b00020', false)}>Dismiss</button>
                </div>
              )}
            </div>
          ))}
        </>
      )}
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
