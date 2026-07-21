import { useState, useEffect, useMemo } from 'react';
import { Search, Star, Heart, Clock, Users, ChefHat, X, Sparkles, ShoppingCart, Check } from 'lucide-react';
import { supabase } from './lib/supabase';
import { addGroceryItems } from './lib/groceryList';

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

// Strips the leading quantity/unit off an ingredient line so it reads
// better as a grocery list item and matches more cleanly — e.g.
// "2 cups all-purpose flour" becomes "all-purpose flour". Falls back to
// the original line if nothing obvious to strip.
function groceryNameFromIngredientLine(line: string): string {
  const cleaned = line
    .replace(/^[\d\s./½¼¾⅓⅔-]+/, '') // leading numbers/fractions
    .replace(/^(cups?|tbsp|tbs|tsp|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|cans?|jars?|cloves?|packages?|pkg|pinch(es)?|large|small|medium)\b\.?\s*/i, '')
    .trim();
  return cleaned || line.trim();
}

const INGREDIENT_STOPWORDS = new Set([
  'to', 'taste', 'and', 'or', 'of', 'a', 'an', 'the', 'for', 'with',
  'fresh', 'freshly', 'halved', 'diced', 'chopped', 'sliced', 'minced',
  'grated', 'shredded', 'crushed', 'peeled', 'cooked', 'raw',
  'large', 'small', 'medium', 'extra', 'virgin', 'organic', 'optional',
]);

// Pulls out the meaningful words from a phrase — lowercased, punctuation
// stripped, short/filler words dropped — so two differently-worded names
// ("Kirkland Extra Virgin Olive Oil" vs "olive oil") can still be
// compared for real overlap instead of needing an exact substring match.
function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !INGREDIENT_STOPWORDS.has(w));
}

// Loosely matches a free-text ingredient line against an inventory item's
// name. Inventory names are often branded/specific ("Kirkland Extra
// Virgin Olive Oil") while ingredient lines are generic ("2 tbs olive
// oil"), so a plain "does the line contain the full item name" check
// misses almost everything in practice. This checks, in order: a direct
// substring match either direction, then falls back to real word overlap
// between the two (ignoring units/qualifiers/stopwords) — e.g. both
// mentioning "chicken" or "basil" is enough to count as a match.
function ingredientMatchesInventoryName(ingredientLine: string, invName: string): boolean {
  const name = invName.trim().toLowerCase();
  if (name.length < 3) return false; // too short to match reliably (e.g. "oz")
  const core = groceryNameFromIngredientLine(ingredientLine).toLowerCase();
  const lineLower = ingredientLine.toLowerCase();

  if (lineLower.includes(name) || name.includes(core)) return true;

  const ingredientWords = new Set(significantWords(core));
  if (ingredientWords.size === 0) return false;
  return significantWords(name).some((w) => ingredientWords.has(w));
}

interface IngredientMatch {
  matched: string[];
  missing: string[];
}

function matchRecipeAgainstInventory(recipe: Recipe, inStockNames: string[]): IngredientMatch {
  const matched: string[] = [];
  const missing: string[] = [];
  for (const line of recipe.ingredients) {
    const hasMatch = inStockNames.some((n) => ingredientMatchesInventoryName(line, n));
    if (hasMatch) matched.push(line);
    else missing.push(line);
  }
  return { matched, missing };
}

