import { useState, useEffect, useRef } from 'react';
import {
  X, ArrowLeft, Star, MapPin, HelpCircle, CheckCircle2,
  CalendarPlus, MessageSquare, Wallet, Clock, ShieldCheck,
  ChevronDown, Sparkles as SparklesIcon, Ship, Trash2, Shield,
  ShoppingCart, Repeat2, PackageCheck, Phone, Award, Users,
  Route, Zap, Leaf, Lock,
} from 'lucide-react';

const CF_HERO = 'https://images.pexels.com/photos/6169033/pexels-photo-6169033.jpeg?auto=compress&cs=tinysrgb&w=900';
const CF_HERO2 = 'https://images.pexels.com/photos/906494/pexels-photo-906494.jpeg?auto=compress&cs=tinysrgb&w=900';
const SS_HERO = 'https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg?auto=compress&cs=tinysrgb&w=900';
const SS_HERO2 = 'https://images.pexels.com/photos/802221/pexels-photo-802221.jpeg?auto=compress&cs=tinysrgb&w=900';
const PS_HERO = 'https://images.pexels.com/photos/5699456/pexels-photo-5699456.jpeg?auto=compress&cs=tinysrgb&w=900';
const PS_HERO2 = 'https://images.pexels.com/photos/2599244/pexels-photo-2599244.jpeg?auto=compress&cs=tinysrgb&w=900';
const CL_HERO = 'https://images.pexels.com/photos/4107120/pexels-photo-4107120.jpeg?auto=compress&cs=tinysrgb&w=900';
const CL_HERO2 = 'https://images.pexels.com/photos/4239013/pexels-photo-4239013.jpeg?auto=compress&cs=tinysrgb&w=900';
const PR_HERO = 'https://images.pexels.com/photos/4481259/pexels-photo-4481259.jpeg?auto=compress&cs=tinysrgb&w=900';
const PR_HERO2 = 'https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg?auto=compress&cs=tinysrgb&w=900';

interface Service {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  price_range: string;
}

interface ServiceDetailModalProps {
  service: Service;
  rating?: { avg: number; count: number } | null;
  onClose: () => void;
  onHireNow: (service: Service) => void;
  onRequestQuote?: (service: Service) => void;
}

interface ServiceDetail {
  heroImages: string[];
  price: string;
  duration: string;
  trusted: string;
  overview: string;
  howItWorks: { title: string; description: string }[];
  whatsIncluded: string[];
  addOns: string[];
  serviceArea: string;
  faqs: { q: string; a: string }[];
  accentColor: string;
  smartSortVariant?: boolean;
  highlights: { icon: typeof Zap; label: string; value: string }[];
}

