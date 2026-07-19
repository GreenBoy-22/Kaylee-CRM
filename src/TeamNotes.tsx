import { useState, useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { NotebookText, Search, Folder, X, Plus, Link2 } from 'lucide-react';
import { supabase } from './lib/supabase';

const ARMY_GREEN = '#4B5320';
const GOLD = '#d4a017';

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

function AnnotationBody({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => l.trim());
  const isBulleted = lines.length > 1 && lines.some((l) => l.trim().startsWith('\u2022'));
  const isNumbered = lines.length > 1 && lines.filter((l) => /^\d+\.\s/.test(l.trim())).length >= 2;

  if (isNumbered) {
    const intro = /^\d+\.\s/.test(lines[0].trim()) ? null : lines[0];
    const steps = lines.filter((l) => /^\d+\.\s/.test(l.trim()));
    return (
      <>
        {intro && <p style={{ margin: '0 0 4px', fontSize: '0.85rem', color: '#555' }}>{intro}</p>}
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: '0.87rem', color: '#333' }}>
          {steps.map((s, i) => (
            <li key={i} style={{ marginBottom: 3 }}>{s.replace(/^\d+\.\s*/, '')}</li>
          ))}
        </ol>
      </>
    );
  }

  if (isBulleted) {
    const intro = lines[0].trim().startsWith('\u2022') ? null : lines[0];
    const bullets = lines.filter((l) => l.trim().startsWith('\u2022'));
    return (
      <>
        {intro && <p style={{ margin: '0 0 4px', fontSize: '0.85rem', color: '#555' }}>{intro}</p>}
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.87rem', color: '#333' }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ marginBottom: 3 }}>{b.replace(/^\u2022\s*/, '')}</li>
          ))}
        </ul>
      </>
    );
  }

  // No explicit bullets in the source text — for anything longer than a
  // single quick fact, auto-break it into sentence-level bullets so dense
  // paragraphs still read as a scannable list instead of a wall of text.
  const sentences = (text.match(/[^.!?]+[.!?]+(\s+|$)/g) || [])
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length > 1) {
    return (
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.87rem', color: '#333' }}>
        {sentences.map((s, i) => (
          <li key={i} style={{ marginBottom: 3 }}>{s}</li>
        ))}
      </ul>
    );
  }

  return <p style={{ margin: 0, fontSize: '0.87rem', color: '#333' }}>{text}</p>;
}

