import type { LucideIcon } from 'lucide-react';
import {
  Brush, Package, Recycle, ShieldCheck, Truck, Building2,
} from 'lucide-react';
import type { DivisionConfig } from './DivisionBookingsPanel';
import { canonicalSlug } from '../../lib/capabilities';

const BY_SLUG: Record<string, Omit<DivisionConfig, 'icon'> & { icon: LucideIcon }> = {
  'private-security': {
    name: 'Private Security',
    slug: 'private-security',
    icon: ShieldCheck,
    accentColor: 'bg-amber-600',
    accentLight: 'bg-amber-50',
    accentText: 'text-amber-600',
    accentBorder: 'border-amber-400',
    accentRing: 'ring-amber-500',
    description: 'Armed and unarmed security guards, event security, CCTV surveillance and escorts.',
    staff: 120,
  },
  'clearing-forwarding': {
    name: 'Clearing & Forwarding',
    slug: 'clearing-forwarding',
    icon: Truck,
    accentColor: 'bg-blue-600',
    accentLight: 'bg-blue-50',
    accentText: 'text-blue-600',
    accentBorder: 'border-blue-400',
    accentRing: 'ring-blue-500',
    description: 'Import/export logistics, customs clearance, cargo forwarding and subscription services.',
    staff: 18,
  },
  procurement: {
    name: 'Procurement',
    slug: 'procurement',
    icon: Package,
    accentColor: 'bg-rose-600',
    accentLight: 'bg-rose-50',
    accentText: 'text-rose-600',
    accentBorder: 'border-rose-400',
    accentRing: 'ring-rose-500',
    description: 'Supply chain sourcing, vendor management, bulk purchasing and procurement logistics.',
    staff: 8,
  },
  'cleaning-janitorial': {
    name: 'Cleaning Services',
    slug: 'cleaning-janitorial',
    icon: Brush,
    accentColor: 'bg-cyan-600',
    accentLight: 'bg-cyan-50',
    accentText: 'text-cyan-600',
    accentBorder: 'border-cyan-400',
    accentRing: 'ring-cyan-500',
    description: 'Commercial and residential cleaning, deep cleaning, sanitisation and maintenance.',
    staff: 45,
  },
  'waste-management': {
    name: 'Smart Sort / Recycling',
    slug: 'waste-management',
    icon: Recycle,
    accentColor: 'bg-emerald-600',
    accentLight: 'bg-emerald-50',
    accentText: 'text-emerald-600',
    accentBorder: 'border-emerald-400',
    accentRing: 'ring-emerald-500',
    description: 'Waste management, smart sorting solutions, and eco-friendly recycling programs.',
    staff: 32,
  },
  'admin-finance': {
    name: 'Admin & Finance',
    slug: 'admin-finance',
    icon: Building2,
    accentColor: 'bg-slate-800',
    accentLight: 'bg-slate-50',
    accentText: 'text-slate-700',
    accentBorder: 'border-slate-400',
    accentRing: 'ring-slate-500',
    description: 'Internal administration, finance operations, and company-wide support.',
    staff: 12,
  },
};

export function getDivisionConfig(slug: string | null | undefined, fallbackName?: string): DivisionConfig {
  const key = canonicalSlug(slug) || slug || '';
  const found = BY_SLUG[key];
  if (found) return found;
  return {
    name: fallbackName || 'Division',
    slug: key || 'division',
    icon: Building2,
    accentColor: 'bg-emerald-600',
    accentLight: 'bg-emerald-50',
    accentText: 'text-emerald-600',
    accentBorder: 'border-emerald-400',
    accentRing: 'ring-emerald-500',
    description: 'Division operations, bookings, and team.',
    staff: 0,
  };
}