const serviceDetails: Record<string, ServiceDetail> = {
  'clearing-forwarding': {
    heroImages: [CF_HERO, CF_HERO2],
    price: 'From Le 150,000',
    duration: '2–5 business days',
    trusted: 'Licensed Brokers',
    overview:
      'End-to-end clearing & forwarding services covering customs declarations, port formalities, freight handling and last-mile delivery. Our licensed brokers ensure shipments move quickly through Freetown port and overland routes.',
    howItWorks: [
      { title: 'Document Review', description: 'We collect and validate B/L, invoice, packing list, and permits.' },
      { title: 'Customs Lodgement', description: 'Declarations submitted via ASYCUDA and duties calculated.' },
      { title: 'Port Clearance', description: 'Physical inspection coordinated and release secured.' },
      { title: 'Delivery', description: 'Cargo transported to your designated destination with tracking.' },
    ],
    whatsIncluded: [
      'Customs documentation & declarations',
      'Real-time shipment tracking',
      'Bonded warehouse storage',
      'Port handling charges coordination',
      'Cargo insurance options',
    ],
    addOns: ['Express clearance (24h)', 'Cold chain handling', 'Hazmat certification', 'Door-to-door trucking'],
    serviceArea: 'Freetown Port, Lungi Airport, all SL border crossings',
    faqs: [
      { q: 'How long does clearance take?', a: 'Standard sea freight: 2–5 business days after documents are submitted. Air freight: 24–48 hours.' },
      { q: 'Do you handle restricted goods?', a: 'Yes, including pharma and hazardous materials with the appropriate permits.' },
      { q: 'What documents do I need to provide?', a: 'Bill of Lading or Airway Bill, commercial invoice, packing list, and any relevant permits or certificates.' },
    ],
    accentColor: 'blue',
    highlights: [
      { icon: Ship, label: 'Port Coverage', value: 'Freetown & Lungi' },
      { icon: ShieldCheck, label: 'Licensed', value: 'ASYCUDA' },
      { icon: Route, label: 'Tracking', value: 'Real-time' },
    ],
  },
  'waste-management': {
    heroImages: [SS_HERO, SS_HERO2],
    price: 'From Le 25,000/month',
    duration: 'Ongoing service',
    trusted: 'Licensed & Certified',
    overview:
      'Reliable waste collection, recycling and disposal for households, offices and industrial sites. Routes are GPS-tracked and pickups confirmed in real time.',
    howItWorks: [
      { title: 'Site Assessment', description: 'We evaluate volume, frequency and access requirements.' },
      { title: 'Schedule Setup', description: 'Weekly, bi-weekly or on-demand pickup calendar configured.' },
      { title: 'Collection', description: 'Trained crews collect, sort and load waste using marked vehicles.' },
      { title: 'Disposal & Reporting', description: 'Waste delivered to approved sites with disposal certificates.' },
    ],
    whatsIncluded: [
      'Scheduled curbside collection',
      'Recyclables sorting',
      'Route GPS tracking',
      'Bins and liners provided',
      'Disposal certification',
    ],
    addOns: ['Bulk waste removal', 'E-waste collection', 'Composting service', 'Biohazard handling'],
    serviceArea: 'Western Area Urban & Rural, Bo, Kenema, Makeni',
    faqs: [
      { q: 'What waste types are accepted?', a: 'General, organic, recyclables, e-waste, and medical (with permits).' },
      { q: 'Can I reschedule a pickup?', a: 'Yes — reschedule any time up to 2 hours before the scheduled slot.' },
      { q: 'Is a contract required?', a: 'Monthly contracts are standard, but one-off pickups are available for residential clients.' },
    ],
    accentColor: 'emerald',
    smartSortVariant: true,
    highlights: [
      { icon: Leaf, label: 'Eco-Friendly', value: 'Recycling First' },
      { icon: Zap, label: 'Same-Day', value: 'Available' },
      { icon: Route, label: 'GPS Tracked', value: 'Every Route' },
    ],
  },
  'procurement': {
    heroImages: [PR_HERO, PR_HERO2],
    price: 'From Le 50,000',
    duration: 'Project-based',
    trusted: 'Vetted Suppliers',
    overview:
      'Strategic sourcing and procurement services that help businesses reduce costs, manage vendors, and streamline supply chains. From single-item sourcing to full tender management, we handle the entire purchasing lifecycle.',
    howItWorks: [
      { title: 'Requirements Analysis', description: 'We assess your needs, budget, and timeline to define scope.' },
      { title: 'Vendor Sourcing', description: 'We identify and evaluate qualified suppliers through our network.' },
      { title: 'Negotiation & Ordering', description: 'We negotiate pricing and terms, then place orders on your behalf.' },
      { title: 'Delivery & QA', description: 'Goods are inspected, delivered, and quality-checked before handoff.' },
    ],
    whatsIncluded: [
      'Strategic sourcing & vendor management',
      'Cost analysis & price benchmarking',
      'Purchase order management',
      'Quality assurance inspections',
      'Delivery coordination',
    ],
    addOns: ['Tender management', 'International sourcing', 'Inventory auditing', 'Contract negotiation'],
    serviceArea: 'Nationwide delivery, Freetown HQ',
    faqs: [
      { q: 'What types of goods can you procure?', a: 'Office supplies, equipment, construction materials, industrial goods, and specialized items — if it can be sourced, we will find it.' },
      { q: 'Do you handle international procurement?', a: 'Yes, we manage imports end-to-end including customs clearance through our C&F division.' },
      { q: 'How are suppliers vetted?', a: 'All suppliers pass a verification process covering licensing, quality history, and financial stability.' },
    ],
    accentColor: 'violet',
    highlights: [
      { icon: ShoppingCart, label: 'Sourcing', value: 'Global Network' },
      { icon: Award, label: 'Vetted', value: 'Suppliers' },
      { icon: Wallet, label: 'Cost Save', value: 'Up to 30%' },
    ],
  },
  'private-security': {
    heroImages: [PS_HERO, PS_HERO2],
    price: 'From Le 200,000/month',
    duration: 'Contract-based',
    trusted: 'Licensed & Insured',
    overview:
      'Professional armed and unarmed security services for businesses, events, and private clients. Our officers are trained, vetted, and equipped to provide reliable protection tailored to your risk profile.',
    howItWorks: [
      { title: 'Risk Assessment', description: 'We evaluate your site, threats, and security requirements.' },
      { title: 'Custom Security Plan', description: 'A tailored deployment plan with officer count, shifts, and equipment.' },
      { title: 'Officer Deployment', description: 'Trained, vetted security officers are deployed to your location.' },
      { title: 'Monitoring & Reporting', description: '24/7 supervision with incident reports and regular performance reviews.' },
    ],
    whatsIncluded: [
      'Armed & unarmed security guards',
      'CCTV monitoring & surveillance',
      'Access control management',
      'Event security & crowd control',
      'Incident reporting & response',
    ],
    addOns: ['K9 units', 'Executive protection', 'Mobile patrols', 'Alarm response'],
    serviceArea: 'Freetown, Bo, Kenema, Makeni & nationwide',
    faqs: [
      { q: 'Are your guards licensed?', a: 'Yes, all officers are licensed, background-checked, and undergo regular training.' },
      { q: 'Can I scale up for events?', a: 'Absolutely — we provide event security from small gatherings to large venues with crowd management.' },
      { q: 'What is the minimum contract?', a: 'Monthly contracts are standard. Short-term event coverage is available on request.' },
    ],
    accentColor: 'slate',
    highlights: [
      { icon: Lock, label: 'Protection', value: '24/7 Cover' },
      { icon: Users, label: 'Officers', value: 'Vetted & Trained' },
      { icon: ShieldCheck, label: 'Insured', value: 'Full Liability' },
    ],
  },
  'cleaning-janitorial': {
    heroImages: [CL_HERO, CL_HERO2],
    price: 'From Le 30,000/session',
    duration: 'Per session / Monthly',
    trusted: 'Trained Crews',
    overview:
      'Professional cleaning and janitorial services for homes, offices, and commercial spaces. Our trained crews use eco-friendly products and industry-standard equipment to deliver spotless results every time.',
    howItWorks: [
      { title: 'Site Survey', description: 'We assess your space and customize a cleaning plan to your needs.' },
      { title: 'Crew Assignment', description: 'A dedicated, trained cleaning crew is assigned to your property.' },
      { title: 'Deep Clean', description: 'We execute the cleaning plan using professional-grade products and equipment.' },
      { title: 'Quality Check', description: 'A supervisor inspects the work and confirms satisfaction before sign-off.' },
    ],
    whatsIncluded: [
      'Deep cleaning of all rooms',
      'Floor care & carpet cleaning',
      'Window & surface sanitization',
      'Restroom sanitization',
      'Waste removal & disposal',
    ],
    addOns: ['Post-construction cleaning', 'Upholstery cleaning', 'Pest control', 'Garden maintenance'],
    serviceArea: 'Freetown, Waterloo, Lumpa & surrounding areas',
    faqs: [
      { q: 'Do you provide cleaning supplies?', a: 'Yes, our crews arrive fully equipped with eco-friendly products and professional equipment.' },
      { q: 'Can I schedule recurring cleaning?', a: 'Yes — weekly, bi-weekly, and monthly plans are available with discounted pricing.' },
      { q: 'How long does a session take?', a: 'A standard office cleaning takes 2–4 hours. Deep cleans and larger spaces may take longer.' },
    ],
    accentColor: 'cyan',
    highlights: [
      { icon: SparklesIcon, label: 'Eco-Friendly', value: 'Safe Products' },
      { icon: Zap, label: 'Same-Day', value: 'Available' },
      { icon: CheckCircle2, label: 'Quality', value: 'Supervised' },
    ],
  },
};

