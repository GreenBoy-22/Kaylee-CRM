import { useState, useEffect } from 'react';
import { MessageSquare, Copy, Check } from 'lucide-react';
import { supabase } from './lib/supabase';

const ARMY_GREEN = '#4B5320';

interface ChatDraft {
  id: string;
  question: string;
  draft_reply: string;
  sources_used: string | null;
  created_at: string;
}

export default function TeamChatAssistant() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [draftReply, setDraftReply] = useState('');
  const [sourcesUsed, setSourcesUsed] = useState('');
  const [history, setHistory] = useState<ChatDraft[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('team_chat_drafts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (!error && data) setHistory(data as ChatDraft[]);
  }

  async function generateDraft() {
    if (!question.trim() || !supabase) return;
    setLoading(true);
    setError('');
    setDraftReply('');
    setCopied(false);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const authToken = sessionData?.session?.access_token;
      if (!authToken) throw new Error('Not signed in');

      const [{ data: courseNotes }, { data: teamNotes }, { data: kpi }] = await Promise.all([
        supabase.from('course_notes').select('course_code, content').limit(50),
        supabase.from('team_notes').select('title, content, category').eq('status', 'approved').limit(50),
        supabase.from('work_kpi_monthly').select('*').order('month_date', { ascending: false }).limit(1),
      ]);

      const contextBlock = `
COURSE NOTES:
${(courseNotes || []).map((n) => `[${n.course_code}] ${n.content}`).join('\n') || '(none)'}

TEAM NOTES:
${(teamNotes || []).map((n) => `[${n.category}] ${n.title}: ${n.content}`).join('\n') || '(none)'}

LATEST KPI SNAPSHOT:
${JSON.stringify(kpi?.[0] || {}, null, 2)}
      `.trim();

      const prompt = `You are helping Kaylee, a WGU Program Mentor, draft a short, confident reply to a Team Giraldi Teams chat message. She is not naturally chatty in group chat, so keep it brief (2-5 sentences), direct, and grounded in her actual experience/data below. Do not pad with filler. If the context doesn't cover the question, say so plainly rather than inventing specifics.

CONTEXT FROM HER HUB:
${contextBlock}

TEAMS MESSAGE TO RESPOND TO:
"${question}"

Reply with just the drafted Teams message text, nothing else.`;

      const response = await fetch(
        'https://uccehajbwxzqdzvexzuc.supabase.co/functions/v1/ai-proxy',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1000,
            messages: [{ role: 'user', content: prompt }],
          }),
        }
      );

      const data = await response.json();
      if (data.error) throw new Error(JSON.stringify(data.error));

      const text = (data.content?.[0]?.text ?? '').trim();
      if (!text) throw new Error('No draft returned');
      setDraftReply(text);

      const usedSources = [
        courseNotes?.length ? 'Course Notes' : null,
        teamNotes?.length ? 'Team Notes' : null,
        kpi?.length ? 'Work Performance KPIs' : null,
      ]
        .filter(Boolean)
        .join(', ');
      setSourcesUsed(usedSources);

      await supabase.from('team_chat_drafts').insert({
        question,
        draft_reply: text,
        sources_used: usedSources,
      });
      loadHistory();
    } catch (e) {
      console.error('Team chat draft error:', e);
      setError('Could not generate a draft. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(draftReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem' }}>
      <h1 style={{ color: ARMY_GREEN, fontSize: '1.5rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <MessageSquare size={22} /> Team Chat Assistant
      </h1>
      <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        Paste a Team Giraldi message and get a grounded, ready-to-send reply.
      </p>

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Paste the Teams question or situation here..."
        rows={4}
        style={{
          width: '100%',
          padding: '0.75rem',
          borderRadius: 8,
          border: '1px solid #ccc',
          fontFamily: 'inherit',
          fontSize: '0.95rem',
          resize: 'vertical',
        }}
      />

      <button
        onClick={generateDraft}
        disabled={loading || !question.trim()}
        style={{
          marginTop: '0.75rem',
          background: ARMY_GREEN,
          color: 'white',
          border: 'none',
          borderRadius: 8,
          padding: '0.6rem 1.25rem',
          fontSize: '0.95rem',
          cursor: loading ? 'default' : 'pointer',
          opacity: loading || !question.trim() ? 0.6 : 1,
        }}
      >
        {loading ? 'Drafting...' : 'Draft a reply'}
      </button>

      {error && <p style={{ color: '#b00020', marginTop: '0.75rem' }}>{error}</p>}

      {draftReply && (
        <div
          style={{
            marginTop: '1.5rem',
            padding: '1rem',
            background: '#f4f5f0',
            borderLeft: `4px solid ${ARMY_GREEN}`,
            borderRadius: 6,
          }}
        >
          <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.95rem' }}>{draftReply}</p>
          {sourcesUsed && (
            <p style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.75rem' }}>
              Grounded in: {sourcesUsed}
            </p>
          )}
          <button
            onClick={copyToClipboard}
            style={{
              marginTop: '0.5rem',
              background: 'white',
              border: `1px solid ${ARMY_GREEN}`,
              color: ARMY_GREEN,
              borderRadius: 6,
              padding: '0.4rem 0.9rem',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
        </div>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1rem', color: ARMY_GREEN, marginBottom: '0.5rem' }}>
            Recent drafts
          </h2>
          {history.map((h) => (
            <div key={h.id} style={{ padding: '0.75rem', borderBottom: '1px solid #eee', fontSize: '0.85rem' }}>
              <p style={{ margin: 0, color: '#444', fontStyle: 'italic' }}>"{h.question}"</p>
              <p style={{ margin: '0.25rem 0 0', whiteSpace: 'pre-wrap' }}>{h.draft_reply}</p>
              <p style={{ fontSize: '0.7rem', color: '#999', marginTop: '0.25rem' }}>
                {new Date(h.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
