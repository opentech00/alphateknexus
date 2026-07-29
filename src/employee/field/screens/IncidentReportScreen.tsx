import { useState, useRef } from 'react';
import {
  ArrowLeft, AlertTriangle, Camera, Loader2, CheckCircle2,
  Wrench, ShieldAlert, MessageSquare, Package, HelpCircle,
} from 'lucide-react';
import { useFieldStaff } from '../FieldStaffContext';
import { supabase } from '../../lib/supabase';
import type { FieldIncident } from '../types';

const INCIDENT_TYPES: { value: FieldIncident['incident_type']; label: string; icon: typeof Wrench }[] = [
  { value: 'Equipment Issue',    label: 'Equipment Issue',    icon: Wrench },
  { value: 'Safety Hazard',      label: 'Safety Hazard',       icon: ShieldAlert },
  { value: 'Customer Complaint', label: 'Customer Complaint', icon: MessageSquare },
  { value: 'Property Damage',    label: 'Property Damage',    icon: Package },
  { value: 'Other',              label: 'Other',               icon: HelpCircle },
];

export function IncidentReportScreen({ onBack }: { onBack: () => void }) {
  const { reportIncident } = useFieldStaff();
  const [type, setType] = useState<FieldIncident['incident_type']>('Equipment Issue');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `field-incidents/${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('employee-photos')
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('employee-photos').getPublicUrl(uploadData.path);
      setPhotoUrl(urlData.publicUrl);
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      await reportIncident({
        incident_type: type,
        description: description.trim(),
        photo_url: photoUrl,
        assignment_id: null,
      });
      setDone(true);
    } catch (err: any) {
      alert(`Failed to report: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg p-7 flex flex-col items-center text-center gap-4 max-w-sm w-full">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Incident Reported</h2>
            <p className="text-sm text-slate-500 mt-1">Your report has been submitted to management.</p>
          </div>
          <button
            onClick={onBack}
            className="w-full py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <h1 className="font-bold text-sm text-slate-900">Report Incident</h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto max-w-md mx-auto w-full px-4 py-5 space-y-5">
        {/* Type selector */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">Incident Type</p>
          <div className="grid grid-cols-2 gap-2">
            {INCIDENT_TYPES.map(t => {
              const Icon = t.icon;
              const active = type === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all text-left ${
                    active
                      ? 'border-red-400 bg-red-50 text-red-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-red-500' : 'text-slate-400'}`} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Description */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">Description</p>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={5}
            placeholder="Describe what happened…"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-red-500 resize-none"
          />
        </div>

        {/* Photo */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">Photo Evidence (optional)</p>
          {photoUrl ? (
            <div className="relative">
              <img src={photoUrl} alt="" className="w-full rounded-xl max-h-48 object-cover" />
              <button
                onClick={() => setPhotoUrl(null)}
                className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={() => photoInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex flex-col items-center gap-2 border-2 border-dashed border-slate-300 rounded-xl py-8 text-slate-400 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <Camera className="w-6 h-6" />
                  <span className="text-sm">Take Photo</span>
                </>
              )}
            </button>
          )}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoSelect}
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!description.trim() || submitting}
          className="w-full flex items-center justify-center gap-2 bg-red-600 text-white text-sm font-semibold rounded-xl py-3.5 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
          Submit Report
        </button>
      </div>
    </div>
  );
}
