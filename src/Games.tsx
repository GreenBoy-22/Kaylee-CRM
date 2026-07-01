// src/Games.tsx
//
// Games tab — video game and board game collection with:
//   • Add by title (auto-enriched via RAWG API for video games)
//   • Filter by type (video game / board game), status, platform/genre
//   • Sort by title, platform, genre, status, rating, date added
//   • Grid and list view
//   • AI-powered "what to play next" suggestion from your shelf
//   • Star ratings, notes, play tracking

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, RefreshCw, Star, CheckCircle2,
  Clock, Heart, Sparkles, X, ChevronDown, ChevronUp,
  List, LayoutGrid, Gamepad2, Dice5,
} from 'lucide-react';
import { supabase } from './lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

type GameType = 'video' | 'board';

type PlayStatus =
  | 'backlog'       // owned, not started
  | 'playing'       // currently playing
  | 'completed'     // finished
  | 'wishlist'      // want to buy
  | 'dropped'       // started but abandoned
  | 'replaying';    // playing again

type Game = {
  id: string;
  title: string;
  game_type: GameType;
  platform: string | null;       // PS5, Xbox, Switch, PC, Tabletop, etc.
  genre: string | null;
  cover_url: string | null;
  description: string | null;
  developer: string | null;      // video games: dev studio; board games: publisher
  release_year: number | null;
  status: PlayStatus;
  rating: number | null;
  date_started: string | null;
  date_completed: string | null;
  hours_played: number | null;   // video games
  player_count: string | null;   // board games (e.g. "2-4")
  play_time_mins: number | null; // board games avg play time
  complexity: string | null;     // board games: light / medium / heavy
  owned: boolean;
  notes: string | null;
  rawg_id: number | null;
  suggestion_dismissed: boolean;
  created_at: string;
};

type RAWGResult = {
  id: number;
  title: string;
  cover: string | null;
  genre: string | null;
  platforms: string[];
  developer: string | null;
  releaseYear: number | null;
  description: string | null;
};

type SortKey = 'title' | 'platform' | 'genre' | 'status' | 'rating' | 'date_added';
type ViewMode = 'grid' | 'list';
type AISuggestion = { game: Game; reason: string } | null;

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<PlayStatus, string> = {
  backlog:    'Backlog',
  playing:    'Currently Playing',
  completed:  'Completed',
  wishlist:   'Wishlist',
  dropped:    'Dropped',
  replaying:  'Replaying',
};

const STATUS_COLORS: Record<PlayStatus, string> = {
  backlog:   '#6b7280',
  playing:   '#7C3AED',
  completed: '#059669',
  wishlist:  '#D97706',
  dropped:   '#DC2626',
  replaying: '#2563EB',
};

const STATUS_ICONS: Record<PlayStatus, React.ElementType> = {
  backlog:   Clock,
  playing:   Gamepad2,
  completed: CheckCircle2,
  wishlist:  Heart,
  dropped:   X,
  replaying: RefreshCw,
};

const VIDEO_PLATFORMS = [
  'PS5', 'PS4', 'Xbox Series X', 'Xbox One', 'Nintendo Switch',
  'PC', 'Steam Deck', 'iOS', 'Android', 'Retro',
];

const BOARD_COMPLEXITY = ['Light', 'Medium', 'Heavy'];

// ── RAWG API ───────────────────────────────────────────────────────────────

async function searchRAWG(query: string): Promise<RAWGResult[]> {
  try {
    const params = new URLSearchParams({ search: query, page_size: '8' });
    // RAWG has a free tier with no key needed for basic search
    const resp = await fetch(`https://api.rawg.io/api/games?${params}&key=`);
    if (!resp.ok) return [];
    const json = await resp.json();
    return (json.results ?? []).map((item: any): RAWGResult => {
      const genre = item.genres?.[0]?.name ?? null;
      const platforms = (item.platforms ?? []).map((p: any) => p.platform?.name ?? '').filter(Boolean);
      const year = item.released ? parseInt(item.released.slice(0, 4)) : null;
      return {
        id: item.id,
        title: item.name,
        cover: item.background_image ?? null,
        genre,
        platforms,
        developer: null, // would need detail call
        releaseYear: isNaN(year!) ? null : year,
        description: null,
      };
    });
  } catch {
    return [];
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number | null; onChange?: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          onClick={() => onChange?.(n)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: onChange ? 'pointer' : 'default', color: n <= (value ?? 0) ? '#D97706' : 'var(--muted)' }}
        >
          <Star size={13} fill={n <= (value ?? 0) ? '#D97706' : 'none'} />
        </button>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: PlayStatus }) {
  const Icon = STATUS_ICONS[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
      background: `${STATUS_COLORS[status]}22`, color: STATUS_COLORS[status],
    }}>
      <Icon size={10} />{STATUS_LABELS[status]}
    </span>
  );
}

