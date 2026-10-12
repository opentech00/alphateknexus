import type { Service } from '../types';
import { fallbackServiceImage } from './media';
import { toSleCurrencyText } from './money';

export type ServiceMode = 'hire' | 'quote' | 'pickup' | 'subscribe';

export type CatalogIcon = 'Ship' | 'Trash2' | 'Shield' | 'Sparkles' | 'ShoppingCart';

export type CatalogMeta = {
  slug: string;
  label: string;
  shortLabel: string;
  blurb: string;
  category: string;
  defaultMode: ServiceMode;
  hasQuote: boolean;
  hasHire: boolean;
  special?: 'waste';
  features: string[];
  responseTime: string;
  duration: string;
  icon: CatalogIcon;
  priceHint: string;
  colors: { chip: string; text: string; price: string; ring: string; bg: string; gradient: string; badge: string; btn: string };
};

export const CATALOG_META: Record<string, CatalogMeta> = {
  'clearing-forwarding': {
    slug: 'clearing-forwarding', label: 'Clearing & Forwarding', shortLabel: 'Clearing',
    blurb: 'Customs, documentation, and freight so cargo never sits at the quay.',
    category: 'C&F', defaultMode: 'hire', hasQuote: true, hasHire: true,
    features: ['Customs Documentation', 'Port Clearance', 'Cargo Tracking', 'Insurance'],
    responseTime: '48h response', duration: '2–5 business days', icon: 'Ship',
    priceHint: 'From SLE 500,000',
    colors: { chip: 'bg-indigo-100', text: 'text-indigo-600', price: 'text-indigo-600', ring: 'ring-indigo-200', bg: 'bg-blue-50', gradient: 'from-blue-500 to-blue-700', badge: 'bg-blue-500', btn: 'bg-blue-600 hover:bg-blue-700' },
  },
  procurement: {
    slug: 'procurement', label: 'Procurement', shortLabel: 'Procurement',
    blurb: 'Sourced, quoted, and delivered — from office essentials to industrial materials.',
    category: 'Procurement', defaultMode: 'quote', hasQuote: true, hasHire: true,
    features: ['Strategic Sourcing', 'Vendor Management', 'Cost Analysis', 'Supply Chain'],
    responseTime: '48h response', duration: 'Project-based', icon: 'ShoppingCart',
    priceHint: 'From SLE 100,000',
    colors: { chip: 'bg-amber-100', text: 'text-amber-600', price: 'text-amber-600', ring: 'ring-amber-200', bg: 'bg-violet-50', gradient: 'from-violet-500 to-violet-700', badge: 'bg-violet-500', btn: 'bg-violet-600 hover:bg-violet-700' },
  },
  'private-security': {
    slug: 'private-security', label: 'Private Security', shortLabel: 'Security',
    blurb: 'Vetted officers and coverage for homes, worksites, and events.',
    category: 'Security', defaultMode: 'hire', hasQuote: true, hasHire: true,
    features: ['Armed & Unarmed Guards', 'CCTV Monitoring', 'Access Control', 'Event Security'],
    responseTime: '24h deploy', duration: 'Contract-based', icon: 'Shield',
    priceHint: 'From SLE 250,000',
    colors: { chip: 'bg-blue-100', text: 'text-blue-600', price: 'text-blue-600', ring: 'ring-blue-200', bg: 'bg-slate-100', gradient: 'from-slate-600 to-slate-800', badge: 'bg-slate-700', btn: 'bg-slate-800 hover:bg-slate-900' },
  },
  'cleaning-janitorial': {
    slug: 'cleaning-janitorial', label: 'Cleaning & Janitorial', shortLabel: 'Cleaning',
    blurb: 'Trained crews for homes, offices, and commercial floors.',
    category: 'Cleaning', defaultMode: 'hire', hasQuote: true, hasHire: true,
    features: ['Deep Cleaning', 'Office Maintenance', 'Carpet & Upholstery', 'Sanitization'],
    responseTime: 'Same-day', duration: 'Per session / Monthly', icon: 'Sparkles',
    priceHint: 'From SLE 120,000',
    colors: { chip: 'bg-teal-100', text: 'text-teal-600', price: 'text-teal-600', ring: 'ring-teal-200', bg: 'bg-cyan-50', gradient: 'from-cyan-500 to-cyan-700', badge: 'bg-cyan-500', btn: 'bg-cyan-600 hover:bg-cyan-700' },
  },
  'waste-management': {
    slug: 'waste-management', label: 'Smart Sort (Waste)', shortLabel: 'Smart Sort',
    blurb: 'Scheduled pickups, recycling streams, and bin subscriptions.',
    category: 'Smart Sort', defaultMode: 'pickup', hasQuote: true, hasHire: true, special: 'waste',
    features: ['Scheduled Collection', 'Recycling', 'Disposal Certs', 'Route Tracking'],
    responseTime: 'Same-day', duration: 'Ongoing service', icon: 'Trash2',
    priceHint: 'From SLE 300,000',
    colors: { chip: 'bg-emerald-100', text: 'text-emerald-600', price: 'text-emerald-600', ring: 'ring-emerald-200', bg: 'bg-emerald-50', gradient: 'from-emerald-500 to-emerald-700', badge: 'bg-emerald-500', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  },
};

export const CATALOG_CATEGORIES = ['All', 'C&F', 'Smart Sort', 'Cleaning', 'Security', 'Procurement'] as const;

export type CatalogItem = {
  service: Service;
  meta: CatalogMeta;
  image: string;
  priceLabel: string;
};

function defaultMeta(service: Service): CatalogMeta {
  return {
    slug: service.slug,
    label: service.name,
    shortLabel: service.name,
    blurb: service.description || 'Book this service with Alphatek Nexus.',
    category: 'All',
    defaultMode: 'hire',
    hasQuote: true,
    hasHire: true,
    features: [],
    responseTime: '48h response',
    duration: 'As scheduled',
    icon: 'Sparkles',
    priceHint: service.price_range || 'Request a quote',
    colors: { chip: 'bg-slate-100', text: 'text-slate-600', price: 'text-slate-700', ring: 'ring-slate-200', bg: 'bg-slate-50', gradient: 'from-slate-500 to-slate-700', badge: 'bg-slate-600', btn: 'bg-slate-800 hover:bg-slate-900' },
  };
}

export function formatCatalogPrice(raw: string | null | undefined, formatMoney?: (n: number) => string): string {
  const text = toSleCurrencyText(raw || '');
  const match = text.match(/([\d,]+(?:\.\d+)?)/);
  if (!match) return text || 'Request a quote';
  const amount = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return text;
  const pretty = formatMoney ? formatMoney(amount) : `SLE ${amount.toLocaleString()}`;
  return `From ${pretty}`;
}

export function parsePriceHint(raw: string | null | undefined, fallback = 25): number {
  const match = (raw || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return fallback;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function buildCatalog(
  services: Service[],
  images: Record<string, string> = {},
  formatMoney?: (n: number) => string,
): CatalogItem[] {
  return services.map((service) => {
    const meta = CATALOG_META[service.slug] || defaultMeta(service);
    return {
      service,
      meta: {
        ...meta,
        label: service.name || meta.label,
        blurb: service.description?.trim() || meta.blurb,
        priceHint: service.price_range?.trim() || meta.priceHint,
      },
      image: images[service.slug] || service.branding_image_url || fallbackServiceImage(service.slug),
      priceLabel: formatCatalogPrice(service.price_range?.trim() || meta.priceHint, formatMoney),
    };
  });
}
