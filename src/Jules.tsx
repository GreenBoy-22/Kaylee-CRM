// src/Jules.tsx
//
// Jules' info tab: profile (microchip, insurance, vet, groomer), a
// grooming section (separate timeline, ~6-week cadence, seasonal cut
// type), a medical/vaccine section (annual recurrence), and a care
// reference panel drawn from her handbook.
//
// Scroll behavior:
//   - Grooming STATUS card: always visible
//   - Grooming HISTORY table: scrollable (.jules-groom-history)
//   - Medical UPCOMING vaccines: always visible
//   - Medical HISTORY table: scrollable (.jules-medical-history)

import { useMemo, useState } from 'react';
import { Heart, Scissors, Syringe, ExternalLink, X, Trash2, AlertCircle, Info, Search } from 'lucide-react';
import {
  useJulesData,
  calculateMedicalUpcoming,
  calculateGroomingStatus,
  MEDICAL_LABELS,
  type MedicalItemType,
  type MedicalLogEntry,
  type GroomingLogEntry,
} from './useJulesData';
import HistoricalScanReview from './HistoricalScanReview';

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

const CUT_TYPE_LABELS: Record<string, string> = {
  short_summer: 'Short summer cut',
  trim_face_feet_fanny: 'Face, feet & fanny trim',
  full_groom: 'Full groom',
  other: 'Other',
};

