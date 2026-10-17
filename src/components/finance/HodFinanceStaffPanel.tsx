import { useCallback, useEffect, useState } from 'react';
import { Briefcase, Loader2, UserPlus, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Position = { key: string; name: string; summary: string; grant_admin: boolean };
type Person = {
  id: string;
  full_name: string;
  email: string;
  employee_number: string;
  role_name: string | null;
  is_hod?: boolean;
};

type Board = { positions: Position[]; ready: Person[]; roster: Person[] };

export function HodFinanceStaffPanel() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [board, setBoard] = useState<Board>({ positions: [], ready: [], roster: [] });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmClearId, setConfirmClearId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    const { data: hod, error: hodError } = await supabase.rpc('is_admin_finance_hod');
    if (hodError || hod !== true) {
      setVisible(false);
      setLoading(false);
      return;
    }
    setVisible(true);
    const { data, error: boardError } = await supabase.rpc('hod_admin_finance_staff_board');
    if (boardError) {
      setError(boardError.message);
      setLoading(false);
      return;
    }
    const next = data as Board;
    setBoard({
      positions: next?.positions ?? [],
      ready: next?.ready ?? [],
      roster: next?.roster ?? [],
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const assign = async (person: Person) => {
    const positionKey = choice[person.id];
    if (!positionKey) {
      setError(`Choose a position for ${person.full_name}.`);
      return;
    }
    setBusyId(person.id);
    setError('');
    setNotice('');
    const { data, error: assignError } = await supabase.rpc('hod_assign_admin_finance_position', {
      p_employee_id: person.id,
      p_position_key: positionKey,
    });
    setBusyId(null);
    if (assignError) {
      setError(assignError.message);
      return;
    }
    const result = data as { full_name?: string; position_name?: string } | null;
    setNotice(`${result?.full_name || person.full_name} is now ${result?.position_name || 'assigned'}.`);
    await load();
  };

  const clearPosition = async (person: Person) => {
    setBusyId(person.id);
    setError('');
    setNotice('');
    const { error: clearError } = await supabase.rpc('hod_clear_admin_finance_position', {
      p_employee_id: person.id,
    });
    setBusyId(null);
    setConfirmClearId(null);
    if (clearError) {
      setError(clearError.message);
      return;
    }
    setNotice(`${person.full_name} is back with HR. Their finance access is removed.`);
    await load();
  };

  if (!visible) return null;
  if (loading) {
    return (
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm" aria-busy="true">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Loading people HR has onboarded
        </div>
      </section>
    );
  }

  const selectedSummary = (id: string) => board.positions.find((p) => p.key === choice[id])?.summary;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" aria-labelledby="hod-staff-heading">
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
        <h2 id="hod-staff-heading" className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-600" aria-hidden="true" />
          Department staff
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          HR creates the employee. You then place them in one Admin & Finance position. The position sets what they can see and change.
        </p>
      </div>

      <div className="p-5 space-y-6">
        {error && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
        )}
        {notice && (
          <p role="status" className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{notice}</p>
        )}

        <div>
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-slate-400" aria-hidden="true" />
            Ready for a finance position
          </h3>
          <p className="text-xs text-slate-500 mt-1 mb-3">People HR has onboarded who are not in another department.</p>
          {board.ready.length === 0 ? (
            <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
              No one is waiting. Ask HR to onboard the employee first.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {board.ready.map((person) => (
                <li key={person.id} className="p-3 sm:p-4 space-y-2">
                  <PersonLine person={person} />
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
                    <label className="flex-1 block">
                      <span className="sr-only">Position for {person.full_name}</span>
                      <select
                        value={choice[person.id] || ''}
                        onChange={(event) => setChoice((prev) => ({ ...prev, [person.id]: event.target.value }))}
                        className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"
                      >
                        <option value="">Choose a position</option>
                        {board.positions.map((position) => (
                          <option key={position.key} value={position.key}>{position.name}</option>
                        ))}
                      </select>
                      {selectedSummary(person.id) && (
                        <span className="block text-xs text-slate-500 mt-1">{selectedSummary(person.id)}</span>
                      )}
                    </label>
                    <button
                      type="button"
                      disabled={busyId === person.id}
                      onClick={() => void assign(person)}
                      className="min-h-[44px] px-4 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {busyId === person.id ? 'Assigning…' : 'Assign'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-slate-400" aria-hidden="true" />
            In Admin & Finance
          </h3>
          {board.roster.length === 0 ? (
            <p className="text-sm text-slate-500 mt-2">No finance positions assigned yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {board.roster.map((person) => (
                <li key={person.id} className="p-3 sm:p-4 space-y-2">
                  <PersonLine person={person} />
                  {person.is_hod ? (
                    <p className="text-xs text-slate-500">Head of Department. This seat is not reassigned here.</p>
                  ) : confirmClearId === person.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-slate-600">Remove finance access for {person.full_name}?</p>
                      <button
                        type="button"
                        disabled={busyId === person.id}
                        onClick={() => void clearPosition(person)}
                        className="min-h-[44px] px-3 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
                      >
                        {busyId === person.id ? 'Removing…' : 'Remove'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearId(null)}
                        className="min-h-[44px] px-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
                      <label className="flex-1 block">
                        <span className="sr-only">New position for {person.full_name}</span>
                        <select
                          value={choice[person.id] || ''}
                          onChange={(event) => setChoice((prev) => ({ ...prev, [person.id]: event.target.value }))}
                          className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"
                        >
                          <option value="">Change position</option>
                          {board.positions.map((position) => (
                            <option key={position.key} value={position.key}>{position.name}</option>
                          ))}
                        </select>
                        {selectedSummary(person.id) && (
                          <span className="block text-xs text-slate-500 mt-1">{selectedSummary(person.id)}</span>
                        )}
                      </label>
                      <button
                        type="button"
                        disabled={busyId === person.id}
                        onClick={() => void assign(person)}
                        className="min-h-[44px] px-4 rounded-xl border border-emerald-200 text-emerald-800 text-sm font-semibold hover:bg-emerald-50 disabled:opacity-50"
                      >
                        Update
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearId(person.id)}
                        className="min-h-[44px] px-4 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function PersonLine({ person }: { person: Person }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-slate-900 truncate">{person.full_name}</p>
      <p className="text-xs text-slate-500 truncate">
        {person.employee_number}
        {person.role_name ? ` · ${person.role_name}` : ' · No finance position yet'}
        {person.email ? ` · ${person.email}` : ''}
      </p>
    </div>
  );
}