function TypeBadge({ type }: { type: GameType }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
      background: type === 'video' ? '#7C3AED22' : '#05966922',
      color: type === 'video' ? '#7C3AED' : '#059669',
    }}>
      {type === 'video' ? <Gamepad2 size={9} /> : <Dice5 size={9} />}
      {type === 'video' ? 'Video Game' : 'Board Game'}
    </span>
  );
}

// ── AI Suggestion ──────────────────────────────────────────────────────────

async function getAISuggestion(
  currentlyPlaying: Game[],
  backlog: Game[],
  mood: 'match' | 'chill'
): Promise<AISuggestion> {
  if (backlog.length === 0) return null;
  if (!supabase) return null;

  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token;
  if (!jwt) return null;

  const currentSummary = currentlyPlaying.map(g =>
    `"${g.title}" (${g.platform ?? g.game_type}, ${g.genre ?? 'unknown genre'})`
  ).join(', ') || 'nothing currently';

  const shelf = backlog.slice(0, 50).map((g, i) =>
    `${i + 1}. "${g.title}" — ${g.game_type === 'video' ? `Platform: ${g.platform ?? 'unknown'}` : `Board game, ${g.player_count ?? '?'} players`}, Genre: ${g.genre ?? 'unknown'}`
  ).join('\n');

  const moodInstruction = mood === 'chill'
    ? 'The user wants something relaxing, low-stress, or easy to pick up and put down.'
    : 'Suggest the game that best complements what they are currently playing in terms of theme or genre.';

  const prompt = `You are a thoughtful game recommender. The user is currently playing: ${currentSummary}.

${moodInstruction}

Here are the games in their backlog (choose ONLY from this list):
${shelf}

Reply with JSON only, no markdown:
{"index": <1-based index>, "reason": "<one warm specific sentence explaining why this game next>"}`;

  try {
    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }],
        }),
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = (data.content ?? []).find((b: any) => b.type === 'text')?.text ?? '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    const game = backlog[parsed.index - 1];
    if (!game) return null;
    return { game, reason: parsed.reason };
  } catch {
    return null;
  }
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function Games() {
  const [games, setGames]               = useState<Game[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [typeFilter, setTypeFilter]     = useState<GameType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<PlayStatus | 'all'>('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [sortKey, setSortKey]           = useState<SortKey>('title');
  const [sortAsc, setSortAsc]           = useState(true);
  const [viewMode, setViewMode]         = useState<ViewMode>('grid');
  const [showAdd, setShowAdd]           = useState(false);
  const [addType, setAddType]           = useState<GameType>('video');
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<RAWGResult[]>([]);
  const [searching, setSearching]       = useState(false);
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [suggestion, setSuggestion]     = useState<AISuggestion>(null);
  const [suggesting, setSuggesting]     = useState(false);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // Manual add form
  const [manualTitle, setManualTitle]       = useState('');
  const [manualPlatform, setManualPlatform] = useState('');
  const [manualGenre, setManualGenre]       = useState('');
  const [manualStatus, setManualStatus]     = useState<PlayStatus>('backlog');
  const [manualType, setManualType]         = useState<GameType>('video');
  const [manualPlayers, setManualPlayers]   = useState('');
  const [manualPlayTime, setManualPlayTime] = useState('');
  const [manualComplexity, setManualComplexity] = useState('');
  const [showManual, setShowManual]         = useState(false);
  const [fetchingCovers, setFetchingCovers] = useState(false);
  const [coverMsg, setCoverMsg]             = useState('');


  // ── Load ────────────────────────────────────────────────────────────
  const loadGames = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.from('games').select('*').order('title', { ascending: true });
    if (data) setGames(data as Game[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadGames(); }, [loadGames]);

  // ── Fetch covers via edge function ─────────────────────────────────
  async function fetchCovers() {
    if (!supabase) return;
    setFetchingCovers(true);
    setCoverMsg('Fetching covers — this may take a minute for 271 games…');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setFetchingCovers(false); return; }
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-game-covers`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` } }
      );
      const data = await resp.json();
      setCoverMsg(data.message || `Updated ${data.updated} covers`);
      await loadGames();
    } catch (e) {
      setCoverMsg('Error fetching covers. Try again.');
    }
    setFetchingCovers(false);
  }

  // ── Add from RAWG result ────────────────────────────────────────────
  async function addFromRAWG(result: RAWGResult, status: PlayStatus = 'backlog') {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const platform = result.platforms[0] ?? null;
    const row = {
      user_id: session.user.id,
      title: result.title,
      game_type: 'video' as GameType,
      platform,
      genre: result.genre,
      cover_url: result.cover,
      description: result.description,
      developer: result.developer,
      release_year: result.releaseYear,
      status,
      owned: status !== 'wishlist',
      rawg_id: result.id,
    };
    const { data, error } = await supabase.from('games').insert(row).select().single();
    if (!error && data) {
      setGames(prev => [data as Game, ...prev]);
      setSearchResults([]);
      setSearchQuery('');
      setShowAdd(false);
    }
  }

  // ── Add manually ────────────────────────────────────────────────────
  async function addManually() {
    if (!supabase || !manualTitle.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const row = {
      user_id: session.user.id,
      title: manualTitle.trim(),
      game_type: manualType,
      platform: manualPlatform.trim() || null,
      genre: manualGenre.trim() || null,
      status: manualStatus,
      owned: manualStatus !== 'wishlist',
      player_count: manualPlayers.trim() || null,
      play_time_mins: manualPlayTime ? parseInt(manualPlayTime) : null,
      complexity: manualComplexity || null,
    };
    const { data, error } = await supabase.from('games').insert(row).select().single();
    if (!error && data) {
      setGames(prev => [data as Game, ...prev]);
      setManualTitle(''); setManualPlatform(''); setManualGenre('');
      setManualStatus('backlog'); setManualPlayers(''); setManualPlayTime('');
      setManualComplexity(''); setShowManual(false); setShowAdd(false);
    }
  }

  // ── Update ──────────────────────────────────────────────────────────
  async function updateGame(id: string, patch: Partial<Game>) {
    setGames(prev => prev.map(g => g.id === id ? { ...g, ...patch } : g));
    if (!supabase) return;
    await supabase.from('games').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  }

  // ── Delete ──────────────────────────────────────────────────────────
  async function deleteGame(id: string) {
    if (!confirm('Remove this game from your collection?')) return;
    setGames(prev => prev.filter(g => g.id !== id));
    if (!supabase) return;
    await supabase.from('games').delete().eq('id', id);
  }

  // ── RAWG search ─────────────────────────────────────────────────────
  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const results = await searchRAWG(searchQuery.trim());
    setSearchResults(results);
    setSearching(false);
  }

  // ── AI suggestion ───────────────────────────────────────────────────
  async function getSuggestion(mood: 'match' | 'chill') {
    setSuggesting(true);
    setSuggestion(null);
    setSuggestionDismissed(false);
    const currentlyPlaying = games.filter(g => g.status === 'playing' || g.status === 'replaying');
    const backlog = games.filter(g => g.status === 'backlog' && g.owned);
    const result = await getAISuggestion(currentlyPlaying, backlog, mood);
    setSuggestion(result);
    setSuggesting(false);
  }

  // ── Derived data ────────────────────────────────────────────────────
  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const g of games) if (g.platform) set.add(g.platform);
    return [...set].sort();
  }, [games]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return games.filter(g => {
      if (typeFilter !== 'all' && g.game_type !== typeFilter) return false;
      if (statusFilter !== 'all' && g.status !== statusFilter) return false;
      if (platformFilter !== 'all' && g.platform !== platformFilter) return false;
      if (!q) return true;
      return (
        g.title.toLowerCase().includes(q) ||
        (g.platform ?? '').toLowerCase().includes(q) ||
        (g.genre ?? '').toLowerCase().includes(q) ||
        (g.developer ?? '').toLowerCase().includes(q)
      );
    });
  }, [games, search, typeFilter, statusFilter, platformFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case 'title':      av = a.title.toLowerCase(); bv = b.title.toLowerCase(); break;
        case 'platform':   av = (a.platform ?? '').toLowerCase(); bv = (b.platform ?? '').toLowerCase(); break;
        case 'genre':      av = (a.genre ?? '').toLowerCase(); bv = (b.genre ?? '').toLowerCase(); break;
        case 'status':     av = a.status; bv = b.status; break;
        case 'rating':     av = a.rating ?? 0; bv = b.rating ?? 0; break;
        case 'date_added': av = a.created_at; bv = b.created_at; break;
        default:           av = a.created_at; bv = b.created_at;
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortAsc]);

  const stats = useMemo(() => ({
    total:     games.filter(g => g.owned).length,
    playing:   games.filter(g => g.status === 'playing' || g.status === 'replaying').length,
    completed: games.filter(g => g.status === 'completed').length,
    backlog:   games.filter(g => g.status === 'backlog' && g.owned).length,
    wishlist:  games.filter(g => g.status === 'wishlist').length,
    video:     games.filter(g => g.game_type === 'video').length,
    board:     games.filter(g => g.game_type === 'board').length,
  }), [games]);

  const currentlyPlaying = games.filter(g => g.status === 'playing' || g.status === 'replaying');

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Games</h1>
          <p>{stats.total} owned · {stats.playing} playing · {stats.completed} completed · {stats.backlog} in backlog · {stats.wishlist} on wishlist</p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setShowAdd(v => !v)}>
            <Plus size={15} /> Add Game
          </button>
          <button className="btn ghost" onClick={fetchCovers} disabled={fetchingCovers} title="Fetch cover art from RAWG and BoardGameGeek">
            <RefreshCw size={15} className={fetchingCovers ? 'spin' : ''} /> {fetchingCovers ? 'Fetching…' : 'Fetch Covers'}
          </button>
        </div>
      </div>

      {coverMsg && (
        <section className="panel" style={{ borderLeft: '3px solid var(--purple)', padding: '10px 14px', fontSize: 13 }}>
          {fetchingCovers && <RefreshCw size={13} className="spin" style={{ marginRight: 6, verticalAlign: 'middle' }} />}
          {coverMsg}
        </section>
      )}

      {/* Stats row */}
      <div className="stats-row">
        {([
          ['Owned', stats.total],
          ['Playing', stats.playing],
          ['Completed', stats.completed],
          ['Backlog', stats.backlog],
          ['Wishlist', stats.wishlist],
          ['Video', stats.video],
          ['Board', stats.board],
        ] as [string, number][]).map(([label, val]) => (
          <div className="stat-card" key={label}>
            <div className="stat-label">{label}</div>
            <div className="stat-val">{val}</div>
          </div>
        ))}
      </div>

      {/* Add game panel */}
      {showAdd && (
        <section className="panel">
          <div className="panel-head">
            <h2>Add a game</h2>
            <button className="btn ghost" onClick={() => { setShowAdd(false); setSearchResults([]); setSearchQuery(''); setShowManual(false); }}>Close</button>
          </div>

          {/* Type selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {(['video', 'board'] as GameType[]).map(t => (
              <button
                key={t}
                className={addType === t ? 'btn primary' : 'btn ghost'}
                onClick={() => { setAddType(t); setSearchResults([]); setShowManual(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {t === 'video' ? <Gamepad2 size={14} /> : <Dice5 size={14} />}
                {t === 'video' ? 'Video Game' : 'Board Game'}
              </button>
            ))}
          </div>

          {/* Video game: search RAWG */}
          {addType === 'video' && !showManual && (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  placeholder="Search by title…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  style={{ flex: 1 }}
                />
                <button className="btn primary" onClick={handleSearch} disabled={searching}>
                  {searching ? <RefreshCw size={14} className="spin" /> : <Search size={14} />}
                  {searching ? 'Searching…' : 'Search'}
                </button>
              </div>
              <button className="btn ghost tiny" style={{ marginTop: 8 }} onClick={() => { setShowManual(true); setManualType('video'); }}>
                + Add manually instead
              </button>
              {searchResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                  {searchResults.map(result => (
                    <div key={result.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border, rgba(0,0,0,0.07))' }}>
                      {result.cover
                        ? <img src={result.cover} alt={result.title} style={{ width: 64, height: 40, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                        : <div style={{ width: 64, height: 40, background: 'var(--surface-2)', borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Gamepad2 size={18} style={{ color: 'var(--muted)' }} /></div>
                      }
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ fontSize: 14 }}>{result.title}</strong>
                        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0' }}>
                          {result.platforms.slice(0, 3).join(', ')}{result.releaseYear ? ` · ${result.releaseYear}` : ''}
                        </p>
                        {result.genre && <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>{result.genre}</p>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                        <button className="btn primary tiny" onClick={() => addFromRAWG(result, 'backlog')}>Add to backlog</button>
                        <button className="btn ghost tiny" onClick={() => addFromRAWG(result, 'playing')}>Currently playing</button>
                        <button className="btn ghost tiny" onClick={() => addFromRAWG(result, 'wishlist')}>Wishlist</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Board game or manual add */}
          {(addType === 'board' || showManual) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              <div className="form-grid">
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Title *
                  <input value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Game title" />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Type
                  <select value={manualType} onChange={e => setManualType(e.target.value as GameType)}>
                    <option value="video">Video Game</option>
                    <option value="board">Board Game</option>
                  </select>
                </label>
                {manualType === 'video' ? (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                    Platform
                    <input value={manualPlatform} onChange={e => setManualPlatform(e.target.value)} placeholder="PS5, Switch, PC…" list="platform-list" />
                    <datalist id="platform-list">{VIDEO_PLATFORMS.map(p => <option key={p} value={p} />)}</datalist>
                  </label>
                ) : (
                  <>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                      Player Count
                      <input value={manualPlayers} onChange={e => setManualPlayers(e.target.value)} placeholder="e.g. 2-4" />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                      Avg Play Time (mins)
                      <input type="number" value={manualPlayTime} onChange={e => setManualPlayTime(e.target.value)} placeholder="e.g. 60" />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                      Complexity
                      <select value={manualComplexity} onChange={e => setManualComplexity(e.target.value)}>
                        <option value="">Select…</option>
                        {BOARD_COMPLEXITY.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                  </>
                )}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Genre
                  <input value={manualGenre} onChange={e => setManualGenre(e.target.value)} placeholder="RPG, Strategy, Cooperative…" />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Status
                  <select value={manualStatus} onChange={e => setManualStatus(e.target.value as PlayStatus)}>
                    {(Object.entries(STATUS_LABELS) as [PlayStatus, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              </div>
              <button className="btn primary" onClick={addManually} disabled={!manualTitle.trim()}>
                <Plus size={14} /> Add to Collection
              </button>
            </div>
          )}
        </section>
      )}

      {/* AI Suggestion panel */}
      {!suggestionDismissed && (
        <section className="panel" style={{ borderLeft: '3px solid var(--purple, #7C3AED)' }}>
          <div className="panel-head">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Sparkles size={16} style={{ color: 'var(--purple, #7C3AED)' }} />
              What to play next
            </h2>
            <button className="btn ghost tiny" onClick={() => setSuggestionDismissed(true)}>
              <X size={13} /> I have one in mind
            </button>
          </div>

          {currentlyPlaying.length > 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 10px' }}>
              Currently playing: {currentlyPlaying.map(g => `"${g.title}"`).join(', ')}
            </p>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 10px' }}>
              Nothing currently playing — suggesting based on your backlog.
            </p>
          )}

          {!suggestion && !suggesting && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn primary"
                onClick={() => getSuggestion('match')}
                disabled={suggesting || stats.backlog === 0}
              >
                <Sparkles size={14} /> Suggest from backlog
              </button>
              <button
                className="btn ghost"
                onClick={() => getSuggestion('chill')}
                disabled={suggesting || stats.backlog === 0}
              >
                <Heart size={14} /> Something chill
              </button>
              {stats.backlog === 0 && (
                <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>No backlog games found.</span>
              )}
            </div>
          )}

          {suggesting && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13 }}>
              <RefreshCw size={14} className="spin" /> Picking your next game…
            </div>
          )}

          {suggestion && !suggesting && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {suggestion.game.cover_url
                ? <img src={suggestion.game.cover_url} alt={suggestion.game.title} style={{ width: 80, height: 50, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                : <div style={{ width: 80, height: 50, background: 'var(--surface-2)', borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Gamepad2 size={20} style={{ color: 'var(--muted)' }} /></div>
              }
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 15 }}>{suggestion.game.title}</strong>
                <p style={{ fontSize: 13, color: 'var(--muted)', margin: '2px 0 6px' }}>
                  {suggestion.game.platform ?? suggestion.game.game_type}
                  {suggestion.game.genre ? ` · ${suggestion.game.genre}` : ''}
                </p>
                <p style={{ fontSize: 13, fontStyle: 'italic', margin: '0 0 10px' }}>{suggestion.reason}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn primary tiny" onClick={() => updateGame(suggestion.game.id, { status: 'playing' })}>
                    <Gamepad2 size={12} /> Start playing
                  </button>
                  <button className="btn ghost tiny" onClick={() => getSuggestion('chill')}>
                    <Heart size={12} /> Something chill
                  </button>
                  <button className="btn ghost tiny" onClick={() => getSuggestion('match')}>
                    <RefreshCw size={12} /> Try again
                  </button>
                  <button className="btn ghost tiny" onClick={() => setSuggestionDismissed(true)}>
                    <X size={12} /> I have one in mind
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Filters + sort */}
      <section className="panel" style={{ paddingBottom: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 0 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input placeholder="Search title, platform, genre…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32, width: '100%', boxSizing: 'border-box' }} />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as GameType | 'all')}>
            <option value="all">All types</option>
            <option value="video">🎮 Video Games</option>
            <option value="board">🎲 Board Games</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as PlayStatus | 'all')}>
            <option value="all">All statuses</option>
            <option value="playing">🎮 Playing</option>
            <option value="backlog">📚 Backlog</option>
            <option value="completed">✅ Completed</option>
            <option value="wishlist">🛒 Wishlist</option>
            <option value="dropped">❌ Dropped</option>
            <option value="replaying">🔁 Replaying</option>
          </select>
          {platforms.length > 0 && (
            <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)} style={{ maxWidth: 140 }}>
              <option value="all">All platforms</option>
              {platforms.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
            {(['title', 'platform', 'genre', 'status', 'rating', 'date_added'] as SortKey[]).map(key => (
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
        {filtered.length !== games.length && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>Showing {filtered.length} of {games.length}</p>
        )}
      </section>

      {/* Grid / List */}
      {loading && (
        <section className="panel">
          <div style={{ display: 'flex', gap: 8, color: 'var(--muted)' }}><RefreshCw size={14} className="spin" /> Loading your collection…</div>
        </section>
      )}

      {!loading && sorted.length === 0 && (
        <section className="panel">
          <div className="brief-item">No games found. Add your first game above!</div>
        </section>
      )}

      {!loading && sorted.length > 0 && viewMode === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, padding: '4px 0' }}>
          {sorted.map(game => (
            <GameCard key={game.id} game={game} onUpdate={updateGame} onDelete={deleteGame} />
          ))}
        </div>
      )}

      {!loading && sorted.length > 0 && viewMode === 'list' && (
        <section className="panel" style={{ paddingBottom: 4 }}>
          {sorted.map(game => (
            <GameListRow
              key={game.id}
              game={game}
              expanded={expandedId === game.id}
              onToggle={() => setExpandedId(expandedId === game.id ? null : game.id)}
              onUpdate={updateGame}
              onDelete={deleteGame}
            />
          ))}
        </section>
      )}
    </>
  );
}

// ── GameCard (grid view) ───────────────────────────────────────────────────

function GameCard({ game, onUpdate, onDelete }: { game: Game; onUpdate: (id: string, patch: Partial<Game>) => void; onDelete: (id: string) => void }) {
  const [hover, setHover] = useState(false);
  const Icon = game.game_type === 'video' ? Gamepad2 : Dice5;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ borderRadius: 8, overflow: 'hidden', background: 'var(--surface, #fff)', border: '1px solid var(--border, rgba(0,0,0,0.07))', cursor: 'pointer', transition: 'box-shadow 120ms', boxShadow: hover ? '0 4px 12px rgba(0,0,0,0.12)' : 'none', position: 'relative' }}
    >
      {game.cover_url
        ? <img src={game.cover_url} alt={game.title} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        : <div style={{ width: '100%', aspectRatio: '16/9', background: `${STATUS_COLORS[game.status]}18`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 6px' }}>
            <Icon size={22} style={{ color: STATUS_COLORS[game.status], flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: STATUS_COLORS[game.status], textAlign: 'center', lineHeight: 1.3, fontWeight: 600, wordBreak: 'break-word' }}>{game.title.slice(0, 40)}</span>
          </div>
      }
      <div style={{ padding: '8px 8px 6px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, marginBottom: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{game.title}</div>
        {game.platform && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{game.platform}</div>}
        <StatusPill status={game.status} />
        {game.rating && <div style={{ marginTop: 4 }}><StarRating value={game.rating} /></div>}
      </div>
      {hover && (
        <div style={{ position: 'absolute', top: 6, right: 6 }}>
          <select
            value={game.status}
            onChange={e => onUpdate(game.id, { status: e.target.value as PlayStatus })}
            onClick={e => e.stopPropagation()}
            style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4 }}
          >
            {(Object.entries(STATUS_LABELS) as [PlayStatus, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

// ── GameListRow (list view) ────────────────────────────────────────────────

function GameListRow({ game, expanded, onToggle, onUpdate, onDelete }: {
  game: Game;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, patch: Partial<Game>) => void;
  onDelete: (id: string) => void;
}) {
  const Icon = game.game_type === 'video' ? Gamepad2 : Dice5;
  return (
    <div>
      <button
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'none', border: 'none', padding: '9px 4px', borderBottom: expanded ? 'none' : '1px solid var(--border, rgba(0,0,0,0.07))', cursor: 'pointer', textAlign: 'left' }}
      >
        {game.cover_url
          ? <img src={game.cover_url} alt={game.title} style={{ width: 46, height: 28, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          : <div style={{ width: 46, height: 28, background: `${STATUS_COLORS[game.status]}22`, borderRadius: 3, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={14} style={{ color: STATUS_COLORS[game.status] }} />
            </div>
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{game.title}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {game.platform ?? (game.game_type === 'board' ? 'Board Game' : '')}
            {game.genre ? ` · ${game.genre}` : ''}
            {game.game_type === 'board' && game.player_count ? ` · ${game.player_count} players` : ''}
          </div>
        </div>
        <TypeBadge type={game.game_type} />
        <StatusPill status={game.status} />
        {game.rating && <StarRating value={game.rating} />}
        {expanded ? <ChevronUp size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
      </button>

      {expanded && (
        <div style={{ padding: '10px 4px 14px 62px', borderBottom: '1px solid var(--border, rgba(0,0,0,0.07))', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {game.description && <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>{game.description.slice(0, 300)}{game.description.length > 300 ? '…' : ''}</p>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              Status
              <select value={game.status} onChange={e => onUpdate(game.id, { status: e.target.value as PlayStatus })} style={{ fontSize: 12 }}>
                {(Object.entries(STATUS_LABELS) as [PlayStatus, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              Rating
              <StarRating value={game.rating} onChange={r => onUpdate(game.id, { rating: r })} />
            </label>
            {game.game_type === 'video' && (
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                Hours played
                <input
                  type="number"
                  value={game.hours_played ?? ''}
                  onChange={e => onUpdate(game.id, { hours_played: e.target.value ? parseFloat(e.target.value) : null })}
                  style={{ fontSize: 12, width: 60 }}
                />
              </label>
            )}
            {game.game_type === 'board' && game.complexity && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Complexity: {game.complexity}</span>
            )}
            {game.game_type === 'board' && game.play_time_mins && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>~{game.play_time_mins} min/game</span>
            )}
          </div>
          {(game.status === 'playing' || game.status === 'replaying') && (
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              Started
              <input type="date" value={game.date_started ?? ''} onChange={e => onUpdate(game.id, { date_started: e.target.value || null })} style={{ fontSize: 12 }} />
            </label>
          )}
          {game.status === 'completed' && (
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              Completed
              <input type="date" value={game.date_completed ?? ''} onChange={e => onUpdate(game.id, { date_completed: e.target.value || null })} style={{ fontSize: 12 }} />
            </label>
          )}
          <textarea
            placeholder="Notes…"
            value={game.notes ?? ''}
            onChange={e => onUpdate(game.id, { notes: e.target.value || null })}
            style={{ fontSize: 13, minHeight: 60, resize: 'vertical' }}
          />
          <div>
            <button className="btn warning tiny" onClick={() => onDelete(game.id)}><X size={12} /> Remove from collection</button>
          </div>
        </div>
      )}
    </div>
  );
}