export default function Jules() {
  const {
    loading, pet, medicalLog, groomingLog,
    logMedical, deleteMedical, logGrooming, deleteGrooming,
  } = useJulesData();

  const [showLogMedical, setShowLogMedical] = useState(false);
  const [showLogGrooming, setShowLogGrooming] = useState(false);
  const [showHandbook, setShowHandbook] = useState(false);
  const [showScanReview, setShowScanReview] = useState(false);

  const medicalUpcoming = useMemo(() => calculateMedicalUpcoming(medicalLog), [medicalLog]);
  const groomingStatus = useMemo(() => calculateGroomingStatus(groomingLog), [groomingLog]);

  const recentMedical = medicalLog.slice(0, 10);
  const recentGrooming = groomingLog.slice(0, 10);

  if (loading) {
    return <section className="panel"><h2>Jules</h2><p>Loading...</p></section>;
  }

  if (!pet) {
    return (
      <section className="panel">
        <h2>Jules</h2>
        <p style={{ color: 'var(--muted)' }}>No profile set up yet.</p>
      </section>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Jules</h1>
          <p>{pet.breed} {pet.color ? `· ${pet.color}` : ''}{pet.weight_lbs ? ` · ~${pet.weight_lbs} lbs` : ''}</p>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={() => setShowScanReview(true)}><Search size={15} /> Scan calendar history</button>
          <button className="btn ghost" onClick={() => setShowHandbook(true)}><Heart size={15} /> Care guide</button>
        </div>
      </div>

      {/* Profile */}
      <div className="panel">
        <div className="panel-head"><h2>Profile</h2></div>
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Microchip</div>
            <div className="stat-val" style={{ fontSize: 14 }}>{pet.microchip_provider}<br />{pet.microchip_id}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Insurance</div>
            <div className="stat-val" style={{ fontSize: 14 }}>
              {pet.insurance_provider}<br />
              {pet.insurance_policy_number}
              {pet.insurance_policy_url && (
                <> <a href={pet.insurance_policy_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={11} style={{ display: 'inline', verticalAlign: 'middle' }} />
                </a></>
              )}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Vet</div>
            <div className="stat-val" style={{ fontSize: 14 }}>{pet.vet_name}<br />{pet.vet_clinic}</div>
            <a href="https://vetpawer.appointmaster.com/avascheduler-standalone/?ACID=694b401e9e745ae8ca6ad39e"
              target="_blank" rel="noopener noreferrer" className="btn primary"
              style={{ marginTop: 8, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
              <ExternalLink size={12} /> Book Vet Appointment
            </a>
          </div>
          <div className="stat-card">
            <div className="stat-label">Groomer</div>
            <div className="stat-val" style={{ fontSize: 14 }}>{pet.groomer_name}<br />{pet.groomer_address}</div>
            <a href="https://tailsandwhiskersgrooming.square.site/"
              target="_blank" rel="noopener noreferrer" className="btn primary"
              style={{ marginTop: 8, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
              <ExternalLink size={12} /> Book Grooming Appointment
            </a>
          </div>
        </div>
      </div>

      {/* Grooming panel */}
      <div className="panel">
        <div className="panel-head">
          <h2><Scissors size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Grooming</h2>
          <button className="btn primary" onClick={() => setShowLogGrooming(true)}>Log grooming visit</button>
        </div>

        {!groomingStatus.hasData && (
          <div className="brief-item">No grooming visits logged yet.</div>
        )}

        {/* Status card — ALWAYS VISIBLE, never scrolls away */}
        {groomingStatus.hasData && (
          <div
            className="brief-item"
            style={{
              borderLeft: `3px solid ${
                groomingStatus.status === 'overdue' ? 'var(--red)' : groomingStatus.status === 'due-soon' ? 'var(--amber)' : 'var(--green)'
              }`,
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              {groomingStatus.status === 'overdue' && <AlertCircle size={14} color="var(--red)" />}
              {groomingStatus.status === 'overdue'
                ? 'Overdue for a groom'
                : groomingStatus.status === 'due-soon'
                ? 'Grooming due soon'
                : 'Recently groomed'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
              Last groom {fmtDate(groomingStatus.lastGroomDate!)} ({groomingStatus.daysSinceGroom} days ago)
              {' · '}next due around {fmtDate(groomingStatus.nextDueDate!)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              Suggested: {CUT_TYPE_LABELS[groomingStatus.suggestedCutType]} {groomingStatus.suggestedCutType === 'short_summer' ? '(pool season)' : '(cooler months)'}
            </div>
          </div>
        )}

        {/* History table — SCROLLABLE */}
        <div className="jules-groom-history">
          <div className="table-card">
            <table>
              <thead>
                <tr><th>Date</th><th>Type</th><th>Services</th><th style={{ textAlign: 'right' }}>Cost</th><th></th></tr>
              </thead>
              <tbody>
                {recentGrooming.length === 0 && (
                  <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No grooming history yet.</td></tr>
                )}
                {recentGrooming.map((entry) => (
                  <tr key={entry.id}>
                    <td>{fmtDate(entry.groom_date)}</td>
                    <td>{entry.cut_type ? CUT_TYPE_LABELS[entry.cut_type] : '—'}</td>
                    <td><small>{entry.services || '—'}</small></td>
                    <td style={{ textAlign: 'right' }}>{entry.cost != null ? fmtMoney(entry.cost) : '—'}</td>
                    <td>
                      <button className="qty-button" onClick={() => { if (confirm('Delete this grooming entry?')) deleteGrooming(entry.id); }} aria-label="Delete">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Medical & Vaccines panel */}
      <div className="panel">
        <div className="panel-head">
          <h2><Syringe size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Medical & Vaccines</h2>
          <button className="btn primary" onClick={() => setShowLogMedical(true)}>Log medical visit</button>
        </div>

        {/* Upcoming vaccines — ALWAYS VISIBLE, never scrolls away */}
        {medicalUpcoming.length === 0 && (
          <div className="brief-item">No recurring medical items tracked yet.</div>
        )}
        {medicalUpcoming.map((item) => (
          <div
            key={item.itemType}
            className="brief-item"
            style={{
              borderLeft: `3px solid ${item.status === 'overdue' ? 'var(--red)' : item.status === 'due-soon' ? 'var(--amber)' : 'var(--green)'}`,
              marginBottom: 6,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {item.status === 'overdue' && <AlertCircle size={13} color="var(--red)" />}
                  {item.label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  Last {fmtDate(item.lastDate)} {'·'} due {fmtDate(item.dueDate)}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Medical history — SEPARATE SCROLLABLE BOX */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Medical History
          </div>
          <div className="jules-medical-history">
            <div className="table-card">
              <table>
                <thead>
                  <tr><th>Date</th><th>Item</th><th style={{ textAlign: 'right' }}>Cost</th><th></th></tr>
                </thead>
                <tbody>
                  {recentMedical.length === 0 && (
                    <tr><td colSpan={4} style={{ color: 'var(--muted)' }}>No medical history yet.</td></tr>
                  )}
                  {recentMedical.map((entry) => (
                    <tr key={entry.id}>
                      <td>{fmtDate(entry.service_date)}</td>
                      <td>{MEDICAL_LABELS[entry.item_type]}{entry.description && entry.description !== MEDICAL_LABELS[entry.item_type] ? ` — ${entry.description}` : ''}</td>
                      <td style={{ textAlign: 'right' }}>{entry.cost != null ? fmtMoney(entry.cost) : '—'}</td>
                      <td>
                        <button className="qty-button" onClick={() => { if (confirm('Delete this medical entry?')) deleteMedical(entry.id); }} aria-label="Delete">
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {showLogGrooming && pet && (
        <LogGroomingModal
          petId={pet.id}
          defaultGroomer={pet.groomer_name}
          onClose={() => setShowLogGrooming(false)}
          onSubmit={async (input) => {
            await logGrooming(input);
            setShowLogGrooming(false);
          }}
        />
      )}

      {showLogMedical && pet && (
        <LogMedicalModal
          petId={pet.id}
          defaultVet={pet.vet_name}
          onClose={() => setShowLogMedical(false)}
          onSubmit={async (input) => {
            await logMedical(input);
            setShowLogMedical(false);
          }}
        />
      )}

      {showHandbook && <HandbookModal onClose={() => setShowHandbook(false)} />}
      {showScanReview && <HistoricalScanReview onClose={() => setShowScanReview(false)} />}
    </>
  );
}

function LogGroomingModal({
  petId, defaultGroomer, onClose, onSubmit,
}: {
  petId: string;
  defaultGroomer: string | null;
  onClose: () => void;
  onSubmit: (input: Omit<GroomingLogEntry, 'id'>) => Promise<void>;
}) {
  const [date, setDate] = useState(() => toKey(new Date()));
  const [cutType, setCutType] = useState<'short_summer' | 'trim_face_feet_fanny' | 'full_groom' | 'other'>('full_groom');
  const [services, setServices] = useState('Bath, blowout, face/feet/fanny trim, anal gland expression, nail trim');
  const [cost, setCost] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit({ pet_id: petId, groom_date: date, cut_type: cutType, services: services.trim() || null, cost: cost ? parseFloat(cost) : null, groomer_name: defaultGroomer, notes: null });
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="panel" style={{ width: 420, margin: 0 }}>
        <div className="panel-head"><h2>Log grooming visit</h2><button className="qty-button" onClick={onClose}><X size={14} /></button></div>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <select value={cutType} onChange={(e) => setCutType(e.target.value as typeof cutType)}>
            {Object.entries(CUT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input placeholder="Services performed" value={services} onChange={(e) => setServices(e.target.value)} />
          <input placeholder="Cost (optional)" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
        <div className="form-actions">
          <button className="btn primary" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function LogMedicalModal({
  petId, defaultVet, onClose, onSubmit,
}: {
  petId: string;
  defaultVet: string | null;
  onClose: () => void;
  onSubmit: (input: Omit<MedicalLogEntry, 'id'>) => Promise<void>;
}) {
  const [itemType, setItemType] = useState<MedicalItemType>('vet_visit');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => toKey(new Date()));
  const [recurrence, setRecurrence] = useState('12');
  const [cost, setCost] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit({ pet_id: petId, item_type: itemType, description: description.trim() || null, service_date: date, recurrence_months: recurrence ? parseInt(recurrence, 10) : null, cost: cost ? parseFloat(cost) : null, vet_name: defaultVet, notes: null });
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="panel" style={{ width: 420, margin: 0 }}>
        <div className="panel-head"><h2>Log medical visit</h2><button className="qty-button" onClick={onClose}><X size={14} /></button></div>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <select value={itemType} onChange={(e) => setItemType(e.target.value as MedicalItemType)}>
            {Object.entries(MEDICAL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input placeholder="Notes (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="form-grid">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input placeholder="Cost (optional)" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Repeats every (months) — leave blank if one-time</label>
            <input type="number" value={recurrence} onChange={(e) => setRecurrence(e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn primary" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function HandbookModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="panel" style={{ width: 560, maxHeight: '80vh', overflowY: 'auto', margin: 0 }}>
        <div className="panel-head">
          <h2><Info size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Jules Care Guide</h2>
          <button className="qty-button" onClick={onClose}><X size={14} /></button>
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          <p><strong>Most important thing:</strong> Jules does not like being left alone. Routine and knowing where her people are helps her feel safe.</p>
          <h4 style={{ marginBottom: 4, marginTop: 16 }}>Feeding (evening, once daily)</h4>
          <p>2 cups Heart to Tail Complete Nutrition dry food + homemade chicken/veggie topper + Dogzymes Complete probiotic + 4 pumps salmon oil, all mixed together.</p>
          <h4 style={{ marginBottom: 4, marginTop: 16 }}>Medication</h4>
          <p>Fluoxetine (Prozac) once daily with dinner, for anxiety. Prescribed by Lauren Saroli, DVM. Don't skip or stop abruptly — if a dose is missed, give it with the next meal and notify Kaylee/Adam.</p>
          <h4 style={{ marginBottom: 4, marginTop: 16 }}>Water safety</h4>
          <p>Loves the pool and beach. Must wear her life vest whenever swimming — she's bottom-heavy and will sink without it.</p>
          <h4 style={{ marginBottom: 4, marginTop: 16 }}>Grooming basics (daily/ongoing)</h4>
          <p>Daily eye crusty removal to prevent staining. Occasional hygiene trim ("Brazilian wax") to prevent cling-ons after bathroom trips — clean with a wet wipe.</p>
          <h4 style={{ marginBottom: 4, marginTop: 16 }}>If something seems wrong</h4>
          <p>Contact her humans immediately for: unusual breathing, persistent coughing, vomiting more than once, unusual lethargy, or refusal to eat.</p>
          <h4 style={{ marginBottom: 4, marginTop: 16 }}>Vet</h4>
          <p>Express Vets, North Canton — Lauren Saroli, DVM.</p>
        </div>
      </div>
    </div>
  );
}