export default function TeamNotes() {
  const [view, setView] = useState<'guide' | 'pending'>('guide');
  const [pending, setPending] = useState<PendingNote[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [annotations, setAnnotations] = useState<Record<string, Annotation[]>>({});
  const [openTopic, setOpenTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [topicSearch, setTopicSearch] = useState('');
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [courseNoteHits, setCourseNoteHits] = useState<CourseNoteHit[]>([]);

  const [addingNote, setAddingNote] = useState(false);
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
    setAddingNote(false);
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
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem' }}>
      <h1 style={{ color: ARMY_GREEN, fontSize: '1.5rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <NotebookText size={22} /> Team SOP Guide
      </h1>
      <p style={{ color: '#666', marginBottom: '1rem', fontSize: '0.9rem' }}>
        A searchable reference built from Team Giraldi chat. New info attaches to what it's about instead of piling up as a flat list.
        Course Notes stays separate — this just checks it for overlap when you're adding something.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem' }}>
        <button onClick={() => setView('guide')} style={{ ...tabStyle(ARMY_GREEN, view === 'guide') }}>
          SOP Guide ({topics.length})
        </button>
        <button onClick={() => setView('pending')} style={{ ...tabStyle(ARMY_GREEN, view === 'pending') }}>
          Pending Review {pending.length > 0 ? `(${pending.length})` : ''}
        </button>
      </div>

      {loading && <p>Loading...</p>}

      {!loading && view === 'guide' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.9rem' }}>
            {visibleTopics.map((topic) => {
              const count = (annotations[topic.id] || []).length;
              return (
                <button
                  key={topic.id}
                  onClick={() => setOpenTopic(topic)}
                  style={{
                    textAlign: 'left', border: '1px solid #e2ddd0', borderRadius: 10, padding: '1rem',
                    background: '#fdfbf6', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8,
                    transition: 'box-shadow 0.15s, transform 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                >
                  <Folder size={26} color={GOLD} fill={GOLD} fillOpacity={0.15} />
                  <div>
                    <span style={{ fontSize: '0.66rem', textTransform: 'uppercase', color: ARMY_GREEN, fontWeight: 700, letterSpacing: 0.3 }}>
                      {CATEGORIES.find((c) => c.value === topic.category)?.label || topic.category}
                    </span>
                    <h3 style={{ margin: '0.25rem 0 0', fontSize: '0.95rem', lineHeight: 1.3 }}>{topic.title}</h3>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#999', marginTop: 'auto' }}>
                    {count} note{count !== 1 ? 's' : ''}
                  </span>
                </button>
              );
            })}
          </div>
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

      {openTopic && (
        <div
          onClick={() => { setOpenTopic(null); setAddingNote(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1.5rem' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'white', borderRadius: 14, maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
          >
            <div style={{ background: ARMY_GREEN, color: 'white', padding: '1rem 1.25rem', borderRadius: '14px 14px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: GOLD, fontWeight: 700 }}>
                  {CATEGORIES.find((c) => c.value === openTopic.category)?.label || openTopic.category}
                </span>
                <h2 style={{ margin: '0.2rem 0 0', fontSize: '1.15rem' }}>{openTopic.title}</h2>
              </div>
              <button onClick={() => { setOpenTopic(null); setAddingNote(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.1rem 1.25rem' }}>
              <p style={{ fontSize: '0.9rem', color: '#444', margin: '0 0 1rem' }}>{openTopic.summary}</p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p style={{ fontSize: '0.75rem', color: '#999', margin: 0, fontWeight: 700, textTransform: 'uppercase' }}>Notes</p>
                {!addingNote && (
                  <button onClick={() => setAddingNote(true)} style={{ ...btnStyle(ARMY_GREEN, false), display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={13} /> Add a note
                  </button>
                )}
              </div>

              {addingNote && (
                <div style={{ background: '#f4f5f0', borderRadius: 8, padding: '0.75rem', marginBottom: 12 }}>
                  <textarea
                    placeholder="What's the update?"
                    value={manualContent}
                    onChange={(e) => setManualContent(e.target.value)}
                    rows={3}
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc', fontSize: '0.85rem', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <input placeholder="Who said it" value={manualPerson} onChange={(e) => setManualPerson(e.target.value)} style={{ flex: 1, padding: '0.35rem 0.5rem', borderRadius: 4, border: '1px solid #ccc', fontSize: '0.82rem' }} />
                    <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} style={{ padding: '0.35rem 0.5rem', borderRadius: 4, border: '1px solid #ccc', fontSize: '0.82rem' }} />
                    <button onClick={() => addManualAnnotation(openTopic)} style={btnStyle(ARMY_GREEN, true)}>Add</button>
                    <button onClick={() => setAddingNote(false)} style={btnStyle('#999', false)}>Cancel</button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(annotations[openTopic.id] || []).map((a) => (
                  <div key={a.id} style={{ borderLeft: `3px solid ${GOLD}`, paddingLeft: 12 }}>
                    <AnnotationBody text={a.content} />
                    <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#aaa' }}>
                      {a.source_person || (a.added_manually ? 'Added manually' : 'Unknown source')}
                      {a.source_date ? ` · ${new Date(a.source_date).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                ))}
                {(annotations[openTopic.id] || []).length === 0 && !addingNote && (
                  <p style={{ color: '#999', fontSize: '0.85rem' }}>No notes on this yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function tabStyle(color: string, active: boolean): CSSProperties {
  return {
    background: active ? color : 'white',
    color: active ? 'white' : color,
    border: `1px solid ${color}`,
    borderRadius: 8,
    padding: '0.45rem 1rem',
    fontSize: '0.85rem',
    cursor: 'pointer',
    fontWeight: 600,
  };
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
