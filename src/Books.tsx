// src/Books.tsx
//
// Library tab — personal book collection with:
//   • Add by title (auto-enriched via Google Books API)
//   • Goodreads CSV import for reading status + wishlist
//   • Sort/filter by title, author, genre, status
//   • AI-powered next-read suggestions from your own shelf
//   • Mood override ("suggest something more uplifting") or full dismiss

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen, Plus, Upload, Search, RefreshCw, Star, CheckCircle2,
  Clock, BookMarked, Heart, Sparkles, X, ChevronDown, ChevronUp,
  List, LayoutGrid, Filter,
} from 'lucide-react';
import { supabase } from './lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

type ReadStatus = 'unread' | 'reading' | 'read' | 'wishlist' | 'dnf';

type Book = {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  google_books_id: string | null;
  cover_url: string | null;
  genre: string | null;
  categories: string[] | null;
  description: string | null;
  published_year: number | null;
  page_count: number | null;
  owned: boolean;
  status: ReadStatus;
  rating: number | null;
  date_started: string | null;
  date_finished: string | null;
  goodreads_id: string | null;
  goodreads_shelf: string | null;
  goodreads_rating: number | null;
  goodreads_date_read: string | null;
  notes: string | null;
  suggestion_dismissed: boolean;
  created_at: string;
};

type GoogleBooksResult = {
  id: string;
  title: string;
  authors: string[];
  isbn: string | null;
  cover: string | null;
  categories: string[];
  description: string;
  publishedYear: number | null;
  pageCount: number | null;
};

type SortKey = 'title' | 'author' | 'genre' | 'status' | 'date_added' | 'rating';
type ViewMode = 'grid' | 'list';
type AISuggestion = { book: Book; reason: string } | null;

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ReadStatus, string> = {
  unread: 'Unread',
  reading: 'Currently Reading',
  read: 'Read',
  wishlist: 'Wishlist (To Buy)',
  dnf: 'Did Not Finish',
};

const STATUS_COLORS: Record<ReadStatus, string> = {
  unread: '#6b7280',
  reading: '#7C3AED',
  read: '#059669',
  wishlist: '#D97706',
  dnf: '#DC2626',
};

const STATUS_ICONS: Record<ReadStatus, React.ElementType> = {
  unread: BookOpen,
  reading: BookMarked,
  read: CheckCircle2,
  wishlist: Heart,
  dnf: X,
};

// ── Google Books API ───────────────────────────────────────────────────────

