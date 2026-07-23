// src/lib/eaAutoDetect.ts
//
// Shared between the Students page (per-student EA panel) and the
// Essential Actions page (all-students EA tracker) so the two can never
// silently drift apart on what counts as "still handled" for an
// auto-detected EA (No Contact / Not Academically Engaged).

export interface EaLogLike {
  student_id: string;
  ea_type: string;
  status: string;
  closed_at: string | null;
}

/**
 * Whether an auto-detected EA (no_contact / not_engaged) should be
 * treated as already handled for a given student right now.
 *
 * This is deliberately NOT a fixed time window (e.g. "closed in the last
 * 24 hours"). A fixed window meant the exact same still-unresolved
 * condition would silently reappear looking un-handled once the window
 * elapsed, even though nothing about the student had actually changed —
 * which is exactly the "I marked it handled and it came back" bug.
 *
 * Instead: an auto EA counts as handled as long as it was marked closed
 * on or after the student's relevant trigger date (last_contact_date for
 * no_contact, last_academic_activity_date for not_engaged). Since the
 * trigger date only changes when there's genuinely new contact/activity,
 * this naturally stays suppressed until there's a real new instance of
 * the same problem — not just because a clock ran out.
 */
export function isAutoEaHandled(
  eaType: 'no_contact' | 'not_engaged',
  triggerDate: string | null,
  eaLog: EaLogLike[],
  studentId: string
): boolean {
  if (!triggerDate) return false;
  const triggerTime = new Date(triggerDate).getTime();
  return eaLog.some(
    (e) =>
      e.student_id === studentId &&
      e.ea_type === eaType &&
      e.status === 'closed' &&
      e.closed_at &&
      new Date(e.closed_at).getTime() >= triggerTime
  );
}
