import { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft, MapPin, Calendar, Clock, Briefcase, CheckCircle2,
  Circle, Camera, Navigation, Play, Square, FileText, AlertTriangle,
  Plus, Loader2, X, Timer, PenLine, Pause, Send, StickyNote,
  Battery, Zap,
} from 'lucide-react';
import { useFieldStaff } from '../FieldStaffContext';
import { STATUS_META } from '../types';
import { supabase } from '../../lib/supabase';
import { useElapsedTimer } from '../useElapsedTimer';
import { SignaturePad } from '../components/SignaturePad';
import { watchPosition, isInsideGeofence, getBatteryLevel, type Coords } from '../geo';

const AUTO_CHECKOUT_HOURS = 10;

export function JobDetailScreen({ assignmentId, onBack }: {
  assignmentId: string;
  onBack: () => void;
}) {
  const {
    assignments, tasks, checkIns, evidence, messages, notes,
    updateAssignmentStatus, saveSignature, toggleTask, addTask,
    checkIn, checkOut, uploadEvidence, sendMessage, addNote,
    pauseJob, resumeJob, sendLocationPing,
  } = useFieldStaff();

  const assignment = assignments.find(a => a.id === assignmentId);
  const jobTasks = tasks[assignmentId] || [];
  const checkInRecord = checkIns[assignmentId];
  const jobEvidence = evidence[assignmentId] || [];
  const jobMessages = messages[assignmentId] || [];
  const jobNotes = notes[assignmentId] || [];

  const [newTaskText, setNewTaskText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [evidenceType, setEvidenceType] = useState<'before' | 'after'>('before');
  const [messageText, setMessageText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [activeTab, setActiveTab] = useState<'checklist' | 'chat' | 'notes'>('checklist');
  const [currentLocation, setCurrentLocation] = useState<Coords | null>(null);
  const [insideGeofence, setInsideGeofence] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const stopWatchRef = useRef<(() => void) | null>(null);

  const { elapsed, hours } = useElapsedTimer(checkInRecord?.checkin_time || null);

  // Auto check-out after threshold
  useEffect(() => {
    if (!checkInRecord?.checkin_time || checkInRecord?.checkout_time) return;
    const start = new Date(checkInRecord.checkin_time).getTime();
    const target = start + AUTO_CHECKOUT_HOURS * 3600 * 1000;
    const delay = target - Date.now();
    if (delay <= 0) {
      checkOut(assignmentId, checkInRecord.latitude || 0, checkInRecord.longitude || 0);
      return;
    }
    const timer = setTimeout(() => {
      checkOut(assignmentId, checkInRecord.latitude || 0, checkInRecord.longitude || 0);
    }, delay);
    return () => clearTimeout(timer);
  }, [checkInRecord, assignmentId, checkOut]);

  // Live GPS tracking + geofence detection during in_progress
  useEffect(() => {
    if (assignment?.status !== 'in_progress') {
      if (stopWatchRef.current) { stopWatchRef.current(); stopWatchRef.current = null; }
      return;
    }
    const stop = watchPosition(
      (coords) => {
        setCurrentLocation(coords);
        sendLocationPing(assignmentId, coords.lat, coords.lng, getBatteryLevel());
        if (assignment.latitude && assignment.longitude) {
          const inside = isInsideGeofence(
            coords,
            { lat: assignment.latitude, lng: assignment.longitude },
            assignment.geofence_radius || 100,
          );
          setInsideGeofence(inside);
        }
      },
      () => {},
    );
    stopWatchRef.current = stop;
    return () => { if (stop) stop(); };
  }, [assignment?.status, assignment?.latitude, assignment?.longitude, assignment?.geofence_radius, assignmentId, sendLocationPing]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [jobMessages.length]);

  if (!assignment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-400">Job not found</p>
      </div>
    );
  }

  const sm = STATUS_META[assignment.status];
  const beforePhotos = jobEvidence.filter(e => e.photo_type === 'before');
  const afterPhotos = jobEvidence.filter(e => e.photo_type === 'after');
  const completedTasks = jobTasks.filter(t => t.completed).length;
  const allTasksDone = jobTasks.length > 0 && completedTasks === jobTasks.length;
  const hasSignature = !!assignment.customer_signature;

  const handleAccept = () => updateAssignmentStatus(assignmentId, 'accepted');
  const handleDecline = () => updateAssignmentStatus(assignmentId, 'declined');
  const handleStart = () => {
    updateAssignmentStatus(assignmentId, 'in_progress');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => checkIn(assignmentId, pos.coords.latitude, pos.coords.longitude),
        () => checkIn(assignmentId, 0, 0),
      );
    } else {
      checkIn(assignmentId, 0, 0);
    }
  };

  const handleCheckOut = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => checkOut(assignmentId, pos.coords.latitude, pos.coords.longitude),
        () => checkOut(assignmentId, 0, 0),
      );
    } else {
      checkOut(assignmentId, 0, 0);
    }
  };

  const handleComplete = () => {
    if (!hasSignature) {
      setShowSignature(true);
      return;
    }
    setCompleting(true);
    updateAssignmentStatus(assignmentId, 'pending_review').finally(() => setCompleting(false));
  };

  const handleSignatureSave = async (dataUrl: string) => {
    setShowSignature(false);
    await saveSignature(assignmentId, dataUrl);
    setCompleting(true);
    updateAssignmentStatus(assignmentId, 'pending_review').finally(() => setCompleting(false));
  };

  const handleAddTask = () => {
    if (!newTaskText.trim()) return;
    addTask(assignmentId, newTaskText.trim());
    setNewTaskText('');
  };

  const handleSendMessage = () => {
    if (!messageText.trim()) return;
    sendMessage(assignmentId, messageText.trim());
    setMessageText('');
  };

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addNote(assignmentId, noteText.trim());
    setNoteText('');
  };

  const handlePause = () => {
    if (!pauseReason.trim()) return;
    pauseJob(assignmentId, pauseReason.trim());
    setShowPauseModal(false);
    setPauseReason('');
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `field-evidence/${assignmentId}/${evidenceType}/${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('employee-photos')
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('employee-photos').getPublicUrl(uploadData.path);
      await uploadEvidence(assignmentId, urlData.publicUrl, evidenceType);
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const canComplete = assignment.status === 'in_progress' && allTasksDone && afterPhotos.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-slate-900 truncate">{assignment.service_name}</p>
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${sm.bg} ${sm.color}`}>
            <span className={`w-1 h-1 rounded-full ${sm.dot}`} />
            {sm.label}
          </span>
        </div>
        {/* Live timer */}
        {(assignment.status === 'in_progress' || assignment.status === 'paused') && checkInRecord?.checkin_time && !checkInRecord?.checkout_time && (
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${assignment.status === 'paused' ? 'bg-orange-50' : 'bg-amber-50'}`}>
            {assignment.status === 'paused' ? <Pause className="w-3.5 h-3.5 text-orange-600" /> : <Timer className="w-3.5 h-3.5 text-amber-600" />}
            <span className={`text-xs font-mono font-semibold ${assignment.status === 'paused' ? 'text-orange-700' : 'text-amber-700'}`}>{elapsed}</span>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto max-w-md mx-auto w-full px-4 py-4 space-y-4">
        {/* Job info card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-sm text-slate-900">{assignment.service_name}</p>
              {assignment.customer_name && <p className="text-xs text-slate-500 mt-0.5">{assignment.customer_name}</p>}
            </div>
          </div>
          <div className="space-y-2 text-sm">
            {assignment.address && (
              <div className="flex items-start gap-2 text-slate-600">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <span>{assignment.address}</span>
              </div>
            )}
            {assignment.scheduled_date && (
              <div className="flex items-center gap-2 text-slate-600">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>{assignment.scheduled_date}{assignment.scheduled_time && ` · ${assignment.scheduled_time}`}</span>
              </div>
            )}
            {assignment.amount != null && (
              <div className="flex items-center gap-2 text-slate-600">
                <span className="text-xs font-semibold text-emerald-600">SLE {Number(assignment.amount).toFixed(2)}</span>
              </div>
            )}
          </div>
          {assignment.instructions && (
            <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-600">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Instructions</p>
              {assignment.instructions}
            </div>
          )}
        </div>

        {/* Geofence status */}
        {assignment.status === 'in_progress' && assignment.latitude && assignment.longitude && (
          <div className={`rounded-2xl p-4 flex items-center gap-3 border ${
            insideGeofence === true
              ? 'bg-emerald-50 border-emerald-200'
              : insideGeofence === false
                ? 'bg-amber-50 border-amber-200'
                : 'bg-slate-50 border-slate-200'
          }`}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
              insideGeofence === true ? 'bg-emerald-100' : 'bg-slate-100'
            }`}>
              {insideGeofence === true
                ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                : <MapPin className="w-5 h-5 text-slate-500" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">
                {insideGeofence === true ? 'On Site' : insideGeofence === false ? 'Outside Job Area' : 'Locating…'}
              </p>
              <p className="text-xs text-slate-500">
                {currentLocation ? `${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}` : 'GPS searching…'}
              </p>
            </div>
            {getBatteryLevel() != null && (
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <Battery className="w-3.5 h-3.5" />
                {getBatteryLevel()}%
              </div>
            )}
          </div>
        )}

        {/* Accept/Decline actions */}
        {(assignment.status === 'assigned' || assignment.status === 'pending') && (
          <div className="flex gap-2">
            <button
              onClick={handleAccept}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl py-3 hover:bg-emerald-700 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" /> Accept Job
            </button>
            <button
              onClick={handleDecline}
              className="flex-1 flex items-center justify-center gap-2 bg-white border border-red-200 text-red-600 text-sm font-semibold rounded-xl py-3 hover:bg-red-50 transition-colors"
            >
              <X className="w-4 h-4" /> Decline
            </button>
          </div>
        )}

        {/* Start */}
        {assignment.status === 'accepted' && (
          <button
            onClick={handleStart}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 text-white text-sm font-semibold rounded-xl py-3 hover:bg-amber-600 transition-colors"
          >
            <Play className="w-4 h-4" /> Start Job & Check In
          </button>
        )}

        {/* In progress actions */}
        {assignment.status === 'in_progress' && (
          <>
            {/* Check-in info */}
            {checkInRecord && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-emerald-800">
                    {checkInRecord.checkin_time ? `Checked in at ${new Date(checkInRecord.checkin_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : 'Checked in'}
                  </p>
                  <p className="text-xs text-emerald-600">
                    {checkInRecord.latitude
                      ? `${checkInRecord.latitude.toFixed(4)}, ${checkInRecord.longitude?.toFixed(4)}`
                      : 'Location not captured'}
                    {hours >= AUTO_CHECKOUT_HOURS - 1 && ' · Auto check-out soon'}
                  </p>
                </div>
              </div>
            )}

            {/* Navigate + Pause */}
            <div className="flex gap-2">
              {assignment.address && (
                <button
                  onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(assignment.address)}`, '_blank')}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 text-blue-600 text-sm font-semibold rounded-xl py-3 hover:bg-blue-100 transition-colors"
                >
                  <Navigation className="w-4 h-4" /> Navigate
                </button>
              )}
              <button
                onClick={() => setShowPauseModal(true)}
                className="flex-1 flex items-center justify-center gap-2 bg-orange-50 border border-orange-200 text-orange-600 text-sm font-semibold rounded-xl py-3 hover:bg-orange-100 transition-colors"
              >
                <Pause className="w-4 h-4" /> Pause
              </button>
            </div>
          </>
        )}

        {/* Paused state */}
        {assignment.status === 'paused' && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center">
                <Pause className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-orange-800">Job Paused</p>
                {assignment.paused_reason && <p className="text-xs text-orange-600">{assignment.paused_reason}</p>}
              </div>
            </div>
            <button
              onClick={() => resumeJob(assignmentId)}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl py-3 hover:bg-emerald-700 transition-colors"
            >
              <Play className="w-4 h-4" /> Resume Work
            </button>
          </div>
        )}

        {/* Tabbed section: Checklist / Chat / Notes */}
        {(assignment.status === 'in_progress' || assignment.status === 'paused' || assignment.status === 'pending_review' || assignment.status === 'approved') && (
          <>
            {/* Tab selector */}
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {([
                { key: 'checklist', label: 'Checklist', icon: CheckCircle2 },
                { key: 'chat', label: 'Chat', icon: Send },
                { key: 'notes', label: 'Notes', icon: StickyNote },
              ] as const).map(tab => {
                const Icon = tab.icon;
                const count = tab.key === 'checklist' ? jobTasks.length : tab.key === 'chat' ? jobMessages.length : jobNotes.length;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      activeTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                    {count > 0 && <span className="text-[10px] text-slate-400">({count})</span>}
                  </button>
                );
              })}
            </div>

            {/* Checklist tab */}
            {activeTab === 'checklist' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-900">Checklist</h3>
                  {jobTasks.length > 0 && (
                    <span className="text-xs text-slate-400">{completedTasks}/{jobTasks.length} done</span>
                  )}
                </div>
                {jobTasks.length > 0 && (
                  <div className="h-1.5 bg-slate-100 rounded-full mb-4 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${(completedTasks / jobTasks.length) * 100}%` }}
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  {jobTasks.map(task => (
                    <button
                      key={task.id}
                      onClick={() => assignment.status === 'in_progress' && toggleTask(task.id, !task.completed)}
                      disabled={assignment.status !== 'in_progress'}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left disabled:opacity-60"
                    >
                      {task.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-300 flex-shrink-0" />
                      )}
                      <span className={`text-sm flex-1 ${task.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        {task.task_text}
                      </span>
                    </button>
                  ))}
                </div>
                {assignment.status === 'in_progress' && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                    <input
                      value={newTaskText}
                      onChange={e => setNewTaskText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                      placeholder="Add a task…"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button onClick={handleAddTask} className="p-2 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {jobTasks.length === 0 && <p className="text-sm text-slate-400 text-center py-3">No checklist items yet</p>}
              </div>
            )}

            {/* Chat tab */}
            {activeTab === 'chat' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col" style={{ minHeight: '300px' }}>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {jobMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-8">
                      <Send className="w-8 h-8 text-slate-300 mb-2" />
                      <p className="text-sm text-slate-400">No messages yet. Start the conversation.</p>
                    </div>
                  ) : (
                    jobMessages.map(msg => (
                      <div key={msg.id} className={`flex ${msg.sender === 'worker' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
                          msg.sender === 'worker' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'
                        }`}>
                          {msg.sender_name && msg.sender !== 'worker' && (
                            <p className="text-[10px] font-semibold opacity-70 mb-0.5">{msg.sender_name}</p>
                          )}
                          <p className="text-sm">{msg.body}</p>
                          <p className={`text-[10px] mt-0.5 ${msg.sender === 'worker' ? 'text-emerald-200' : 'text-slate-400'}`}>
                            {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
                {assignment.status === 'in_progress' && (
                  <div className="border-t border-slate-100 p-3 flex gap-2">
                    <input
                      value={messageText}
                      onChange={e => setMessageText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Type a message…"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button onClick={handleSendMessage} className="p-2 bg-emerald-600 rounded-lg text-white hover:bg-emerald-700 transition-colors">
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Notes tab */}
            {activeTab === 'notes' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                {jobNotes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-6">
                    <StickyNote className="w-8 h-8 text-slate-300 mb-2" />
                    <p className="text-sm text-slate-400">No notes yet. Add observations during the job.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {jobNotes.map(note => (
                      <div key={note.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-sm text-slate-700">{note.note_text}</p>
                        {note.photo_url && <img src={note.photo_url} alt="" className="mt-2 w-full max-h-32 object-cover rounded-lg" />}
                        <p className="text-[10px] text-slate-400 mt-1.5">
                          {new Date(note.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {assignment.status === 'in_progress' && (
                  <div className="flex gap-2 pt-2 border-t border-slate-100">
                    <input
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                      placeholder="Add a note…"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button onClick={handleAddNote} className="p-2 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Evidence photos */}
        {(assignment.status === 'in_progress' || assignment.status === 'paused' || assignment.status === 'pending_review' || assignment.status === 'approved') && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Evidence Photos</h3>
            <div className="mb-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Before ({beforePhotos.length})</p>
              {beforePhotos.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {beforePhotos.map(ev => <img key={ev.id} src={ev.photo_url} alt="" className="w-full aspect-square object-cover rounded-lg" />)}
                </div>
              ) : <p className="text-xs text-slate-400">No before photos</p>}
            </div>
            <div className="mb-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">After ({afterPhotos.length})</p>
              {afterPhotos.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {afterPhotos.map(ev => <img key={ev.id} src={ev.photo_url} alt="" className="w-full aspect-square object-cover rounded-lg" />)}
                </div>
              ) : <p className="text-xs text-slate-400">No after photos</p>}
            </div>
            {assignment.status === 'in_progress' && (
              <>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEvidenceType('before'); photoInputRef.current?.click(); }}
                    disabled={uploading}
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg py-2.5 hover:bg-slate-100 transition-colors disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                    Before
                  </button>
                  <button
                    onClick={() => { setEvidenceType('after'); photoInputRef.current?.click(); }}
                    disabled={uploading}
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg py-2.5 hover:bg-slate-100 transition-colors disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                    After
                  </button>
                </div>
                <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />
              </>
            )}
          </div>
        )}

        {/* Signature section */}
        {assignment.status === 'in_progress' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Customer Signature</h3>
            {hasSignature ? (
              <div className="space-y-3">
                <img src={assignment.customer_signature!} alt="Customer signature" className="w-full max-h-32 object-contain bg-slate-50 rounded-xl border border-slate-200" />
                <p className="text-xs text-slate-400">
                  Captured {assignment.signature_captured_at ? new Date(assignment.signature_captured_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                </p>
                <button onClick={() => setShowSignature(true)} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                  Re-capture signature
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSignature(true)}
                className="w-full flex flex-col items-center gap-2 border-2 border-dashed border-slate-300 rounded-xl py-8 text-slate-400 hover:bg-slate-50 transition-colors"
              >
                <PenLine className="w-6 h-6" />
                <span className="text-sm font-medium">Capture Customer Signature</span>
              </button>
            )}
          </div>
        )}

        {/* Complete & Check-out */}
        {assignment.status === 'in_progress' && (
          <>
            {!allTasksDone && <p className="text-xs text-amber-600 text-center">Complete all checklist items to finish</p>}
            {afterPhotos.length === 0 && <p className="text-xs text-amber-600 text-center">Upload at least one "after" photo</p>}
            {!hasSignature && <p className="text-xs text-amber-600 text-center">Capture customer signature before submitting</p>}
            <div className="flex gap-2">
              <button
                onClick={handleCheckOut}
                className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl py-3 hover:bg-slate-50 transition-colors"
              >
                <Square className="w-4 h-4" /> Check Out
              </button>
              <button
                onClick={handleComplete}
                disabled={!canComplete || completing}
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl py-3 hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Submit for Review
              </button>
            </div>
          </>
        )}

        {/* Pending review status */}
        {assignment.status === 'pending_review' && (
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-100 rounded-full flex items-center justify-center">
              <FileText className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-purple-800">Submitted for Review</p>
              <p className="text-xs text-purple-600">An admin will review and approve your work</p>
            </div>
          </div>
        )}

        {/* Approved */}
        {assignment.status === 'approved' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">Job Approved</p>
              <p className="text-xs text-emerald-600">Your work has been approved by management</p>
            </div>
          </div>
        )}
      </div>

      {/* Signature pad modal */}
      {showSignature && (
        <SignaturePad onSave={handleSignatureSave} onCancel={() => setShowSignature(false)} />
      )}

      {/* Pause modal */}
      {showPauseModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-2">
              <Pause className="w-5 h-5 text-orange-500" />
              <h3 className="font-bold text-slate-900">Pause Job</h3>
            </div>
            <p className="text-sm text-slate-500">The timer will stop while paused. You can resume anytime.</p>
            <textarea
              value={pauseReason}
              onChange={e => setPauseReason(e.target.value)}
              placeholder="Reason for pausing (e.g. lunch break, waiting for materials)…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500 resize-none"
              rows={3}
            />
            <div className="flex gap-2">
              <button onClick={() => setShowPauseModal(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handlePause}
                disabled={!pauseReason.trim()}
                className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                Pause Job
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
