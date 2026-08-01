import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Briefcase, CalendarDays, Wallet, Heart, ChevronRight,
  CreditCard, MapPin, Bell, Shield, Headphones, Settings,
  LogOut, Camera, Star, ExternalLink, X, User, Phone, Mail,
  Save, CheckCircle2, Loader2, AlertTriangle, Trash2, ImagePlus,
  History, Smartphone,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { WalletPanel } from '../WalletPanel';
import { FavoritesPage } from '../../pages/FavoritesPage';
import { AppearancePanel } from '../AppearancePanel';
import { ReferralModal } from '../ReferralPanel';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { AddressPage } from '../AddressPage';
import { PremiumBenefitsPage } from '../../pages/PremiumBenefitsPage';
import { BottomSheet } from './BottomSheet';
import { MobilePaymentMethodModal } from './MobilePaymentMethodModal';
import { MobileServiceHistoryModal } from './MobileServiceHistoryModal';

type ModalType = null | 'wallet' | 'favorites' | 'appearance' | 'edit-profile' | 'address' | 'benefits' | 'payment' | 'history' | 'notifications' | 'help';

interface Props {
  onMobileNav: (page: 'home' | 'bookings' | 'wallet' | 'profile' | 'services') => void;
  onNavigate: (page: string) => void;
  onQuickBook: (serviceId: string, preset: any) => void;
  onRebook?: (booking: any) => void;
}

interface Stats {
  total: number;
  completed: number;
  memberYear: number;
  walletBalance: number;
  unreadCount: number;
}

