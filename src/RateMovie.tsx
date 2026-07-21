import { useState, useEffect } from 'react';
import { Star, Film } from 'lucide-react';
import { supabase } from './lib/supabase';

const ARMY_GREEN = '#4B5320';

interface MediaSummary {
  id: string;
  title: string;
  media_type: 'movie' | 'tv';
  year: number | null;
  cover_url: string | null;
}

export default function RateMovie({ mediaId }: { mediaId: string }) {
  const [media, setMedia] = useState<MediaSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    if (!supabase) { setLoading(false); setNotFound(true); return; }
    const { data } = await supabase.from('media').select('id, title, media_type, year, cover_url').eq('id', mediaId).maybeSingle();
    if (!data) setNotFound(true);
    else setMedia(data as MediaSummary);
    setLoading(false);
  }

  async function submit() {
    if (!supabase || !name.trim() || !rating) return;
    setSubmitting(true);
    setError('');
    const { error: err } = await supabase.from('media_feedback').insert({
      media_id: mediaId,
      reviewer_name: name.trim(),
      rating,
      comment: comment.trim() || null,
    });
    setSubmitting(false);
    if (err) { setError("Couldn't submit — try again in a moment."); return; }
    setSubmitted(true);
  }

  const wrap: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#f4f5f0', padding: '1.5rem', fontFamily: 'system-ui, sans-serif',
  };
  const card: React.CSSProperties = {
    background: 'white', borderRadius: 16, padding: '2rem', maxWidth: 420, width: '100%',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center',
  };

  if (loading) {
    return <div style={wrap}><p>Loading...</p></div>;
  }

  if (notFound) {
    return (
      <div style={wrap}>
        <div style={card}>
          <Film size={32} color={ARMY_GREEN} />
          <p style={{ marginTop: 12 }}>This link doesn't look right — double-check the link you were sent.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={wrap}>
        <div style={card}>
          <div style={{ fontSize: '2.5rem' }}>🍿</div>
          <h2 style={{ color: ARMY_GREEN, margin: '0.5rem 0' }}>Thanks, {name.split(' ')[0]}!</h2>
          <p style={{ color: '#666' }}>Your rating on {media?.title} has been saved.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={card}>
        {media?.cover_url ? (
          <img src={media.cover_url} alt={media.title} style={{ width: 96, height: 144, objectFit: 'cover', borderRadius: 8, margin: '0 auto 10px' }} />
        ) : (
          <Film size={28} color={ARMY_GREEN} />
        )}
        <p style={{ color: '#888', fontSize: '0.85rem', margin: '8px 0 2px' }}>How was...</p>
        <h1 style={{ color: ARMY_GREEN, fontSize: '1.4rem', margin: '0 0 1.25rem' }}>
          {media?.title}{media?.year ? ` (${media.year})` : ''}
        </h1>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: '1.25rem' }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <Star size={32} fill={n <= rating ? '#d4a017' : 'none'} color="#d4a017" />
            </button>
          ))}
        </div>

        <input
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', padding: '0.6rem', borderRadius: 8, border: '1px solid #ccc', marginBottom: 10, fontSize: '1rem', boxSizing: 'border-box' }}
        />
        <textarea
          placeholder="Any thoughts? (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          style={{ width: '100%', padding: '0.6rem', borderRadius: 8, border: '1px solid #ccc', marginBottom: 14, fontSize: '1rem', fontFamily: 'inherit', boxSizing: 'border-box' }}
        />

        {error && <p style={{ color: '#c0392b', fontSize: '0.85rem' }}>{error}</p>}

        <button
          onClick={submit}
          disabled={submitting || !name.trim() || !rating}
          style={{
            width: '100%', background: ARMY_GREEN, color: 'white', border: 'none', borderRadius: 8,
            padding: '0.75rem', fontSize: '1rem', fontWeight: 600, cursor: 'pointer',
            opacity: submitting || !name.trim() || !rating ? 0.5 : 1,
          }}
        >
          {submitting ? 'Submitting...' : 'Submit Rating'}
        </button>
      </div>
    </div>
  );
}
