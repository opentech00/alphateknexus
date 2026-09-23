import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { useHaptics } from '../../hooks/useHaptics';
import {
  clockInOffice,
  fetchOfficeAttendanceToday,
  hasApprovedLeaveToday,
  isAttendancePromptWindow,
  isClockInPromptSnoozed,
  isLateClockIn,
  localWorkDate,
  snoozeClockInPrompt,
} from '../lib/attendance';
import { ClockInPromptModal } from './ClockInPromptModal';
import { toast } from '../../components/toast/toast';

export function OfficeClockInPrompt() {
  const { employee, user } = useAuth();
  const { vibrate } = useHaptics();
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

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

    async function check() {
      if (!employee || !user) {
        if (!cancelled) setVisible(false);
        return;
      }
      if (employee.status === 'inactive' || employee.status === 'on_leave') {
        if (!cancelled) setVisible(false);
        return;
      }

      const now = new Date();
      const workDate = localWorkDate(now);
      if (!isAttendancePromptWindow(now) || isClockInPromptSnoozed(employee.id, workDate)) {
        if (!cancelled) setVisible(false);
        return;
      }

      const [onLeave, att] = await Promise.all([
        hasApprovedLeaveToday(employee.id, workDate),
        fetchOfficeAttendanceToday(employee.id, workDate),
      ]);
      if (cancelled) return;
      setVisible(!onLeave && !att?.clock_in_at);
    }

    void check();
    return () => { cancelled = true; };
  }, [employee, user, tick]);

  const handleSnooze = useCallback(() => {
    if (!employee) return;
    snoozeClockInPrompt(employee.id, localWorkDate());
    setVisible(false);
    setError('');
  }, [employee]);

  const handleClockIn = useCallback(async () => {
    if (!employee || !user) return;
    setSaving(true);
    setError('');
    const { error: err } = await clockInOffice({
      employeeId: employee.id,
      userId: user.id,
      serviceId: employee.service_id,
    });
    setSaving(false);
    if (err) {
      setError(err);
      toast.error(err);
      return;
    }
    vibrate('success');
    toast.success('Clocked in');
    setVisible(false);
  }, [employee, user, vibrate]);

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