const accentMap: Record<string, { badge: string; btn: string; text: string; bg: string; dot: string; ring: string; gradient: string }> = {
  blue: {
    badge: 'bg-blue-600 text-white',
    btn: 'bg-blue-600 hover:bg-blue-700 text-white',
    text: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    dot: 'bg-blue-500',
    ring: 'ring-blue-500',
    gradient: 'from-blue-500 to-blue-700',
  },
  emerald: {
    badge: 'bg-emerald-600 text-white',
    btn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    text: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-500',
    gradient: 'from-emerald-500 to-emerald-700',
  },
  violet: {
    badge: 'bg-violet-600 text-white',
    btn: 'bg-violet-600 hover:bg-violet-700 text-white',
    text: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-900/20',
    dot: 'bg-violet-500',
    ring: 'ring-violet-500',
    gradient: 'from-violet-500 to-violet-700',
  },
  slate: {
    badge: 'bg-slate-700 text-white',
    btn: 'bg-slate-800 hover:bg-slate-900 text-white',
    text: 'text-slate-700 dark:text-slate-300',
    bg: 'bg-slate-100 dark:bg-slate-700/30',
    dot: 'bg-slate-600',
    ring: 'ring-slate-500',
    gradient: 'from-slate-600 to-slate-800',
  },
  cyan: {
    badge: 'bg-cyan-600 text-white',
    btn: 'bg-cyan-600 hover:bg-cyan-700 text-white',
    text: 'text-cyan-600 dark:text-cyan-400',
    bg: 'bg-cyan-50 dark:bg-cyan-900/20',
    dot: 'bg-cyan-500',
    ring: 'ring-cyan-500',
    gradient: 'from-cyan-500 to-cyan-700',
  },
};

