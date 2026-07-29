export type AssignmentStatus =
  | 'pending'
  | 'assigned'
  | 'accepted'
  | 'declined'
  | 'in_progress'
  | 'pending_review'
  | 'approved'
  | 'rejected';

export interface FieldAssignment {
  id: string;
  employee_id: string;
  service_id: string | null;
  service_name: string;
  customer_name: string;
  address: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  instructions: string | null;
  amount: number | null;
  status: AssignmentStatus;
  notes: string | null;
  customer_signature: string | null;
  signature_captured_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SyncQueueStatus = 'pending' | 'syncing' | 'failed';

export interface SyncQueueItem {
  id: string;
  table: string;
  operation: 'update' | 'insert';
  recordId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  status: SyncQueueStatus;
}

export interface FieldAssignmentTask {
  id: string;
  assignment_id: string;
  task_text: string;
  completed: boolean;
  sort_order: number;
  created_at: string;
}

export interface FieldCheckIn {
  id: string;
  assignment_id: string;
  employee_id: string;
  checkin_time: string | null;
  checkout_time: string | null;
  latitude: number | null;
  longitude: number | null;
  checkin_photo_url: string | null;
  created_at: string;
}

export interface FieldEvidence {
  id: string;
  assignment_id: string;
  employee_id: string;
  photo_url: string;
  photo_type: 'before' | 'after';
  created_at: string;
}

export interface FieldIncident {
  id: string;
  assignment_id: string | null;
  employee_id: string;
  incident_type: 'Equipment Issue' | 'Safety Hazard' | 'Customer Complaint' | 'Property Damage' | 'Other';
  description: string;
  photo_url: string | null;
  status: 'open' | 'reviewed' | 'closed';
  created_at: string;
}

export interface FieldAttendance {
  id: string;
  employee_id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  latitude: number | null;
  longitude: number | null;
  status: 'present' | 'absent' | 'half_day' | 'late';
  created_at: string;
}

export interface ChecklistTemplate {
  id: string;
  service_slug: string;
  item_text: string;
  sort_order: number;
}

export interface JobMessage {
  id: string;
  assignment_id: string;
  sender: 'worker' | 'admin' | 'customer';
  body: string;
  created_at: string;
}

export const STATUS_META: Record<AssignmentStatus, { label: string; color: string; bg: string; dot: string }> = {
  pending:         { label: 'Pending',         color: 'text-slate-600',   bg: 'bg-slate-100',   dot: 'bg-slate-400'   },
  assigned:        { label: 'Assigned',        color: 'text-blue-600',     bg: 'bg-blue-50',      dot: 'bg-blue-500'    },
  accepted:        { label: 'Accepted',        color: 'text-indigo-600',   bg: 'bg-indigo-50',    dot: 'bg-indigo-500'  },
  declined:        { label: 'Declined',        color: 'text-red-600',      bg: 'bg-red-50',       dot: 'bg-red-500'     },
  in_progress:     { label: 'In Progress',     color: 'text-amber-600',   bg: 'bg-amber-50',     dot: 'bg-amber-500'   },
  pending_review:  { label: 'Pending Review',  color: 'text-purple-600',  bg: 'bg-purple-50',    dot: 'bg-purple-500'  },
  approved:        { label: 'Approved',        color: 'text-emerald-600',  bg: 'bg-emerald-50',   dot: 'bg-emerald-500' },
  rejected:        { label: 'Rejected',        color: 'text-rose-600',     bg: 'bg-rose-50',      dot: 'bg-rose-500'    },
};
