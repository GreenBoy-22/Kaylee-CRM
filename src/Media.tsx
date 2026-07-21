// src/Media.tsx
// Movies & TV — search via TMDB, track watch status, see streaming availability

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, RefreshCw, Star, CheckCircle2, Clock,
  Heart, X, ChevronDown, ChevronUp, List, LayoutGrid,
  Tv, Film, Play, Pause, RotateCcw, Sparkles, Eye, Zap,
} from 'lucide-react';
import { supabase } from './lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

type MediaType = 'movie' | 'tv';

type WatchStatus =
  | 'want_to_watch'
  | 'watching'
  | 'watched'
  | 'rewatching'
  | 'on_hold'
  | 'dropped';

type MediaItem = {
  id: string;
  title: string;
  media_type: MediaType;
  year: number | null;
  genre: string | null;
  cover_url: string | null;
  description: string | null;
  director: string | null;
  creator: string | null;
  cast_list: string | null;
  runtime_mins: number | null;
  tmdb_id: number | null;
  imdb_id: string | null;
  status: WatchStatus;
  total_seasons: number | null;
  current_season: number | null;
  current_episode: number | null;
  rating: number | null;
  notes: string | null;
  date_watched: string | null;
  streaming_services: string | null;
  owned: boolean;
  owned_format: string | null;
  created_at: string;
};

type TMDBResult = {
  id: number;
  title: string;
  media_type: MediaType;
  year: number | null;
  genre: string | null;
  cover_url: string | null;
  description: string | null;
  director: string | null;
  creator: string | null;
  runtime_mins: number | null;
  total_seasons: number | null;
  streaming: string[];
};

type SortKey = 'title' | 'year' | 'genre' | 'status' | 'rating' | 'date_added';
type ViewMode = 'grid' | 'list';

const MOODS = [
  { label: '🎬 Something epic',      prompt: 'epic action-packed blockbuster or war film' },
  { label: '😂 Make me laugh',        prompt: 'hilarious comedy or feel-good movie' },
  { label: '😢 Feel something deep',  prompt: 'emotional or thought-provoking drama' },
  { label: '😱 Edge of my seat',      prompt: 'suspenseful thriller or mystery' },
  { label: '🧚 Cozy & magical',       prompt: 'cozy fantasy or feel-good family film' },
  { label: '💕 Romance me',           prompt: 'romantic movie or love story' },
  { label: '🤯 Mind-bending',         prompt: 'mind-bending sci-fi or psychological film' },
  { label: '🎃 Spooky vibes',         prompt: 'horror or supernatural thriller' },
  { label: '🌍 True story',           prompt: 'biographical or historical drama' },
  { label: '⚡ Short & fun',          prompt: 'light quick fun movie under 100 minutes' },
  { label: '🎵 Music & art',          prompt: 'musical, music documentary, or arts film' },
  { label: '🌏 Something different',  prompt: 'foreign film, indie gem, or lesser-known hidden gem' },
];

const STREAMING_SERVICES = [
  'Netflix', 'Disney+', 'Max', 'Hulu', 'Prime Video',
  'Apple TV+', 'Peacock', 'Paramount+', 'Crunchyroll', 'Other',
];

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<WatchStatus, { label: string; color: string; icon: React.ElementType }> = {
  want_to_watch: { label: 'Want to Watch', color: '#6366f1', icon: Heart },
  watching:      { label: 'Watching',       color: '#7C3AED', icon: Play },
  watched:       { label: 'Watched',        color: '#059669', icon: CheckCircle2 },
  rewatching:    { label: 'Rewatching',     color: '#2563EB', icon: RotateCcw },
  on_hold:       { label: 'On Hold',        color: '#D97706', icon: Pause },
  dropped:       { label: 'Dropped',        color: '#DC2626', icon: X },
};

const STREAMING_COLORS: Record<string, string> = {
  'Netflix':       '#E50914',
  'Hulu':          '#1CE783',
  'Disney+':       '#113CCF',
  'HBO Max':       '#5822B4',
  'Max':           '#5822B4',
  'Prime Video':   '#00A8E0',
  'Apple TV+':     '#555555',
  'Peacock':       '#000000',
  'Paramount+':    '#0064FF',
  'Crunchyroll':   '#F47521',
};

// ── TMDB helpers ───────────────────────────────────────────────────────────

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG  = 'https://image.tmdb.org/t/p/w500';

function getApiKey(): string {
  return (import.meta.env.VITE_TMDB_API_KEY as string) || '';
}

