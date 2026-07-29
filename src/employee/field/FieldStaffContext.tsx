import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/EmployeeAuthContext';
import type {
  FieldAssignment, FieldAssignmentTask, FieldCheckIn,
  FieldEvidence, FieldIncident, FieldAttendance, ChecklistTemplate,
  SyncQueueItem, JobMessage, FieldJobNote, FieldLocationPing, FieldJobScore,
} from './types';
import {
  enqueueSync, getQueue, updateQueueItem, removeQueueItem, getPendingCount,
} from './syncQueue';
import { pushToast } from './components/Toast';

interface FieldStaffContextValue {
  assignments: FieldAssignment[];
  tasks: Record<string, FieldAssignmentTask[]>;
  checkIns: Record<string, FieldCheckIn | null>;
  evidence: Record<string, FieldEvidence[]>;
  incidents: FieldIncident[];
  attendance: FieldAttendance[];
  checklistTemplates: ChecklistTemplate[];
  messages: Record<string, JobMessage[]>;
  notes: Record<string, FieldJobNote[]>;
  jobScores: Record<string, FieldJobScore>;
  loading: boolean;
  error: string;
  online: boolean;
  pendingSync: number;
  refresh: () => Promise<void>;
  updateAssignmentStatus: (id: string, status: FieldAssignment['status']) => Promise<void>;
  saveSignature: (assignmentId: string, signatureData: string) => Promise<void>;
  toggleTask: (taskId: string, completed: boolean) => Promise<void>;
  addTask: (assignmentId: string, text: string) => Promise<void>;
  checkIn: (assignmentId: string, lat: number, lng: number, photoUrl?: string) => Promise<void>;
  checkOut: (assignmentId: string, lat: number, lng: number) => Promise<void>;
  uploadEvidence: (assignmentId: string, photoUrl: string, photoType: 'before' | 'after') => Promise<void>;
  deleteEvidence: (evidenceId: string) => Promise<void>;
  reportIncident: (incident: Omit<FieldIncident, 'id' | 'employee_id' | 'status' | 'created_at'>) => Promise<void>;
  clockIn: (lat?: number, lng?: number) => Promise<void>;
  clockOut: (lat?: number, lng?: number) => Promise<void>;
  todayAttendance: FieldAttendance | null;
  sendMessage: (assignmentId: string, body: string) => Promise<void>;
  addNote: (assignmentId: string, noteText: string, photoUrl?: string) => Promise<void>;
  pauseJob: (assignmentId: string, reason: string) => Promise<void>;
  resumeJob: (assignmentId: string) => Promise<void>;
  sendLocationPing: (assignmentId: string, lat: number, lng: number, batteryLevel?: number) => Promise<void>;
}

const FieldStaffContext = createContext<FieldStaffContextValue | undefined>(undefined);

