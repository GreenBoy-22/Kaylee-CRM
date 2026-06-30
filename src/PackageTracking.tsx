import { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

type Status = 'ordered' | 'shipped' | 'out_for_delivery' | 'delivered' | 'exception';

interface Package {
  id: string;
  tracking_number: string;
  carrier: string | null;
  item_description: string | null;
  retailer: string | null;
  order_date: string | null;
  expected_delivery: string | null;
  status: Status;
  email_subject: string | null;
  email_date: string | null;
  notes: string | null;
  created_at: string;
}

interface EmailCandidate {
  subject: string;
  date: string;
  snippet: string;
  threadId: string;
  tracking_number: string;
  carrier: string;
  item_description: string;
  retailer: string;
  expected_delivery: string;
}

const STATUS_CONFIG: Record<Status, { label: string; color: string; icon: string }> = {
  ordered:          { label: 'Ordered',          color: '#6366f1', icon: '🛒' },
  shipped:          { label: 'Shipped',           color: '#f59e0b', icon: '📦' },
  out_for_delivery: { label: 'Out for Delivery',  color: '#3b82f6', icon: '🚚' },
  delivered:        { label: 'Delivered',         color: '#10b981', icon: '✅' },
  exception:        { label: 'Exception',         color: '#ef4444', icon: '⚠️' },
};

const CARRIER_LINKS: Record<string, (n: string) => string> = {
  UPS:      n => `https://www.ups.com/track?tracknum=${n}`,
  USPS:     n => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`,
  FedEx:    n => `https://www.fedex.com/fedextrack/?trknbr=${n}`,
  Amazon:   n => `https://www.amazon.com/progress-tracker/package/?ref_=pe_tracking_carrier_name&trackingId=${n}`,
  DHL:      n => `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${n}`,
  OnTrac:   n => `https://www.ontrac.com/tracking/?number=${n}`,
  LaserShip:n => `https://www.lasership.com/track/${n}`,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function trackingUrl(pkg: Package): string | null {
  if (!pkg.carrier || !pkg.tracking_number) return null;
  const carrier = Object.keys(CARRIER_LINKS).find(c =>
    pkg.carrier!.toLowerCase().includes(c.toLowerCase())
  );
  return carrier ? CARRIER_LINKS[carrier](pkg.tracking_number) : null;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function PackageTracking({ userId }: { userId: string }) {
  const [packages, setPackages]             = useState<Package[]>([]);
  const [loading, setLoading]               = useState(true);
  const [scanning, setScanning]             = useState(false);
  const [scanResults, setScanResults]       = useState<EmailCandidate[]>([]);
  const [selected, setSelected]             = useState<Set<number>>(new Set());
  const [scanError, setScanError]           = useState<string | null>(null);
  const [showAddForm, setShowAddForm]       = useState(false);
  const [editId, setEditId]                 = useState<string | null>(null);
  const [filterStatus, setFilterStatus]     = useState<Status | 'all' | 'active'>('active');
  const [expandedId, setExpandedId]         = useState<string | null>(null);
  const [saving, setSaving]                 = useState(false);
  const [toast, setToast]                   = useState<string | null>(null);

  const [form, setForm] = useState({
    tracking_number: '', carrier: '', item_description: '',
    retailer: '', order_date: '', expected_delivery: '',
    status: 'shipped' as Status, notes: '',
  });

  // ── Data ──────────────────────────────────────────────────────────────────

  const loadPackages = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('package_tracking')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (!error) setPackages(data || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadPackages(); }, [loadPackages]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ── Gmail Scan ─────────────────────────────────────────────────────────────

  const scanGmail = async () => {
    setScanning(true);
    setScanError(null);
    setScanResults([]);
    setSelected(new Set());

    try {
      // Call Claude via ai-proxy to search Gmail + extract tracking info
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `https://uccehajbwxzqdzvexzuc.supabase.co/functions/v1/ai-proxy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            _gmail_tracking_scan: true,
            model: 'claude-sonnet-4-6',
            max_tokens: 4000,
            messages: [{
              role: 'user',
              content: `Search my Gmail inbox for shipping/tracking emails from the last 60 days.
Look for emails containing: tracking number, shipped, your order has shipped, out for delivery, package, delivery notification.
For each email found, extract:
- tracking_number (the actual tracking code)
- carrier (UPS, USPS, FedEx, Amazon, DHL, OnTrac, LaserShip, or Unknown)
- item_description (what was ordered, if mentioned)
- retailer (Amazon, Etsy, Target, Walmart, Chewy, etc.)
- expected_delivery (date if mentioned, as YYYY-MM-DD)
- subject (email subject)
- date (email date as ISO string)
- snippet (brief excerpt)
- threadId (Gmail thread ID)

Return ONLY a JSON array of objects with exactly those fields. No markdown, no explanation.
If no tracking emails found, return [].`,
            }],
            mcp_servers: [{
              type: 'url',
              url: 'https://gmailmcp.googleapis.com/mcp/v1',
              name: 'gmail-mcp',
            }],
          }),
        }
      );

      if (!response.ok) throw new Error(`Edge function error: ${response.status}`);
      const data = await response.json();

      // Extract text from response
      const textBlocks = (data.content || [])
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('');

      // Parse JSON
      const clean = textBlocks.replace(/```json|```/g, '').trim();
      const results: EmailCandidate[] = JSON.parse(clean || '[]');

      // Filter out already-saved tracking numbers
      const existing = new Set(packages.map(p => p.tracking_number));
      const fresh = results.filter(r => r.tracking_number && !existing.has(r.tracking_number));

      setScanResults(fresh);
      // Auto-select all by default
      setSelected(new Set(fresh.map((_, i) => i)));

      if (fresh.length === 0 && results.length === 0) {
        setScanError('No shipping emails found in the last 60 days.');
      } else if (fresh.length === 0) {
        setScanError('All found packages are already saved.');
      }
    } catch (err) {
      console.error(err);
      setScanError(`Scan failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setScanning(false);
    }
  };

  const importSelected = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    const toInsert = [...selected].map(i => {
      const r = scanResults[i];
      return {
        user_id: userId,
        tracking_number: r.tracking_number,
        carrier: r.carrier || null,
        item_description: r.item_description || null,
        retailer: r.retailer || null,
        expected_delivery: r.expected_delivery || null,
        email_subject: r.subject || null,
        email_date: r.date || null,
        status: 'shipped' as Status,
      };
    });

    const { error } = await supabase.from('package_tracking').insert(toInsert);
    if (error) {
      showToast(`❌ Import failed: ${error.message}`);
    } else {
      showToast(`✅ Imported ${toInsert.length} package${toInsert.length !== 1 ? 's' : ''}`);
      setScanResults([]);
      setSelected(new Set());
      await loadPackages();
    }
    setSaving(false);
  };

  // ── Manual Add / Edit ──────────────────────────────────────────────────────

  const resetForm = () => setForm({
    tracking_number: '', carrier: '', item_description: '',
    retailer: '', order_date: '', expected_delivery: '',
    status: 'shipped', notes: '',
  });

  const openEdit = (pkg: Package) => {
    setForm({
      tracking_number: pkg.tracking_number,
      carrier: pkg.carrier || '',
      item_description: pkg.item_description || '',
      retailer: pkg.retailer || '',
      order_date: pkg.order_date || '',
      expected_delivery: pkg.expected_delivery || '',
      status: pkg.status,
      notes: pkg.notes || '',
    });
    setEditId(pkg.id);
    setShowAddForm(true);
  };

  const savePackage = async () => {
    if (!form.tracking_number.trim()) return;
    setSaving(true);
    const payload = {
      user_id: userId,
      tracking_number: form.tracking_number.trim(),
      carrier: form.carrier || null,
      item_description: form.item_description || null,
      retailer: form.retailer || null,
      order_date: form.order_date || null,
      expected_delivery: form.expected_delivery || null,
      status: form.status,
      notes: form.notes || null,
    };

    let error;
    if (editId) {
      ({ error } = await supabase.from('package_tracking').update(payload).eq('id', editId));
    } else {
      ({ error } = await supabase.from('package_tracking').insert(payload));
    }

    if (error) {
      showToast(`❌ Save failed: ${error.message}`);
    } else {
      showToast(editId ? '✅ Package updated' : '✅ Package added');
      resetForm();
      setShowAddForm(false);
      setEditId(null);
      await loadPackages();
    }
    setSaving(false);
  };

  const deletePackage = async (id: string) => {
    if (!confirm('Remove this package?')) return;
    const { error } = await supabase.from('package_tracking').delete().eq('id', id);
    if (!error) {
      setPackages(prev => prev.filter(p => p.id !== id));
      if (expandedId === id) setExpandedId(null);
      showToast('🗑️ Package removed');
    }
  };

  const updateStatus = async (id: string, status: Status) => {
    const { error } = await supabase.from('package_tracking').update({ status }).eq('id', id);
    if (!error) setPackages(prev => prev.map(p => p.id === id ? { ...p, status } : p));
  };

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = packages.filter(p => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'active') return p.status !== 'delivered';
    return p.status === filterStatus;
  });

  const counts = {
    all: packages.length,
    active: packages.filter(p => p.status !== 'delivered').length,
    ordered: packages.filter(p => p.status === 'ordered').length,
    shipped: packages.filter(p => p.status === 'shipped').length,
    out_for_delivery: packages.filter(p => p.status === 'out_for_delivery').length,
    delivered: packages.filter(p => p.status === 'delivered').length,
    exception: packages.filter(p => p.status === 'exception').length,
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '16px', maxWidth: '900px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          background: '#1e293b', color: '#fff', padding: '10px 16px',
          borderRadius: 8, fontSize: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
          📦 Package Tracker
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { setShowAddForm(!showAddForm); setEditId(null); resetForm(); }}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #6366f1', background: showAddForm ? '#6366f1' : '#fff', color: showAddForm ? '#fff' : '#6366f1', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
          >
            {showAddForm ? '✕ Cancel' : '+ Add Package'}
          </button>
          <button
            onClick={scanGmail}
            disabled={scanning}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0f172a', color: '#fff', fontSize: 13, cursor: scanning ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: scanning ? 0.7 : 1 }}
          >
            {scanning ? '⏳ Scanning Gmail…' : '📧 Scan Gmail'}
          </button>
        </div>
      </div>

      {/* Manual Add / Edit Form */}
      {showAddForm && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600 }}>{editId ? 'Edit Package' : 'Add Package Manually'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              ['tracking_number', 'Tracking Number *', 'text'],
              ['carrier', 'Carrier (UPS, USPS, FedEx…)', 'text'],
              ['item_description', 'Item Description', 'text'],
              ['retailer', 'Retailer', 'text'],
              ['order_date', 'Order Date', 'date'],
              ['expected_delivery', 'Expected Delivery', 'date'],
            ].map(([key, label, type]) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</label>
                <input
                  type={type}
                  value={(form as Record<string, string>)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Status</label>
            <select
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value as Status }))}
              style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }}
            >
              {(Object.keys(STATUS_CONFIG) as Status[]).map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s].icon} {STATUS_CONFIG[s].label}</option>
              ))}
            </select>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
            />
          </div>
          <button
            onClick={savePackage}
            disabled={saving || !form.tracking_number.trim()}
            style={{ marginTop: 12, padding: '9px 20px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Package'}
          </button>
        </div>
      )}

      {/* Gmail Scan Results */}
      {(scanResults.length > 0 || scanError) && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
              📧 Found {scanResults.length} new package{scanResults.length !== 1 ? 's' : ''} in Gmail
            </h3>
            {scanResults.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setSelected(new Set(scanResults.map((_, i) => i)))} style={linkBtn}>Select all</button>
                <button onClick={() => setSelected(new Set())} style={linkBtn}>None</button>
              </div>
            )}
          </div>
          {scanError && <p style={{ color: '#92400e', fontSize: 13 }}>{scanError}</p>}
          {scanResults.map((r, i) => (
            <div key={i} style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              padding: '10px 0', borderBottom: i < scanResults.length - 1 ? '1px solid #fde68a' : 'none',
            }}>
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => {
                  const s = new Set(selected);
                  s.has(i) ? s.delete(i) : s.add(i);
                  setSelected(s);
                }}
                style={{ marginTop: 2, flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                  {r.item_description || r.subject || 'Unknown item'}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {r.carrier && <span style={{ marginRight: 8 }}>🚚 {r.carrier}</span>}
                  {r.retailer && <span style={{ marginRight: 8 }}>🏪 {r.retailer}</span>}
                  <span style={{ fontFamily: 'monospace' }}>{r.tracking_number}</span>
                  {r.expected_delivery && <span style={{ marginLeft: 8 }}>📅 {formatDate(r.expected_delivery)}</span>}
                </div>
              </div>
            </div>
          ))}
          {scanResults.length > 0 && (
            <button
              onClick={importSelected}
              disabled={saving || selected.size === 0}
              style={{ marginTop: 12, padding: '9px 20px', borderRadius: 8, border: 'none', background: '#0f172a', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              {saving ? 'Saving…' : `Import ${selected.size} Selected`}
            </button>
          )}
        </div>
      )}

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {([
          ['active', '📦 Active', counts.active],
          ['all', 'All', counts.all],
          ['shipped', '📦 Shipped', counts.shipped],
          ['out_for_delivery', '🚚 Out for Delivery', counts.out_for_delivery],
          ['ordered', '🛒 Ordered', counts.ordered],
          ['delivered', '✅ Delivered', counts.delivered],
          ['exception', '⚠️ Exception', counts.exception],
        ] as [string, string, number][]).map(([val, label, count]) => (
          <button
            key={val}
            onClick={() => setFilterStatus(val as Status | 'all' | 'active')}
            style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontWeight: filterStatus === val ? 700 : 400,
              border: filterStatus === val ? '2px solid #6366f1' : '1px solid #e2e8f0',
              background: filterStatus === val ? '#eef2ff' : '#fff',
              color: filterStatus === val ? '#4338ca' : '#475569',
            }}
          >
            {label} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
          </button>
        ))}
      </div>

      {/* Package List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Loading packages…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 14 }}>No packages here. Scan Gmail or add one manually.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(pkg => {
            const cfg = STATUS_CONFIG[pkg.status];
            const url = trackingUrl(pkg);
            const days = daysUntil(pkg.expected_delivery);
            const isExpanded = expandedId === pkg.id;

            return (
              <div key={pkg.id} style={{
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
                overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}>
                {/* Card header */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : pkg.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', cursor: 'pointer' }}
                >
                  {/* Status dot */}
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {pkg.item_description || 'Unknown item'}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      {pkg.carrier && <span style={{ marginRight: 8 }}>{pkg.carrier}</span>}
                      {pkg.retailer && <span style={{ marginRight: 8 }}>• {pkg.retailer}</span>}
                      <span style={{ fontFamily: 'monospace' }}>{pkg.tracking_number}</span>
                    </div>
                  </div>

                  {/* Delivery badge */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{
                      display: 'inline-block', padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: cfg.color + '20', color: cfg.color,
                    }}>
                      {cfg.icon} {cfg.label}
                    </div>
                    {days !== null && pkg.status !== 'delivered' && (
                      <div style={{ fontSize: 11, color: days <= 0 ? '#ef4444' : days === 1 ? '#f59e0b' : '#64748b', marginTop: 3 }}>
                        {days <= 0 ? 'Due today' : days === 1 ? 'Tomorrow' : `${days} days`}
                      </div>
                    )}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f1f5f9', padding: '12px 14px', background: '#fafafa' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                      {[
                        ['Tracking #', pkg.tracking_number],
                        ['Carrier', pkg.carrier],
                        ['Retailer', pkg.retailer],
                        ['Order Date', formatDate(pkg.order_date)],
                        ['Expected Delivery', formatDate(pkg.expected_delivery)],
                        ['Added', formatDate(pkg.created_at)],
                      ].map(([label, val]) => val && (
                        <div key={label}>
                          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                          <div style={{ fontSize: 13, color: '#334155', marginTop: 2 }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    {pkg.notes && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</div>
                        <div style={{ fontSize: 13, color: '#334155', marginTop: 2 }}>{pkg.notes}</div>
                      </div>
                    )}

                    {/* Status updater */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                      {(Object.keys(STATUS_CONFIG) as Status[]).map(s => (
                        <button
                          key={s}
                          onClick={() => updateStatus(pkg.id, s)}
                          style={{
                            padding: '4px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer', fontWeight: 600,
                            border: pkg.status === s ? `2px solid ${STATUS_CONFIG[s].color}` : '1px solid #e2e8f0',
                            background: pkg.status === s ? STATUS_CONFIG[s].color + '20' : '#fff',
                            color: pkg.status === s ? STATUS_CONFIG[s].color : '#64748b',
                          }}
                        >
                          {STATUS_CONFIG[s].icon} {STATUS_CONFIG[s].label}
                        </button>
                      ))}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      {url && (
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          style={{ padding: '6px 14px', borderRadius: 7, background: '#0f172a', color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}
                        >
                          🔗 Track Package
                        </a>
                      )}
                      <button onClick={() => openEdit(pkg)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #6366f1', color: '#6366f1', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        ✏️ Edit
                      </button>
                      <button onClick={() => deletePackage(pkg.id)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #fee2e2', color: '#ef4444', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        🗑️ Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#92400e', fontSize: 12,
  cursor: 'pointer', textDecoration: 'underline', padding: 0,
};