export default function RecipeBook({ initialRecipeId, inventory = [] }: { initialRecipeId?: string | null; inventory?: { name: string; quantity: number }[] }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [cookWhatIHaveOpen, setCookWhatIHaveOpen] = useState(false);
  const [addingToGrocery, setAddingToGrocery] = useState(false);
  const [groceryAddedMsg, setGroceryAddedMsg] = useState('');
  const [feedback, setFeedback] = useState<RecipeFeedback[]>([]);
  const [showTextComposer, setShowTextComposer] = useState(false);
  const [textMessage, setTextMessage] = useState('');
  const [fbName, setFbName] = useState('');
  const [fbRating, setFbRating] = useState(0);
  const [fbComment, setFbComment] = useState('');
  const [pushSending, setPushSending] = useState(false);
  const [pushResult, setPushResult] = useState('');

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (selected) {
      loadFeedback(selected.id);
      setTextMessage(`Hey! I made ${selected.title} tonight \u{1F37D}\uFE0F Would love to know what you thought — rate it here: https://kaylee-crm.vercel.app/rate/${selected.id}`);
      setShowTextComposer(false);
      setFbName(''); setFbRating(0); setFbComment('');
      setGroceryAddedMsg('');
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

  async function sendPushRequest(recipe: Recipe) {
    if (!supabase) return;
    setPushSending(true);
    setPushResult('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const myId = sessionData?.session?.user?.id;
      const { data: otherUsers } = await supabase.from('users').select('id, name').neq('id', myId || '');
      if (!otherUsers || otherUsers.length === 0) {
        setPushResult('No other Hub users to notify.');
        setPushSending(false);
        return;
      }
      const deepLink = `/?recipe=${recipe.id}`;
      let totalSent = 0;
      for (const u of otherUsers) {
        const { data: result, error } = await supabase.functions.invoke('send-push-notifications', {
          body: {
            user_id: u.id,
            title: `Rate ${recipe.title}!`,
            body: 'Kaylee made this and wants to know what you thought — tap to rate it.',
            url: deepLink,
          },
        });
        if (!error && result?.sent) totalSent += result.sent;
      }
      setPushResult(
        totalSent > 0
          ? `Notification sent to ${totalSent} device${totalSent > 1 ? 's' : ''}.`
          : "Nobody has notifications turned on yet — they'll need to enable push notifications in the Hub first."
      );
    } catch {
      setPushResult('Could not send — try again in a moment.');
    }
    setPushSending(false);
  }

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.from('recipes').select('*').order('title', { ascending: true });
    const loaded = (data as Recipe[]) || [];
    setRecipes(loaded);
    setLoading(false);
    if (initialRecipeId) {
      const match = loaded.find((r) => r.id === initialRecipeId);
      if (match) setSelected(match);
    }
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

  const inStockNames = useMemo(
    () => inventory.filter((i) => i.quantity > 0).map((i) => i.name),
    [inventory]
  );

  async function addMissingToGroceryList(recipe: Recipe) {
    const { missing } = matchRecipeAgainstInventory(recipe, inStockNames);
    if (missing.length === 0) {
      setGroceryAddedMsg("You've already got everything for this one!");
      return;
    }
    setAddingToGrocery(true);
    const result = await addGroceryItems(
      missing.map((line) => ({
        name: groceryNameFromIngredientLine(line),
        note: line,
        source: 'recipe',
        source_label: recipe.title,
      }))
    );
    setAddingToGrocery(false);
    setGroceryAddedMsg(
      result.added > 0
        ? `Added ${result.added} item${result.added !== 1 ? 's' : ''} to the grocery list${result.skipped > 0 ? ` (${result.skipped} already on it)` : ''}.`
        : "Everything's already on the grocery list."
    );
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
      if (minRating > 0 && r.rating < minRating) return false;
      if (!q) return true;
      const inTitle = r.title.toLowerCase().includes(q);
      const inIngredients = r.ingredients.some((i) => i.toLowerCase().includes(q));
      return inTitle || inIngredients;
    });
  }, [recipes, search, courseFilter, favoritesOnly, minRating]);

  // "Cook What I Have" — scans every recipe with at least one ingredient
  // and finds whichever has the most ingredient lines matched against
  // what's currently in stock. Ties broken by highest match ratio (so a
  // 5-ingredient recipe that's fully covered beats a 20-ingredient recipe
  // that happens to share the same raw count).
  const cookWhatIHaveResult = useMemo(() => {
    if (!cookWhatIHaveOpen || inStockNames.length === 0) return null;
    let best: { recipe: Recipe; match: IngredientMatch } | null = null;
    for (const r of recipes) {
      if (r.ingredients.length === 0) continue;
      const match = matchRecipeAgainstInventory(r, inStockNames);
      if (match.matched.length === 0) continue;
      if (!best) { best = { recipe: r, match }; continue; }
      const bestRatio = best.match.matched.length / best.recipe.ingredients.length;
      const thisRatio = match.matched.length / r.ingredients.length;
      if (
        match.matched.length > best.match.matched.length ||
        (match.matched.length === best.match.matched.length && thisRatio > bestRatio)
      ) {
        best = { recipe: r, match };
      }
    }
    return best;
  }, [cookWhatIHaveOpen, recipes, inStockNames]);

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
        <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} style={{ padding: '0.5rem', borderRadius: 8, border: '1px solid #ccc' }}>
          <option value={0}>Any rating</option>
          <option value={5}>★★★★★ only</option>
          <option value={4}>★★★★+ and up</option>
          <option value={3}>★★★+ and up</option>
          <option value={2}>★★+ and up</option>
          <option value={1}>★+ and up</option>
        </select>
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
        <button
          onClick={() => setCookWhatIHaveOpen(true)}
          disabled={inStockNames.length === 0}
          title={inStockNames.length === 0 ? 'No inventory items in stock to match against' : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.8rem', borderRadius: 8,
            border: `1px solid ${ARMY_GREEN}`, background: ARMY_GREEN, color: 'white', cursor: 'pointer',
            opacity: inStockNames.length === 0 ? 0.5 : 1,
          }}
        >
          <Sparkles size={14} /> Cook What I Have
        </button>
      </div>

      {cookWhatIHaveOpen && (
        <div style={{ border: `2px solid ${ARMY_GREEN}`, borderRadius: 12, padding: '1rem 1.1rem', marginBottom: '1.25rem', background: '#f4f5f0' }}>
          {!cookWhatIHaveResult ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
                No recipe matched anything currently in stock — try restocking a few staples first.
              </p>
              <button onClick={() => setCookWhatIHaveOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: ARMY_GREEN, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={14} /> Best match for what's on hand
                  </div>
                  <h3 style={{ margin: '4px 0 2px', fontSize: '1.1rem' }}>{cookWhatIHaveResult.recipe.title}</h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#555' }}>
                    You have {cookWhatIHaveResult.match.matched.length} of {cookWhatIHaveResult.recipe.ingredients.length} ingredients already.
                  </p>
                </div>
                <button onClick={() => setCookWhatIHaveOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
              </div>

              {cookWhatIHaveResult.match.missing.length > 0 && (
                <div style={{ fontSize: '0.82rem', color: '#666', marginBottom: 10 }}>
                  Still need: {cookWhatIHaveResult.match.missing.map(groceryNameFromIngredientLine).join(', ')}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => { setSelected(cookWhatIHaveResult.recipe); }}
                  style={{ background: ARMY_GREEN, color: 'white', border: 'none', borderRadius: 6, padding: '0.5rem 0.9rem', fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  View recipe
                </button>
                {cookWhatIHaveResult.match.missing.length > 0 && (
                  <button
                    onClick={() => addMissingToGroceryList(cookWhatIHaveResult.recipe)}
                    disabled={addingToGrocery}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'white', border: `1px solid ${ARMY_GREEN}`, color: ARMY_GREEN, borderRadius: 6, padding: '0.5rem 0.9rem', fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    <ShoppingCart size={14} /> Add missing to Grocery List
                  </button>
                )}
              </div>
              {groceryAddedMsg && <p style={{ fontSize: '0.8rem', color: ARMY_GREEN, margin: '8px 0 0' }}>{groceryAddedMsg}</p>}
            </>
          )}
        </div>
      )}

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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ fontSize: '0.9rem', color: ARMY_GREEN, margin: 0 }}>Ingredients</h3>
              {inStockNames.length > 0 && (
                <button
                  onClick={() => addMissingToGroceryList(selected)}
                  disabled={addingToGrocery}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'white', border: `1px solid ${ARMY_GREEN}`, color: ARMY_GREEN, borderRadius: 6, padding: '0.3rem 0.65rem', fontSize: '0.75rem', cursor: 'pointer' }}
                >
                  <ShoppingCart size={12} /> Add missing to Grocery List
                </button>
              )}
            </div>
            <ul style={{ margin: '0 0 4px', paddingLeft: 2, fontSize: '0.88rem', listStyle: 'none' }}>
              {selected.ingredients.map((ing, i) => {
                const have = inStockNames.length > 0 && inStockNames.some((n) => ingredientMatchesInventoryName(ing, n));
                return (
                  <li key={i} style={{ marginBottom: 4, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    {inStockNames.length > 0 && (
                      have
                        ? <Check size={14} style={{ color: ARMY_GREEN, flexShrink: 0, marginTop: 2 }} />
                        : <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #ccc', flexShrink: 0, marginTop: 2 }} />
                    )}
                    <span style={{ color: have ? '#222' : inStockNames.length > 0 ? '#999' : '#222' }}>{ing}</span>
                  </li>
                );
              })}
            </ul>
            {groceryAddedMsg && <p style={{ fontSize: '0.78rem', color: ARMY_GREEN, margin: '0 0 1rem' }}>{groceryAddedMsg}</p>}
            {!groceryAddedMsg && <div style={{ marginBottom: '1rem' }} />}

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
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => sendPushRequest(selected)}
                  disabled={pushSending}
                  style={{ fontSize: '0.8rem', background: '#534AB7', color: 'white', border: 'none', borderRadius: 6, padding: '0.4rem 0.75rem', cursor: 'pointer' }}
                >
                  {pushSending ? 'Sending...' : 'Send push notification'}
                </button>
                <button
                  onClick={() => setShowTextComposer((v) => !v)}
                  style={{ fontSize: '0.8rem', background: ARMY_GREEN, color: 'white', border: 'none', borderRadius: 6, padding: '0.4rem 0.75rem', cursor: 'pointer' }}
                >
                  Ask for feedback
                </button>
              </div>
            </div>

            {pushResult && (
              <p style={{ fontSize: '0.78rem', color: pushResult.startsWith('Notification sent') ? ARMY_GREEN : '#c0392b', margin: '0 0 10px' }}>
                {pushResult}
              </p>
            )}

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