export function FieldStaffProvider({ children }: { children: ReactNode }) {
  const { employee } = useAuth();
  const [assignments, setAssignments] = useState<FieldAssignment[]>([]);
  const [tasks, setTasks] = useState<Record<string, FieldAssignmentTask[]>>({});
  const [checkIns, setCheckIns] = useState<Record<string, FieldCheckIn | null>>({});
  const [evidence, setEvidence] = useState<Record<string, FieldEvidence[]>>({});
  const [incidents, setIncidents] = useState<FieldIncident[]>([]);
  const [attendance, setAttendance] = useState<FieldAttendance[]>([]);
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>([]);
  const [messages, setMessages] = useState<Record<string, JobMessage[]>>({});
  const [notes, setNotes] = useState<Record<string, FieldJobNote[]>>({});
  const [jobScores, setJobScores] = useState<Record<string, FieldJobScore>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [todayAttendance, setTodayAttendance] = useState<FieldAttendance | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(getPendingCount());
  const assignmentStatusRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const on = () => { setOnline(true); processSyncQueue(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const refresh = useCallback(async () => {
    if (!employee) return;
    setLoading(true);
    setError('');
    try {
      const idRes = await supabase.from('field_assignments').select('id').eq('employee_id', employee.id);
      const ids = idRes.data?.map(r => r.id) || [];

      const [
        { data: aData, error: aErr },
        { data: tData, error: tErr },
        { data: ciData, error: ciErr },
        { data: eData, error: eErr },
        { data: incData, error: incErr },
        { data: attData, error: attErr },
        { data: tplData },
        { data: msgData },
        { data: noteData },
        { data: scoreData },
      ] = await Promise.all([
        supabase.from('field_assignments').select('*').eq('employee_id', employee.id).order('scheduled_date', { ascending: true }),
        ids.length > 0
          ? supabase.from('field_assignment_tasks').select('*').in('assignment_id', ids)
          : Promise.resolve({ data: [], error: null } as any),
        ids.length > 0
          ? supabase.from('field_check_ins').select('*').in('assignment_id', ids)
          : Promise.resolve({ data: [], error: null } as any),
        ids.length > 0
          ? supabase.from('field_evidence').select('*').in('assignment_id', ids)
          : Promise.resolve({ data: [], error: null } as any),
        supabase.from('field_incidents').select('*').eq('employee_id', employee.id).order('created_at', { ascending: false }),
        supabase.from('field_attendance').select('*').eq('employee_id', employee.id).order('work_date', { ascending: false }).limit(30),
        supabase.from('field_checklist_templates').select('*').order('service_slug, sort_order'),
        ids.length > 0
          ? supabase.from('field_job_messages').select('*').in('assignment_id', ids).order('created_at', { ascending: true })
          : Promise.resolve({ data: [], error: null } as any),
        ids.length > 0
          ? supabase.from('field_job_notes').select('*').in('assignment_id', ids).order('created_at', { ascending: true })
          : Promise.resolve({ data: [], error: null } as any),
        ids.length > 0
          ? supabase.from('field_job_scores').select('*').in('assignment_id', ids)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (aErr) throw aErr;
      if (tErr) throw tErr;
      if (ciErr) throw ciErr;
      if (eErr) throw eErr;
      if (incErr) throw incErr;
      if (attErr) throw attErr;

      setAssignments((aData || []) as FieldAssignment[]);

      const statusMap: Record<string, string> = {};
      (aData || []).forEach((a: any) => { statusMap[a.id] = a.status; });
      assignmentStatusRef.current = statusMap;

      const taskMap: Record<string, FieldAssignmentTask[]> = {};
      (tData || []).forEach((t: any) => {
        if (!taskMap[t.assignment_id]) taskMap[t.assignment_id] = [];
        taskMap[t.assignment_id].push(t as FieldAssignmentTask);
      });
      setTasks(taskMap);

      const ciMap: Record<string, FieldCheckIn | null> = {};
      (ciData || []).forEach((ci: any) => { ciMap[ci.assignment_id] = ci as FieldCheckIn; });
      setCheckIns(ciMap);

      const evMap: Record<string, FieldEvidence[]> = {};
      (eData || []).forEach((e: any) => {
        if (!evMap[e.assignment_id]) evMap[e.assignment_id] = [];
        evMap[e.assignment_id].push(e as FieldEvidence);
      });
      setEvidence(evMap);

      setIncidents((incData || []) as FieldIncident[]);
      setAttendance((attData || []) as FieldAttendance[]);
      setChecklistTemplates((tplData || []) as ChecklistTemplate[]);

      const msgMap: Record<string, JobMessage[]> = {};
      (msgData || []).forEach((m: any) => {
        if (!msgMap[m.assignment_id]) msgMap[m.assignment_id] = [];
        msgMap[m.assignment_id].push(m as JobMessage);
      });
      setMessages(msgMap);

      const noteMap: Record<string, FieldJobNote[]> = {};
      (noteData || []).forEach((n: any) => {
        if (!noteMap[n.assignment_id]) noteMap[n.assignment_id] = [];
        noteMap[n.assignment_id].push(n as FieldJobNote);
      });
      setNotes(noteMap);

      const scoreMap: Record<string, FieldJobScore> = {};
      (scoreData || []).forEach((s: any) => { scoreMap[s.assignment_id] = s as FieldJobScore; });
      setJobScores(scoreMap);

      const today = new Date().toISOString().split('T')[0];
      setTodayAttendance((attData || []).find((a: any) => a.work_date === today) as FieldAttendance | null || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load field staff data');
    } finally {
      setLoading(false);
    }
  }, [employee]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime subscriptions
  useEffect(() => {
    if (!employee) return;
    const channel = supabase
      .channel('field_assignments_changes')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'field_assignments', filter: `employee_id=eq.${employee.id}` },
        (payload: any) => {
          const updated = payload.new as FieldAssignment;
          const oldStatus = assignmentStatusRef.current[updated.id];
          if (oldStatus && oldStatus !== updated.status) {
            if (updated.status === 'approved') {
              pushToast({ type: 'approval', title: 'Job Approved', body: `${updated.service_name} has been approved` });
            } else if (updated.status === 'rejected') {
              pushToast({ type: 'rejection', title: 'Job Rejected', body: `${updated.service_name} needs attention` });
            } else if (updated.status === 'assigned' && !oldStatus) {
              pushToast({ type: 'job', title: 'New Job Assigned', body: `${updated.service_name} for ${updated.customer_name}` });
            }
          }
          assignmentStatusRef.current[updated.id] = updated.status;
          setAssignments(prev => prev.map(a => a.id === updated.id ? updated : a));
        },
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'field_assignments', filter: `employee_id=eq.${employee.id}` },
        (payload: any) => {
          const newRow = payload.new as FieldAssignment;
          assignmentStatusRef.current[newRow.id] = newRow.status;
          pushToast({ type: 'job', title: 'New Job Assigned', body: `${newRow.service_name} for ${newRow.customer_name}` });
          setAssignments(prev => [newRow, ...prev.filter(a => a.id !== newRow.id)]);
        },
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'field_job_messages' },
        (payload: any) => {
          const msg = payload.new as JobMessage;
          setMessages(prev => ({
            ...prev,
            [msg.assignment_id]: [...(prev[msg.assignment_id] || []), msg],
          }));
          if (msg.sender !== 'worker') {
            pushToast({ type: 'info', title: 'New Message', body: msg.body.slice(0, 80) });
          }
        },
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'field_job_notes' },
        (payload: any) => {
          const note = payload.new as FieldJobNote;
          if (note.employee_id === employee.id) {
            setNotes(prev => ({
              ...prev,
              [note.assignment_id]: [...(prev[note.assignment_id] || []), note],
            }));
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [employee]);

  const processSyncQueue = useCallback(async () => {
    const queue = getQueue().filter(i => i.status === 'pending' || i.status === 'failed');
    for (const item of queue) {
      updateQueueItem(item.id, { status: 'syncing', attempts: item.attempts + 1 });
      try {
        let res;
        if (item.operation === 'update') {
          res = await supabase.from(item.table).update(item.payload).eq('id', item.recordId);
        } else {
          res = await supabase.from(item.table).insert(item.payload);
        }
        if (res.error) throw res.error;
        removeQueueItem(item.id);
      } catch {
        updateQueueItem(item.id, { status: 'failed' });
      }
    }
    setPendingSync(getPendingCount());
  }, []);

  useEffect(() => { if (online) processSyncQueue(); }, [online, processSyncQueue]);

  const writeOrQueue = useCallback(async (
    table: string, operation: 'update' | 'insert', recordId: string, payload: Record<string, unknown>,
  ) => {
    if (!navigator.onLine) {
      enqueueSync({ table, operation, recordId, payload });
      setPendingSync(getPendingCount());
      return;
    }
    try {
      if (operation === 'update') {
        await supabase.from(table).update(payload).eq('id', recordId);
      } else {
        await supabase.from(table).insert(payload);
      }
    } catch {
      enqueueSync({ table, operation, recordId, payload });
      setPendingSync(getPendingCount());
    }
  }, []);

  const updateAssignmentStatus = useCallback(async (id: string, status: FieldAssignment['status']) => {
    setAssignments(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    await writeOrQueue('field_assignments', 'update', id, { status, updated_at: new Date().toISOString() });
  }, [writeOrQueue]);

  const saveSignature = useCallback(async (assignmentId: string, signatureData: string) => {
    setAssignments(prev => prev.map(a => a.id === assignmentId ? {
      ...a, customer_signature: signatureData, signature_captured_at: new Date().toISOString(),
    } : a));
    await writeOrQueue('field_assignments', 'update', assignmentId, {
      customer_signature: signatureData,
      signature_captured_at: new Date().toISOString(),
    });
  }, [writeOrQueue]);

  const toggleTask = useCallback(async (taskId: string, completed: boolean) => {
    setTasks(prev => {
      const next = { ...prev };
      for (const key in next) {
        next[key] = next[key].map(t => t.id === taskId ? { ...t, completed } : t);
      }
      return next;
    });
    await writeOrQueue('field_assignment_tasks', 'update', taskId, { completed });
  }, [writeOrQueue]);

  const addTask = useCallback(async (assignmentId: string, text: string) => {
    if (!employee) return;
    const tempId = `temp_${Date.now()}`;
    const newTask: FieldAssignmentTask = {
      id: tempId, assignment_id: assignmentId, task_text: text,
      completed: false, sort_order: 999, created_at: new Date().toISOString(),
    };
    setTasks(prev => ({ ...prev, [assignmentId]: [...(prev[assignmentId] || []), newTask] }));

    if (!navigator.onLine) {
      enqueueSync({
        table: 'field_assignment_tasks', operation: 'insert', recordId: tempId,
        payload: { assignment_id: assignmentId, task_text: text, sort_order: 999 },
      });
      setPendingSync(getPendingCount());
      return;
    }
    try {
      const { data } = await supabase.from('field_assignment_tasks').insert({
        assignment_id: assignmentId, task_text: text, sort_order: 999,
      }).select('*').single();
      if (data) {
        setTasks(prev => ({
          ...prev,
          [assignmentId]: (prev[assignmentId] || []).map(t => t.id === tempId ? data as FieldAssignmentTask : t),
        }));
      }
    } catch { /* optimistic — will reconcile on next refresh */ }
  }, [employee]);

  const checkIn = useCallback(async (assignmentId: string, lat: number, lng: number, photoUrl?: string) => {
    if (!employee) return;
    const payload = {
      assignment_id: assignmentId, employee_id: employee.id,
      checkin_time: new Date().toISOString(), latitude: lat, longitude: lng,
      checkin_photo_url: photoUrl || null,
    };
    if (!navigator.onLine) {
      enqueueSync({ table: 'field_check_ins', operation: 'insert', recordId: 'temp', payload });
      setPendingSync(getPendingCount());
      const tempCi: FieldCheckIn = {
        id: 'temp', assignment_id: assignmentId, employee_id: employee.id,
        checkin_time: payload.checkin_time, checkout_time: null,
        latitude: lat, longitude: lng, checkin_photo_url: photoUrl || null, created_at: payload.checkin_time,
      };
      setCheckIns(prev => ({ ...prev, [assignmentId]: tempCi }));
      return;
    }
    try {
      const { data } = await supabase.from('field_check_ins').insert(payload).select('*').single();
      if (data) setCheckIns(prev => ({ ...prev, [assignmentId]: data as FieldCheckIn }));
    } catch { /* ignore */ }
  }, [employee]);

  const checkOut = useCallback(async (assignmentId: string, lat: number, lng: number) => {
    const ci = checkIns[assignmentId];
    if (!ci) return;
    setCheckIns(prev => ({ ...prev, [assignmentId]: { ...ci, checkout_time: new Date().toISOString() } }));
    if (!navigator.onLine) {
      enqueueSync({
        table: 'field_check_ins', operation: 'update', recordId: ci.id,
        payload: { checkout_time: new Date().toISOString(), latitude: lat, longitude: lng },
      });
      setPendingSync(getPendingCount());
      return;
    }
    try {
      await supabase.from('field_check_ins').update({
        checkout_time: new Date().toISOString(), latitude: lat, longitude: lng,
      }).eq('id', ci.id);
    } catch { /* ignore */ }
  }, [checkIns]);

  const uploadEvidence = useCallback(async (assignmentId: string, photoUrl: string, photoType: 'before' | 'after') => {
    if (!employee) return;
    const tempId = `temp_${Date.now()}`;
    const tempEv: FieldEvidence = {
      id: tempId, assignment_id: assignmentId, employee_id: employee.id,
      photo_url: photoUrl, photo_type: photoType, created_at: new Date().toISOString(),
    };
    setEvidence(prev => ({ ...prev, [assignmentId]: [...(prev[assignmentId] || []), tempEv] }));

    const payload = {
      assignment_id: assignmentId, employee_id: employee.id,
      photo_url: photoUrl, photo_type: photoType,
    };
    if (!navigator.onLine) {
      enqueueSync({ table: 'field_evidence', operation: 'insert', recordId: tempId, payload });
      setPendingSync(getPendingCount());
      return;
    }
    try {
      const { data } = await supabase.from('field_evidence').insert(payload).select('*').single();
      if (data) {
        setEvidence(prev => ({
          ...prev,
          [assignmentId]: (prev[assignmentId] || []).map(e => e.id === tempId ? data as FieldEvidence : e),
        }));
      }
    } catch { /* ignore */ }
  }, [employee]);

  const deleteEvidence = useCallback(async (evidenceId: string) => {
    setEvidence(prev => {
      const next: Record<string, FieldEvidence[]> = {};
      for (const key in prev) next[key] = prev[key].filter(e => e.id !== evidenceId);
      return next;
    });
    await supabase.from('field_evidence').delete().eq('id', evidenceId);
  }, []);

  const reportIncident = useCallback(async (incident: Omit<FieldIncident, 'id' | 'employee_id' | 'status' | 'created_at'>) => {
    if (!employee) return;
    const tempId = `temp_${Date.now()}`;
    const tempInc: FieldIncident = {
      ...incident, id: tempId, employee_id: employee.id, status: 'open', created_at: new Date().toISOString(),
    };
    setIncidents(prev => [tempInc, ...prev]);

    const payload = { ...incident, employee_id: employee.id, status: 'open' as const };
    if (!navigator.onLine) {
      enqueueSync({ table: 'field_incidents', operation: 'insert', recordId: tempId, payload });
      setPendingSync(getPendingCount());
      return;
    }
    try {
      const { data } = await supabase.from('field_incidents').insert(payload).select('*').single();
      if (data) {
        setIncidents(prev => [data as FieldIncident, ...prev.filter(i => i.id !== tempId)]);
      }
    } catch { /* ignore */ }
  }, [employee]);

  const clockIn = useCallback(async (lat?: number, lng?: number) => {
    if (!employee) return;
    const today = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();
    const tempAtt: FieldAttendance = {
      id: 'temp', employee_id: employee.id, work_date: today, clock_in: nowIso,
      clock_out: null, latitude: lat || null, longitude: lng || null, status: 'present', created_at: nowIso,
    };
    setTodayAttendance(tempAtt);

    const payload = {
      employee_id: employee.id, work_date: today, clock_in: nowIso,
      latitude: lat || null, longitude: lng || null, status: 'present' as const,
    };
    if (!navigator.onLine) {
      enqueueSync({ table: 'field_attendance', operation: 'insert', recordId: 'temp', payload });
      setPendingSync(getPendingCount());
      return;
    }
    try {
      const { data } = await supabase.from('field_attendance').upsert(payload, { onConflict: 'employee_id,work_date' }).select('*').single();
      if (data) setTodayAttendance(data as FieldAttendance);
    } catch { /* ignore */ }
  }, [employee]);

  const clockOut = useCallback(async (lat?: number, lng?: number) => {
    if (!employee || !todayAttendance) return;
    const nowIso = new Date().toISOString();
    setTodayAttendance(prev => prev ? { ...prev, clock_out: nowIso } : null);

    if (!navigator.onLine) {
      enqueueSync({
        table: 'field_attendance', operation: 'update', recordId: todayAttendance.id,
        payload: { clock_out: nowIso, latitude: lat || null, longitude: lng || null },
      });
      setPendingSync(getPendingCount());
      return;
    }
    try {
      await supabase.from('field_attendance').update({
        clock_out: nowIso, latitude: lat || null, longitude: lng || null,
      }).eq('id', todayAttendance.id);
    } catch { /* ignore */ }
  }, [employee, todayAttendance]);

  // === NEW: Job messaging ===
  const sendMessage = useCallback(async (assignmentId: string, body: string) => {
    if (!employee) return;
    const tempId = `temp_${Date.now()}`;
    const tempMsg: JobMessage = {
      id: tempId, assignment_id: assignmentId, sender: 'worker',
      sender_name: employee.full_name, body, created_at: new Date().toISOString(),
    };
    setMessages(prev => ({
      ...prev,
      [assignmentId]: [...(prev[assignmentId] || []), tempMsg],
    }));

    const payload = {
      assignment_id: assignmentId, sender: 'worker',
      sender_name: employee.full_name, body,
    };
    if (!navigator.onLine) {
      enqueueSync({ table: 'field_job_messages', operation: 'insert', recordId: tempId, payload });
      setPendingSync(getPendingCount());
      return;
    }
    try {
      const { data } = await supabase.from('field_job_messages').insert(payload).select('*').single();
      if (data) {
        setMessages(prev => ({
          ...prev,
          [assignmentId]: (prev[assignmentId] || []).map(m => m.id === tempId ? data as JobMessage : m),
        }));
      }
    } catch { /* ignore */ }
  }, [employee]);

  // === NEW: Job notes ===
  const addNote = useCallback(async (assignmentId: string, noteText: string, photoUrl?: string) => {
    if (!employee) return;
    const tempId = `temp_${Date.now()}`;
    const tempNote: FieldJobNote = {
      id: tempId, assignment_id: assignmentId, employee_id: employee.id,
      note_text: noteText, photo_url: photoUrl || null, created_at: new Date().toISOString(),
    };
    setNotes(prev => ({
      ...prev,
      [assignmentId]: [...(prev[assignmentId] || []), tempNote],
    }));

    const payload = {
      assignment_id: assignmentId, employee_id: employee.id,
      note_text: noteText, photo_url: photoUrl || null,
    };
    if (!navigator.onLine) {
      enqueueSync({ table: 'field_job_notes', operation: 'insert', recordId: tempId, payload });
      setPendingSync(getPendingCount());
      return;
    }
    try {
      const { data } = await supabase.from('field_job_notes').insert(payload).select('*').single();
      if (data) {
        setNotes(prev => ({
          ...prev,
          [assignmentId]: (prev[assignmentId] || []).map(n => n.id === tempId ? data as FieldJobNote : n),
        }));
      }
    } catch { /* ignore */ }
  }, [employee]);

  // === NEW: Pause / Resume job ===
  const pauseJob = useCallback(async (assignmentId: string, reason: string) => {
    setAssignments(prev => prev.map(a => a.id === assignmentId ? {
      ...a, status: 'paused', paused_at: new Date().toISOString(), paused_reason: reason,
    } : a));
    await writeOrQueue('field_assignments', 'update', assignmentId, {
      status: 'paused', paused_at: new Date().toISOString(), paused_reason: reason,
      updated_at: new Date().toISOString(),
    });
  }, [writeOrQueue]);

  const resumeJob = useCallback(async (assignmentId: string) => {
    setAssignments(prev => prev.map(a => a.id === assignmentId ? {
      ...a, status: 'in_progress', paused_at: null, paused_reason: null,
    } : a));
    await writeOrQueue('field_assignments', 'update', assignmentId, {
      status: 'in_progress', paused_at: null, paused_reason: null,
      updated_at: new Date().toISOString(),
    });
  }, [writeOrQueue]);

  // === NEW: Location pings ===
  const sendLocationPing = useCallback(async (assignmentId: string, lat: number, lng: number, batteryLevel?: number) => {
    if (!employee) return;
    const payload = {
      assignment_id: assignmentId, employee_id: employee.id,
      latitude: lat, longitude: lng, battery_level: batteryLevel || null,
    };
    if (!navigator.onLine) return; // pings are best-effort, don't queue
    try {
      await supabase.from('field_location_pings').insert(payload);
    } catch { /* ignore */ }
  }, [employee]);

  return (
    <FieldStaffContext.Provider value={{
      assignments, tasks, checkIns, evidence, incidents, attendance,
      checklistTemplates, messages, notes, jobScores,
      loading, error, online, pendingSync, refresh,
      updateAssignmentStatus, saveSignature, toggleTask, addTask,
      checkIn, checkOut, uploadEvidence, deleteEvidence,
      reportIncident, clockIn, clockOut, todayAttendance,
      sendMessage, addNote, pauseJob, resumeJob, sendLocationPing,
    }}>
      {children}
    </FieldStaffContext.Provider>
  );
}

export function useFieldStaff() {
  const ctx = useContext(FieldStaffContext);
  if (!ctx) throw new Error('useFieldStaff must be used within FieldStaffProvider');
  return ctx;
}
