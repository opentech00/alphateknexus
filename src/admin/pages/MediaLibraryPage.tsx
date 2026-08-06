import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Image as ImageIcon, Video, FileText, Trash2, Upload, Search, X,
  Plus, Pencil, RefreshCw, Eye, EyeOff, Loader2, AlertCircle,
  CheckCircle2, FolderOpen, LayoutGrid,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, EmptyState } from '../components/ui';
import {
  uploadMediaFile, deleteMediaFile, getImageDimensions,
} from '../../lib/media';
import type { MediaAsset, MediaCategory } from '../../types';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const CATEGORIES: { value: MediaCategory; label: string; icon: typeof ImageIcon; color: string; bg: string }[] = [
  { value: 'app_logo', label: 'App Logo', icon: LayoutGrid, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { value: 'service_branding', label: 'Service Branding', icon: ImageIcon, color: 'text-blue-600', bg: 'bg-blue-50' },
  { value: 'login_carousel', label: 'Login Carousel', icon: ImageIcon, color: 'text-purple-600', bg: 'bg-purple-50' },
  { value: 'splash', label: 'Splash Screen', icon: ImageIcon, color: 'text-amber-600', bg: 'bg-amber-50' },
  { value: 'general', label: 'General Content', icon: FolderOpen, color: 'text-slate-600', bg: 'bg-slate-100' },
];

const SERVICE_KEYS = [
  { value: 'app-logo', label: 'App Logo' },
  { value: 'clearing-forwarding', label: 'Clearing & Forwarding' },
  { value: 'waste-management', label: 'Smart Sort / Recycling' },
  { value: 'cleaning-janitorial', label: 'Cleaning & Janitorial' },
  { value: 'private-security', label: 'Private Security' },
  { value: 'procurement', label: 'Procurement' },
  { value: 'general', label: 'General' },
];

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType: string | null, fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (fileType?.startsWith('image/') || ['webp', 'png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext))
    return <ImageIcon className="w-5 h-5 text-blue-500" />;
  if (fileType?.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi'].includes(ext))
    return <Video className="w-5 h-5 text-purple-500" />;
  return <FileText className="w-5 h-5 text-slate-400" />;
}

function isImage(fileType: string | null, fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return fileType?.startsWith('image/') || ['webp', 'png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext);
}

function isVideo(fileType: string | null, fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return fileType?.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi'].includes(ext);
}

interface UploadModalState {
  open: boolean;
  category: MediaCategory;
  key: string;
  title: string;
  altText: string;
  displayOrder: number;
  file: File | null;
}

interface EditModalState {
  open: boolean;
  asset: MediaAsset | null;
  title: string;
  altText: string;
  key: string;
  displayOrder: number;
  category: MediaCategory;
}

export function MediaLibraryPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<MediaCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [uploadModal, setUploadModal] = useState<UploadModalState>({
    open: false, category: 'general', key: 'general', title: '', altText: '', displayOrder: 0, file: null,
  });
  const [editModal, setEditModal] = useState<EditModalState>({
    open: false, asset: null, title: '', altText: '', key: '', displayOrder: 0, category: 'general',
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAssets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('media_assets')
      .select('*')
      .order('category', { ascending: true })
      .order('key', { ascending: true })
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching media assets:', error);
    } else {
      setAssets((data as MediaAsset[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAssets(); }, []);

  const filtered = useMemo(() => {
    let rows = assets;
    if (activeCategory !== 'all') {
      rows = rows.filter((a) => a.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (a) =>
          (a.title || '').toLowerCase().includes(q) ||
          (a.alt_text || '').toLowerCase().includes(q) ||
          (a.file_name || '').toLowerCase().includes(q) ||
          a.key.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [assets, activeCategory, search]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: assets.length };
    for (const cat of CATEGORIES) {
      map[cat.value] = assets.filter((a) => a.category === cat.value).length;
    }
    return map;
  }, [assets]);

  const handleUpload = async () => {
    if (!uploadModal.file) { setError('Please select a file to upload'); return; }
    if (uploadModal.file.size > MAX_FILE_SIZE) {
      setError(`File exceeds 50MB limit (${formatFileSize(uploadModal.file.size)})`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const folder = uploadModal.category;
      const uploaded = await uploadMediaFile(uploadModal.file, folder);
      if (!uploaded) { setError('Failed to upload file to storage'); return; }

      let width = 0, height = 0;
      if (uploadModal.file.type.startsWith('image/')) {
        const dims = await getImageDimensions(uploadModal.file);
        width = dims.width;
        height = dims.height;
      }

      const { data: userData } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from('media_assets').insert({
        category: uploadModal.category,
        key: uploadModal.key,
        title: uploadModal.title || uploadModal.file.name,
        alt_text: uploadModal.altText,
        file_name: uploadModal.file.name,
        file_path: uploaded.path,
        file_url: uploaded.url,
        file_type: uploadModal.file.type,
        file_size: uploadModal.file.size,
        width: width || null,
        height: height || null,
        display_order: uploadModal.displayOrder,
        is_active: true,
        uploaded_by: userData.user?.id || null,
      });

      if (insErr) {
        setError(`Failed to save record: ${insErr.message}`);
        await deleteMediaFile(uploaded.path);
        return;
      }

      setUploadModal({
        open: false, category: 'general', key: 'general', title: '', altText: '', displayOrder: 0, file: null,
      });
      await fetchAssets();
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = async () => {
    if (!editModal.asset) return;
    setError(null);
    setSaving(true);
    try {
      const { error: updErr } = await supabase
        .from('media_assets')
        .update({
          title: editModal.title,
          alt_text: editModal.altText,
          key: editModal.key,
          display_order: editModal.displayOrder,
          category: editModal.category,
        })
        .eq('id', editModal.asset.id);

      if (updErr) { setError(`Failed to update: ${updErr.message}`); return; }

      // If replacing the file
      if (replaceFile && editModal.asset) {
        setReplacingId(editModal.asset.id);
        const uploaded = await uploadMediaFile(replaceFile, editModal.category);
        if (!uploaded) { setError('Failed to upload replacement file'); return; }

        let width = 0, height = 0;
        if (replaceFile.type.startsWith('image/')) {
          const dims = await getImageDimensions(replaceFile);
          width = dims.width;
          height = dims.height;
        }

        const { error: updErr2 } = await supabase
          .from('media_assets')
          .update({
            file_name: replaceFile.name,
            file_path: uploaded.path,
            file_url: uploaded.url,
            file_type: replaceFile.type,
            file_size: replaceFile.size,
            width: width || null,
            height: height || null,
          })
          .eq('id', editModal.asset.id);

        if (updErr2) { setError(`Failed to update file reference: ${updErr2.message}`); return; }

        // Delete old file from storage
        await deleteMediaFile(editModal.asset.file_path);
        setReplaceFile(null);
        setReplacingId(null);
      }

      setEditModal({ open: false, asset: null, title: '', altText: '', key: '', displayOrder: 0, category: 'general' });
      await fetchAssets();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (asset: MediaAsset) => {
    if (!window.confirm(`Delete "${asset.title || asset.file_name}"? This removes the file and record permanently.`)) return;
    setDeletingId(asset.id);
    await deleteMediaFile(asset.file_path);
    await supabase.from('media_assets').delete().eq('id', asset.id);
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    setDeletingId(null);
  };

  const handleToggle = async (asset: MediaAsset) => {
    setTogglingId(asset.id);
    const newVal = !asset.is_active;
    await supabase.from('media_assets').update({ is_active: newVal }).eq('id', asset.id);
    setAssets((prev) => prev.map((a) => a.id === asset.id ? { ...a, is_active: newVal } : a));
    setTogglingId(null);
  };

  const openEdit = (asset: MediaAsset) => {
    setEditModal({
      open: true,
      asset,
      title: asset.title || '',
      altText: asset.alt_text || '',
      key: asset.key,
      displayOrder: asset.display_order,
      category: asset.category,
    });
    setReplaceFile(null);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Media Library"
        description="Manage app logo, service branding, login carousel, and all digital content"
        icon={ImageIcon}
        actions={
          <button
            onClick={() => setUploadModal({ open: true, category: 'general', key: 'general', title: '', altText: '', displayOrder: 0, file: null })}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Upload Media
          </button>
        }
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Category filters */}
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

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, file name, key..."
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        />
      </div>

      {/* Assets grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No media assets found"
          description={search || activeCategory !== 'all' ? 'Try adjusting filters.' : 'Upload your first media asset to get started.'}
          action={
            <button
              onClick={() => setUploadModal({ open: true, category: activeCategory === 'all' ? 'general' : activeCategory, key: 'general', title: '', altText: '', displayOrder: 0, file: null })}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Upload Media
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((asset) => {
            const cat = CATEGORIES.find((c) => c.value === asset.category);
            const showImage = isImage(asset.file_type, asset.file_name || '');
            const showVideo = isVideo(asset.file_type, asset.file_name || '');
            return (
              <div
                key={asset.id}
                className={`bg-white rounded-2xl border overflow-hidden shadow-sm transition-all hover:shadow-md ${
                  asset.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'
                }`}
              >
                {/* Preview */}
                <div className="relative h-40 bg-slate-100 flex items-center justify-center overflow-hidden">
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
                  {/* Category badge */}
                  {cat && (
                    <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold ${cat.bg} ${cat.color}`}>
                      <cat.icon className="w-2.5 h-2.5" /> {cat.label}
                    </span>
                  )}
                  {/* Active/inactive badge */}
                  <span className={`absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold ${
                    asset.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {asset.is_active ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                    {asset.is_active ? 'Active' : 'Hidden'}
                  </span>
                </div>

                {/* Info */}
                <div className="p-3">
                  <p className="text-sm font-semibold text-slate-800 truncate" title={asset.title || ''}>
                    {asset.title || asset.file_name}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    Key: {asset.key} · Order: {asset.display_order}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{formatFileSize(asset.file_size)}</p>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 mt-3">
                    <button
                      onClick={() => openEdit(asset)}
                      className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggle(asset)}
                      disabled={togglingId === asset.id}
                      className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-50"
                      title={asset.is_active ? 'Hide' : 'Show'}
                    >
                      {togglingId === asset.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : asset.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <a
                      href={asset.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                      title="Open file"
                    >
                      <FileText className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => handleDelete(asset)}
                      disabled={deletingId === asset.id}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-50 ml-auto"
                      title="Delete"
                    >
                      {deletingId === asset.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      {uploadModal.open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">Upload Media Asset</h2>
              </div>
              <button onClick={() => setUploadModal({ ...uploadModal, open: false })} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              {/* File drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition-all"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,.pdf,.doc,.docx,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setUploadModal({ ...uploadModal, file: f, title: uploadModal.title || f.name });
                  }}
                />
                {uploadModal.file ? (
                  <div className="flex items-center justify-center gap-3">
                    {getFileIcon(uploadModal.file.type, uploadModal.file.name)}
                    <div className="text-left">
                      <p className="text-sm font-medium text-slate-800">{uploadModal.file.name}</p>
                      <p className="text-xs text-slate-400">{formatFileSize(uploadModal.file.size)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <Upload className="w-8 h-8" />
                    <p className="text-sm font-medium">Click to select a file</p>
                    <p className="text-xs">Images, videos, and documents — max 50MB</p>
                  </div>
                )}
              </div>

              {/* Category */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Category</label>
                <select
                  value={uploadModal.category}
                  onChange={(e) => setUploadModal({ ...uploadModal, category: e.target.value as MediaCategory })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Key */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Key (what this asset represents)</label>
                <select
                  value={uploadModal.key}
                  onChange={(e) => setUploadModal({ ...uploadModal, key: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {SERVICE_KEYS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">For service branding, select the matching service. For app logo, select "App Logo".</p>
              </div>

              {/* Title */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Title</label>
                <input
                  type="text"
                  value={uploadModal.title}
                  onChange={(e) => setUploadModal({ ...uploadModal, title: e.target.value })}
                  placeholder="Display name for this asset"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Alt text */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Alt Text (accessibility)</label>
                <input
                  type="text"
                  value={uploadModal.altText}
                  onChange={(e) => setUploadModal({ ...uploadModal, altText: e.target.value })}
                  placeholder="Description for screen readers"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Display order */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Display Order</label>
                <input
                  type="number"
                  value={uploadModal.displayOrder}
                  onChange={(e) => setUploadModal({ ...uploadModal, displayOrder: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-xs text-slate-400 mt-1">Lower numbers appear first. Use for galleries with multiple images per service.</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setUploadModal({ ...uploadModal, open: false })}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploading || !uploadModal.file}
                  className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Upload
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal.open && editModal.asset && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">Edit Media Asset</h2>
              </div>
              <button onClick={() => setEditModal({ ...editModal, open: false })} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              {/* Current preview */}
              <div className="h-32 bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center">
                {isImage(editModal.asset.file_type, editModal.asset.file_name || '') ? (
                  <img src={editModal.asset.file_url} alt="" className="w-full h-full object-cover" />
                ) : isVideo(editModal.asset.file_type, editModal.asset.file_name || '') ? (
                  <video src={editModal.asset.file_url} className="w-full h-full object-cover" muted />
                ) : (
                  getFileIcon(editModal.asset.file_type, editModal.asset.file_name || '')
                )}
              </div>

              {/* Replace file */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Replace File (optional)</label>
                <div
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*,video/*,.pdf,.doc,.docx,.txt';
                    input.onchange = () => {
                      if (input.files?.[0]) setReplaceFile(input.files[0]);
                    };
                    input.click();
                  }}
                  className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition-all"
                >
                  {replaceFile ? (
                    <div className="flex items-center justify-center gap-2">
                      {getFileIcon(replaceFile.type, replaceFile.name)}
                      <span className="text-sm font-medium text-slate-800">{replaceFile.name}</span>
                      <span className="text-xs text-slate-400">({formatFileSize(replaceFile.size)})</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                      <RefreshCw className="w-4 h-4" />
                      <span className="text-sm">Click to replace the file</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Category</label>
                <select
                  value={editModal.category}
                  onChange={(e) => setEditModal({ ...editModal, category: e.target.value as MediaCategory })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Key */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Key</label>
                <select
                  value={editModal.key}
                  onChange={(e) => setEditModal({ ...editModal, key: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {SERVICE_KEYS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Title</label>
                <input
                  type="text"
                  value={editModal.title}
                  onChange={(e) => setEditModal({ ...editModal, title: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Alt text */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Alt Text</label>
                <input
                  type="text"
                  value={editModal.altText}
                  onChange={(e) => setEditModal({ ...editModal, altText: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Display order */}
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
                <button
                  onClick={() => setEditModal({ ...editModal, open: false })}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEdit}
                  disabled={saving}
                  className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
