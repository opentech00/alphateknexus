import { useState } from 'react';
import { Clock, LogIn, LogOut, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import { useFieldStaff } from '../FieldStaffContext';

export function AttendanceScreen() {
  const { attendance, todayAttendance, clockIn, clockOut } = useFieldStaff();
  const [busy, setBusy] = useState(false);

  const handleClockIn = async () => {
    setBusy(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => { clockIn(pos.coords.latitude, pos.coords.longitude).finally(() => setBusy(false)); },
        () => { clockIn().finally(() => setBusy(false)); },
      );
    } else {
      await clockIn();
      setBusy(false);
    }
  };

  const handleClockOut = async () => {
    setBusy(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => { clockOut(pos.coords.latitude, pos.coords.longitude).finally(() => setBusy(false)); },
        () => { clockOut().finally(() => setBusy(false)); },
      );
    } else {
      await clockOut();
      setBusy(false);
    }
  };

  const fmtTime = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';

  const today = new Date().toISOString().split('T')[0];
  const isClockedIn = todayAttendance?.clock_in && !todayAttendance?.clock_out;

  return (
    <div className="max-w-md mx-auto px-4 py-5 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Attendance</h1>
        <p className="text-sm text-slate-400">Track your daily work hours</p>
      </div>

      {/* Today card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl" />
        <div className="relative">
          <p className="text-xs text-slate-400 uppercase tracking-widest">Today</p>
          <p className="text-lg font-bold mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>

          <div className="grid grid-cols-2 gap-4 mt-5">
            <div>
              <p className="text-xs text-slate-400">Clock In</p>
              <p className="text-lg font-bold font-mono">{fmtTime(todayAttendance?.clock_in || null)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Clock Out</p>
              <p className="text-lg font-bold font-mono">{fmtTime(todayAttendance?.clock_out || null)}</p>
            </div>
          </div>

          <button
            onClick={isClockedIn ? handleClockOut : handleClockIn}
            disabled={busy}
            className="w-full mt-5 flex items-center justify-center gap-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl py-3 hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            {busy ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isClockedIn ? (
              <><LogOut className="w-4 h-4" /> Clock Out</>
            ) : (
              <><LogIn className="w-4 h-4" /> Clock In</>
            )}
          </button>
        </div>
      </div>

      {/* Status badge */}
      {todayAttendance && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${
          isClockedIn ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
        }`}>
          {isClockedIn ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {isClockedIn ? 'You are currently on the clock' : 'You have clocked out for today'}
        </div>
      )}

      {/* History */}
      <div>
        <h2 className="text-sm font-bold text-slate-900 mb-3">Recent History</h2>
        {attendance.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
            <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No attendance records yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {attendance.map(rec => (
              <div key={rec.id} className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Clock className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{rec.work_date}</p>
                  <p className="text-xs text-slate-400">
                    {fmtTime(rec.clock_in)} → {fmtTime(rec.clock_out)}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                  rec.status === 'present' ? 'bg-emerald-50 text-emerald-600' :
                  rec.status === 'late' ? 'bg-amber-50 text-amber-600' :
                  rec.status === 'half_day' ? 'bg-blue-50 text-blue-600' :
                  'bg-red-50 text-red-600'
                }`}>{rec.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