async function tmdbSearch(query: string): Promise<TMDBResult[]> {
  const key = getApiKey();
  if (!key) return [];
  try {
    const resp = await fetch(`${TMDB_BASE}/search/multi?api_key=${key}&query=${encodeURIComponent(query)}&include_adult=false&page=1`);
    if (!resp.ok) return [];
    const json = await resp.json();
    const results: TMDBResult[] = [];
    for (const item of (json.results ?? []).slice(0, 8)) {
      if (item.media_type !== 'movie' && item.media_type !== 'tv') continue;
      const isMovie = item.media_type === 'movie';
      results.push({
        id: item.id,
        title: isMovie ? item.title : item.name,
        media_type: item.media_type,
        year: isMovie
          ? (item.release_date ? parseInt(item.release_date.slice(0, 4)) : null)
          : (item.first_air_date ? parseInt(item.first_air_date.slice(0, 4)) : null),
        genre: null,
        cover_url: item.poster_path ? `${TMDB_IMG}${item.poster_path}` : null,
        description: item.overview || null,
        director: null,
        creator: null,
        runtime_mins: null,
        total_seasons: item.number_of_seasons ?? null,
        streaming: [],
      });
    }
    return results;
  } catch { return []; }
}

async function tmdbDetails(tmdbId: number, mediaType: MediaType): Promise<Partial<TMDBResult>> {
  const key = getApiKey();
  if (!key) return {};
  try {
    const endpoint = mediaType === 'movie'
      ? `${TMDB_BASE}/movie/${tmdbId}?api_key=${key}&append_to_response=credits,watch/providers`
      : `${TMDB_BASE}/tv/${tmdbId}?api_key=${key}&append_to_response=credits,watch/providers`;
    const resp = await fetch(endpoint);
    if (!resp.ok) return {};
    const d = await resp.json();
    const genres = (d.genres ?? []).map((g: any) => g.name).slice(0, 2).join(', ');
    const providers = d['watch/providers']?.results?.US?.flatrate ?? [];
    const streaming = providers.map((p: any) => p.provider_name as string);
    let director: string | null = null;
    let creator: string | null = null;
    if (mediaType === 'movie') {
      director = d.credits?.crew?.find((c: any) => c.job === 'Director')?.name ?? null;
    } else {
      creator = (d.created_by ?? []).map((c: any) => c.name).join(', ') || null;
    }
    return {
      genre: genres || null,
      director,
      creator,
      runtime_mins: mediaType === 'movie' ? (d.runtime ?? null) : (d.episode_run_time?.[0] ?? null),
      total_seasons: d.number_of_seasons ?? null,
      streaming,
    };
  } catch { return {}; }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number | null; onChange?: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} onClick={() => onChange?.(n)} style={{ background: 'none', border: 'none', padding: 0, cursor: onChange ? 'pointer' : 'default', color: n <= (value ?? 0) ? '#D97706' : 'var(--muted)' }}>
          <Star size={13} fill={n <= (value ?? 0) ? '#D97706' : 'none'} />
        </button>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: WatchStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: `${cfg.color}22`, color: cfg.color }}>
      <Icon size={10} />{cfg.label}
    </span>
  );
}

function StreamingBadge({ service }: { service: string }) {
  const color = STREAMING_COLORS[service] ?? '#6b7280';
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: color, color: '#fff', whiteSpace: 'nowrap' }}>
      {service}
    </span>
  );
}

