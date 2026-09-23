import { supabase } from './supabase';

export const ATTENDANCE_PROMPT_HOUR = 9;
export const ATTENDANCE_LATE_MINUTE = 15;
export const CLOCK_IN_SNOOZE_MS = 15 * 60 * 1000;
export const ATTENDANCE_UPDATED_EVENT = 'atn-attendance-updated';

export function localWorkDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isAttendancePromptWindow(d = new Date()): boolean {
  return d.getHours() >= ATTENDANCE_PROMPT_HOUR;
}

export function isLateClockIn(d = new Date()): boolean {
  return d.getHours() > ATTENDANCE_PROMPT_HOUR
    || (d.getHours() === ATTENDANCE_PROMPT_HOUR && d.getMinutes() > ATTENDANCE_LATE_MINUTE);
}

function snoozeStorageKey(employeeId: string, workDate: string): string {
  return `atn-clockin-snooze:${employeeId}:${workDate}`;
}

export function isClockInPromptSnoozed(employeeId: string, workDate: string): boolean {
  try {
    const raw = sessionStorage.getItem(snoozeStorageKey(employeeId, workDate));
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

export function snoozeClockInPrompt(employeeId: string, workDate: string, ms = CLOCK_IN_SNOOZE_MS): void {
  try {
    sessionStorage.setItem(snoozeStorageKey(employeeId, workDate), String(Date.now() + ms));
  } catch {
    /* ignore quota / private mode */
  }
}

export function notifyAttendanceUpdated(): void {
  window.dispatchEvent(new Event(ATTENDANCE_UPDATED_EVENT));
}

export async function hasApprovedLeaveToday(employeeId: string, workDate: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('status', 'approved')
    .lte('start_date', workDate)
    .gte('end_date', workDate)
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.id);
}

export async function fetchOfficeAttendanceToday(employeeId: string, workDate: string) {
  const { data, error } = await supabase
    .from('office_attendance')
    .select('id, clock_in_at, clock_out_at, status')
    .eq('employee_id', employeeId)
    .eq('work_date', workDate)
    .maybeSingle();
  if (error) return null;
  return data as { id: string; clock_in_at: string | null; clock_out_at: string | null; status: string } | null;
}

export async function clockInOffice(params: {
  employeeId: string;
  userId: string;
  serviceId: string | null;
}): Promise<{ error: string | null; late: boolean }> {
  const now = new Date();
  const late = isLateClockIn(now);
  const { error } = await supabase.from('office_attendance').upsert({
    employee_id: params.employeeId,
    user_id: params.userId,
    service_id: params.serviceId,
    work_date: localWorkDate(now),
    clock_in_at: now.toISOString(),
    status: late ? 'late' : 'present',
  }, { onConflict: 'employee_id,work_date' });

  if (!error) notifyAttendanceUpdated();
  return { error: error?.message ?? null, late };
}

export async function clockOutOffice(attendanceId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('office_attendance')
    .update({ clock_out_at: new Date().toISOString() })
    .eq('id', attendanceId);
  if (!error) notifyAttendanceUpdated();
  return { error: error?.message ?? null };
}

export function readCurrentLocation(): Promise<{ lat?: number; lng?: number }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({});
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}
