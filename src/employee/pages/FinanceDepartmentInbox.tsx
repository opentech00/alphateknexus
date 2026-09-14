import { useState } from 'react';
import { ClipboardList, FileText, FolderOpen, Inbox, ShieldCheck } from 'lucide-react';
import { FinanceApprovalsPanel } from '../../components/FinanceApprovalsPanel';
import { DocumentsPage, ReportPage } from './ActivityPages';
import { DelegatedTasksPage } from './DelegatedTasksPage';
import type { Employee } from '../types';

type InboxTab = 'drafts' | 'awaiting' | 'tasks' | 'documents' | 'reports';

export function FinanceDepartmentInbox({
  employee,
}: {
  employee: Employee | null;
}) {
  const [tab, setTab] = useState<InboxTab>('awaiting');

  const tabs: { id: InboxTab; label: string; icon: typeof Inbox }[] = [
    { id: 'awaiting', label: 'Awaiting my approval', icon: ShieldCheck },
    { id: 'drafts', label: 'My drafts', icon: FileText },
    { id: 'tasks', label: 'Assigned tasks', icon: ClipboardList },
    { id: 'documents', label: 'Documents', icon: FolderOpen },
    { id: 'reports', label: 'Reports', icon: Inbox },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Department inbox</h1>
        <p className="text-sm text-slate-400">Admin & Finance work: drafts, dual-control approvals, documents, and reports.</p>
      </div>

      <div className="flex gap-1 overflow-x-auto bg-white border border-slate-200 rounded-2xl p-1.5">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap ${
              tab === id ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'awaiting' && <FinanceApprovalsPanel scope="awaiting" allowCreate />}
      {tab === 'drafts' && <FinanceApprovalsPanel scope="drafts" allowCreate />}
      {tab === 'tasks' && <DelegatedTasksPage onBack={() => setTab('awaiting')} />}
      {tab === 'documents' && (
        <DocumentsPage employee={employee} />
      )}
      {tab === 'reports' && (
        <ReportPage employee={employee} onBack={() => setTab('awaiting')} />
      )}
    </div>
  );
}