const serviceIconMap: Record<string, { icon: typeof Ship; label: string }> = {
  'clearing-forwarding': { icon: Ship, label: 'Clearing & Forwarding' },
  'waste-management': { icon: Trash2, label: 'Smart Sort' },
  'procurement': { icon: ShoppingCart, label: 'Procurement' },
  'private-security': { icon: Shield, label: 'Private Security' },
  'cleaning-janitorial': { icon: SparklesIcon, label: 'Cleaning & Janitorial' },
};

function FAQ({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`rounded-xl border transition-all duration-200 overflow-hidden ${
        open
          ? 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
      }`}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left p-4 flex items-center justify-between gap-3"
      >
        <p className={`font-semibold text-sm transition-colors ${open ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'}`}>{q}</p>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-all duration-200 ${open ? 'rotate-180 text-slate-600 dark:text-slate-300' : 'text-slate-400'}`} />
      </button>
      <div className={`grid transition-all duration-200 ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <p className="px-4 pb-4 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  );
}

export function ServiceDetailModal({ service, rating, onClose, onHireNow, onRequestQuote }: ServiceDetailModalProps) {
  const detail = serviceDetails[service.slug];
  const [activeImg, setActiveImg] = useState(0);
  const [tab, setTab] = useState<'overview' | 'details'>('overview');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const accent = accentMap[detail?.accentColor ?? 'emerald'];
  const svcIcon = serviceIconMap[service.slug];

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    setImageLoaded(false);
  }, [activeImg]);

  // Fallback for services without a detail definition
  if (!detail) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />
        <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center animate-in zoom-in-95 duration-300">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{service.name}</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6">{service.description}</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Close</button>
            <button onClick={() => onHireNow(service)} className="flex-1 py-3 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-900 transition-colors">Hire Now</button>
          </div>
        </div>
      </div>
    );
  }

  const heroImg = detail.heroImages[activeImg] ?? detail.heroImages[0];
  const ServiceIcon = svcIcon?.icon ?? SparklesIcon;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full sm:max-w-lg md:max-w-xl bg-white dark:bg-slate-800 sm:rounded-3xl shadow-2xl flex flex-col max-h-[96vh] overflow-hidden animate-in fade-in slide-in-from-bottom-8 sm:zoom-in-95 duration-300 rounded-t-3xl sm:rounded-t-3xl">

        {/* Hero Image */}
        <div className="relative h-56 sm:h-60 flex-shrink-0 overflow-hidden">
          {!imageLoaded && (
            <div className="absolute inset-0 bg-slate-200 dark:bg-slate-700 animate-pulse" />
          )}
          <img
            src={heroImg}
            alt={service.name}
            className={`w-full h-full object-cover transition-opacity duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImageLoaded(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

          {/* Image nav arrows for multi-image */}
          {detail.heroImages.length > 1 && (
            <>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {detail.heroImages.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${i === activeImg ? 'bg-white w-5' : 'bg-white/40 w-1.5 hover:bg-white/70'}`}
                  />
                ))}
              </div>
              {activeImg > 0 && (
                <button
                  onClick={() => setActiveImg(activeImg - 1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-all"
                >
                  <ChevronDown className="w-4 h-4 rotate-90" />
                </button>
              )}
              {activeImg < detail.heroImages.length - 1 && (
                <button
                  onClick={() => setActiveImg(activeImg + 1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-all"
                >
                  <ChevronDown className="w-4 h-4 -rotate-90" />
                </button>
              )}
            </>
          )}

          {/* Back & Close */}
          <button
            onClick={onClose}
            className="absolute top-3 left-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition-all active:scale-90"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition-all active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Title overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end gap-3">
            <div className={`w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-xl flex-shrink-0`}>
              <ServiceIcon className={`w-6 h-6 ${accent.text}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-white leading-tight drop-shadow">
                {detail.smartSortVariant ? 'Smart Sort' : service.name}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                {rating ? (
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span className="text-amber-300 text-sm font-semibold">{rating.avg}</span>
                    <span className="text-white/60 text-xs">({rating.count} review{rating.count !== 1 ? 's' : ''})</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span className="text-white/70 text-sm font-medium">New service</span>
                  </div>
                )}
                <span className="text-white/40 text-xs">·</span>
                <span className="text-white/70 text-xs font-medium">{detail.trusted}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 dark:border-slate-700 flex-shrink-0 bg-white dark:bg-slate-800 px-2">
          <button
            onClick={() => { setTab('overview'); scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className={`flex-1 py-3.5 text-sm font-medium transition-all relative ${tab === 'overview' ? 'text-slate-900 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
          >
            Overview
            {tab === 'overview' && (
              <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full ${accent.btn.split(' ')[0]}`} />
            )}
          </button>
          <button
            onClick={() => { setTab('details'); scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className={`flex-1 py-3.5 text-sm font-medium transition-all relative ${tab === 'details' ? 'text-slate-900 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
          >
            Details & FAQ
            {tab === 'details' && (
              <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full ${accent.btn.split(' ')[0]}`} />
            )}
          </button>
        </div>

        {/* Scrollable body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
          {tab === 'overview' ? (
            <div className="p-5 space-y-5">
              {/* Highlights */}
              <div className="grid grid-cols-3 gap-2.5">
                {detail.highlights.map(({ icon: Icon, label, value }) => (
                  <div key={label} className={`${accent.bg} rounded-xl p-3 text-center border border-transparent`}>
                    <Icon className={`w-5 h-5 ${accent.text} mx-auto mb-1.5`} />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium">{label}</p>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5 leading-tight">{value}</p>
                  </div>
                ))}
              </div>

              {/* Stat pills */}
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { icon: Wallet, label: 'PRICE', value: detail.price },
                  { icon: Clock, label: 'DURATION', value: detail.duration },
                  { icon: ShieldCheck, label: 'TRUSTED', value: detail.trusted },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
                    <Icon className="w-4 h-4 text-slate-400 dark:text-slate-500 mx-auto mb-1" />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-medium">{label}</p>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5 leading-tight">{value}</p>
                  </div>
                ))}
              </div>

              {/* Overview section */}
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100 mb-2">
                  <SparklesIcon className={`w-4 h-4 ${accent.text}`} />
                  Overview
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{detail.overview}</p>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-700" />

              {/* How it works */}
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">How it works</h3>
                <div className="space-y-3">
                  {detail.howItWorks.map((step, i) => (
                    <div key={i} className="flex gap-3 group">
                      <div className="flex flex-col items-center">
                        <div className={`w-7 h-7 rounded-full ${accent.btn} text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm`}>
                          {i + 1}
                        </div>
                        {i < detail.howItWorks.length - 1 && (
                          <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700 mt-1" />
                        )}
                      </div>
                      <div className="pb-1">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{step.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-5 space-y-5">
              {/* What's included */}
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">What's included</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {detail.whatsIncluded.map((item) => (
                    <div key={item} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <CheckCircle2 className={`w-4 h-4 ${accent.text} flex-shrink-0 mt-0.5`} />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-700" />

              {/* Optional add-ons */}
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">Optional add-ons</h3>
                <div className="flex flex-wrap gap-2">
                  {detail.addOns.map((addon) => (
                    <span key={addon} className={`px-3 py-1.5 border rounded-full text-xs font-medium transition-all hover:scale-105 ${accent.bg} ${accent.text} border-transparent`}>
                      {addon}
                    </span>
                  ))}
                </div>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-700" />

              {/* Service area */}
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100 mb-2">
                  <MapPin className={`w-4 h-4 ${accent.text}`} />
                  Service area
                </h3>
                <div className={`${accent.bg} rounded-xl p-3 border border-transparent`}>
                  <p className={`text-sm font-medium ${accent.text}`}>{detail.serviceArea}</p>
                </div>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-700" />

              {/* FAQ */}
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
                  <HelpCircle className={`w-4 h-4 ${accent.text}`} />
                  Frequently asked
                </h3>
                <div className="space-y-2">
                  {detail.faqs.map((faq) => (
                    <FAQ key={faq.q} q={faq.q} a={faq.a} />
                  ))}
                </div>
              </div>

              {/* Contact hint */}
              <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-100 dark:border-slate-700">
                <div className={`w-10 h-10 rounded-xl ${accent.btn} flex items-center justify-center flex-shrink-0`}>
                  <Phone className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Still have questions?</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Request a quote and our team will reach out to you.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sticky CTA bar */}
        <div className="flex-shrink-0 p-3 sm:p-4 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={() => (onRequestQuote ? onRequestQuote(service) : onHireNow(service))}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors active:scale-95"
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span className="truncate">Request Quote</span>
          </button>
          {detail.smartSortVariant ? (
            <div className="flex gap-2 sm:gap-3 sm:flex-1">
              <button
                onClick={() => onHireNow(service)}
                className="flex-1 min-w-0 flex items-center justify-center gap-2 py-3 px-2 sm:px-3 rounded-xl text-sm font-semibold bg-teal-500 hover:bg-teal-600 text-white transition-all active:scale-95 shadow-sm"
              >
                <Repeat2 className="w-4 h-4 shrink-0" />
                <span className="truncate">Subscribe</span>
              </button>
              <button
                onClick={() => onHireNow(service)}
                className="flex-1 min-w-0 flex items-center justify-center gap-2 py-3 px-2 sm:px-3 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-900 text-white transition-all active:scale-95 shadow-sm"
              >
                <PackageCheck className="w-4 h-4 shrink-0" />
                <span className="truncate">One-Off Pickup</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => onHireNow(service)}
              className={`flex-1 min-w-0 flex items-center justify-center gap-2 py-3 px-2 sm:px-3 rounded-xl text-sm font-semibold transition-all active:scale-95 shadow-sm ${accent.btn}`}
            >
              <CalendarPlus className="w-4 h-4 shrink-0" />
              <span className="truncate">Hire Now</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