async function searchGoogleBooks(query: string): Promise<GoogleBooksResult[]> {
  const params = new URLSearchParams({ q: query, maxResults: '8', printType: 'books' });
  const resp = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`);
  if (!resp.ok) return [];
  const json = await resp.json();
  return (json.items ?? []).map((item: any): GoogleBooksResult => {
    const info = item.volumeInfo ?? {};
    const isbn = info.industryIdentifiers?.find((i: any) => i.type === 'ISBN_13')?.identifier
      ?? info.industryIdentifiers?.find((i: any) => i.type === 'ISBN_10')?.identifier
      ?? null;
    const cover = info.imageLinks?.thumbnail?.replace('http://', 'https://') ?? null;
    const year = info.publishedDate ? parseInt(info.publishedDate.slice(0, 4)) : null;
    return {
      id: item.id,
      title: info.title ?? 'Unknown Title',
      authors: info.authors ?? [],
      isbn,
      cover,
      categories: info.categories ?? [],
      description: info.description ?? '',
      publishedYear: isNaN(year!) ? null : year,
      pageCount: info.pageCount ?? null,
    };
  });
}

// ── Goodreads CSV parser ───────────────────────────────────────────────────

type GoodreadsRow = {
  title: string;
  author: string;
  isbn: string;
  isbn13: string;
  goodreads_id: string;
  shelf: string;
  rating: number | null;
  date_read: string | null;
  date_added: string | null;
};

function parseGoodreadsCSV(text: string): GoodreadsRow[] {
  // Full RFC-4180 parser — handles embedded newlines and commas inside quoted fields
  // (Goodreads My Review field contains newlines which break simple line-split parsers)
  const allRows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cell += ch; }
    } else {
      if (ch === '"') { inQ = true; }
      else if (ch === ',') { row.push(cell.trim()); cell = ''; }
      else if (ch === '\n' || (ch === '\r' && text[i+1] === '\n')) {
        if (ch === '\r') i++;
        row.push(cell.trim());
        if (row.some(c => c)) allRows.push(row);
        row = []; cell = '';
      } else { cell += ch; }
    }
  }
  if (cell || row.length) { row.push(cell.trim()); if (row.some(c => c)) allRows.push(row); }

  if (allRows.length < 2) return [];
  const headers = allRows[0].map(h => h.replace(/"/g,'').trim().toLowerCase().replace(/\s+/g,'_'));

  const idx = (name: string) => {
    const exact = headers.indexOf(name);
    if (exact >= 0) return exact;
    return headers.findIndex(h => h.replace(/[^a-z0-9]/g,'') === name.replace(/[^a-z0-9]/g,''));
  };
  const titleIdx     = idx('title');
  const authorIdx    = idx('author');
  const isbnIdx      = idx('isbn');
  const isbn13Idx    = idx('isbn13');
  const idIdx        = idx('book_id') >= 0 ? idx('book_id') : idx('bookid');
  const shelfIdx     = idx('exclusive_shelf') >= 0 ? idx('exclusive_shelf') : idx('exclusiveshelf');
  const ratingIdx    = idx('my_rating') >= 0 ? idx('my_rating') : idx('myrating');
  const dateReadIdx  = idx('date_read') >= 0 ? idx('date_read') : idx('dateread');
  const dateAddedIdx = idx('date_added') >= 0 ? idx('date_added') : idx('dateadded');

  const results: GoodreadsRow[] = [];
  for (let i = 1; i < allRows.length; i++) {
    const cells = allRows[i];
    const get = (i: number) => (i >= 0 ? (cells[i] ?? '').replace(/"/g,'').trim() : '');
    const title = get(titleIdx);
    if (!title) continue;
    const ratingRaw = parseInt(get(ratingIdx));
    results.push({
      title,
      author: get(authorIdx),
      isbn: get(isbnIdx).replace(/[^0-9X]/gi, ''),
      isbn13: get(isbn13Idx).replace(/[^0-9]/g, ''),
      goodreads_id: get(idIdx),
      shelf: get(shelfIdx) || 'read',
      rating: isNaN(ratingRaw) || ratingRaw === 0 ? null : ratingRaw,
      date_read: get(dateReadIdx) || null,
      date_added: get(dateAddedIdx) || null,
    });
  }
  return results;
}

function goodreadsShelfToStatus(shelf: string): ReadStatus {
  const s = shelf.toLowerCase().trim();
  if (s === 'currently-reading') return 'reading';
  if (s === 'to-read') return 'unread';   // owned, not yet read
  if (s === 'to-buy') return 'wishlist';  // not owned yet
  if (s === 'did-not-finish') return 'dnf';
  if (s === 'read') return 'read';
  return 'unread';
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

function StatusPill({ status }: { status: ReadStatus }) {
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

// ── AI Suggestion via Anthropic API ───────────────────────────────────────

async function getAISuggestion(
  currentlyReading: Book[],
  unreadOwned: Book[],
  mood: 'match' | 'uplifting'
): Promise<AISuggestion> {
  if (unreadOwned.length === 0) return null;

  const currentSummary = currentlyReading.map(b =>
    `"${b.title}" by ${b.author ?? 'unknown'} (${b.genre ?? (b.categories?.[0] ?? 'unknown genre')})`
  ).join(', ') || 'nothing currently';

  const shelf = unreadOwned.map((b, i) =>
    `${i + 1}. "${b.title}" by ${b.author ?? 'unknown'} — genre: ${b.genre ?? (b.categories?.[0] ?? 'unknown')}`
  ).join('\n');

  const moodInstruction = mood === 'uplifting'
    ? 'The user wants something uplifting, feel-good, or lighter in tone. Avoid heavy, sad, or dark books.'
    : 'Suggest the book that best complements or follows on thematically from what they are currently reading.';

  const prompt = `You are a thoughtful book recommender. The user is currently reading: ${currentSummary}.

${moodInstruction}

Here are the unread books they already own (choose ONLY from this list):
${shelf}

Reply with JSON only, no markdown:
{"index": <1-based index from the list>, "reason": "<one warm, specific sentence explaining why this book next>"}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text ?? '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    const book = unreadOwned[parsed.index - 1];
    if (!book) return null;
    return { book, reason: parsed.reason };
  } catch {
    return null;
  }
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Books() {
  const [books, setBooks]             = useState<Book[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState<ReadStatus | 'all'>('all');
  const [genreFilter, setGenreFilter] = useState('all');
  const [sortKey, setSortKey]         = useState<SortKey>('title');
  const [sortAsc, setSortAsc]         = useState(true);
  const [viewMode, setViewMode]       = useState<ViewMode>('grid');
  const [showAdd, setShowAdd]         = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [importing, setImporting]     = useState(false);
  const [importMsg, setImportMsg]     = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GoogleBooksResult[]>([]);
  const [searching, setSearching]     = useState(false);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [suggestion, setSuggestion]   = useState<AISuggestion>(null);
  const [suggesting, setSuggesting]   = useState(false);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // ── Load books ──────────────────────────────────────────────────────
  const loadBooks = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.from('books').select('*').order('created_at', { ascending: false });
    if (data) setBooks(data as Book[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadBooks(); }, [loadBooks]);

  // ── Add book from Google Books result ───────────────────────────────
  async function addBook(result: GoogleBooksResult, status: ReadStatus = 'unread') {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const genre = result.categories[0]?.split('/')[0]?.trim() ?? null;
    const row = {
      user_id: session.user.id,
      title: result.title,
      author: result.authors.join(', ') || null,
      isbn: result.isbn,
      google_books_id: result.id,
      cover_url: result.cover,
      genre,
      categories: result.categories.length ? result.categories : null,
      description: result.description || null,
      published_year: result.publishedYear,
      page_count: result.pageCount,
      owned: status !== 'wishlist',
      status,
    };
    const { data, error } = await supabase.from('books').insert(row).select().single();
    if (!error && data) {
      setBooks(prev => [data as Book, ...prev]);
      setSearchResults([]);
      setSearchQuery('');
      setShowAdd(false);
    }
  }

  // ── Update book field ───────────────────────────────────────────────
  async function updateBook(id: string, patch: Partial<Book>) {
    setBooks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
    if (!supabase) return;
    await supabase.from('books').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  }

  // ── Delete book ─────────────────────────────────────────────────────
  async function deleteBook(id: string) {
    if (!confirm('Remove this book from your library?')) return;
    setBooks(prev => prev.filter(b => b.id !== id));
    if (!supabase) return;
    await supabase.from('books').delete().eq('id', id);
  }

  // ── Google Books search ─────────────────────────────────────────────
  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const results = await searchGoogleBooks(searchQuery.trim());
    setSearchResults(results);
    setSearching(false);
  }

  // ── Goodreads CSV import ────────────────────────────────────────────
  async function handleGoodreadsImport(file: File) {
    if (!supabase) return;
    setImporting(true);
    setImportMsg('Reading CSV…');
    const text = await file.text();
    const rows = parseGoodreadsCSV(text);
    if (!rows.length) { setImportMsg('No rows found. Make sure this is a Goodreads export CSV.'); setImporting(false); return; }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setImporting(false); return; }

    setImportMsg(`Found ${rows.length} books. Importing…`);
    let added = 0, updated = 0, skipped = 0;

    for (const row of rows) {
      const status = goodreadsShelfToStatus(row.shelf);
      // Check if already exists by goodreads_id or title+author match
      const existing = books.find(b =>
        (row.goodreads_id && b.goodreads_id === row.goodreads_id) ||
        (b.title.toLowerCase() === row.title.toLowerCase() && (b.author ?? '').toLowerCase() === row.author.toLowerCase())
      );

      if (existing) {
        const patch: Partial<Book> = {
          goodreads_id: row.goodreads_id || existing.goodreads_id,
          goodreads_shelf: row.shelf,
          goodreads_rating: row.rating,
          goodreads_date_read: row.date_read,
          status,
          // Goodreads is source of truth for status — update owned accordingly
          owned: status !== 'wishlist',
        };
        await supabase.from('books').update(patch).eq('id', existing.id);
        updated++;
      } else {
        // Try to enrich from Google Books
        let enriched: GoogleBooksResult | null = null;
        try {
          const query = row.isbn13 || row.isbn ? `isbn:${row.isbn13 || row.isbn}` : `intitle:${row.title} inauthor:${row.author}`;
          const results = await searchGoogleBooks(query);
          enriched = results[0] ?? null;
        } catch { /* enrichment optional */ }

        const genre = enriched?.categories[0]?.split('/')[0]?.trim() ?? null;
        await supabase.from('books').insert({
          user_id: session.user.id,
          title: row.title,
          author: row.author || null,
          isbn: row.isbn13 || row.isbn || enriched?.isbn || null,
          google_books_id: enriched?.id ?? null,
          cover_url: enriched?.cover ?? null,
          genre,
          categories: enriched?.categories?.length ? enriched.categories : null,
          description: enriched?.description || null,
          published_year: enriched?.publishedYear ?? null,
          page_count: enriched?.pageCount ?? null,
          owned: status !== 'wishlist',
          status,
          goodreads_id: row.goodreads_id || null,
          goodreads_shelf: row.shelf,
          goodreads_rating: row.rating,
          goodreads_date_read: row.date_read,
        });
        added++;
      }
    }

    await loadBooks();
    setImportMsg(`Done! Added ${added}, updated ${updated}${skipped ? `, skipped ${skipped}` : ''}.`);
    setImporting(false);
  }



  // ── Fetch covers from Google Books ──────────────────────────────────
  async function fetchCovers() {
    if (!supabase) return;
    const needsCovers = books.filter(b => !b.cover_url && b.title);
    if (!needsCovers.length) { return; }
    setImportMsg(`Fetching covers for ${needsCovers.length} books...`);
    setShowImport(true);
    let updated = 0;
    for (const book of needsCovers) {
      try {
        const query = book.isbn
          ? `isbn:${book.isbn}`
          : `intitle:${encodeURIComponent(book.title)}${book.author ? `+inauthor:${encodeURIComponent(book.author.split(' & ')[0])}` : ''}`;
        const resp = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1&printType=books`);
        const json = await resp.json();
        const item = json.items?.[0];
        if (!item) continue;
        const info = item.volumeInfo ?? {};
        const cover = info.imageLinks?.thumbnail?.replace('http://', 'https://') ?? null;
        const genre = book.genre || (info.categories?.[0]?.split('/')[0]?.trim() ?? null);
        const description = book.description || info.description || null;
        const page_count = book.page_count || info.pageCount || null;
        const google_books_id = item.id ?? null;
        if (cover || genre || description) {
          await supabase.from('books').update({
            cover_url: cover ?? book.cover_url,
            genre: genre ?? book.genre,
            description: description ?? book.description,
            page_count: page_count ?? book.page_count,
            google_books_id: google_books_id ?? book.google_books_id,
            updated_at: new Date().toISOString(),
          }).eq('id', book.id);
          updated++;
        }
        // Rate limit — Google Books free tier allows ~1 req/100ms
        await new Promise(r => setTimeout(r, 120));
        if (updated % 50 === 0 && updated > 0) {
          setImportMsg(`Fetched ${updated} covers so far...`);
        }
      } catch { /* skip failed books */ }
    }
    await loadBooks();
    setImportMsg(`Done! Fetched covers/metadata for ${updated} books.`);
  }

  // ── Merged library CSV import (iCollect + Goodreads pre-merged) ─────
  async function handleMergedImport(file: File) {
    if (!supabase) return;
    setImporting(true);
    setImportMsg('Reading CSV...');
    const text = await file.text();
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) { setImportMsg('No rows found.'); setImporting(false); return; }
    const headers = lines[0].split(',').map(h => h.replace(/"/g,'').trim().toLowerCase());
    const col = (name: string) => headers.indexOf(name);
    const tIdx = col('title'), aIdx = col('author'), gIdx = col('genre');
    const isbnIdx = col('isbn'), pgIdx = col('page_count'), rIdx = col('rating');
    const stIdx = col('status'), ownIdx = col('owned'), synIdx = col('synopsis');
    const grIdIdx = col('goodreads_id'), grShelfIdx = col('goodreads_shelf');
    const grRatingIdx = col('goodreads_rating'), grDateIdx = col('goodreads_date_read');
    const pubYrIdx = col('published_year');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setImporting(false); return; }
    let added = 0, skipped = 0;
    setImportMsg(`Found ${lines.length - 1} books. Importing...`);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cells: string[] = [];
      let cur = '', inQ = false;
      for (const ch of line + ',') {
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      const get = (i: number) => i >= 0 ? (cells[i] ?? '').replace(/"/g,'').trim() : '';
      const title = get(tIdx);
      if (!title) continue;
      const exists = books.find(b => b.title.toLowerCase() === title.toLowerCase());
      if (exists) { skipped++; continue; }
      const ratingRaw = parseInt(get(rIdx));
      const pgRaw = parseInt(get(pgIdx));
      const pubYrRaw = parseInt(get(pubYrIdx));
      const grRatingRaw = parseInt(get(grRatingIdx));
      const ownedRaw = get(ownIdx);
      await supabase.from('books').insert({
        user_id: session.user.id,
        title,
        author: get(aIdx) || null,
        genre: get(gIdx) || null,
        isbn: get(isbnIdx) || null,
        page_count: isNaN(pgRaw) ? null : pgRaw,
        published_year: isNaN(pubYrRaw) ? null : pubYrRaw,
        rating: isNaN(ratingRaw) || ratingRaw === 0 ? null : ratingRaw,
        status: (get(stIdx) as ReadStatus) || 'unread',
        owned: ownedRaw !== 'false' && ownedRaw !== 'False',
        description: get(synIdx) || null,
        goodreads_id: get(grIdIdx) || null,
        goodreads_shelf: get(grShelfIdx) || null,
        goodreads_rating: isNaN(grRatingRaw) || grRatingRaw === 0 ? null : grRatingRaw,
        goodreads_date_read: get(grDateIdx) || null,
      });
      added++;
      if (added % 100 === 0) setImportMsg(`Imported ${added} so far...`);
    }
    await loadBooks();
    setImportMsg(`Done! Added ${added} books${skipped ? `, skipped ${skipped} duplicates` : ''}.`);
    setImporting(false);
  }

  // ── iCollect CSV import ─────────────────────────────────────────────
  function fixEncoding(text: string): string {
    return text
      .replace(/â€™/g, "'").replace(/â€˜/g, "'")
      .replace(/â€œ/g, '"').replace(/â€/g, '"')
      .replace(/â€"/g, '—').replace(/â€"/g, '–')
      .replace(/â€¦/g, '…').replace(/Â/g, '')
      .trim();
  }

  function convertAuthor(raw: string): string {
    if (!raw) return '';
    raw = fixEncoding(raw);
    const parts = raw.split(',').map(p => p.trim());
    if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
    if (parts.length === 4) return `${parts[1]} ${parts[0]} & ${parts[3]} ${parts[2]}`;
    if (parts.length > 2 && parts.length % 2 === 0) {
      const authors = [];
      for (let i = 0; i < parts.length; i += 2) authors.push(`${parts[i+1]} ${parts[i]}`);
      return authors.join(' & ');
    }
    return raw;
  }

  async function handleiCollectImport(file: File) {
    if (!supabase) return;
    setImporting(true);
    setImportMsg('Reading CSV…');
    const text = await file.text();
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) { setImportMsg('No rows found.'); setImporting(false); return; }
    const headers = lines[0].split(',').map(h => h.replace(/"/g,'').trim().toLowerCase());
    const idx = (name: string) => headers.indexOf(name);
    const tIdx = idx('title'), aIdx = idx('author'), gIdx = idx('genre');
    const isbnIdx = idx('isbn'), pgIdx = idx('page_count'), rIdx = idx('rating');
    const stIdx = idx('status'), synIdx = idx('synopsis');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setImporting(false); return; }
    let added = 0, skipped = 0;
    setImportMsg(`Found ${lines.length - 1} books. Importing…`);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cells: string[] = [];
      let cur = '', inQ = false;
      for (const ch of line + ',') {
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      const get = (i: number) => i >= 0 ? (cells[i] ?? '').replace(/"/g,'').trim() : '';
      const title = fixEncoding(get(tIdx));
      if (!title) continue;
      const exists = books.find(b => b.title.toLowerCase() === title.toLowerCase());
      if (exists) { skipped++; continue; }
      const ratingRaw = parseInt(get(rIdx));
      const pgRaw = parseInt(get(pgIdx));
      await supabase.from('books').insert({
        user_id: session.user.id,
        title,
        author: convertAuthor(get(aIdx)) || null,
        genre: fixEncoding(get(gIdx).split(',')[0]) || null,
        isbn: get(isbnIdx) || null,
        page_count: isNaN(pgRaw) ? null : pgRaw,
        rating: isNaN(ratingRaw) || ratingRaw === 0 ? null : ratingRaw,
        status: (get(stIdx) as ReadStatus) || 'unread',
        owned: true,
        description: get(synIdx) || null,
      });
      added++;
      if (added % 50 === 0) setImportMsg(`Imported ${added} so far…`);
    }
    await loadBooks();
    setImportMsg(`Done! Added ${added} books${skipped ? `, skipped ${skipped} duplicates` : ''}.`);
    setImporting(false);
  }

  // ── AI suggestion ───────────────────────────────────────────────────
  async function getSuggestion(mood: 'match' | 'uplifting') {
    setSuggesting(true);
    setSuggestion(null);
    setSuggestionDismissed(false);
    const currentlyReading = books.filter(b => b.status === 'reading');
    // Fall back to recently read books if nothing currently reading
    const context = currentlyReading.length > 0
      ? currentlyReading
      : books.filter(b => b.status === 'read' && b.goodreads_date_read).sort((a,b) => (b.goodreads_date_read ?? '').localeCompare(a.goodreads_date_read ?? '')).slice(0, 3);
    const unreadOwned = books.filter(b => b.status === 'unread' && b.owned);
    const result = await getAISuggestion(context, unreadOwned, mood);
    setSuggestion(result);
    setSuggesting(false);
  }

  // ── Derived data ────────────────────────────────────────────────────
  const genres = useMemo(() => {
    const set = new Set<string>();
    for (const b of books) if (b.genre) set.add(b.genre);
    return [...set].sort();
  }, [books]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return books.filter(b => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (genreFilter !== 'all' && b.genre !== genreFilter) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        (b.author ?? '').toLowerCase().includes(q) ||
        (b.genre ?? '').toLowerCase().includes(q)
      );
    });
  }, [books, search, statusFilter, genreFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case 'title':      av = a.title.toLowerCase(); bv = b.title.toLowerCase(); break;
        case 'author':     av = (a.author ?? '').toLowerCase(); bv = (b.author ?? '').toLowerCase(); break;
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
    total:    books.filter(b => b.owned).length,
    read:     books.filter(b => b.status === 'read').length,
    reading:  books.filter(b => b.status === 'reading').length,
    unread:   books.filter(b => b.status === 'unread' && b.owned).length,
    wishlist: books.filter(b => b.status === 'wishlist').length,
    dnf:      books.filter(b => b.status === 'dnf').length,
  }), [books]);

  const currentlyReading = books.filter(b => b.status === 'reading');

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
          <h1>Library</h1>
          <p>{stats.total} owned · {stats.read} read · {stats.reading} reading · {stats.unread} unread · {stats.wishlist} on wishlist</p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => { setShowAdd(v => !v); setShowImport(false); }}>
            <Plus size={15} /> Add Book
          </button>
          <label className="btn ghost" style={{ cursor: 'pointer' }}>
            <Upload size={15} /> Import Goodreads
            <input type="file" accept=".csv" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) { setShowImport(true); handleGoodreadsImport(f); } }} />
          </label>
          <label className="btn ghost" style={{ cursor: 'pointer' }}>
            <Upload size={15} /> Import Library CSV
            <input type="file" accept=".csv" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) { setShowImport(true); handleMergedImport(f); } }} />
          </label>
          <button className="btn ghost" onClick={fetchCovers} title="Fetch missing covers and metadata from Google Books">
            <RefreshCw size={15} /> Fetch Covers
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="stats-row">
        {([['Owned', stats.total], ['Read', stats.read], ['Reading', stats.reading], ['Unread', stats.unread], ['Wishlist', stats.wishlist], ['DNF', stats.dnf]] as [string, number][]).map(([label, val]) => (
          <div className="stat-card" key={label}>
            <div className="stat-label">{label}</div>
            <div className="stat-val">{val}</div>
          </div>
        ))}
      </div>

      {/* Goodreads import status */}
      {showImport && (
        <section className="panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {importing && <RefreshCw size={14} className="spin" />}
            <span style={{ fontSize: 13 }}>{importMsg}</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>
            To export from Goodreads: My Books → Import/Export → Export Library
          </p>
        </section>
      )}

      {/* Add book panel */}
      {showAdd && (
        <section className="panel">
          <div className="panel-head">
            <h2>Add a book</h2>
            <button className="btn ghost" onClick={() => { setShowAdd(false); setSearchResults([]); setSearchQuery(''); }}>Close</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="Search by title or author…"
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
          {searchResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {searchResults.map(result => (
                <div key={result.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border, rgba(0,0,0,0.07))' }}>
                  {result.cover
                    ? <img src={result.cover} alt={result.title} style={{ width: 48, height: 68, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                    : <div style={{ width: 48, height: 68, background: 'var(--surface-2)', borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BookOpen size={18} style={{ color: 'var(--muted)' }} /></div>
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: 14 }}>{result.title}</strong>
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0' }}>{result.authors.join(', ')}{result.publishedYear ? ` · ${result.publishedYear}` : ''}</p>
                    {result.categories[0] && <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>{result.categories[0]}</p>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                    <button className="btn primary tiny" onClick={() => addBook(result, 'unread')}>Add to library</button>
                    <button className="btn ghost tiny" onClick={() => addBook(result, 'reading')}>Currently reading</button>
                    <button className="btn ghost tiny" onClick={() => addBook(result, 'wishlist')}>Wishlist</button>
                  </div>
                </div>
              ))}
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
              What to read next
            </h2>
            <button className="btn ghost tiny" onClick={() => setSuggestionDismissed(true)}>
              <X size={13} /> I have one in mind
            </button>
          </div>

          {currentlyReading.length > 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 10px' }}>
              Currently reading: {currentlyReading.map(b => `"${b.title}"`).join(', ')}
            </p>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 10px' }}>
              No current read — suggesting based on your recent reads and shelf.
            </p>
          )}

          {!suggestion && !suggesting && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={() => getSuggestion('match')} disabled={suggesting || books.filter(b => b.status === 'unread' && b.owned).length === 0}>
                <Sparkles size={14} /> Suggest from my shelf
              </button>
              <button className="btn ghost" onClick={() => getSuggestion('uplifting')} disabled={suggesting || books.filter(b => b.status === 'unread' && b.owned).length === 0}>
                <Heart size={14} /> Something more uplifting
              </button>
              {books.filter(b => b.status === 'unread' && b.owned).length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>No unread owned books found.</span>
              )}
            </div>
          )}

          {suggesting && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13 }}>
              <RefreshCw size={14} className="spin" /> Picking your next read…
            </div>
          )}

          {suggestion && !suggesting && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {suggestion.book.cover_url
                ? <img src={suggestion.book.cover_url} alt={suggestion.book.title} style={{ width: 56, height: 80, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                : <div style={{ width: 56, height: 80, background: 'var(--surface-2)', borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BookOpen size={20} style={{ color: 'var(--muted)' }} /></div>
              }
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 15 }}>{suggestion.book.title}</strong>
                <p style={{ fontSize: 13, color: 'var(--muted)', margin: '2px 0 6px' }}>{suggestion.book.author}</p>
                <p style={{ fontSize: 13, fontStyle: 'italic', margin: '0 0 10px' }}>{suggestion.reason}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn primary tiny" onClick={() => updateBook(suggestion.book.id, { status: 'reading' })}>
                    <BookMarked size={12} /> Start reading
                  </button>
                  <button className="btn ghost tiny" onClick={() => getSuggestion('uplifting')}>
                    <Heart size={12} /> Something more uplifting
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', boxSizing: 'border-box' }}>
          <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 0, boxSizing: 'border-box' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input placeholder="Search title, author, genre…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32, width: '100%', boxSizing: 'border-box' }} />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as ReadStatus | 'all')} style={{ flex: '0 0 auto' }}>
            <option value="all">All books</option>
            <option value="reading">📖 Currently Reading</option>
            <option value="unread">📚 Owned — Unread</option>
            <option value="read">✅ Read</option>
            <option value="wishlist">🛒 Wishlist (To Buy)</option>
            <option value="dnf">❌ Did Not Finish</option>
          </select>
          {genres.length > 0 && (
            <select value={genreFilter} onChange={e => setGenreFilter(e.target.value)} style={{ flex: '0 0 auto', maxWidth: 160 }}>
              <option value="all">All genres</option>
              {genres.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
            {(['title','author','genre','status','rating','date_added'] as SortKey[]).map(key => (
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
        {filtered.length !== books.length && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>Showing {filtered.length} of {books.length}</p>
        )}
      </section>

      {/* Book grid / list */}
      {loading && (
        <section className="panel"><div style={{ display: 'flex', gap: 8, color: 'var(--muted)' }}><RefreshCw size={14} className="spin" /> Loading your library…</div></section>
      )}

      {!loading && sorted.length === 0 && (
        <section className="panel">
          <div className="brief-item">No books found. Add your first book above or import from Goodreads!</div>
        </section>
      )}

      {!loading && sorted.length > 0 && viewMode === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, padding: '4px 0' }}>
          {sorted.map(book => (
            <BookCard key={book.id} book={book} onUpdate={updateBook} onDelete={deleteBook} />
          ))}
        </div>
      )}

      {!loading && sorted.length > 0 && viewMode === 'list' && (
        <section className="panel" style={{ paddingBottom: 4 }}>
          {sorted.map(book => (
            <BookListRow
              key={book.id}
              book={book}
              expanded={expandedId === book.id}
              onToggle={() => setExpandedId(expandedId === book.id ? null : book.id)}
              onUpdate={updateBook}
              onDelete={deleteBook}
            />
          ))}
        </section>
      )}
    </>
  );
}

// ── BookCard (grid view) ───────────────────────────────────────────────────

function BookCard({ book, onUpdate, onDelete }: { book: Book; onUpdate: (id: string, patch: Partial<Book>) => void; onDelete: (id: string) => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ borderRadius: 8, overflow: 'hidden', background: 'var(--surface, #fff)', border: '1px solid var(--border, rgba(0,0,0,0.07))', cursor: 'pointer', transition: 'box-shadow 120ms', boxShadow: hover ? '0 4px 12px rgba(0,0,0,0.12)' : 'none', position: 'relative' }}
    >
      {book.cover_url
        ? <img src={book.cover_url} alt={book.title} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
        : <div style={{ width: '100%', aspectRatio: '2/3', background: `${STATUS_COLORS[book.status]}18`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 6px' }}>
            <BookOpen size={22} style={{ color: STATUS_COLORS[book.status], flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: STATUS_COLORS[book.status], textAlign: 'center', lineHeight: 1.3, fontWeight: 600, wordBreak: 'break-word' }}>{book.title.slice(0,40)}</span>
          </div>
      }
      <div style={{ padding: '8px 8px 6px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, marginBottom: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{book.title}</div>
        {book.author && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{book.author}</div>}
        <StatusPill status={book.status} />
        {book.rating && <div style={{ marginTop: 4 }}><StarRating value={book.rating} /></div>}
      </div>
      {hover && (
        <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
          <select
            value={book.status}
            onChange={e => onUpdate(book.id, { status: e.target.value as ReadStatus })}
            onClick={e => e.stopPropagation()}
            style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4 }}
          >
            {(Object.entries(STATUS_LABELS) as [ReadStatus, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

// ── BookListRow (list view) ────────────────────────────────────────────────

function BookListRow({ book, expanded, onToggle, onUpdate, onDelete }: {
  book: Book;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, patch: Partial<Book>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'none', border: 'none', padding: '9px 4px', borderBottom: expanded ? 'none' : '1px solid var(--border, rgba(0,0,0,0.07))', cursor: 'pointer', textAlign: 'left' }}
      >
        {book.cover_url
          ? <img src={book.cover_url} alt={book.title} style={{ width: 32, height: 46, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
          : <div style={{ width: 32, height: 46, background: `${STATUS_COLORS[book.status]}22`, borderRadius: 3, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={14} style={{ color: STATUS_COLORS[book.status] }} />
            </div>
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{book.title}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{book.author}{book.genre ? ` · ${book.genre}` : ''}{book.published_year ? ` · ${book.published_year}` : ''}</div>
        </div>
        <StatusPill status={book.status} />
        {book.rating && <StarRating value={book.rating} />}
        {expanded ? <ChevronUp size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
      </button>

      {expanded && (
        <div style={{ padding: '10px 4px 14px 48px', borderBottom: '1px solid var(--border, rgba(0,0,0,0.07))', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {book.description && <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>{book.description.slice(0, 300)}{book.description.length > 300 ? '…' : ''}</p>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              Status
              <select value={book.status} onChange={e => onUpdate(book.id, { status: e.target.value as ReadStatus })} style={{ fontSize: 12 }}>
                {(Object.entries(STATUS_LABELS) as [ReadStatus, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              My rating
              <StarRating value={book.rating} onChange={r => onUpdate(book.id, { rating: r })} />
            </label>
            {book.page_count && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{book.page_count} pages</span>}
            {book.goodreads_id && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Goodreads synced</span>}
          </div>
          {book.status === 'reading' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                Started
                <input type="date" value={book.date_started ?? ''} onChange={e => onUpdate(book.id, { date_started: e.target.value || null })} style={{ fontSize: 12 }} />
              </label>
            </div>
          )}
          {book.status === 'read' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                Finished
                <input type="date" value={book.date_finished ?? ''} onChange={e => onUpdate(book.id, { date_finished: e.target.value || null })} style={{ fontSize: 12 }} />
              </label>
            </div>
          )}
          <textarea
            placeholder="Personal notes…"
            value={book.notes ?? ''}
            onChange={e => onUpdate(book.id, { notes: e.target.value || null })}
            style={{ fontSize: 13, minHeight: 60, resize: 'vertical' }}
          />
          <div>
            <button className="btn warning tiny" onClick={() => onDelete(book.id)}><X size={12} /> Remove from library</button>
          </div>
        </div>
      )}
    </div>
  );
}
