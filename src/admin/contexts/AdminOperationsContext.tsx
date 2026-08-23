import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface AdminOperationsContextValue {
  newJobCount: number;
  jobReviewCount: number;
  newTaskCount: number;
  loading: boolean;
}

const AdminOperationsContext = createContext<AdminOperationsContextValue | null>(null);

export function AdminOperationsProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin } = useAuth();
  const [newJobCount, setNewJobCount] = useState(0);
  const [jobReviewCount, setJobReviewCount] = useState(0);
  const [newTaskCount, setNewTaskCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refreshCounts = useCallback(async () => {
    if (!user || !isAdmin) {
      setNewJobCount(0);
      setJobReviewCount(0);
      setNewTaskCount(0);
      setLoading(false);
      return;
    }

    const [{ count: pendingJobs }, { count: pendingReviews }, { count: pendingTasks }] = await Promise.all([
      supabase.from('field_assignments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('field_assignments').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
      supabase.from('task_delegations').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    setNewJobCount(pendingJobs || 0);
    setJobReviewCount(pendingReviews || 0);
    setNewTaskCount(pendingTasks || 0);
    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  useEffect(() => {
    if (!user || !isAdmin) return;

    const channel = supabase
      .channel(`admin-operations-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'field_assignments' }, refreshCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_delegations' }, refreshCounts)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, isAdmin, refreshCounts]);

  return (
    <AdminOperationsContext.Provider value={{ newJobCount, jobReviewCount, newTaskCount, loading }}>
      {children}
    </AdminOperationsContext.Provider>
  );
}

export function useAdminOperations() {
  const context = useContext(AdminOperationsContext);
  if (!context) throw new Error('useAdminOperations must be used within AdminOperationsProvider');
  return context;
}