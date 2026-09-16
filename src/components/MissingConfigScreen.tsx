import { AlertTriangle } from 'lucide-react';

type MissingConfigScreenProps = {
  appName: string;
};

export function MissingConfigScreen({ appName }: MissingConfigScreenProps) {
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">{appName} is not configured</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Set <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">VITE_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">VITE_SUPABASE_ANON_KEY</code> (or{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">VITE_SUPABASE_PUBLISHABLE_KEY</code>)
          in <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">.env</code>, then restart the
          dev server. Copy <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">.env.example</code> to
          get started.
        </p>
      </div>
    </div>
  );
}
