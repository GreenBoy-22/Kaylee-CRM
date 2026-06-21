// src/HistoricalScanReview.tsx
//
// Bulk-review UI for the one-time 3-year historical calendar scan.
// Shows every keyword-matched candidate grouped by category, lets the
// user approve/reject individually or in bulk, then imports approved
// items into the real log tables.

import { useEffect, useMemo, useState } from 'react';
import { X, Check, Search, Loader2 } from 'lucide-react';
import { useHistoricalScan, type ScanResult } from './useHistoricalScan';
import { supabase } from './lib/supabase';

const CATEGORY_LABELS: Record<ScanResult['category'], string> = {
  jules_grooming: 'Jules — Grooming',
  jules_medical: 'Jules — Medical/Vaccines',
  vehicle_maintenance: 'Vehicle Maintenance',
};

const CONFIDENCE_COLOR: Record<ScanResult['confidence'], string> = {
  high: 'var(--green)', medium: 'var(--amber)', low: 'var(--muted)',
};

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function HistoricalScanReview({ onClose }: { onClose: () => void }) {
  const { scanning, scanSummary, results, loadingResults, runScan, fetchResults, updateStatus, bulkReject, importApproved } = useHistoricalScan();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [petId, setPetId] = useState<string | null>(null);
  const [vehicleIdByName, setVehicleIdByName] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchResults();
    (async () => {
      if (!supabase) return;
      const petRes = await supabase.from('pet_info').select('id').limit(1).maybeSingle();
      if (petRes.data) setPetId((petRes.data as any).id);
      const vehiclesRes = await supabase.from('vehicles').select('id, name');
      if (vehiclesRes.data) {
        const map: Record<string, string> = {};
        for (const v of vehiclesRes.data as any[]) map[v.name] = v.id;
        setVehicleIdByName(map);
      }
    })();
  }, [fetchResults]);

  const grouped = useMemo(() => {
    const map = new Map<ScanResult['category'], ScanResult[]>();
    for (const r of results) {
      const arr = map.get(r.category) ?? [];
      arr.push(r);
      map.set(r.category, arr);
    }
    return map;
  }, [results]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleScan = async () => {
    setHasScanned(true);
    await runScan();
  };

  const handleApproveAndImport = async (result: ScanResult) => {
    await updateStatus(result.id, 'approved');
    await importApproved(result, vehicleIdByName, petId);
  };

  const handleBulkApproveAndImport = async (categoryResults: ScanResult[]) => {
    setImporting(true);
    try {
      for (const r of categoryResults) {
        if (selected.has(r.id)) {
          await importApproved(r, vehicleIdByName, petId);
        }
      }
      const ids = categoryResults.filter((r) => selected.has(r.id)).map((r) => r.id);
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      await fetchResults();
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div className="panel" style={{ width: 680, maxHeight: '85vh', overflowY: 'auto', margin: 0 }}>
        <div className="panel-head">
          <h2><Search size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Historical Calendar Scan</h2>
          <button className="qty-button" onClick={onClose}><X size={14} /></button>
        </div>

        {!hasScanned && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 16px' }}>
            <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>
              Scans up to 3 years of your Google Calendar for grooming visits, vet/vaccine events, and vehicle maintenance.
              Nothing gets saved automatically — you'll review and approve everything found below.
            </p>
            <button className="btn primary" onClick={handleScan} disabled={scanning}>
              {scanning ? 'Scanning...' : 'Run scan'}
            </button>
          </div>
        )}

        {scanning && (
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            This can take a minute for 3 years of events across all your calendars...
          </p>
        )}

        {scanSummary && (
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
            Scanned {scanSummary.scanned} events, found {scanSummary.candidates} possible matches.
          </p>
        )}

        {loadingResults && <p style={{ color: 'var(--muted)' }}>Loading results...</p>}

        {!loadingResults && results.length === 0 && hasScanned && !scanning && (
          <p style={{ color: 'var(--muted)' }}>No matches found, or everything's already been reviewed.</p>
        )}

        {Array.from(grouped.entries()).map(([category, items]) => (
          <div key={category} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>{CATEGORY_LABELS[category]} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({items.length})</span></h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn ghost"
                  style={{ fontSize: 11.5, padding: '4px 8px' }}
                  onClick={() => setSelected((prev) => new Set([...prev, ...items.map((i) => i.id)]))}
                >
                  Select all
                </button>
                <button
                  className="btn primary"
                  style={{ fontSize: 11.5, padding: '4px 8px' }}
                  disabled={importing || !items.some((i) => selected.has(i.id))}
                  onClick={() => handleBulkApproveAndImport(items)}
                >
                  Import selected
                </button>
                <button
                  className="btn ghost"
                  style={{ fontSize: 11.5, padding: '4px 8px' }}
                  onClick={() => bulkReject(items.map((i) => i.id))}
                >
                  Reject all
                </button>
              </div>
            </div>

            {items.map((item) => (
              <div
                key={item.id}
                className="brief-item"
                style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, borderLeft: `3px solid ${CONFIDENCE_COLOR[item.confidence]}` }}
              >
                <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{item.event_title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    {fmtDate(item.event_date)} {'·'} matched "{item.matched_keyword}"
                    {item.matched_vehicle_name ? ` · ${item.matched_vehicle_name}` : ''}
                    {' · '}<span style={{ color: CONFIDENCE_COLOR[item.confidence] }}>{item.confidence} confidence</span>
                  </div>
                </div>
                <button className="qty-button" aria-label="Approve and import" onClick={() => handleApproveAndImport(item)}>
                  <Check size={13} color="var(--green)" />
                </button>
                <button className="qty-button" aria-label="Reject" onClick={() => updateStatus(item.id, 'rejected')}>
                  <X size={13} color="var(--red)" />
                </button>
              </div>
            ))}
          </div>
        ))}

        {hasScanned && !scanning && (
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button className="btn ghost" onClick={handleScan}>Re-run scan</button>
          </div>
        )}
      </div>
    </div>
  );
}
