import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image as ImageIcon, Video, FileText, Trash2, Upload, Search, X,
  Plus, Pencil, RefreshCw, Eye, EyeOff, Loader2, FolderOpen, LayoutGrid,
  List, Copy, Check, HardDrive, CheckCircle2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, EmptyState, Spinner, ErrorBanner, StatCard, TableShell } from '../components/ui';
import { MediaPicker } from '../components/MediaPicker';
import {
  saveMediaAsset, replaceMediaAsset, deleteMediaFile, assignMediaAssetSlot,
  formatFileSize, isImageFile, isVideoFile, keysForCategory, defaultKeyForCategory,
  canonicalizeMediaKey, MEDIA_ACCEPT,
} from '../../lib/media';
import { getMediaUsageLabels, fetchCampaignTitlesByAsset } from '../../lib/mediaUsage';
import type { MediaAsset, MediaCategory } from '../../types';

const CATEGORIES: { value: MediaCategory; label: string; icon: typeof ImageIcon; color: string; bg: string }[] = [
  { value: 'app_logo', label: 'App Logo', icon: LayoutGrid, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { value: 'service_branding', label: 'Service Branding', icon: ImageIcon, color: 'text-blue-600', bg: 'bg-blue-50' },
  { value: 'login_carousel', label: 'Login Carousel', icon: ImageIcon, color: 'text-purple-600', bg: 'bg-purple-50' },
  { value: 'splash', label: 'Splash Screen', icon: ImageIcon, color: 'text-amber-600', bg: 'bg-amber-50' },
  { value: 'general', label: 'General Content', icon: FolderOpen, color: 'text-slate-600', bg: 'bg-slate-100' },
  { value: 'campaign', label: 'Campaigns', icon: ImageIcon, color: 'text-rose-600', bg: 'bg-rose-50' },
];

const ASSIGNMENT_CATEGORIES: MediaCategory[] = ['app_logo', 'service_branding', 'login_carousel', 'splash'];

function getFileIcon(fileType: string | null, fileName: string) {
  if (isImageFile(fileType, fileName)) return <ImageIcon className="w-5 h-5 text-blue-500" />;
  if (isVideoFile(fileType, fileName)) return <Video className="w-5 h-5 text-purple-500" />;
  return <FileText className="w-5 h-5 text-slate-400" />;
}

function UsageChips({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {labels.slice(0, 3).map((label) => (
        <span key={label} className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-500 truncate max-w-full">
          {label}
        </span>
      ))}
      {labels.length > 3 && (
        <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-400">
          +{labels.length - 3}
        </span>
      )}
    </div>
  );
}

function PreviewThumb({ asset, className = 'h-40' }: { asset: MediaAsset; className?: string }) {
  const showImage = isImageFile(asset.file_type, asset.file_name || '');
  const showVideo = isVideoFile(asset.file_type, asset.file_name || '');
  return (
    <div className={`relative bg-slate-100 flex items-center justify-center overflow-hidden ${className}`}>
      {showImage ? (
        <img src={asset.file_url} alt={asset.alt_text || asset.title || ''} className="w-full h-full object-cover" />
      ) : showVideo ? (
        <video src={asset.file_url} className="w-full h-full object-cover" muted />
      ) : (
        <div className="flex flex-col items-center gap-2 text-slate-400">
          {getFileIcon(asset.file_type, asset.file_name || '')}
          <span className="text-xs">{asset.file_type || 'File'}</span>
        </div>
      )}
    </div>
  );
}

export function MediaLibraryPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [campaignUsage, setCampaignUsage] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<MediaCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video' | 'document'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'hidden'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<MediaAsset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [assignSlot, setAssignSlot] = useState<{ category: MediaCategory; key: string } | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<MediaCategory>('general');
  const [uploadKey, setUploadKey] = useState('general');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadAlt, setUploadAlt] = useState('');
  const [uploadOrder, setUploadOrder] = useState(0);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editModal, setEditModal] = useState<{
    open: boolean;
    asset: MediaAsset | null;
    title: string;
    altText: string;
    key: string;
    displayOrder: number;
    category: MediaCategory;
  }>({ open: false, asset: null, title: '', altText: '', key: '', displayOrder: 0, category: 'general' });
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchAssets = async () => {
    setLoading(true);
    const { data, error: qErr } = await supabase
      .from('media_assets')
      .select('*')
      .order('category', { ascending: true })
      .order('key', { ascending: true })
      .order('display_order', { ascending: true });

    if (qErr) {
      setError(qErr.message);
      setAssets([]);
    } else {
      const rows = (data as MediaAsset[]) || [];
      setAssets(rows);
      setCampaignUsage(await fetchCampaignTitlesByAsset(rows));
    }
    setLoading(false);
  };

  useEffect(() => { void fetchAssets(); }, []);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: assets.length };
    for (const cat of CATEGORIES) {
      map[cat.value] = assets.filter((a) => a.category === cat.value).length;
    }
    return map;
  }, [assets]);

  const stats = useMemo(() => ({
    total: assets.length,
    active: assets.filter((a) => a.is_active).length,
    hidden: assets.filter((a) => !a.is_active).length,
    storage: formatFileSize(assets.reduce((sum, a) => sum + (a.file_size || 0), 0)),
  }), [assets]);

  const filtered = useMemo(() => {
    let rows = assets;
    if (activeCategory !== 'all') rows = rows.filter((a) => a.category === activeCategory);
    if (statusFilter === 'active') rows = rows.filter((a) => a.is_active);
    if (statusFilter === 'hidden') rows = rows.filter((a) => !a.is_active);
    if (typeFilter === 'image') rows = rows.filter((a) => isImageFile(a.file_type, a.file_name || ''));
    if (typeFilter === 'video') rows = rows.filter((a) => isVideoFile(a.file_type, a.file_name || ''));
    if (typeFilter === 'document') {
      rows = rows.filter((a) => !isImageFile(a.file_type, a.file_name || '') && !isVideoFile(a.file_type, a.file_name || ''));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (a) =>
          (a.title || '').toLowerCase().includes(q) ||
          (a.alt_text || '').toLowerCase().includes(q) ||
          (a.file_name || '').toLowerCase().includes(q) ||
          a.key.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [assets, activeCategory, search, typeFilter, statusFilter]);

  const usageFor = (asset: MediaAsset) => getMediaUsageLabels(asset, campaignUsage[asset.id] || []);

  const openUpload = (category: MediaCategory = activeCategory === 'all' ? 'general' : activeCategory) => {
    setUploadCategory(category);
    setUploadKey(defaultKeyForCategory(category));
    setUploadTitle('');
    setUploadAlt('');
    setUploadOrder(0);
    setUploadFiles([]);
    setUploadOpen(true);
    setError(null);
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) { setError('Please select a file to upload'); return; }
    setError(null);
    setUploading(true);
    const key = uploadKey.trim() || defaultKeyForCategory(uploadCategory);
    for (const file of uploadFiles) {
      const result = await saveMediaAsset(file, {
        category: uploadCategory,
        key,
        title: uploadTitle || file.name,
        altText: uploadAlt,
        displayOrder: uploadFiles.length === 1 && uploadOrder > 0 ? uploadOrder : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        setUploading(false);
        return;
      }
    }
    setUploadOpen(false);
    setUploading(false);
    await fetchAssets();
  };

  const handleEdit = async () => {
    if (!editModal.asset) return;
    setError(null);
    setSaving(true);
    const { error: updErr } = await supabase
      .from('media_assets')
      .update({
        title: editModal.title,
        alt_text: editModal.altText,
        key: canonicalizeMediaKey(editModal.key),
        display_order: editModal.displayOrder,
        category: editModal.category,
      })
      .eq('id', editModal.asset.id);
    if (updErr) { setError(updErr.message); setSaving(false); return; }

    if (replaceFile) {
      const current = { ...editModal.asset, category: editModal.category };
      const result = await replaceMediaAsset(current, replaceFile);
      if (!result.ok) { setError(result.error); setSaving(false); return; }
      setReplaceFile(null);
    }

    setEditModal({ open: false, asset: null, title: '', altText: '', key: '', displayOrder: 0, category: 'general' });
    setSaving(false);
    await fetchAssets();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const removed = await deleteMediaFile(deleteTarget.file_path);
    if (!removed) setError('Storage delete failed; removing the library record anyway.');
    const { error: delErr } = await supabase.from('media_assets').delete().eq('id', deleteTarget.id);
    if (delErr) setError(delErr.message);
    else setAssets((prev) => prev.filter((a) => a.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleting(false);
  };

  const handleToggle = async (asset: MediaAsset) => {
    setTogglingId(asset.id);
    const newVal = !asset.is_active;
    const { error: togErr } = await supabase.from('media_assets').update({ is_active: newVal }).eq('id', asset.id);
    if (togErr) setError(togErr.message);
    else setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, is_active: newVal } : a)));
    setTogglingId(null);
  };

  const copyUrl = async (asset: MediaAsset) => {
    try {
      await navigator.clipboard.writeText(asset.file_url);
      setCopiedId(asset.id);
      window.setTimeout(() => setCopiedId((id) => (id === asset.id ? null : id)), 1500);
    } catch {
      setError('Could not copy URL');
    }
  };

  const openEdit = (asset: MediaAsset) => {
    setEditModal({
      open: true,
      asset,
      title: asset.title || '',
      altText: asset.alt_text || '',
      key: canonicalizeMediaKey(asset.key),
      displayOrder: asset.display_order,
      category: asset.category,
    });
    setReplaceFile(null);
  };

  const handleAssign = async (asset: MediaAsset) => {
    if (!assignSlot) return;
    const result = await assignMediaAssetSlot(asset.id, assignSlot.category, assignSlot.key);
    if (result.error) setError(result.error);
    else await fetchAssets();
    setAssignSlot(null);
  };

  const slotOccupant = (category: MediaCategory, key: string) =>
    assets
      .filter((a) => a.category === category && canonicalizeMediaKey(a.key) === canonicalizeMediaKey(key) && a.is_active)
      .sort((a, b) => a.display_order - b.display_order)[0];

  const keyOptions = keysForCategory(uploadOpen ? uploadCategory : editModal.category);
  const showAssignments = ASSIGNMENT_CATEGORIES.includes(activeCategory as MediaCategory);

  const actionButtons = (asset: MediaAsset) => (
    <div className="flex items-center gap-1">
      <button onClick={() => openEdit(asset)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title="Edit">
        <Pencil className="w-4 h-4" />
      </button>
      <button
        onClick={() => void handleToggle(asset)}
        disabled={togglingId === asset.id}
        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        title={asset.is_active ? 'Hide' : 'Show'}
      >
        {togglingId === asset.id ? <Loader2 className="w-4 h-4 animate-spin" /> : asset.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
      <button onClick={() => void copyUrl(asset)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title="Copy URL">
        {copiedId === asset.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
      </button>
      <a href={asset.file_url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title="Open file">
        <FileText className="w-4 h-4" />
      </a>
      <button onClick={() => setDeleteTarget(asset)} className="p-2 rounded-lg text-red-500 hover:bg-red-50 ml-auto" title="Delete">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Media Library"
        description="Manage app logo, service branding, login carousel, splash, and campaign media"
        icon={ImageIcon}
        actions={
          <>
            <button
              onClick={() => void fetchAssets()}
              className="inline-flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button
              onClick={() => openUpload()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Upload Media
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total assets" value={stats.total} icon={FolderOpen} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Active" value={stats.active} icon={Eye} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Hidden" value={stats.hidden} icon={EyeOff} color="text-slate-500" accent="bg-slate-50" />
        <StatCard label="Storage used" value={stats.storage} icon={HardDrive} color="text-blue-600" accent="bg-blue-50" />
      </div>

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        <button
          onClick={() => setActiveCategory('all')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all border ${
            activeCategory === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          }`}
        >
          <FolderOpen className="w-4 h-4" /> All Media
          <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${activeCategory === 'all' ? 'bg-white/20' : 'bg-slate-100'}`}>
            {counts.all || 0}
          </span>
        </button>
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const active = activeCategory === cat.value;
          return (
            <button
              key={cat.value}
              onClick={() => setActiveCategory(cat.value)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all border ${
                active ? `${cat.bg} ${cat.color} border-transparent` : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" /> {cat.label}
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${active ? 'bg-white/70' : 'bg-slate-100'}`}>
                {counts[cat.value] || 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, file name, key..."
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white"
          >
            <option value="all">All types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="document">Documents</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="hidden">Hidden</option>
          </select>
          <div className="flex rounded-xl border border-slate-200 overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 ${viewMode === 'grid' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500'}`}
              title="Grid"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 ${viewMode === 'list' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500'}`}
              title="List"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {showAssignments && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Live assignments</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {keysForCategory(activeCategory as MediaCategory).map((slot) => {
              const occupant = slotOccupant(activeCategory as MediaCategory, slot.value);
              return (
                <div key={slot.value} className="rounded-xl border border-slate-200 overflow-hidden">
                  {occupant ? (
                    <button type="button" className="w-full" onClick={() => setLightbox(occupant)}>
                      <PreviewThumb asset={occupant} className="h-20" />
                    </button>
                  ) : (
                    <div className="h-20 bg-slate-50 flex items-center justify-center text-slate-300">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-[11px] font-semibold text-slate-700 truncate">{slot.label}</p>
                    <button
                      type="button"
                      onClick={() => setAssignSlot({ category: activeCategory as MediaCategory, key: slot.value })}
                      className="mt-1 text-[11px] font-semibold text-emerald-600"
                    >
                      {occupant ? 'Change' : 'Assign'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No media assets found"
          description={search || activeCategory !== 'all' || typeFilter !== 'all' || statusFilter !== 'all' ? 'Try adjusting filters.' : 'Upload your first media asset to get started.'}
          action={
            <button
              onClick={() => openUpload()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4" /> Upload Media
            </button>
          }
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((asset) => {
            const cat = CATEGORIES.find((c) => c.value === asset.category);
            const previewable = isImageFile(asset.file_type, asset.file_name || '') || isVideoFile(asset.file_type, asset.file_name || '');
            return (
              <div
                key={asset.id}
                className={`bg-white rounded-2xl border overflow-hidden shadow-sm transition-all hover:shadow-md ${
                  asset.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'
                }`}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => previewable && setLightbox(asset)}
                >
                  <div className="relative">
                    <PreviewThumb asset={asset} />
                    {cat && (
                      <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold ${cat.bg} ${cat.color}`}>
                        <cat.icon className="w-2.5 h-2.5" /> {cat.label}
                      </span>
                    )}
                    <span className={`absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold ${
                      asset.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {asset.is_active ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                      {asset.is_active ? 'Active' : 'Hidden'}
                    </span>
                  </div>
                </button>
                <div className="p-3">
                  <p className="text-sm font-semibold text-slate-800 truncate" title={asset.title || ''}>
                    {asset.title || asset.file_name}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    Key: {asset.key} · Order: {asset.display_order}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{formatFileSize(asset.file_size)}</p>
                  <UsageChips labels={usageFor(asset)} />
                  <div className="mt-2">{actionButtons(asset)}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <TableShell
          headers={
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Used in</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
          }
        >
          <tbody>
            {filtered.map((asset) => {
              const cat = CATEGORIES.find((c) => c.value === asset.category);
              return (
                <tr key={asset.id} className={`border-t border-slate-100 ${asset.is_active ? '' : 'opacity-60'}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setLightbox(asset)} className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                        <PreviewThumb asset={asset} className="h-12 w-12" />
                      </button>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{asset.title || asset.file_name}</p>
                        <p className="text-xs text-slate-400 truncate">{asset.file_name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{cat?.label || asset.category}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{asset.key}</td>
                  <td className="px-4 py-3"><UsageChips labels={usageFor(asset)} /></td>
                  <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{formatFileSize(asset.file_size)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${asset.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {asset.is_active ? 'Active' : 'Hidden'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{actionButtons(asset)}</td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}

      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">Upload Media Asset</h2>
              </div>
              <button onClick={() => setUploadOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const files = Array.from(e.dataTransfer.files);
                  if (files.length) {
                    setUploadFiles(files);
                    if (!uploadTitle) setUploadTitle(files[0].name);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  dragActive ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={MEDIA_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length) {
                      setUploadFiles(files);
                      if (!uploadTitle) setUploadTitle(files[0].name);
                    }
                  }}
                />
                {uploadFiles.length > 0 ? (
                  <div className="space-y-1">
                    {uploadFiles.map((f) => (
                      <p key={f.name + f.size} className="text-sm font-medium text-slate-800">
                        {f.name} <span className="text-xs text-slate-400">({formatFileSize(f.size)})</span>
                      </p>
                    ))}
                    <p className="text-xs text-slate-400">Click to choose different files</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <Upload className="w-8 h-8" />
                    <p className="text-sm font-medium">Click or drag files here</p>
                    <p className="text-xs">Images, videos, and documents — max 50MB each</p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Category</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => {
                    const cat = e.target.value as MediaCategory;
                    setUploadCategory(cat);
                    setUploadKey(defaultKeyForCategory(cat));
                  }}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Key (what this asset represents)</label>
                <select
                  value={keyOptions.some((k) => k.value === uploadKey) ? uploadKey : ''}
                  onChange={(e) => setUploadKey(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {keyOptions.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
                {uploadCategory === 'general' && (
                  <input
                    type="text"
                    value={uploadKey}
                    onChange={(e) => setUploadKey(e.target.value)}
                    placeholder="Custom key (optional)"
                    className="mt-2 w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Title</label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Display name for this asset"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Alt Text (accessibility)</label>
                <input
                  type="text"
                  value={uploadAlt}
                  onChange={(e) => setUploadAlt(e.target.value)}
                  placeholder="Description for screen readers"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {uploadFiles.length <= 1 && (
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Display Order</label>
                  <input
                    type="number"
                    value={uploadOrder}
                    onChange={(e) => setUploadOrder(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">Leave 0 to auto-assign. Lower numbers appear first.</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setUploadOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 text-sm">
                  Cancel
                </button>
                <button
                  onClick={() => void handleUpload()}
                  disabled={uploading || uploadFiles.length === 0}
                  className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Upload{uploadFiles.length > 1 ? ` ${uploadFiles.length}` : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editModal.open && editModal.asset && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">Edit Media Asset</h2>
              </div>
              <button onClick={() => setEditModal({ ...editModal, open: false })} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <PreviewThumb asset={editModal.asset} className="h-32 rounded-xl" />
              <UsageChips labels={usageFor(editModal.asset)} />

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Replace File (optional)</label>
                <button
                  type="button"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = MEDIA_ACCEPT;
                    input.onchange = () => {
                      if (input.files?.[0]) setReplaceFile(input.files[0]);
                    };
                    input.click();
                  }}
                  className="w-full border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-emerald-400 hover:bg-emerald-50/50"
                >
                  {replaceFile ? (
                    <span className="text-sm font-medium text-slate-800">{replaceFile.name} ({formatFileSize(replaceFile.size)})</span>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-slate-400 text-sm"><RefreshCw className="w-4 h-4" /> Click to replace the file</span>
                  )}
                </button>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Category</label>
                <select
                  value={editModal.category}
                  onChange={(e) => {
                    const cat = e.target.value as MediaCategory;
                    setEditModal({ ...editModal, category: cat, key: defaultKeyForCategory(cat) });
                  }}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Key</label>
                <select
                  value={keysForCategory(editModal.category).some((k) => k.value === editModal.key) ? editModal.key : keysForCategory(editModal.category)[0]?.value}
                  onChange={(e) => setEditModal({ ...editModal, key: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {keysForCategory(editModal.category).map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
                {editModal.category === 'general' && (
                  <input
                    type="text"
                    value={editModal.key}
                    onChange={(e) => setEditModal({ ...editModal, key: e.target.value })}
                    className="mt-2 w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Title</label>
                <input
                  type="text"
                  value={editModal.title}
                  onChange={(e) => setEditModal({ ...editModal, title: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Alt Text</label>
                <input
                  type="text"
                  value={editModal.altText}
                  onChange={(e) => setEditModal({ ...editModal, altText: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Display Order</label>
                <input
                  type="number"
                  value={editModal.displayOrder}
                  onChange={(e) => setEditModal({ ...editModal, displayOrder: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditModal({ ...editModal, open: false })} className="flex-1 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 text-sm">
                  Cancel
                </button>
                <button
                  onClick={() => void handleEdit()}
                  disabled={saving}
                  className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Delete media</h2>
                <p className="text-sm text-slate-500">This removes the file and record permanently.</p>
              </div>
            </div>
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
              <p className="text-sm text-red-700">
                Delete <strong>{deleteTarget.title || deleteTarget.file_name}</strong>?
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button>
              <button
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button type="button" className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 text-white" onClick={() => setLightbox(null)}>
            <X className="w-5 h-5" />
          </button>
          {isVideoFile(lightbox.file_type, lightbox.file_name || '') ? (
            <video src={lightbox.file_url} className="max-w-full max-h-[85vh] rounded-xl" controls autoPlay onClick={(e) => e.stopPropagation()} />
          ) : isImageFile(lightbox.file_type, lightbox.file_name || '') ? (
            <img src={lightbox.file_url} alt={lightbox.alt_text || ''} className="max-w-full max-h-[85vh] rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          ) : (
            <div className="bg-white rounded-xl p-8 text-center" onClick={(e) => e.stopPropagation()}>
              {getFileIcon(lightbox.file_type, lightbox.file_name || '')}
              <p className="mt-3 text-sm font-medium">{lightbox.file_name}</p>
              <a href={lightbox.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-600 font-semibold">Open file</a>
            </div>
          )}
        </div>
      )}

      <MediaPicker
        open={Boolean(assignSlot)}
        onClose={() => setAssignSlot(null)}
        title="Assign media"
        categories={
          assignSlot && assignSlot.category !== 'general'
            ? [assignSlot.category, 'general']
            : ['general']
        }
        onSelect={(asset) => void handleAssign(asset)}
      />
    </div>
  );
}
