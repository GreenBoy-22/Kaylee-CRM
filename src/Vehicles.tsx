// src/Vehicles.tsx
//
// Vehicles tab: per-vehicle maintenance tracker (what's due/overdue, cross-
// referenced with the linked budget rules), mileage log with miles/year
// estimate, and registration/insurance renewal month tracking.

import { useMemo, useState } from 'react';
import { Wrench, Gauge, X, Trash2, AlertCircle, ExternalLink, Package } from 'lucide-react';
import {
  useVehiclesData,
  calculateUpcoming,
  calculateTireStatus,
  calculateMileageUpcoming,
  type Vehicle,
  type ServiceType,
  type MaintenanceEntry,
  type VehiclePart,
} from './useVehiclesData';

const SERVICE_LABELS: Record<ServiceType, string> = {
  oil_change: 'Oil change', tire_rotation: 'Tire rotation', tire_alignment: 'Tire alignment',
  tires_replaced: 'Tires replaced', windshield_wipers: 'Windshield wipers', air_filter: 'Air filter',
  registration: 'Registration', emissions: 'Emissions test', inspection: 'Inspection',
  brakes: 'Brakes', battery: 'Battery', other: 'Other',
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Vehicles() {
  const {
    loading, vehicles, maintenanceLog, mileageLog, vehicleRules, parts, serviceIntervals, knownIssues, isAdmin,
    updateVehicle, logMaintenance, deleteMaintenanceEntry, logMileage, estimateMilesPerYear,
  } = useVehiclesData();

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [showLogService, setShowLogService] = useState(false);
  const [showLogMileage, setShowLogMileage] = useState(false);
  const [showEditVehicle, setShowEditVehicle] = useState(false);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) ?? vehicles[0] ?? null;

  const upcoming = useMemo(() => {
    if (!selectedVehicle) return [];
    return calculateUpcoming(vehicleRules, maintenanceLog, selectedVehicle.id);
  }, [vehicleRules, maintenanceLog, selectedVehicle]);

  const vehicleMaintenanceHistory = useMemo(
    () => maintenanceLog.filter((m) => m.vehicle_id === selectedVehicle?.id).slice(0, 15),
    [maintenanceLog, selectedVehicle]
  );

  const vehicleMileageHistory = useMemo(
    () => mileageLog.filter((m) => m.vehicle_id === selectedVehicle?.id).slice(0, 10),
    [mileageLog, selectedVehicle]
  );

  const vehicleParts = useMemo(
    () => parts.filter((p) => p.vehicle_id === selectedVehicle?.id),
    [parts, selectedVehicle]
  );

  const tireStatus = useMemo(
    () => (selectedVehicle ? calculateTireStatus(selectedVehicle) : null),
    [selectedVehicle]
  );

  const mileageUpcoming = useMemo(
    () => (selectedVehicle ? calculateMileageUpcoming(serviceIntervals, maintenanceLog, selectedVehicle) : []),
    [serviceIntervals, maintenanceLog, selectedVehicle]
  );

  const vehicleKnownIssues = useMemo(
    () => knownIssues.filter((k) => k.vehicle_id === selectedVehicle?.id),
    [knownIssues, selectedVehicle]
  );

  const [showLogTires, setShowLogTires] = useState(false);

  const milesPerYear = selectedVehicle ? estimateMilesPerYear(selectedVehicle.id) : null;

  if (loading) {
    return <section className="panel"><h2>Vehicles</h2><p>Loading...</p></section>;
  }

  if (vehicles.length === 0) {
    return (
      <section className="panel">
        <h2>Vehicles</h2>
        <p style={{ color: 'var(--muted)' }}>No vehicles set up yet.</p>
      </section>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Vehicles</h1>
          <p>Maintenance, mileage, and renewal tracking.</p>
        </div>
      </div>

      <div className="toggle-wrap" style={{ marginBottom: 16 }}>
        {vehicles.map((v) => (
          <button
            key={v.id}
            className={selectedVehicle?.id === v.id ? 'active' : ''}
            onClick={() => setSelectedVehicleId(v.id)}
          >
            {v.name}
          </button>
        ))}
      </div>

      {selectedVehicle && (
        <>
          <div className="panel">
            <div className="panel-head">
              <h2>{selectedVehicle.name}</h2>
              {isAdmin && (
                <button className="btn ghost" onClick={() => setShowEditVehicle(true)}>Edit details</button>
              )}
            </div>

            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-label">Year / Trim</div>
                <div className="stat-val" style={{ fontSize: 16 }}>
                  {selectedVehicle.year ? `${selectedVehicle.year} ` : ''}{selectedVehicle.trim || (selectedVehicle.year ? '' : 'Not set')}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Current mileage</div>
                <div className="stat-val" style={{ fontSize: 16 }}>
                  {selectedVehicle.current_mileage ? selectedVehicle.current_mileage.toLocaleString() : 'Not logged'}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Est. miles/year</div>
                <div className="stat-val" style={{ fontSize: 16 }}>
                  {milesPerYear ? milesPerYear.toLocaleString() : 'Need more readings'}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Registration</div>
                <div className="stat-val" style={{ fontSize: 16 }}>
                  {selectedVehicle.registration_renewal_month ? MONTH_NAMES[selectedVehicle.registration_renewal_month - 1] : 'Not set'}
                </div>
              </div>
            </div>

            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn ghost" onClick={() => setShowLogMileage(true)}><Gauge size={15} /> Log mileage</button>
              <button className="btn primary" onClick={() => setShowLogService(true)}><Wrench size={15} /> Log service</button>
            </div>
          </div>

          {tireStatus && (
            <div className="panel">
              <div className="panel-head">
                <h2>Tires</h2>
                {isAdmin && (
                  <button className="btn ghost" onClick={() => setShowLogTires(true)}>
                    {tireStatus.hasData ? 'Update' : 'Log replacement'}
                  </button>
                )}
              </div>

              {!tireStatus.hasData && (
                <div className="brief-item">
                  No tire replacement logged yet{tireStatus.ratedMiles ? ` (rated for ${tireStatus.ratedMiles.toLocaleString()} miles)` : ''}.
                  {isAdmin ? ' Log it once you have the receipt details.' : ''}
                </div>
              )}

              {tireStatus.hasData && (
                <>
                  <div
                    className="brief-item"
                    style={{
                      borderLeft: `3px solid ${tireStatus.status === 'overdue' ? 'var(--red)' : tireStatus.status === 'due-soon' ? 'var(--amber)' : 'var(--green)'}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {tireStatus.status === 'overdue' && <AlertCircle size={14} color="var(--red)" />}
                        {tireStatus.status === 'overdue' ? 'Overdue for new tires' : tireStatus.status === 'due-soon' ? 'Due soon' : 'Good condition'}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{tireStatus.percentUsed}% of rated life</div>
                    </div>
                    <div style={{ height: 8, background: '#f0f0f4', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${tireStatus.percentUsed}%`,
                          background: tireStatus.status === 'overdue' ? 'var(--red)' : tireStatus.status === 'due-soon' ? 'var(--amber)' : 'var(--green)',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                      {tireStatus.milesSinceReplacement?.toLocaleString()} mi since replacement
                      {tireStatus.replacedDate ? ` (${fmtDate(tireStatus.replacedDate)})` : ''}
                      {' \u00b7 '}
                      {tireStatus.milesRemaining && tireStatus.milesRemaining > 0
                        ? `~${tireStatus.milesRemaining.toLocaleString()} mi remaining`
                        : 'past rated life'}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="panel">
            <div className="panel-head"><h2>What's due</h2></div>
            {upcoming.length === 0 && (
              <div className="brief-item">No scheduled maintenance linked to this vehicle yet.</div>
            )}
            {upcoming.map((item) => (
              <div
                key={item.ruleId}
                className="brief-item"
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderLeft: `3px solid ${item.status === 'overdue' ? 'var(--red)' : item.status === 'due-soon' ? 'var(--amber)' : 'var(--green)'}`,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {item.status === 'overdue' && <AlertCircle size={14} color="var(--red)" />}
                    {item.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {item.status === 'overdue' ? 'Overdue \u2014 ' : item.status === 'due-soon' ? 'Due ' : 'Scheduled for '}
                    {item.monthLabel}
                    {item.lastServiceDate ? ` \u00b7 last done ${fmtDate(item.lastServiceDate)}` : ' \u00b7 not logged yet'}
                  </div>
                </div>
                <div style={{ fontWeight: 600 }}>{fmtMoney(item.amount)}</div>
              </div>
            ))}
          </div>

          {mileageUpcoming.length > 0 && (
            <div className="panel">
              <div className="panel-head">
                <h2>Recommended maintenance</h2>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>By mileage \u2014 based on the manual + dealer sources</span>
              </div>
              {!selectedVehicle.current_mileage && (
                <div className="brief-item" style={{ marginBottom: 10 }}>
                  Log your current mileage above to see how close each item is to due.
                </div>
              )}
              {mileageUpcoming.map((item) => (
                <div
                  key={item.intervalId}
                  className="brief-item"
                  style={{
                    borderLeft: `3px solid ${
                      item.status === 'overdue' ? 'var(--red)' : item.status === 'due-soon' ? 'var(--amber)' : item.status === 'good' ? 'var(--green)' : 'var(--border)'
                    }`,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
                        {item.status === 'overdue' && <AlertCircle size={13} color="var(--red)" />}
                        {item.name}
                        {item.sourceConfidence !== 'factory' && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--amber)', border: '1px solid var(--amber)', borderRadius: 4, padding: '1px 5px' }}>
                            {item.sourceConfidence === 'disputed' ? 'DISPUTED' : 'COMMUNITY'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        Every {item.intervalMiles.toLocaleString()} mi
                        {item.status !== 'unknown' && item.milesSinceService != null && (
                          <> {'\u00b7'} {item.milesSinceService.toLocaleString()} mi since last done</>
                        )}
                        {item.status === 'unknown' && ' \u00b7 not logged yet'}
                      </div>
                      {item.sourceNote && (
                        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3, fontStyle: 'italic' }}>{item.sourceNote}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {vehicleKnownIssues.length > 0 && (
            <div className="panel">
              <div className="panel-head">
                <h2>Known issues to watch for</h2>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Reported by other owners \u2014 not a schedule, just things to keep an eye on</span>
              </div>
              {vehicleKnownIssues.map((issue) => (
                <div
                  key={issue.id}
                  className="brief-item"
                  style={{
                    borderLeft: `3px solid ${issue.severity === 'significant' ? 'var(--red)' : issue.severity === 'moderate' ? 'var(--amber)' : 'var(--border)'}`,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{issue.title}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text)', marginTop: 3 }}>{issue.description}</div>
                  {issue.symptoms && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}><strong>Watch for:</strong> {issue.symptoms}</div>
                  )}
                  {issue.source_note && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>Source: {issue.source_note}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {vehicleParts.length > 0 && (
            <div className="panel">
              <div className="panel-head"><h2>Parts reference</h2></div>
              {Object.entries(
                vehicleParts.reduce<Record<string, VehiclePart[]>>((acc, p) => {
                  (acc[p.service_type] ??= []).push(p);
                  return acc;
                }, {})
              ).map(([type, items]) => (
                <div key={type} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6 }}>
                    {SERVICE_LABELS[type as ServiceType]}
                  </div>
                  {items.map((part) => (
                    <div key={part.id} className="brief-item" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <Package size={14} color="var(--muted)" style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{part.part_label}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {[part.brand, part.part_number, part.size_spec].filter(Boolean).join(' \u00b7 ')}
                        </div>
                      </div>
                      {part.amazon_url && (
                        <a href={part.amazon_url} target="_blank" rel="noopener noreferrer" className="qty-button" aria-label="View on Amazon">
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="panel">
            <div className="panel-head"><h2>Service history</h2></div>
            {vehicleMaintenanceHistory.length === 0 && (
              <div className="brief-item">No service logged yet.</div>
            )}
            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Service</th><th>Mileage</th><th style={{ textAlign: 'right' }}>Cost</th>
                    {isAdmin && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {vehicleMaintenanceHistory.map((entry) => (
                    <tr key={entry.id}>
                      <td>{fmtDate(entry.service_date)}</td>
                      <td>{SERVICE_LABELS[entry.service_type]}{entry.description ? ` \u2014 ${entry.description}` : ''}</td>
                      <td>{entry.mileage_at_service ? entry.mileage_at_service.toLocaleString() : '\u2014'}</td>
                      <td style={{ textAlign: 'right' }}>{entry.cost != null ? fmtMoney(entry.cost) : '\u2014'}</td>
                      {isAdmin && (
                        <td>
                          <button className="qty-button" onClick={() => { if (confirm('Delete this service entry?')) deleteMaintenanceEntry(entry.id); }} aria-label="Delete">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Mileage log</h2></div>
            {vehicleMileageHistory.length === 0 && (
              <div className="brief-item">No mileage logged yet. Log a couple readings over time to get a miles/year estimate.</div>
            )}
            <div className="table-card">
              <table>
                <thead><tr><th>Date</th><th style={{ textAlign: 'right' }}>Mileage</th></tr></thead>
                <tbody>
                  {vehicleMileageHistory.map((entry) => (
                    <tr key={entry.id}>
                      <td>{fmtDate(entry.reading_date)}</td>
                      <td style={{ textAlign: 'right' }}>{entry.mileage.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showLogService && selectedVehicle && (
        <LogServiceModal
          vehicle={selectedVehicle}
          upcoming={upcoming}
          onClose={() => setShowLogService(false)}
          onSubmit={async (input) => {
            await logMaintenance(input);
            setShowLogService(false);
          }}
        />
      )}

      {showLogMileage && selectedVehicle && (
        <LogMileageModal
          vehicle={selectedVehicle}
          onClose={() => setShowLogMileage(false)}
          onSubmit={async (input) => {
            await logMileage(input);
            setShowLogMileage(false);
          }}
        />
      )}

      {showEditVehicle && selectedVehicle && (
        <EditVehicleModal
          vehicle={selectedVehicle}
          onClose={() => setShowEditVehicle(false)}
          onSave={async (patch) => {
            await updateVehicle(selectedVehicle.id, patch);
            setShowEditVehicle(false);
          }}
        />
      )}

      {showLogTires && selectedVehicle && (
        <LogTireReplacementModal
          vehicle={selectedVehicle}
          onClose={() => setShowLogTires(false)}
          onSave={async (patch) => {
            await updateVehicle(selectedVehicle.id, patch);
            setShowLogTires(false);
          }}
        />
      )}
    </>
  );
}

function LogServiceModal({
  vehicle,
  upcoming,
  onClose,
  onSubmit,
}: {
  vehicle: Vehicle;
  upcoming: ReturnType<typeof calculateUpcoming>;
  onClose: () => void;
  onSubmit: (input: Omit<MaintenanceEntry, 'id'>) => Promise<void>;
}) {
  const [serviceType, setServiceType] = useState<ServiceType>('oil_change');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => toKey(new Date()));
  const [mileage, setMileage] = useState(vehicle.current_mileage ? String(vehicle.current_mileage) : '');
  const [cost, setCost] = useState('');
  const [linkedRuleId, setLinkedRuleId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit({
        vehicle_id: vehicle.id,
        service_type: serviceType,
        description: description.trim() || null,
        service_date: date,
        mileage_at_service: mileage ? parseInt(mileage, 10) : null,
        cost: cost ? parseFloat(cost) : null,
        source_rule_id: linkedRuleId || null,
        notes: null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="panel" style={{ width: 420, margin: 0 }}>
        <div className="panel-head">
          <h2>Log service \u2014 {vehicle.name}</h2>
          <button className="qty-button" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <select value={serviceType} onChange={(e) => setServiceType(e.target.value as ServiceType)}>
            {Object.entries(SERVICE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          {upcoming.length > 0 && (
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Link to a scheduled item (optional)</label>
              <select value={linkedRuleId} onChange={(e) => setLinkedRuleId(e.target.value)} style={{ width: '100%' }}>
                <option value="">Not linked</option>
                {upcoming.map((u) => (
                  <option key={u.ruleId} value={u.ruleId}>{u.name} ({u.monthLabel})</option>
                ))}
              </select>
            </div>
          )}
          <input placeholder="Notes (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="form-grid">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input placeholder="Mileage" type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} />
          </div>
          <input placeholder="Cost (optional)" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
        <div className="form-actions">
          <button className="btn primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving...' : 'Save service'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogMileageModal({
  vehicle,
  onClose,
  onSubmit,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onSubmit: (input: { vehicle_id: string; mileage: number; reading_date: string; notes: string | null }) => Promise<void>;
}) {
  const [mileage, setMileage] = useState('');
  const [date, setDate] = useState(() => toKey(new Date()));
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!mileage) return;
    setSubmitting(true);
    try {
      await onSubmit({ vehicle_id: vehicle.id, mileage: parseInt(mileage, 10), reading_date: date, notes: null });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="panel" style={{ width: 360, margin: 0 }}>
        <div className="panel-head">
          <h2>Log mileage \u2014 {vehicle.name}</h2>
          <button className="qty-button" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <input placeholder="Current odometer reading" type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} autoFocus />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="form-actions">
          <button className="btn primary" onClick={handleSubmit} disabled={submitting || !mileage}>
            {submitting ? 'Saving...' : 'Save reading'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditVehicleModal({
  vehicle,
  onClose,
  onSave,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onSave: (patch: Partial<Vehicle>) => Promise<void>;
}) {
  const [year, setYear] = useState(vehicle.year ? String(vehicle.year) : '');
  const [trim, setTrim] = useState(vehicle.trim ?? '');
  const [color, setColor] = useState(vehicle.color ?? '');
  const [mileage, setMileage] = useState(vehicle.current_mileage ? String(vehicle.current_mileage) : '');
  const [regMonth, setRegMonth] = useState(vehicle.registration_renewal_month ? String(vehicle.registration_renewal_month) : '');
  const [insMonth, setInsMonth] = useState(vehicle.insurance_renewal_month ? String(vehicle.insurance_renewal_month) : '');
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    setSubmitting(true);
    try {
      await onSave({
        year: year ? parseInt(year, 10) : null,
        trim: trim.trim() || null,
        color: color.trim() || null,
        current_mileage: mileage ? parseInt(mileage, 10) : null,
        current_mileage_updated_at: mileage ? toKey(new Date()) : vehicle.current_mileage_updated_at,
        registration_renewal_month: regMonth ? parseInt(regMonth, 10) : null,
        insurance_renewal_month: insMonth ? parseInt(insMonth, 10) : null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="panel" style={{ width: 420, margin: 0 }}>
        <div className="panel-head">
          <h2>Edit {vehicle.name}</h2>
          <button className="qty-button" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="form-grid">
            <input placeholder="Year" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
            <input placeholder="Trim" value={trim} onChange={(e) => setTrim(e.target.value)} />
          </div>
          <div className="form-grid">
            <input placeholder="Color" value={color} onChange={(e) => setColor(e.target.value)} />
            <input placeholder="Current mileage" type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} />
          </div>
          <div className="form-grid">
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Registration renews</label>
              <select value={regMonth} onChange={(e) => setRegMonth(e.target.value)} style={{ width: '100%' }}>
                <option value="">Not set</option>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Insurance renews</label>
              <select value={insMonth} onChange={(e) => setInsMonth(e.target.value)} style={{ width: '100%' }}>
                <option value="">Not set</option>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="form-actions">
          <button className="btn primary" onClick={handleSave} disabled={submitting}>
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogTireReplacementModal({
  vehicle,
  onClose,
  onSave,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onSave: (patch: Partial<Vehicle>) => Promise<void>;
}) {
  const [ratedMiles, setRatedMiles] = useState(vehicle.tire_rated_miles ? String(vehicle.tire_rated_miles) : '');
  const [replacedDate, setReplacedDate] = useState(vehicle.tire_replaced_date ?? toKey(new Date()));
  const [replacedMileage, setReplacedMileage] = useState(vehicle.tire_replaced_mileage ? String(vehicle.tire_replaced_mileage) : '');
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    if (!replacedMileage) return;
    setSubmitting(true);
    try {
      await onSave({
        tire_rated_miles: ratedMiles ? parseInt(ratedMiles, 10) : vehicle.tire_rated_miles,
        tire_replaced_date: replacedDate,
        tire_replaced_mileage: parseInt(replacedMileage, 10),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="panel" style={{ width: 400, margin: 0 }}>
        <div className="panel-head">
          <h2>Tires \u2014 {vehicle.name}</h2>
          <button className="qty-button" onClick={onClose}><X size={14} /></button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: -8 }}>
          Enter what's on the receipt: the date and odometer reading when these tires went on.
        </p>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Date replaced</label>
            <input type="date" value={replacedDate} onChange={(e) => setReplacedDate(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Odometer reading at replacement</label>
            <input placeholder="e.g. 62000" type="number" value={replacedMileage} onChange={(e) => setReplacedMileage(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Rated tire life (miles)</label>
            <input placeholder="e.g. 50000" type="number" value={ratedMiles} onChange={(e) => setRatedMiles(e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn primary" onClick={handleSave} disabled={submitting || !replacedMileage}>
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
