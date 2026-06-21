// src/useHistoricalScan.ts
//
// One-time historical scan: triggers the historical-calendar-scan edge
// function (3 years back, keyword-matched against grooming/vehicle
// terms), then lets the user bulk-review and approve/reject candidates
// before anything gets written into the real log tables.

import { useCallback, useState } from 'react';
import { supabase, hasSupabase } from './lib/supabase';

export interface ScanResult {
  id: string;
  category: 'jules_grooming' | 'jules_medical' | 'vehicle_maintenance';
  matched_vehicle_name: string | null;
  event_title: string;
  event_date: string;
  matched_keyword: string;
  confidence: 'high' | 'medium' | 'low';
  status: 'pending' | 'approved' | 'rejected' | 'imported';
}

export function useHistoricalScan() {
  const [scanning, setScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState<{ scanned: number; candidates: number } | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  const runScan = useCallback(async () => {
    if (!hasSupabase || !supabase) return;
    setScanning(true);
    setScanSummary(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Not signed in');

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/historical-calendar-scan`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await resp.json();
      if (json.error) throw new Error(json.error);
      setScanSummary({ scanned: json.scanned, candidates: json.candidates });
      await fetchResults();
    } catch (err) {
      console.error('Historical scan failed:', err);
      throw err;
    } finally {
      setScanning(false);
    }
  }, []);

  const fetchResults = useCallback(async () => {
    if (!supabase) return;
    setLoadingResults(true);
    try {
      const { data } = await supabase
        .from('historical_scan_results')
        .select('*')
        .eq('status', 'pending')
        .order('event_date', { ascending: false });
      if (data) setResults(data as ScanResult[]);
    } finally {
      setLoadingResults(false);
    }
  }, []);

  const updateStatus = useCallback(async (id: string, status: 'approved' | 'rejected') => {
    if (!supabase) return;
    await supabase.from('historical_scan_results').update({ status }).eq('id', id);
    setResults((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const bulkApprove = useCallback(async (ids: string[]) => {
    if (!supabase || ids.length === 0) return;
    await supabase.from('historical_scan_results').update({ status: 'approved' }).in('id', ids);
    setResults((prev) => prev.filter((r) => !ids.includes(r.id)));
  }, []);

  const bulkReject = useCallback(async (ids: string[]) => {
    if (!supabase || ids.length === 0) return;
    await supabase.from('historical_scan_results').update({ status: 'rejected' }).in('id', ids);
    setResults((prev) => prev.filter((r) => !ids.includes(r.id)));
  }, []);

  // Imports an approved scan result into the real log table, then marks
  // it 'imported' so it won't show up for review again.
  const importApproved = useCallback(
    async (
      result: ScanResult,
      vehicleIdByName: Record<string, string>,
      petId: string | null
    ) => {
      if (!supabase) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      if (result.category === 'jules_grooming' && petId) {
        await supabase.from('pet_grooming_log').insert({
          pet_id: petId,
          groom_date: result.event_date,
          cut_type: 'other',
          services: `Imported from calendar: "${result.event_title}"`,
          logged_by: userId,
        });
      } else if (result.category === 'jules_medical' && petId) {
        await supabase.from('pet_medical_log').insert({
          pet_id: petId,
          item_type: 'other',
          description: `Imported from calendar: "${result.event_title}"`,
          service_date: result.event_date,
          recurrence_months: null,
          logged_by: userId,
        });
      } else if (result.category === 'vehicle_maintenance' && result.matched_vehicle_name) {
        const vehicleId = vehicleIdByName[result.matched_vehicle_name];
        if (vehicleId) {
          await supabase.from('vehicle_maintenance_log').insert({
            vehicle_id: vehicleId,
            service_type: 'other',
            description: `Imported from calendar: "${result.event_title}"`,
            service_date: result.event_date,
            logged_by: userId,
          });
        }
      }

      await supabase.from('historical_scan_results').update({ status: 'imported' }).eq('id', result.id);
    },
    []
  );

  return {
    scanning, scanSummary, results, loadingResults,
    runScan, fetchResults, updateStatus, bulkApprove, bulkReject, importApproved,
  };
}
