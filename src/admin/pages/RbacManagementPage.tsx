import { useState } from 'react';
import {
  Shield, Users, BarChart3, Building2, Settings, Lock,
  ChevronRight,
} from 'lucide-react';
import { RoleManagementPage } from '../components/RoleManagementPanel';
import { UserRoleAssignmentPanel } from '../components/UserRoleAssignmentPanel';
import { AuditLogViewer } from '../components/AuditLogViewer';
import { DepartmentManagementPanel } from '../components/DepartmentManagementPanel';

type Tab = 'overview' | 'roles' | 'users' | 'departments' | 'audit';

export function RbacManagementPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const tabs = [
    {
      id: 'overview' as const,
      label: 'Overview',
      icon: Shield,
      description: 'RBAC system status and quick actions',
    },
    {
      id: 'roles' as const,
      label: 'Roles',
      icon: Lock,
      description: 'Manage role definitions and permissions',
    },
    {
      id: 'users' as const,
      label: 'User Access',
      icon: Users,
      description: 'Assign roles to users',
    },
    {
      id: 'departments' as const,
      label: 'Departments',
      icon: Building2,
      description: 'Manage departments and access control',
    },
    {
      id: 'audit' as const,
      label: 'Audit Logs',
      icon: BarChart3,
      description: 'View system activity and compliance logs',
    },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab />;
      case 'roles':
        return <RoleManagementPage />;
      case 'users':
        return <UserRoleAssignmentPanel />;
      case 'departments':
        return <DepartmentManagementPanel />;
      case 'audit':
        return <AuditLogViewer />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Role-Based Access Control</h1>
          <p className="text-slate-600 mt-1">Manage roles, permissions, and access policies</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200 overflow-x-auto">
        <div className="flex gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 font-medium text-sm whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? 'border-emerald-600 text-emerald-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div>{renderContent()}</div>
    </div>
  );
}

/**
 * Overview Tab with key features and quick actions
 */
function OverviewTab() {
  const features = [
    {
      icon: Lock,
      title: 'Granular Permissions',
      description: 'Define fine-grained permissions for different user roles and operations',
      benefits: ['Action-level control', 'Category-based organization', 'Sensitive operation flagging'],
    },
    {
      icon: Users,
      title: 'User Role Management',
      description: 'Assign multiple roles to users with department scoping and expiration',
      benefits: ['Multiple roles per user', 'Temporary assignments', 'Primary role designation'],
    },
    {
      icon: Building2,
      title: 'Department Isolation',
      description: 'Organize access by departments with role-based data segregation',
      benefits: ['Department scoping', 'Manager assignments', 'Hierarchical access'],
    },
    {
      icon: BarChart3,
      title: 'Comprehensive Audit Logging',
      description: 'Track all sensitive operations with detailed audit trails for compliance',
      benefits: ['Action tracking', 'Change history', 'Export capabilities'],
    },
  ];

  const bestPractices = [
    {
      title: 'Principle of Least Privilege',
      description:
        'Assign users only the minimum permissions they need to perform their job. Regularly review and remove unnecessary access.',
      icon: Shield,
    },
    {
      title: 'Role Segregation',
      description:
        'Separate roles for different functions (approvers, reviewers, operators). Prevent conflicts of interest.',
      icon: Users,
    },
    {
      title: 'Audit Review',
      description:
        'Regularly review audit logs for suspicious activities. Monitor sensitive operations like deletions and permission changes.',
      icon: BarChart3,
    },
    {
      title: 'Temporary Access',
      description:
        'Use expiring role assignments for temporary access. Automatically revoke access when contracts or projects end.',
      icon: Lock,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Key Features */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-4">Key Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div
                key={idx}
                className="border border-slate-200 rounded-lg p-5 hover:shadow-md transition-shadow bg-white"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{feature.title}</h3>
                    <p className="text-sm text-slate-600 mt-1">{feature.description}</p>
                  </div>
                </div>
                <ul className="space-y-1 pl-13">
                  {feature.benefits.map((benefit, bidx) => (
                    <li key={bidx} className="text-xs text-slate-600 flex items-center gap-2">
                      <ChevronRight className="w-3 h-3 text-emerald-500" />
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Best Practices */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-4">Security Best Practices</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bestPractices.map((practice, idx) => {
            const Icon = practice.icon;
            return (
              <div
                key={idx}
                className="border border-slate-200 rounded-lg p-5 bg-gradient-to-br from-slate-50 to-white"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{practice.title}</h3>
                    <p className="text-sm text-slate-600 mt-2">{practice.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <QuickActionLink
            title="Create New Role"
            description="Define a new role with specific permissions"
            onClick={() => {
              // This would navigate to roles tab
              window.location.hash = '#roles';
            }}
          />
          <QuickActionLink
            title="Assign User Role"
            description="Grant roles to users and manage access"
            onClick={() => {
              window.location.hash = '#users';
            }}
          />
          <QuickActionLink
            title="View Audit Trail"
            description="Monitor system activity and compliance"
            onClick={() => {
              window.location.hash = '#audit';
            }}
          />
          <QuickActionLink
            title="Manage Departments"
            description="Organize teams and access scopes"
            onClick={() => {
              window.location.hash = '#departments';
            }}
          />
        </div>
      </div>

      {/* Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
          <Shield className="w-5 h-5" /> Permission Categories
        </h3>
        <p className="text-sm text-blue-800 mb-4">
          Permissions are organized into the following categories for easy management:
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            'Bookings',
            'Customers',
            'Finance',
            'Employees',
            'Settings',
            'Reports',
            'Audit',
            'Divisions',
          ].map((cat) => (
            <div key={cat} className="px-3 py-2 bg-white rounded-lg border border-blue-200 text-sm text-blue-900">
              {cat}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface QuickActionLinkProps {
  title: string;
  description: string;
  onClick: () => void;
}

function QuickActionLink({ title, description, onClick }: QuickActionLinkProps) {
  return (
    <button
      onClick={onClick}
      className="text-left p-4 bg-white rounded-lg border border-emerald-200 hover:shadow-md transition-shadow group"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900 group-hover:text-emerald-600 transition-colors">
            {title}
          </h3>
          <p className="text-sm text-slate-600 mt-1">{description}</p>
        </div>
        <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 transition-colors flex-shrink-0 ml-2" />
      </div>
    </button>
  );
}
