import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { useFieldStaff } from '../field/FieldStaffContext';
import { useHaptics } from '../../hooks/useHaptics';
import {
  hasApprovedLeaveToday,
  isAttendancePromptWindow,
  isClockInPromptSnoozed,
  isLateClockIn,
  localWorkDate,
  readCurrentLocation,
  snoozeClockInPrompt,
} from '../lib/attendance';
import { ClockInPromptModal } from './ClockInPromptModal';

export function FieldClockInPrompt() {
  const { employee, hasCapability } = useAuth();
  const { loading, todayAttendance, clockIn } = useFieldStaff();
  const { vibrate } = useHaptics();
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [onLeave, setOnLeave] = useState(false);
  const [tick, setTick] = useState(0);

  const canAttend = hasCapability('field.attendance');

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') setTick((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function checkLeave() {
      if (!employee) {
        if (!cancelled) setOnLeave(false);
        return;
      }
      const leave = await hasApprovedLeaveToday(employee.id, localWorkDate());
      if (!cancelled) setOnLeave(leave);
    }
    void checkLeave();
    return () => { cancelled = true; };
  }, [employee, tick]);

  useEffect(() => {
    if (!employee || loading || !canAttend) {
      setVisible(false);
      return;
    }
    if (employee.status === 'inactive' || employee.status === 'on_leave' || onLeave) {
      setVisible(false);
      return;
    }
    const now = new Date();
    const workDate = localWorkDate(now);
    if (!isAttendancePromptWindow(now) || isClockInPromptSnoozed(employee.id, workDate)) {
      setVisible(false);
      return;
    }
    setVisible(!todayAttendance?.clock_in);
  }, [employee, loading, canAttend, onLeave, todayAttendance, tick]);

  const handleSnooze = useCallback(() => {
    if (!employee) return;
    snoozeClockInPrompt(employee.id, localWorkDate());
    setVisible(false);
    setError('');
  }, [employee]);

  const handleClockIn = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      const { lat, lng } = await readCurrentLocation();
      await clockIn(lat, lng);
      vibrate('success');
      setVisible(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clock in. Try again.');
    } finally {
      setSaving(false);
    }
  }, [clockIn, vibrate]);

  return (
    <ClockInPromptModal
      visible={visible}
      late={isLateClockIn()}
      saving={saving}
      error={error}
      onClockIn={() => void handleClockIn()}
      onSnooze={handleSnooze}
    />
  );
}