function TypeBadge({ type }: { type: MediaType }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999, background: type === 'movie' ? '#7C3AED22' : '#2563EB22', color: type === 'movie' ? '#7C3AED' : '#2563EB' }}>
      {type === 'movie' ? <Film size={9} /> : <Tv size={9} />}
      {type === 'movie' ? 'Movie' : 'TV Show'}
    </span>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function Media({ initialMediaId }: { initialMediaId?: string | null } = {}) {
  const [items, setItems]               = useState<MediaItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [typeFilter, setTypeFilter]     = useState<MediaType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<WatchStatus | 'all'>('all');
  const [streamFilter, setStreamFilter] = useState('all');
  const [minRating, setMinRating]       = useState(0);
  const [sortKey, setSortKey]           = useState<SortKey>('title');
  const [sortAsc, setSortAsc]           = useState(true);
  const [viewMode, setViewMode]         = useState<ViewMode>(initialMediaId ? 'list' : 'grid');
  const [expandedId, setExpandedId]     = useState<string | null>(initialMediaId ?? null);

  // AI suggestion state
  const [suggestion, setSuggestion]         = useState<string | null>(null);
  const [suggesting, setSuggesting]         = useState(false);
  const [activeMood, setActiveMood]         = useState<string | null>(null);

  // Quick-add wishlist state
  const [showQuickAdd, setShowQuickAdd]     = useState(false);
  const [qaTitle, setQaTitle]               = useState('');
  const [qaService, setQaService]           = useState('Netflix');
  const [qaNotes, setQaNotes]               = useState('');
  const [qaSaving, setQaSaving]             = useState(false);

  // Add panel
  const [showAdd, setShowAdd]           = useState(false);
  const [tmdbQuery, setTmdbQuery]       = useState('');
  const [tmdbResults, setTmdbResults]   = useState<TMDBResult[]>([]);
  const [searching, setSearching]       = useState(false);
  const [loadingDetails, setLoadingDetails] = useState<number | null>(null);
  const [showManual, setShowManual]     = useState(false);

  // Manual form
  const [mTitle, setMTitle]         = useState('');
  const [mType, setMType]           = useState<MediaType>('movie');
  const [mYear, setMYear]           = useState('');
  const [mGenre, setMGenre]         = useState('');
  const [mStatus, setMStatus]       = useState<WatchStatus>('want_to_watch');
  const [mOwned, setMOwned]         = useState(false);
  const [mFormat, setMFormat]       = useState('');

  const hasApiKey = !!getApiKey();

  // ── Load ──────────────────────────────────────────────────────────────
  const loadItems = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.from('media').select('*').order('title');
    if (data) setItems(data as MediaItem[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  // ── TMDB search ───────────────────────────────────────────────────────
  async function handleTMDBSearch() {
    if (!tmdbQuery.trim()) return;
    setSearching(true);
    const results = await tmdbSearch(tmdbQuery.trim());
    setTmdbResults(results);
    setSearching(false);
  }

  async function addFromTMDB(result: TMDBResult, status: WatchStatus = 'want_to_watch') {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setLoadingDetails(result.id);
    const details = await tmdbDetails(result.id, result.media_type);
    setLoadingDetails(null);
    const row = {
      user_id: session.user.id,
      title: result.title,
      media_type: result.media_type,
      year: result.year,
      genre: details.genre ?? result.genre,
      cover_url: result.cover_url,
      description: result.description,
      director: details.director ?? null,
      creator: details.creator ?? null,
      runtime_mins: details.runtime_mins ?? null,
      total_seasons: details.total_seasons ?? result.total_seasons,
      tmdb_id: result.id,
      status,
      streaming_services: (details.streaming ?? []).join(', ') || null,
      owned: false,
    };
    const { data, error } = await supabase.from('media').insert(row).select().single();
    if (!error && data) {
      setItems(prev => [...prev, data as MediaItem].sort((a, b) => a.title.localeCompare(b.title)));
      setTmdbResults([]);
      setTmdbQuery('');
      setShowAdd(false);
    }
  }

  // ── Manual add ────────────────────────────────────────────────────────
  async function addManually() {
    if (!supabase || !mTitle.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const row = {
      user_id: session.user.id,
      title: mTitle.trim(),
      media_type: mType,
      year: mYear ? parseInt(mYear) : null,
      genre: mGenre || null,
      status: mStatus,
      owned: mOwned,
      owned_format: mFormat || null,
    };
    const { data, error } = await supabase.from('media').insert(row).select().single();
    if (!error && data) {
      setItems(prev => [...prev, data as MediaItem].sort((a, b) => a.title.localeCompare(b.title)));
      setMTitle(''); setMType('movie'); setMYear(''); setMGenre('');
      setMStatus('want_to_watch'); setMOwned(false); setMFormat('');
      setShowManual(false); setShowAdd(false);
    }
  }

  // ── Update / Delete ───────────────────────────────────────────────────
  async function updateItem(id: string, patch: Partial<MediaItem>) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    if (!supabase) return;
    await supabase.from('media').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  }

  async function deleteItem(id: string) {
    if (!confirm('Remove this from your list?')) return;
    setItems(prev => prev.filter(i => i.id !== id));
    if (expandedId === id) setExpandedId(null);
    if (!supabase) return;
    await supabase.from('media').delete().eq('id', id);
  }

  // ── AI suggestion ─────────────────────────────────────────────────────
  async function getSuggestion(mood: { label: string; prompt: string }) {
    if (!supabase) return;
    setSuggesting(true);
    setActiveMood(mood.label);
    setSuggestion(null);

    // Build list of watched titles for context
    const watched = items.filter(i => i.status === 'watched' || i.status === 'rewatching');
    const watchlist = items.filter(i => i.status === 'want_to_watch');
    const watchedTitles = watched.slice(0, 40).map(i => i.title).join(', ');
    const watchlistTitles = watchlist.slice(0, 20).map(i => i.title).join(', ');

    const prompt = `You are a movie and TV show recommendation expert for Kaylee's personal collection.

Mood requested: "${mood.prompt}"

Movies/shows already watched (sample): ${watchedTitles || 'various films'}
Currently on watchlist: ${watchlistTitles || 'nothing yet'}

Suggest 3 movies or TV shows that match the mood. For each one give:
- Title and year
- One sentence on why it fits this mood perfectly
- Whether it's a movie or TV show

Keep it conversational and enthusiastic. Don't suggest anything already in their watched list. Format as a short punchy list.`;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setSuggesting(false); return; }

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], max_tokens: 500 }),
      });
      const data = await resp.json();
      const text = data?.content?.[0]?.text ?? data?.choices?.[0]?.message?.content ?? null;
      setSuggestion(text);
    } catch { setSuggestion('Could not get suggestions right now. Try again!'); }
    setSuggesting(false);
  }

  // ── Quick-add to watchlist ─────────────────────────────────────────────
  async function quickAddToWatchlist() {
    if (!supabase || !qaTitle.trim()) return;
    setQaSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setQaSaving(false); return; }
    const row = {
      user_id: session.user.id,
      title: qaTitle.trim(),
      media_type: 'movie' as MediaType,
      status: 'want_to_watch' as WatchStatus,
      streaming_services: qaService !== 'Other' ? qaService : null,
      notes: qaNotes.trim() || null,
      owned: false,
    };
    const { data, error } = await supabase.from('media').insert(row).select().single();
    if (!error && data) {
      setItems(prev => [...prev, data as MediaItem].sort((a, b) => a.title.localeCompare(b.title)));
      setQaTitle(''); setQaService('Netflix'); setQaNotes('');
      setShowQuickAdd(false);
    }
    setQaSaving(false);
  }

  // ── Refresh streaming info ────────────────────────────────────────────
  async function refreshStreaming(item: MediaItem) {
    if (!item.tmdb_id || !hasApiKey) return;
    const details = await tmdbDetails(item.tmdb_id, item.media_type);
    if (details.streaming !== undefined) {
      await updateItem(item.id, { streaming_services: details.streaming.join(', ') || null });
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────
  const allStreaming = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.streaming_services) {
        for (const s of item.streaming_services.split(',')) {
          const t = s.trim();
          if (t) set.add(t);
        }
      }
    }
    return [...set].sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(i => {
      if (typeFilter !== 'all' && i.media_type !== typeFilter) return false;
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (minRating > 0 && (i.rating ?? 0) < minRating) return false;
      if (streamFilter !== 'all') {
        const services = (i.streaming_services ?? '').split(',').map(s => s.trim());
        if (!services.includes(streamFilter)) return false;
      }
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        (i.genre ?? '').toLowerCase().includes(q) ||
        (i.director ?? '').toLowerCase().includes(q) ||
        (i.creator ?? '').toLowerCase().includes(q) ||
        (i.streaming_services ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, search, typeFilter, statusFilter, streamFilter, minRating]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case 'title':      av = a.title.toLowerCase(); bv = b.title.toLowerCase(); break;
        case 'year':       av = a.year ?? 0; bv = b.year ?? 0; break;
        case 'genre':      av = (a.genre ?? '').toLowerCase(); bv = (b.genre ?? '').toLowerCase(); break;
        case 'status':     av = a.status; bv = b.status; break;
        case 'rating':     av = a.rating ?? 0; bv = b.rating ?? 0; break;
        case 'date_added': av = a.created_at; bv = b.created_at; break;
        default:           av = a.title.toLowerCase(); bv = b.title.toLowerCase();
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortAsc]);

  const stats = useMemo(() => ({
    movies:       items.filter(i => i.media_type === 'movie').length,
    tv:           items.filter(i => i.media_type === 'tv').length,
    watched:      items.filter(i => i.status === 'watched').length,
    watching:     items.filter(i => i.status === 'watching' || i.status === 'rewatching').length,
    want_to_watch:items.filter(i => i.status === 'want_to_watch').length,
    owned:        items.filter(i => i.owned).length,
  }), [items]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Movies & TV</h1>
          <p>{stats.movies} movies · {stats.tv} shows · {stats.watched} watched · {stats.watching} in progress · <span style={{ color: '#6366f1', fontWeight: 600 }}>{stats.want_to_watch} on watchlist</span></p>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={() => { setShowQuickAdd(v => !v); setShowAdd(false); }} style={{ color: '#6366f1', borderColor: '#6366f1' }}>
            <Zap size={15} /> Saw it on…
          </button>
          <button className="btn primary" onClick={() => { setShowAdd(v => !v); setShowQuickAdd(false); }}>
            <Plus size={15} /> Add Title
          </button>
        </div>
      </div>

      {!hasApiKey && (
        <section className="panel" style={{ borderLeft: '3px solid #D97706', background: '#fffbeb', fontSize: 13 }}>
          <strong>TMDB API key not configured.</strong> Add <code>VITE_TMDB_API_KEY</code> to your Vercel environment variables for search and streaming info. Get a free key at <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">themoviedb.org/settings/api</a>. You can still add titles manually.
        </section>
      )}

      {/* Stats */}
      <div className="stats-row">
        {([
          ['Movies', stats.movies],
          ['TV Shows', stats.tv],
          ['Watched', stats.watched],
          ['In Progress', stats.watching],
          ['Watchlist', stats.want_to_watch],
          ['Owned', stats.owned],
        ] as [string, number][]).map(([label, val]) => (
          <div className="stat-card" key={label}>
            <div className="stat-label">{label}</div>
            <div className="stat-val">{val}</div>
          </div>
        ))}
      </div>

      {/* ── Quick-add watchlist panel ─────────────────────────────────── */}
      {showQuickAdd && (
        <section className="panel" style={{ borderLeft: '3px solid #6366f1' }}>
          <div className="panel-head">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Zap size={15} style={{ color: '#6366f1' }} /> Saw something? Save it!</h2>
            <button className="btn ghost" onClick={() => setShowQuickAdd(false)}>Close</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                placeholder="Title (movie or show)…"
                value={qaTitle}
                onChange={e => setQaTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && quickAddToWatchlist()}
                style={{ flex: '2 1 200px' }}
                autoFocus
              />
              <select value={qaService} onChange={e => setQaService(e.target.value)} style={{ flex: '1 1 120px' }}>
                {STREAMING_SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <input
              placeholder="Optional note (e.g. 'looks hilarious', 'Adam recommended it')…"
              value={qaNotes}
              onChange={e => setQaNotes(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" onClick={quickAddToWatchlist} disabled={!qaTitle.trim() || qaSaving}>
                {qaSaving ? <RefreshCw size={13} className="spin" /> : <Heart size={13} />}
                {qaSaving ? 'Saving…' : 'Add to Watchlist'}
              </button>
              <button className="btn ghost" onClick={() => setShowQuickAdd(false)}>Cancel</button>
            </div>
          </div>
        </section>
      )}

      {/* ── AI What to Watch ─────────────────────────────────────────────── */}
      <section className="panel" style={{ borderLeft: '3px solid #7C3AED' }}>
        <div className="panel-head" style={{ marginBottom: 10 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={15} style={{ color: '#7C3AED' }} /> What should I watch?
          </h2>
          {suggestion && (
            <button className="btn ghost tiny" onClick={() => { setSuggestion(null); setActiveMood(null); }}>
              <X size={11} /> Clear
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: suggestion || suggesting ? 12 : 0 }}>
          {MOODS.map(mood => (
            <button
              key={mood.label}
              className={activeMood === mood.label ? 'btn primary tiny' : 'btn ghost tiny'}
              onClick={() => getSuggestion(mood)}
              disabled={suggesting}
              style={{ fontSize: 12 }}
            >
              {suggesting && activeMood === mood.label ? <RefreshCw size={11} className="spin" /> : null}
              {mood.label}
            </button>
          ))}
        </div>
        {suggesting && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13 }}>
            <RefreshCw size={13} className="spin" /> Finding the perfect pick for you…
          </div>
        )}
        {suggestion && !suggesting && (
          <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', background: '#7C3AED11', borderRadius: 8, padding: '12px 14px', color: 'var(--text)' }}>
            {suggestion}
          </div>
        )}
      </section>

      {/* Add panel */}
      {showAdd && (
        <section className="panel">
          <div className="panel-head">
            <h2>Add a movie or show</h2>
            <button className="btn ghost" onClick={() => { setShowAdd(false); setTmdbResults([]); setShowManual(false); }}>Close</button>
          </div>

          {hasApiKey && !showManual && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  placeholder="Search movies and TV shows…"
                  value={tmdbQuery}
                  onChange={e => setTmdbQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTMDBSearch()}
                  style={{ flex: 1 }}
                />
                <button className="btn primary" onClick={handleTMDBSearch} disabled={searching}>
                  {searching ? <RefreshCw size={14} className="spin" /> : <Search size={14} />}
                  {searching ? 'Searching…' : 'Search'}
                </button>
              </div>
              <button className="btn ghost tiny" onClick={() => setShowManual(true)}>+ Add manually instead</button>

              {tmdbResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                  {tmdbResults.map(result => (
                    <div key={result.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border, rgba(0,0,0,0.07))' }}>
                      {result.cover_url
                        ? <img src={result.cover_url} alt={result.title} style={{ width: 48, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                        : <div style={{ width: 48, height: 72, background: 'var(--surface-2)', borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {result.media_type === 'movie' ? <Film size={18} style={{ color: 'var(--muted)' }} /> : <Tv size={18} style={{ color: 'var(--muted)' }} />}
                          </div>
                      }
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: 14 }}>{result.title}</strong>
                          <TypeBadge type={result.media_type} />
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0' }}>
                          {result.year}{result.total_seasons ? ` · ${result.total_seasons} seasons` : ''}
                        </p>
                        {result.description && <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{result.description}</p>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                        {loadingDetails === result.id
                          ? <RefreshCw size={14} className="spin" style={{ margin: '0 auto' }} />
                          : <>
                              <button className="btn primary tiny" onClick={() => addFromTMDB(result, 'want_to_watch')}>+ Watchlist</button>
                              <button className="btn ghost tiny" onClick={() => addFromTMDB(result, 'watching')}>Watching</button>
                              <button className="btn ghost tiny" onClick={() => addFromTMDB(result, 'watched')}>Watched it</button>
                            </>
                        }
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {(!hasApiKey || showManual) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              <div className="form-grid">
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Title *<input value={mTitle} onChange={e => setMTitle(e.target.value)} placeholder="Title" />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Type
                  <select value={mType} onChange={e => setMType(e.target.value as MediaType)}>
                    <option value="movie">Movie</option>
                    <option value="tv">TV Show</option>
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Year<input type="number" value={mYear} onChange={e => setMYear(e.target.value)} placeholder="2024" />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Genre<input value={mGenre} onChange={e => setMGenre(e.target.value)} placeholder="Action, Drama…" />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Status
                  <select value={mStatus} onChange={e => setMStatus(e.target.value as WatchStatus)}>
                    {(Object.entries(STATUS_CONFIG) as [WatchStatus, any][]).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Format (if owned)
                  <input value={mFormat} onChange={e => setMFormat(e.target.value)} placeholder="DVD, Blu-ray, Digital…" />
                </label>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={mOwned} onChange={e => setMOwned(e.target.checked)} />
                I own this
              </label>
              <button className="btn primary" onClick={addManually} disabled={!mTitle.trim()}>
                <Plus size={14} /> Add to List
              </button>
            </div>
          )}
        </section>
      )}

      {/* Filters */}
      <section className="panel" style={{ paddingBottom: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 0 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input placeholder="Search title, genre, director…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32, width: '100%', boxSizing: 'border-box' }} />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as MediaType | 'all')}>
            <option value="all">All types</option>
            <option value="movie">🎬 Movies</option>
            <option value="tv">📺 TV Shows</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as WatchStatus | 'all')}>
            <option value="all">All statuses</option>
            {(Object.entries(STATUS_CONFIG) as [WatchStatus, any][]).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
          </select>
          {allStreaming.length > 0 && (
            <select value={streamFilter} onChange={e => setStreamFilter(e.target.value)} style={{ maxWidth: 160 }}>
              <option value="all">All services</option>
              {allStreaming.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <select value={minRating} onChange={e => setMinRating(Number(e.target.value))}>
            <option value={0}>Any rating</option>
            <option value={5}>★★★★★ only</option>
            <option value={4}>★★★★+ and up</option>
            <option value={3}>★★★+ and up</option>
            <option value={2}>★★+ and up</option>
            <option value={1}>★+ and up</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
            {(['title','year','genre','status','rating','date_added'] as SortKey[]).map(key => (
              <button key={key} className={sortKey === key ? 'btn primary tiny' : 'btn ghost tiny'} onClick={() => toggleSort(key)}>
                {key === 'date_added' ? 'Added' : key.charAt(0).toUpperCase() + key.slice(1)}
                {sortKey === key && (sortAsc ? ' ↑' : ' ↓')}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={viewMode === 'grid' ? 'btn primary tiny' : 'btn ghost tiny'} onClick={() => setViewMode('grid')}><LayoutGrid size={13} /></button>
            <button className={viewMode === 'list' ? 'btn primary tiny' : 'btn ghost tiny'} onClick={() => setViewMode('list')}><List size={13} /></button>
          </div>
        </div>
        {filtered.length !== items.length && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>Showing {filtered.length} of {items.length}</p>
        )}
      </section>

      {/* Content */}
      {loading && (
        <section className="panel">
          <div style={{ display: 'flex', gap: 8, color: 'var(--muted)' }}><RefreshCw size={14} className="spin" /> Loading…</div>
        </section>
      )}

      {!loading && sorted.length === 0 && (
        <section className="panel">
          <div className="brief-item">Nothing here yet — add your first movie or show above!</div>
        </section>
      )}

      {!loading && sorted.length > 0 && viewMode === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {sorted.map(item => <MediaCard key={item.id} item={item} onUpdate={updateItem} onDelete={deleteItem} />)}
        </div>
      )}

      {!loading && sorted.length > 0 && viewMode === 'list' && (
        <section className="panel" style={{ paddingBottom: 4 }}>
          {sorted.map(item => (
            <MediaListRow
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onUpdate={updateItem}
              onDelete={deleteItem}
              onRefreshStreaming={() => refreshStreaming(item)}
              hasApiKey={hasApiKey}
            />
          ))}
        </section>
      )}
    </>
  );
}

// ── MediaCard (grid) ───────────────────────────────────────────────────────

function MediaCard({ item, onUpdate, onDelete }: { item: MediaItem; onUpdate: (id: string, patch: Partial<MediaItem>) => void; onDelete: (id: string) => void }) {
  const [hover, setHover] = useState(false);
  const cfg = STATUS_CONFIG[item.status];
  const streaming = item.streaming_services ? item.streaming_services.split(',').map(s => s.trim()).filter(Boolean) : [];

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ borderRadius: 8, overflow: 'hidden', background: 'var(--surface, #fff)', border: '1px solid var(--border, rgba(0,0,0,0.07))', boxShadow: hover ? '0 4px 12px rgba(0,0,0,0.12)' : 'none', transition: 'box-shadow 120ms', position: 'relative' }}
    >
      {/* Poster */}
      {item.cover_url
        ? <img src={item.cover_url} alt={item.title} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        : <div style={{ width: '100%', aspectRatio: '2/3', background: `${cfg.color}18`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {item.media_type === 'movie' ? <Film size={24} style={{ color: cfg.color }} /> : <Tv size={24} style={{ color: cfg.color }} />}
            <span style={{ fontSize: 10, color: cfg.color, textAlign: 'center', padding: '0 6px', fontWeight: 600, lineHeight: 1.3 }}>{item.title.slice(0, 40)}</span>
          </div>
      }

      {/* Streaming badges overlay */}
      {streaming.length > 0 && (
        <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: 'calc(100% - 12px)' }}>
          {streaming.slice(0, 2).map(s => <StreamingBadge key={s} service={s} />)}
        </div>
      )}

      {/* Status badge overlay on hover */}
      {hover && (
        <div style={{ position: 'absolute', top: 6, right: 6 }}>
          <select
            value={item.status}
            onChange={e => onUpdate(item.id, { status: e.target.value as WatchStatus })}
            onClick={e => e.stopPropagation()}
            style={{ fontSize: 10, padding: '2px 4px', borderRadius: 4 }}
          >
            {(Object.entries(STATUS_CONFIG) as [WatchStatus, any][]).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
          </select>
        </div>
      )}

      <div style={{ padding: '8px 8px 6px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, marginBottom: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{item.title}</div>
        {item.year && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{item.year}{item.total_seasons ? ` · ${item.total_seasons}S` : ''}</div>}
        <StatusPill status={item.status} />
        {item.rating && <div style={{ marginTop: 4 }}><StarRating value={item.rating} /></div>}
      </div>
    </div>
  );
}

// ── MediaListRow (list) ────────────────────────────────────────────────────

function MediaListRow({ item, expanded, onToggle, onUpdate, onDelete, onRefreshStreaming, hasApiKey }: {
  item: MediaItem;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, patch: Partial<MediaItem>) => void;
  onDelete: (id: string) => void;
  onRefreshStreaming: () => void;
  hasApiKey: boolean;
}) {
  const streaming = item.streaming_services ? item.streaming_services.split(',').map(s => s.trim()).filter(Boolean) : [];

  return (
    <div>
      <button
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'none', border: 'none', padding: '9px 4px', borderBottom: expanded ? 'none' : '1px solid var(--border, rgba(0,0,0,0.07))', cursor: 'pointer', textAlign: 'left' }}
      >
        {item.cover_url
          ? <img src={item.cover_url} alt={item.title} style={{ width: 36, height: 54, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          : <div style={{ width: 36, height: 54, background: `${STATUS_CONFIG[item.status].color}22`, borderRadius: 3, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {item.media_type === 'movie' ? <Film size={14} style={{ color: STATUS_CONFIG[item.status].color }} /> : <Tv size={14} style={{ color: STATUS_CONFIG[item.status].color }} />}
            </div>
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{item.title}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {item.year && <span>{item.year} · </span>}
            {item.genre && <span>{item.genre}</span>}
            {item.director && <span> · {item.director}</span>}
            {item.creator && <span> · Created by {item.creator}</span>}
          </div>
          {streaming.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              {streaming.map(s => <StreamingBadge key={s} service={s} />)}
            </div>
          )}
        </div>
        <TypeBadge type={item.media_type} />
        <StatusPill status={item.status} />
        {item.rating && <StarRating value={item.rating} />}
        {expanded ? <ChevronUp size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
      </button>

      {expanded && (
        <div style={{ padding: '10px 4px 14px 52px', borderBottom: '1px solid var(--border, rgba(0,0,0,0.07))' }}>
          {item.description && <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.5 }}>{item.description.slice(0, 400)}{item.description.length > 400 ? '…' : ''}</p>}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              Status
              <select value={item.status} onChange={e => onUpdate(item.id, { status: e.target.value as WatchStatus })} style={{ fontSize: 12 }}>
                {(Object.entries(STATUS_CONFIG) as [WatchStatus, any][]).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              Rating <StarRating value={item.rating} onChange={r => onUpdate(item.id, { rating: r })} />
            </label>
            {item.media_type === 'tv' && (
              <>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Season
                  <input type="number" value={item.current_season ?? ''} onChange={e => onUpdate(item.id, { current_season: e.target.value ? parseInt(e.target.value) : null })} style={{ fontSize: 12, width: 50 }} />
                </label>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Episode
                  <input type="number" value={item.current_episode ?? ''} onChange={e => onUpdate(item.id, { current_episode: e.target.value ? parseInt(e.target.value) : null })} style={{ fontSize: 12, width: 50 }} />
                </label>
              </>
            )}
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              Date watched
              <input type="date" value={item.date_watched ?? ''} onChange={e => onUpdate(item.id, { date_watched: e.target.value || null })} style={{ fontSize: 12 }} />
            </label>
          </div>

          {/* Streaming */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Eye size={12} /> Streaming on
              {hasApiKey && item.tmdb_id && (
                <button className="btn ghost tiny" onClick={onRefreshStreaming} style={{ fontSize: 11 }}>
                  <RefreshCw size={11} /> Refresh
                </button>
              )}
            </div>
            {streaming.length > 0
              ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{streaming.map(s => <StreamingBadge key={s} service={s} />)}</div>
              : <div style={{ fontSize: 12, color: 'var(--muted)' }}>Not on any tracked streaming service right now</div>
            }
          </div>

          {/* Ownership */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', marginBottom: 10 }}>
            <input type="checkbox" checked={item.owned} onChange={e => onUpdate(item.id, { owned: e.target.checked })} />
            I own this
            {item.owned && (
              <input value={item.owned_format ?? ''} onChange={e => onUpdate(item.id, { owned_format: e.target.value || null })} placeholder="DVD, Blu-ray, Digital…" style={{ fontSize: 12, marginLeft: 8 }} />
            )}
          </label>

          <textarea
            placeholder="Notes…"
            value={item.notes ?? ''}
            onChange={e => onUpdate(item.id, { notes: e.target.value || null })}
            style={{ fontSize: 13, minHeight: 60, resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
          />

          <MediaFeedbackSection item={item} />

          <div style={{ marginTop: 8 }}>
            <button className="btn warning tiny" onClick={() => onDelete(item.id)}><X size={12} /> Remove</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MediaFeedbackSection — reviews + push/text "rate this" link, mirrors
// the same feature on Recipe Book so it's consistent across the app ────────

interface MediaFeedback {
  id: string;
  media_id: string;
  reviewer_name: string;
  rating: number | null;
  comment: string | null;
  watched_date: string;
  created_at: string;
}

function MediaFeedbackSection({ item }: { item: MediaItem }) {
  const [feedback, setFeedback] = useState<MediaFeedback[]>([]);
  const [showTextComposer, setShowTextComposer] = useState(false);
  const [textMessage, setTextMessage] = useState('');
  const [pushSending, setPushSending] = useState(false);
  const [pushResult, setPushResult] = useState('');

  useEffect(() => {
    load();
    const emoji = item.media_type === 'movie' ? '🎬' : '📺';
    setTextMessage(`Hey! We watched ${item.title} ${emoji} Would love to know what you thought — rate it here: https://kaylee-crm.vercel.app/watch/${item.id}`);
    setShowTextComposer(false);
    setPushResult('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  async function load() {
    if (!supabase) return;
    const { data } = await supabase
      .from('media_feedback')
      .select('*')
      .eq('media_id', item.id)
      .order('created_at', { ascending: false });
    setFeedback((data as MediaFeedback[]) || []);
  }

  async function sendPushRequest() {
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
      const deepLink = `/?media=${item.id}`;
      let totalSent = 0;
      for (const u of otherUsers) {
        const { data: result, error } = await supabase.functions.invoke('send-push-notifications', {
          body: {
            user_id: u.id,
            title: `Rate ${item.title}!`,
            body: 'Kaylee wants to know what you thought — tap to rate it.',
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

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border, rgba(0,0,0,0.07))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
          Family Feedback {feedback.length > 0 && (() => {
            const rated = feedback.filter((f) => f.rating);
            if (!rated.length) return '';
            const avg = rated.reduce((s, f) => s + (f.rating || 0), 0) / rated.length;
            return `— avg ${avg.toFixed(1)}/5 (${rated.length})`;
          })()}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={sendPushRequest}
            disabled={pushSending}
            style={{ fontSize: 11, background: '#534AB7', color: 'white', border: 'none', borderRadius: 5, padding: '0.3rem 0.6rem', cursor: 'pointer' }}
          >
            {pushSending ? 'Sending...' : 'Send push notification'}
          </button>
          <button
            onClick={() => setShowTextComposer((v) => !v)}
            style={{ fontSize: 11, background: '#4B5320', color: 'white', border: 'none', borderRadius: 5, padding: '0.3rem 0.6rem', cursor: 'pointer' }}
          >
            Ask for feedback
          </button>
        </div>
      </div>

      {pushResult && (
        <p style={{ fontSize: 11, color: pushResult.startsWith('Notification sent') ? '#4B5320' : '#c0392b', margin: '0 0 8px' }}>
          {pushResult}
        </p>
      )}

      {showTextComposer && (
        <div style={{ background: 'var(--surface-1, #f4f5f0)', borderRadius: 8, padding: '0.6rem', marginBottom: 10 }}>
          <textarea
            value={textMessage}
            onChange={(e) => setTextMessage(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <a
              href={`sms:?body=${encodeURIComponent(textMessage)}`}
              style={{ fontSize: 11, background: '#25D366', color: 'white', border: 'none', borderRadius: 5, padding: '0.3rem 0.6rem', textDecoration: 'none' }}
            >
              Open in Messages
            </a>
            <button
              onClick={() => navigator.clipboard.writeText(textMessage)}
              style={{ fontSize: 11, background: 'white', border: '1px solid #ccc', borderRadius: 5, padding: '0.3rem 0.6rem', cursor: 'pointer' }}
            >
              Copy text
            </button>
          </div>
        </div>
      )}

      {feedback.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {feedback.map((f) => (
            <div key={f.id} style={{ fontSize: 12, padding: '5px 7px', background: 'var(--surface-1, #fafafa)', borderRadius: 6 }}>
              <strong>{f.reviewer_name}</strong>
              {f.rating ? (
                <span style={{ marginLeft: 6 }}>
                  {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={10} fill={n <= f.rating! ? '#d4a017' : 'none'} color="#d4a017" style={{ verticalAlign: -1 }} />)}
                </span>
              ) : null}
              <span style={{ color: 'var(--muted)', fontSize: 10, marginLeft: 6 }}>{new Date(f.watched_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</span>
              {f.comment && <p style={{ margin: '2px 0 0', color: 'var(--muted)' }}>{f.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
