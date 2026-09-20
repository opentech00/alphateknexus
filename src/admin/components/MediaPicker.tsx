import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Search, Upload, X, Loader2, FolderOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  saveMediaAsset,
  formatFileSize,
  isImageFile,
  isVideoFile,
  defaultKeyForCategory,
  MEDIA_ACCEPT,
} from '../../lib/media';
import type { MediaAsset, MediaCategory } from '../../types';
import { EmptyState, ErrorBanner, Spinner } from './ui';

const CATEGORY_LABELS: Record<MediaCategory, string> = {
  app_logo: 'App Logo',
  service_branding: 'Service Branding',
  login_carousel: 'Login Carousel',
  splash: 'Splash Screen',
  general: 'General',
  campaign: 'Campaigns',
};

export function MediaPicker({
  open,
  onClose,
  onSelect,
  categories = ['campaign', 'general'],
  allowUpload = true,
  title = 'Choose from media library',
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
  categories?: MediaCategory[];
  allowUpload?: boolean;
  title?: string;
}) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<MediaCategory | 'all'>(
    categories.length === 1 ? categories[0] : 'all',
  );
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const categoryKey = categories.join(',');

  useEffect(() => {
    if (!open) return;
    const cats = categoryKey.split(',') as MediaCategory[];
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSearch('');
    setCategory(cats.length === 1 ? cats[0] : 'all');

    supabase
      .from('media_assets')
      .select('*')
      .in('category', cats)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data, error: qErr }) => {
        if (cancelled) return;
        if (qErr) setError(qErr.message);
        setAssets((data as MediaAsset[]) || []);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, categoryKey]);

  const filtered = useMemo(() => {
    let rows = assets;
    if (category !== 'all') rows = rows.filter((a) => a.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (a) =>
          (a.title || '').toLowerCase().includes(q) ||
          (a.file_name || '').toLowerCase().includes(q) ||
          a.key.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [assets, category, search]);

  const uploadCategory: MediaCategory = category === 'all' ? (categories[0] || 'general') : category;

  const handleUpload = async (file: File) => {
    setError(null);
    setUploading(true);
    const result = await saveMediaAsset(file, {
      category: uploadCategory,
      key: defaultKeyForCategory(uploadCategory),
      title: file.name,
    });
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSelect(result.asset);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl max-w-2xl w-full p-5 max-h-[80vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {error && <div className="mb-3"><ErrorBanner message={error} /></div>}

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, file, or key…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {categories.length > 1 && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as MediaCategory | 'all')}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          )}
        </div>

        {allowUpload && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="mb-4 w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:border-emerald-400 hover:bg-emerald-50/50 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading…' : `Upload to ${CATEGORY_LABELS[uploadCategory]}`}
            <input
              ref={fileInputRef}
              type="file"
              accept={MEDIA_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void handleUpload(file);
              }}
            />
          </button>
        )}

        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No media found"
            description={search ? 'Try a different search.' : 'Upload a file to get started.'}
          />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {filtered.map((asset) => {
              const image = isImageFile(asset.file_type, asset.file_name || '');
              const video = isVideoFile(asset.file_type, asset.file_name || '');
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => { onSelect(asset); onClose(); }}
                  className="rounded-xl overflow-hidden border border-slate-200 hover:border-emerald-400 text-left"
                >
                  <div className="h-24 bg-slate-100 flex items-center justify-center overflow-hidden">
                    {image ? (
                      <img src={asset.file_url} alt={asset.alt_text || ''} className="w-full h-full object-cover" />
                    ) : video ? (
                      <video src={asset.file_url} className="w-full h-full object-cover" muted />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="text-xs font-semibold text-slate-800 truncate">{asset.title || asset.file_name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{formatFileSize(asset.file_size)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