export function MobileProfilePage({ onMobileNav, onNavigate, onQuickBook, onRebook }: Props) {
  const { profile, user, isAdmin, signOut } = useAuth();
  const { referral_enabled, wallet_enabled } = useFeatureFlags();
  const [stats, setStats] = useState<Stats>({
    total: 0, completed: 0,
    memberYear: new Date().getFullYear(),
    walletBalance: 0, unreadCount: 0,
  });
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [referralOpen, setReferralOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url || null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || 'U';

  const fetchStats = useCallback(async () => {
    if (!user) return;
    const [bookingsRes, walletRes, notifRes] = await Promise.all([
      supabase.from('bookings').select('status').eq('user_id', user.id),
      supabase.from('wallet_transactions').select('amount_sle, status').eq('user_id', user.id),
      supabase.from('notifications').select('id', { count: 'exact' }).eq('user_id', user.id).eq('read', false),
    ]);

    const bookings = bookingsRes.data || [];
    const txns = (walletRes.data || []) as any[];
    const balance = txns
      .filter((t) => t.status === 'completed')
      .reduce((sum, t) => sum + Number(t.amount_sle), 0);

    setStats({
      total: bookings.length,
      completed: bookings.filter((b: any) => b.status === 'completed').length,
      memberYear: user.created_at ? new Date(user.created_at).getFullYear() : new Date().getFullYear(),
      walletBalance: balance,
      unreadCount: notifRes.count || 0,
    });
  }, [user]);

  useEffect(() => {
    fetchStats();
    setAvatarUrl(profile?.avatar_url || null);
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, [fetchStats, profile?.avatar_url]);

  const refreshProfile = async () => {
    if (!user) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (data) {
      setAvatarUrl((data as any).avatar_url || null);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError('');
    if (deleteConfirm !== 'DELETE') {
      setDeleteError('Please type DELETE in capitals to confirm.');
      return;
    }
    setDeleting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) {
        setDeleteError('Session expired. Please sign in again.');
        setDeleting(false);
        return;
      }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDeleteError(body.error || `Request failed (${res.status})`);
        setDeleting(false);
        return;
      }
      await supabase.auth.signOut();
      setShowDeleteModal(false);
      setDeleting(false);
      window.location.href = '/';
    } catch (err: any) {
      setDeleteError(err.message || 'Something went wrong.');
      setDeleting(false);
    }
  };

  const fmtBalance = (n: number) => {
    const sign = n < 0 ? '-' : '';
    return `${sign}SLE ${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className={`pb-8 transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      {/* ── Hero Card ── */}
      <div className="relative overflow-hidden bg-blue-700 mx-4 mt-4 rounded-3xl shadow-xl shadow-blue-900/20">
        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-[0.07] pointer-events-none select-none">
          <img src="/alphateknexus_logo_transparent.webp" alt="" className="w-32 opacity-80" />
        </div>
        <div className="relative px-5 pt-6 pb-0">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => setActiveModal('edit-profile')}
              className="relative flex-shrink-0 active:scale-95 transition-transform"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-white/40 shadow" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-white font-extrabold text-2xl shadow-inner">
                  {initials}
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow">
                <Camera className="w-3 h-3 text-blue-700" />
              </div>
            </button>
            <div className="min-w-0">
              <h2 className="text-white font-extrabold text-lg leading-tight truncate">
                {profile?.full_name || 'User'}
              </h2>
              <p className="text-blue-200 text-xs truncate mt-0.5">{profile?.email}</p>
              <span className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 bg-emerald-500 text-white text-[11px] font-bold rounded-full">
                <Star className="w-3 h-3 fill-white" />
                Premium Client
              </span>
            </div>
          </div>
          <div className="flex items-center bg-blue-600/60 backdrop-blur-sm rounded-2xl divide-x divide-blue-500/50">
            <StatCell icon={<CalendarDays className="w-4 h-4 text-blue-200" />} label="Total Bookings" value={String(stats.total)} />
            <StatCell icon={<CalendarDays className="w-4 h-4 text-blue-200" />} label="Completed" value={String(stats.completed)} />
            <StatCell icon={<CalendarDays className="w-4 h-4 text-blue-200" />} label="Member Since" value={String(stats.memberYear)} />
          </div>
        </div>
        <div className="h-4" />
      </div>

      {/* ── Quick Access ── */}
      <div className="mx-4 mt-4 bg-white rounded-3xl shadow-sm border border-slate-100 p-5">
        <p className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-4">Quick Access</p>
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: Briefcase, label: 'All Services', color: 'text-blue-600', bg: 'bg-blue-50', action: () => onMobileNav('services') },
            { icon: CalendarDays, label: 'Bookings', color: 'text-green-600', bg: 'bg-green-50', action: () => onMobileNav('bookings') },
            ...(wallet_enabled ? [{ icon: Wallet, label: 'Wallet', color: 'text-violet-600', bg: 'bg-violet-50', action: () => setActiveModal('wallet') as any }] : []),
            { icon: Heart, label: 'Favorites', color: 'text-rose-500', bg: 'bg-rose-50', action: () => setActiveModal('favorites') },
          ].map(({ icon: Icon, label, color, bg, action }) => (
            <button key={label} onClick={action} className="flex flex-col items-center gap-2 active:scale-90 transition-transform">
              <div className={`w-14 h-14 ${bg} rounded-2xl flex items-center justify-center shadow-sm`}>
                <Icon className={`w-6 h-6 ${color}`} strokeWidth={1.75} />
              </div>
              <span className="text-[11px] font-medium text-slate-600 text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Premium Banner ── */}
      <div className="mx-4 mt-4 bg-gradient-to-r from-blue-600 to-blue-500 rounded-3xl p-4 flex items-center gap-3 shadow-lg shadow-blue-600/20">
        <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center flex-shrink-0">
          <Star className="w-6 h-6 text-white fill-white/80" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-extrabold text-sm">You're a Premium Client!</p>
          <p className="text-blue-100 text-xs mt-0.5 leading-snug">Enjoy priority support, exclusive offers and faster service.</p>
        </div>
        <button onClick={() => setActiveModal('benefits')} className="flex-shrink-0 px-3 py-2 bg-white text-blue-700 font-bold text-xs rounded-xl shadow-sm active:scale-95 transition-transform whitespace-nowrap">
          View Benefits
        </button>
      </div>

      {/* ── Menu List ── */}
      <div className="mx-4 mt-4 bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden divide-y divide-slate-50">
        <MenuItem icon={User} iconBg="bg-blue-50" iconColor="text-blue-600"
          label="Edit Profile" sub="Update photo, name, phone & address"
          onClick={() => setActiveModal('edit-profile')} />
        {wallet_enabled && (
        <MenuItem icon={Wallet} iconBg="bg-violet-50" iconColor="text-violet-600"
          label="Wallet" sub="Credits balance & transaction history"
          right={<span className={`font-bold text-sm ${stats.walletBalance < 0 ? 'text-red-600' : 'text-blue-600'}`}>{fmtBalance(stats.walletBalance)}</span>}
          onClick={() => setActiveModal('wallet')} />
        )}
        <MenuItem icon={CreditCard} iconBg="bg-purple-50" iconColor="text-purple-600"
          label="Payment Methods" sub="Saved cards & mobile money"
          onClick={() => setActiveModal('payment')} />
        <MenuItem icon={History} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          label="Service History" sub="View past bookings & receipts"
          onClick={() => setActiveModal('history')} />
        <MenuItem icon={MapPin} iconBg="bg-green-50" iconColor="text-green-600"
          label="Addresses" sub="Manage your service addresses"
          onClick={() => setActiveModal('address')} />
        <MenuItem icon={Bell} iconBg="bg-amber-50" iconColor="text-amber-500"
          label="Notifications" sub="Manage alerts & preferences"
          badge={stats.unreadCount > 0 ? stats.unreadCount : undefined}
          onClick={() => setActiveModal('notifications')} />
      </div>

      {/* ── Admin / Support / Settings ── */}
      <div className="mx-4 mt-3 bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden divide-y divide-slate-50">
        {isAdmin && (
          <a href="/admin.html" target="_blank" rel="noopener noreferrer" className="block">
            <MenuItem icon={Shield} iconBg="bg-slate-100" iconColor="text-slate-600"
              label="Admin Dashboard" sub="Access admin tools & analytics"
              rightIcon={<ExternalLink className="w-3.5 h-3.5 text-slate-300" />} />
          </a>
        )}
        <MenuItem icon={Headphones} iconBg="bg-teal-50" iconColor="text-teal-600"
          label="Help & Support" sub="Get help or contact support"
          onClick={() => setActiveModal('help')} />
        <MenuItem icon={Settings} iconBg="bg-slate-100" iconColor="text-slate-500"
          label="Settings" sub="App settings & preferences"
          onClick={() => setActiveModal('appearance')} />
        <MenuItem icon={LogOut} iconBg="bg-slate-100" iconColor="text-slate-500"
          label="Sign Out" sub="Log out from your account"
          labelColor="text-slate-700" onClick={signOut} />
      </div>

      {/* ── Danger Zone ── */}
      <div className="mx-4 mt-3 mb-2">
        <button
          onClick={() => setShowDeleteModal(true)}
          className="w-full flex items-center justify-center gap-2 py-3.5 text-red-500 font-semibold text-sm bg-red-50 rounded-2xl active:scale-[0.98] transition-transform border border-red-100"
        >
          <Trash2 className="w-4 h-4" />
          Delete Account
        </button>
        <p className="text-center text-[11px] text-slate-400 mt-2 px-4">
          This permanently removes your account, bookings, and wallet history.
        </p>
      </div>

      {/* ── Bottom-Sheet Modals ── */}
      {wallet_enabled && (
      <BottomSheet open={activeModal === 'wallet'} onClose={() => { setActiveModal(null); fetchStats(); }} title="Wallet" showHandle>
        <div className="p-4">
          <WalletPanel onChooseService={() => { setActiveModal(null); onMobileNav('services'); }} />
        </div>
      </BottomSheet>
      )}

      <BottomSheet open={activeModal === 'favorites'} onClose={() => setActiveModal(null)} title="Favorites" showHandle>
        <div className="p-4">
          <FavoritesPage onNavigate={onNavigate} onQuickBook={onQuickBook} />
        </div>
      </BottomSheet>

      <BottomSheet open={activeModal === 'appearance'} onClose={() => setActiveModal(null)} title="Settings" showHandle>
        <div className="p-4">
          <AppearancePanel />
        </div>
      </BottomSheet>

      <BottomSheet open={activeModal === 'edit-profile'} onClose={() => { setActiveModal(null); refreshProfile(); }} title="Edit Profile" showHandle>
        <EditProfileForm
          onDone={() => { setActiveModal(null); refreshProfile(); fetchStats(); }}
        />
      </BottomSheet>

      <BottomSheet open={activeModal === 'address'} onClose={() => setActiveModal(null)} title="Saved Addresses" showHandle>
        <div className="p-4">
          <AddressPage />
        </div>
      </BottomSheet>

      <BottomSheet open={activeModal === 'benefits'} onClose={() => setActiveModal(null)} showHandle>
        <PremiumBenefitsPage onBack={() => setActiveModal(null)} />
      </BottomSheet>

      <BottomSheet open={activeModal === 'notifications'} onClose={() => setActiveModal(null)} title="Notifications" showHandle>
        <div className="p-4">
          <NotificationsInfo unreadCount={stats.unreadCount} onOpenPanel={() => setActiveModal(null)} />
        </div>
      </BottomSheet>

      <BottomSheet open={activeModal === 'help'} onClose={() => setActiveModal(null)} title="Help & Support" showHandle>
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 rounded-2xl p-4">
            <p className="text-sm font-bold text-slate-800 mb-1">Need a hand?</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Our support team is available to help with any questions about your bookings, payments, or account.
            </p>
          </div>
          <a href="mailto:support@alphateknexus.com"
            className="flex items-center gap-3 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm active:scale-[0.98] transition-transform">
            <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center">
              <Mail className="w-5 h-5 text-teal-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">Email Support</p>
              <p className="text-xs text-slate-400">support@alphateknexus.com</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </a>
          <a href="tel:+23276000000"
            className="flex items-center gap-3 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm active:scale-[0.98] transition-transform">
            <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center">
              <Phone className="w-5 h-5 text-teal-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">Call Support</p>
              <p className="text-xs text-slate-400">+232 76 000 000</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </a>
        </div>
      </BottomSheet>

      {/* Payment Method Modal */}
      <MobilePaymentMethodModal
        open={activeModal === 'payment'}
        onClose={() => setActiveModal(null)}
        mode="manage"
      />

      {/* Service History Modal */}
      <MobileServiceHistoryModal
        open={activeModal === 'history'}
        onClose={() => setActiveModal(null)}
        onRebook={(booking) => {
          setActiveModal(null);
          onRebook?.(booking);
        }}
      />

      {referral_enabled && <ReferralModal open={referralOpen} onClose={() => setReferralOpen(false)} />}

      {/* ── Delete Account Modal ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm animate-scaleIn overflow-hidden">
            <div className="px-6 pt-6 pb-2 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Delete Account</h3>
              <button onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); setDeleteError(''); }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 pb-6">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-7 h-7 text-red-500" />
              </div>
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4 mb-4">
                <p className="text-sm text-red-700 font-semibold mb-2">Warning: This action cannot be undone.</p>
                <ul className="text-xs text-red-600/90 space-y-1 list-disc list-inside leading-relaxed">
                  <li>All your bookings and service history will be erased.</li>
                  <li>Your wallet balance and transaction records will be lost.</li>
                  <li>Saved favorites, addresses, and documents will be removed.</li>
                  <li>You will be signed out immediately and cannot recover this account.</li>
                </ul>
              </div>
              <p className="text-sm text-slate-600 mb-2">
                To confirm, type <span className="font-bold text-red-600">DELETE</span> below:
              </p>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="Type DELETE"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
              />
              {deleteError && (
                <p className="text-xs text-red-600 mt-2">{deleteError}</p>
              )}
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); setDeleteError(''); }}
                  disabled={deleting}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting || deleteConfirm !== 'DELETE'}
                  className="flex-1 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deleting ? 'Deleting…' : 'Delete Forever'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Notifications Info ── */

function NotificationsInfo({ unreadCount, onOpenPanel }: { unreadCount: number; onOpenPanel: () => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Bell className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-amber-700">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}
          </p>
          <p className="text-xs text-amber-600/80 mt-0.5">
            {unreadCount > 0 ? 'Tap the bell icon at the top to view them.' : 'You have no unread notifications.'}
          </p>
        </div>
      </div>
      <button
        onClick={onOpenPanel}
        className="w-full py-3 bg-slate-900 text-white font-semibold text-sm rounded-2xl active:scale-[0.98] transition-transform"
      >
        Open Notification Center
      </button>
    </div>
  );
}

/* ── Edit Profile Form ── */

function EditProfileForm({ onDone }: { onDone: () => void }) {
  const { profile, user } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [address, setAddress] = useState(profile?.address || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url || null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const initials = fullName
    ? fullName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || 'U';

  const handleAvatarUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    setError('');
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;

      if (avatarUrl) {
        const oldPath = avatarUrl.split('/avatars/')[1];
        if (oldPath) await supabase.storage.from('avatars').remove([oldPath]).then();
      }

      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { cacheControl: '3600', upsert: true });
      if (upErr) throw new Error(upErr.message);

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id);
      if (dbErr) throw new Error(dbErr.message);

      setAvatarUrl(url);
    } catch (err: any) {
      setError(err.message || 'Failed to upload image.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() || null, phone: phone.trim() || null, address: address.trim() || null })
      .eq('id', user!.id);
    if (error) setError(error.message);
    else { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    setSaving(false);
  };

  return (
    <div className="p-4">
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
        {/* Avatar uploader */}
        <div className="flex flex-col items-center mb-6">
          <div className="relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-24 h-24 rounded-full object-cover border-4 border-slate-100 shadow" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-blue-100 border-4 border-slate-100 flex items-center justify-center text-blue-700 font-extrabold text-3xl">
                {initials}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-9 h-9 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-3 flex items-center gap-1">
            <ImagePlus className="w-3 h-3" /> Tap the camera to upload a photo
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
          {saved && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Profile updated successfully
            </div>
          )}
          <Field label="Full Name" icon={User}>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
              className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white outline-none transition-all" />
          </Field>
          <Field label="Phone" icon={Phone}>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white outline-none transition-all" />
          </Field>
          <Field label="Address" icon={MapPin}>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, area"
              className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white outline-none transition-all" />
          </Field>
          <Field label="Email" icon={Mail}>
            <input type="email" disabled value={profile?.email || ''}
              className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-400 cursor-not-allowed" />
          </Field>
          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm">
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={onDone}
              className="px-5 py-3 text-sm text-slate-500 font-medium hover:text-slate-700 transition-colors">
              Done
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon: any; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        {children}
      </div>
    </div>
  );
}

/* ── Helpers ── */

function StatCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex-1 flex flex-col items-center py-3 gap-0.5">
      {icon}
      <span className="text-white font-extrabold text-base leading-tight">{value}</span>
      <span className="text-blue-300 text-[10px] font-medium text-center leading-tight">{label}</span>
    </div>
  );
}

function MenuItem({
  icon: Icon, iconBg, iconColor, label, sub,
  right, rightIcon, badge, onClick, labelColor,
}: {
  icon: React.ComponentType<any>;
  iconBg: string; iconColor: string;
  label: string; sub: string;
  right?: React.ReactNode;
  rightIcon?: React.ReactNode;
  badge?: number;
  onClick?: () => void;
  labelColor?: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50/80 active:bg-slate-100 transition-colors text-left">
      <div className={`w-10 h-10 ${iconBg} rounded-2xl flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${iconColor}`} strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${labelColor || 'text-slate-800'}`}>{label}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{sub}</p>
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
      {badge !== undefined ? (
        <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white text-[11px] font-bold rounded-full flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      ) : (
        <div className="flex-shrink-0">{rightIcon || <ChevronRight className="w-4 h-4 text-slate-300" />}</div>
      )}
    </button>
  );
}
