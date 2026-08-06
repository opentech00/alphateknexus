export interface Service {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  price_range: string;
  is_active: boolean;
  created_at: string;
  branding_image_url?: string | null;
  login_image_url?: string | null;
}

export type MediaCategory = 'app_logo' | 'service_branding' | 'login_carousel' | 'splash' | 'general';

export interface MediaAsset {
  id: string;
  category: MediaCategory;
  key: string;
  title: string | null;
  alt_text: string | null;
  file_name: string | null;
  file_path: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  display_order: number;
  is_active: boolean;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: 'user' | 'admin';
  created_at: string;
  referral_code: string | null;
  avatar_url: string | null;
  address: string | null;
  admin_role_id: string | null;
}

export type BookingStatus =
  | 'pending'
  | 'pending_review'
  | 'approved'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface Booking {
  id: string;
  service_id: string;
  user_id: string | null;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  location: string | null;
  notes: string | null;
  status: BookingStatus;
  payment_method: string | null;
  payment_status: string | null;
  details: Record<string, unknown> | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}
