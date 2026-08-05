export interface Service {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  price_range: string;
  is_active: boolean;
  created_at: string;
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
