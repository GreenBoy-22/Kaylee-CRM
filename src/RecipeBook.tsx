import { useState, useEffect, useMemo } from 'react';
import { Search, Star, Heart, Clock, Users, ChefHat, X } from 'lucide-react';
import { supabase } from './lib/supabase';

const ARMY_GREEN = '#4B5320';

interface RecipeFeedback {
  id: string;
  recipe_id: string;
  reviewer_name: string;
  rating: number | null;
  comment: string | null;
  cooked_date: string;
  created_at: string;
}

interface Recipe {
  id: string;
  recipe_keeper_id: string | null;
  title: string;
  course: string | null;
  category: string | null;
  collection: string | null;
  source: string | null;
  servings: string | null;
  prep_time_iso: string | null;
  cook_time_iso: string | null;
  ingredients: string[];
  instructions: string[];
  notes: string | null;
  rating: number;
  is_favorite: boolean;
  photo_filenames: string[];
}

// Parses ISO 8601 durations like "PT35M", "PT1H30M", "PT0S" into "35 min" etc.
function humanDuration(iso: string | null): string {
  if (!iso) return '';
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '';
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  if (h === 0 && m === 0) return '';
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ''}`.trim() : `${m} min`;
}

export default function RecipeBook() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [feedback, setFeedback] = useState<RecipeFeedback[]>([]);
  const [showTextComposer, setShowTextComposer] = useState(false);
  const [textMessage, setTextMessage] = useState('');
  const [fbName, setFbName] = useState('');
  const [fbRating, setFbRating] = useState(0);
  const [fbComment, setFbComment] = useState('');

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (selected) {
      loadFeedback(selected.id);
      setTextMessage(`Hey! I made ${selected.title} tonight \u{1F37D}\uFE0F Would love to know what you thought — rate it 1-5 and let me know any feedback whenever you get a sec!`);
      setShowTextComposer(false);
      setFbName(''); setFbRating(0); setFbComment('');
    } else {
      setFeedback([]);
    }
  }, [selected?.id]);

  async function loadFeedback(recipeId: string) {
    if (!supabase) return;
    const { data } = await supabase
      .from('recipe_feedback')
      .select('*')
      .eq('recipe_id', recipeId)
      .order('created_at', { ascending: false });
    setFeedback((data as RecipeFeedback[]) || []);
  }

  async function submitFeedback() {
    if (!selected || !fbName.trim() || !supabase) return;
    const { data, error } = await supabase
      .from('recipe_feedback')
      .insert({ recipe_id: selected.id, reviewer_name: fbName.trim(), rating: fbRating || null, comment: fbComment.trim() || null })
      .select()
      .single();
    if (error || !data) return;
    setFeedback((current) => [data as RecipeFeedback, ...current]);
    setFbName(''); setFbRating(0); setFbComment('');
  }

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.from('recipes').select('*').order('title', { ascending: true });
    setRecipes((data as Recipe[]) || []);
    setLoading(false);
  }

  async function toggleFavorite(recipe: Recipe) {
    const next = !recipe.is_favorite;
    setRecipes((current) => current.map((r) => (r.id === recipe.id ? { ...r, is_favorite: next } : r)));
    if (selected?.id === recipe.id) setSelected({ ...recipe, is_favorite: next });
    if (!supabase) return;
    await supabase.from('recipes').update({ is_favorite: next, updated_at: new Date().toISOString() }).eq('id', recipe.id);
  }

  async function setRating(recipe: Recipe, rating: number) {
    setRecipes((current) => current.map((r) => (r.id === recipe.id ? { ...r, rating } : r)));
    if (selected?.id === recipe.id) setSelected({ ...recipe, rating });
    if (!supabase) return;
    await supabase.from('recipes').update({ rating, updated_at: new Date().toISOString() }).eq('id', recipe.id);
  }

  const courses = useMemo(() => {
    const set = new Set(recipes.map((r) => r.course).filter((c): c is string => !!c && c.trim() !== ''));
    return Array.from(set).sort();
  }, [recipes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipes.filter((r) => {
      if (favoritesOnly && !r.is_favorite) return false;
      if (courseFilter && r.course !== courseFilter) return false;
      if (!q) return true;
      const inTitle = r.title.toLowerCase().includes(q);
      const inIngredients = r.ingredients.some((i) => i.toLowerCase().includes(q));
      return inTitle || inIngredients;
    });
  }, [recipes, search, courseFilter, favoritesOnly]);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>
      <h1 style={{ color: ARMY_GREEN, fontSize: '1.5rem', margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
        <ChefHat size={22} /> Recipe Book
      </h1>
      <p style={{ color: '#666', fontSize: '0.9rem', margin: '0 0 1rem' }}>
        {recipes.length} recipes imported from Recipe Keeper.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#999' }} />
          <input
            placeholder="Search by name or ingredient..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2rem', borderRadius: 8, border: '1px solid #ccc' }}
          />
        </div>
        {courses.length > 0 && (
          <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} style={{ padding: '0.5rem', borderRadius: 8, border: '1px solid #ccc' }}>
            <option value="">All courses</option>
            {courses.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <button
          onClick={() => setFavoritesOnly((f) => !f)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.8rem', borderRadius: 8,
            border: `1px solid ${favoritesOnly ? '#c0392b' : '#ccc'}`,
            background: favoritesOnly ? '#fdecea' : 'white', color: favoritesOnly ? '#c0392b' : '#555', cursor: 'pointer',
          }}
        >
          <Heart size={14} fill={favoritesOnly ? '#c0392b' : 'none'} /> Favorites
        </button>
      </div>

      {loading && <p>Loading...</p>}
      {!loading && filtered.length === 0 && <p style={{ color: '#999' }}>No recipes match.</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.9rem' }}>
        {filtered.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelected(r)}
            style={{
              textAlign: 'left', border: '1px solid #e5e5e5', borderRadius: 10, padding: '0.9rem',
              background: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <strong style={{ fontSize: '0.95rem', lineHeight: 1.3 }}>{r.title}</strong>
              {r.is_favorite && <Heart size={14} fill="#c0392b" color="#c0392b" style={{ flexShrink: 0, marginLeft: 6 }} />}
            </div>
            {r.course && <span style={{ fontSize: '0.72rem', color: ARMY_GREEN, fontWeight: 700, textTransform: 'uppercase' }}>{r.course}</span>}
            <div style={{ fontSize: '0.78rem', color: '#888', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {r.servings && <span><Users size={11} style={{ verticalAlign: -1 }} /> {r.servings}</span>}
              {humanDuration(r.cook_time_iso) && <span><Clock size={11} style={{ verticalAlign: -1 }} /> {humanDuration(r.cook_time_iso)}</span>}
            </div>
            {r.rating > 0 && (
              <div style={{ display: 'flex', gap: 1 }}>
                {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={12} fill={n <= r.rating ? '#d4a017' : 'none'} color="#d4a017" />)}
              </div>
            )}
          </button>
        ))}
      </div>

      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1.5rem' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'white', borderRadius: 12, maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '1.5rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h2 style={{ margin: '0 0 0.4rem', color: ARMY_GREEN }}>{selected.title}</h2>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.85rem', color: '#666', marginBottom: 10 }}>
              {selected.course && <span>{selected.course}</span>}
              {selected.servings && <span><Users size={13} style={{ verticalAlign: -2 }} /> Serves {selected.servings}</span>}
              {humanDuration(selected.prep_time_iso) && <span>Prep: {humanDuration(selected.prep_time_iso)}</span>}
              {humanDuration(selected.cook_time_iso) && <span>Cook: {humanDuration(selected.cook_time_iso)}</span>}
              {selected.source && <span>Source: {selected.source}</span>}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <button onClick={() => toggleFavorite(selected)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Heart size={16} fill={selected.is_favorite ? '#c0392b' : 'none'} color="#c0392b" />
                <span style={{ fontSize: '0.8rem', color: '#c0392b' }}>{selected.is_favorite ? 'Favorited' : 'Add to favorites'}</span>
              </button>
              <div style={{ display: 'flex', gap: 2 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setRating(selected, n === selected.rating ? 0 : n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <Star size={16} fill={n <= selected.rating ? '#d4a017' : 'none'} color="#d4a017" />
                  </button>
                ))}
              </div>
            </div>

            <h3 style={{ fontSize: '0.9rem', color: ARMY_GREEN, marginBottom: 6 }}>Ingredients</h3>
            <ul style={{ margin: '0 0 1rem', paddingLeft: 18, fontSize: '0.88rem' }}>
              {selected.ingredients.map((ing, i) => <li key={i} style={{ marginBottom: 3 }}>{ing}</li>)}
            </ul>

            <h3 style={{ fontSize: '0.9rem', color: ARMY_GREEN, marginBottom: 6 }}>Directions</h3>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: '0.88rem' }}>
              {selected.instructions.map((step, i) => <li key={i} style={{ marginBottom: 8 }}>{step}</li>)}
            </ol>

            {selected.notes && (
              <>
                <h3 style={{ fontSize: '0.9rem', color: ARMY_GREEN, marginTop: '1rem', marginBottom: 6 }}>Notes</h3>
                <p style={{ fontSize: '0.85rem', color: '#555' }}>{selected.notes}</p>
              </>
            )}

            <hr style={{ margin: '1.2rem 0', border: 'none', borderTop: '1px solid #eee' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ fontSize: '0.95rem', color: ARMY_GREEN, margin: 0 }}>
                Family Feedback {feedback.length > 0 && (() => {
                  const rated = feedback.filter((f) => f.rating);
                  if (!rated.length) return '';
                  const avg = rated.reduce((s, f) => s + (f.rating || 0), 0) / rated.length;
                  return `— avg ${avg.toFixed(1)}/5 (${rated.length})`;
                })()}
              </h3>
              <button
                onClick={() => setShowTextComposer((v) => !v)}
                style={{ fontSize: '0.8rem', background: ARMY_GREEN, color: 'white', border: 'none', borderRadius: 6, padding: '0.4rem 0.75rem', cursor: 'pointer' }}
              >
                Ask for feedback
              </button>
            </div>

            {showTextComposer && (
              <div style={{ background: '#f4f5f0', borderRadius: 8, padding: '0.75rem', marginBottom: 12 }}>
                <textarea
                  value={textMessage}
                  onChange={(e) => setTextMessage(e.target.value)}
                  rows={3}
                  style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc', fontSize: '0.85rem', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <a
                    href={`sms:?body=${encodeURIComponent(textMessage)}`}
                    style={{ fontSize: '0.8rem', background: '#25D366', color: 'white', border: 'none', borderRadius: 6, padding: '0.4rem 0.75rem', textDecoration: 'none' }}
                  >
                    Open in Messages
                  </a>
                  <button
                    onClick={() => navigator.clipboard.writeText(textMessage)}
                    style={{ fontSize: '0.8rem', background: 'white', border: '1px solid #ccc', borderRadius: 6, padding: '0.4rem 0.75rem', cursor: 'pointer' }}
                  >
                    Copy text
                  </button>
                </div>
                <p style={{ fontSize: '0.72rem', color: '#888', margin: '6px 0 0' }}>
                  "Open in Messages" pre-fills this text in your phone's messaging app — you'll still pick who to send it to.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                placeholder="Name"
                value={fbName}
                onChange={(e) => setFbName(e.target.value)}
                style={{ flex: '1 1 100px', padding: '0.4rem 0.5rem', borderRadius: 6, border: '1px solid #ccc', fontSize: '0.85rem' }}
              />
              <div style={{ display: 'flex', gap: 1 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setFbRating(n === fbRating ? 0 : n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <Star size={16} fill={n <= fbRating ? '#d4a017' : 'none'} color="#d4a017" />
                  </button>
                ))}
              </div>
              <input
                placeholder="Comment (optional)"
                value={fbComment}
                onChange={(e) => setFbComment(e.target.value)}
                style={{ flex: '2 1 160px', padding: '0.4rem 0.5rem', borderRadius: 6, border: '1px solid #ccc', fontSize: '0.85rem' }}
              />
              <button
                onClick={submitFeedback}
                disabled={!fbName.trim()}
                style={{ background: ARMY_GREEN, color: 'white', border: 'none', borderRadius: 6, padding: '0.4rem 0.75rem', fontSize: '0.8rem', cursor: 'pointer', opacity: fbName.trim() ? 1 : 0.5 }}
              >
                Log it
              </button>
            </div>

            {feedback.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {feedback.map((f) => (
                  <div key={f.id} style={{ fontSize: '0.85rem', padding: '6px 8px', background: '#fafafa', borderRadius: 6 }}>
                    <strong>{f.reviewer_name}</strong>
                    {f.rating ? (
                      <span style={{ marginLeft: 6 }}>
                        {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={11} fill={n <= f.rating! ? '#d4a017' : 'none'} color="#d4a017" style={{ verticalAlign: -1 }} />)}
                      </span>
                    ) : null}
                    <span style={{ color: '#999', fontSize: '0.72rem', marginLeft: 6 }}>{new Date(f.cooked_date).toLocaleDateString()}</span>
                    {f.comment && <p style={{ margin: '2px 0 0', color: '#555' }}>{f.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
