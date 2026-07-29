import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Upload, Image, FileText, File, Trash2, X } from 'lucide-react';

interface Document {
  id: string;
  booking_id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  uploaded_by_admin: boolean;
  created_at: string;
}

interface DocumentUploadProps {
  bookingId: string;
  readOnly?: boolean;
  serviceSlug?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ACCEPTED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType: string) {
  if (fileType.startsWith('image/')) {
    return <Image className="w-6 h-6 text-emerald-500" />;
  }
  if (fileType === 'application/pdf') {
    return <FileText className="w-6 h-6 text-red-500" />;
  }
  return <File className="w-6 h-6 text-slate-500" />;
}

export function DocumentUpload({ bookingId, readOnly = false, serviceSlug }: DocumentUploadProps) {
  const { user, isAdmin } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false });

    if (error) {
      setError('Failed to load documents');
      console.error('Error fetching documents:', error);
    } else {
      setDocuments(data || []);
    }
    setLoading(false);
  }, [bookingId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const validateFile = (file: globalThis.File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `File "${file.name}" exceeds 10MB limit (${formatFileSize(file.size)})`;
    }
    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      return `File "${file.name}" has an unsupported file type`;
    }
    return null;
  };

  const uploadFile = async (file: globalThis.File) => {
    if (!user) {
      setError('You must be logged in to upload files');
      return;
    }

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      const filename = `${Date.now()}-${file.name}`;
      const filePath = `${user.id}/${bookingId}/${filename}`;

      // Simulate progress since Supabase JS doesn't provide upload progress natively
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 150);

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      clearInterval(progressInterval);

      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`);
        setUploading(false);
        setUploadProgress(0);
        return;
      }

      setUploadProgress(95);

      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      const { error: insertError } = await supabase.from('documents').insert({
        booking_id: bookingId,
        user_id: user.id,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
        uploaded_by_admin: isAdmin,
        service_slug: serviceSlug || null,
      });

      if (insertError) {
        setError(`Failed to save document record: ${insertError.message}`);
        // Attempt cleanup
        await supabase.storage.from('documents').remove([filePath]);
      } else {
        setUploadProgress(100);
        await fetchDocuments();
      }
    } catch (err) {
      setError('An unexpected error occurred during upload');
      console.error('Upload error:', err);
    } finally {
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 500);
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Upload files sequentially
    Array.from(files).forEach((file) => uploadFile(file));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (readOnly) return;
      handleFiles(e.dataTransfer.files);
    },
    [readOnly]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDelete = async (doc: Document) => {
    if (!user) return;

    // Only allow deleting own uploads (or admin can delete any)
    if (doc.user_id !== user.id && !isAdmin) {
      setError('You can only delete your own uploads');
      return;
    }

    const confirmed = window.confirm(`Delete "${doc.file_name}"?`);
    if (!confirmed) return;

    // Extract storage path from the URL
    const filePath = `${doc.user_id}/${doc.booking_id}/${doc.file_url.split('/').pop()}`;

    const { error: deleteStorageError } = await supabase.storage
      .from('documents')
      .remove([filePath]);

    if (deleteStorageError) {
      console.error('Storage delete error:', deleteStorageError);
    }

    const { error: deleteDbError } = await supabase
      .from('documents')
      .delete()
      .eq('id', doc.id);

    if (deleteDbError) {
      setError(`Failed to delete document: ${deleteDbError.message}`);
    } else {
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      {!readOnly && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center
            transition-all duration-200 ease-in-out
            ${
              dragActive
                ? 'border-emerald-500 bg-emerald-50 scale-[1.02]'
                : 'border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/50'
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_FILE_TYPES.join(',')}
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />

          <div className="flex flex-col items-center gap-3">
            <div
              className={`rounded-full p-3 ${
                dragActive ? 'bg-emerald-100' : 'bg-slate-100'
              }`}
            >
              <Upload
                className={`w-8 h-8 ${
                  dragActive ? 'text-emerald-600' : 'text-slate-400'
                }`}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">
                {dragActive
                  ? 'Drop files here'
                  : 'Drag & drop files here, or click to browse'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Images, PDFs, and documents up to 10MB
              </p>
            </div>
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="absolute inset-x-0 bottom-0 px-4 pb-3">
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Uploading... {uploadProgress}%
              </p>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <X className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Documents Grid */}
      {documents.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="group relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow duration-200"
            >
              {/* Delete Button */}
              {!readOnly && user && (doc.user_id === user.id || isAdmin) && (
                <button
                  onClick={() => handleDelete(doc)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-700"
                  title="Delete file"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              {/* File Preview */}
              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                {doc.file_type.startsWith('image/') ? (
                  <div className="mb-3 rounded-lg overflow-hidden bg-slate-100 aspect-video flex items-center justify-center">
                    <img
                      src={doc.file_url}
                      alt={doc.file_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="mb-3 rounded-lg bg-slate-50 aspect-video flex items-center justify-center">
                    {getFileIcon(doc.file_type)}
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {doc.file_name}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{formatFileSize(doc.file_size)}</span>
                    <span>•</span>
                    <span>
                      {new Date(doc.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {doc.uploaded_by_admin && (
                    <span className="inline-block mt-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                      Admin
                    </span>
                  )}
                </div>
              </a>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 rounded-xl border border-slate-200 bg-white">
          <File className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No documents uploaded yet</p>
        </div>
      )}
    </div>
  );
}
