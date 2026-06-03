import {
  LayoutGrid,
  Mail,
  SendHorizontal,
  Reply,
  MessageSquare,
  Scale,
  Handshake,
  CheckCircle,
  CreditCard,
  Globe,
  Link,
  Inbox,
  FileText,
  Users,
  Search,
  Users2,
  Zap,
  BarChart2,
} from 'lucide-react';
import { NavCounts } from './types';

interface SidebarProps {
  navCounts: NavCounts;
  selectedStage?: string;
  onSelectStage?: (stage: string) => void;
  onAllContactsOpen?: () => void;
}

export function Sidebar({ navCounts, selectedStage = 'all', onSelectStage, onAllContactsOpen }: SidebarProps) {
  const pipelineItems = [
    { id: 'all', label: 'All Contacts', count: navCounts.all, icon: LayoutGrid },
    { id: 'start-outreach', label: 'Start Outreach', count: navCounts.startOutreach, icon: Mail },
    { id: 'outreach-sent', label: 'Outreach Sent', count: navCounts.outreachSent, icon: SendHorizontal },
    { id: 'send-followup', label: 'Send Follow-up', count: navCounts.sendFollowup, icon: Reply },
    { id: 'response-received', label: 'Response Received', count: navCounts.responseReceived, icon: MessageSquare },
    { id: 'under-negotiation', label: 'Under Negotiation', count: navCounts.underNegotiation, icon: Scale },
    { id: 'negotiated', label: 'Negotiated', count: navCounts.negotiated, icon: Handshake },
    { id: 'approved', label: 'Approved', count: navCounts.approved, icon: CheckCircle },
    { id: 'payment-sent', label: 'Payment Sent', count: navCounts.paymentSent, icon: CreditCard },
    { id: 'live', label: 'Live', count: navCounts.live, icon: Globe },
  ];

  const toolsItems = [
    { label: 'Senders', href: '/dashboard/senders', icon: Users },
    { label: 'Link Tracker', href: '#', icon: Link },
    { label: 'Inbox Monitor', href: '#', icon: Inbox },
    { label: 'Outreach Templates', href: '#', icon: FileText },
  ];

  const leadsItems = [
    { label: 'Overview', href: '/leads', icon: BarChart2 },
    { label: 'New Leads', href: '/leads/new-leads', icon: Search },
    { label: 'Contacts', href: '/leads/contacts', icon: Users2 },
    { label: 'Outreach Ready', href: '/leads/outreach-ready', icon: Zap },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-700 flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="px-4 py-3">
        <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-2">
          AI Outreach
        </div>
        <h1 className="text-3xl font-black text-slate-100 tracking-tight">
          Link<span className="text-emerald-400">Ops</span>
        </h1>
      </div>

      {/* Status Card */}
      <div className="px-4 py-3">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-xs font-bold text-black flex-shrink-0">
              A
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-emerald-400">Automation</div>
              <div className="text-xs text-slate-400">Active & running</div>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {/* Leads */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
            Leads
          </p>
          <div className="space-y-1">
            {leadsItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              >
                <item.icon size={15} />
                {item.label}
              </a>
            ))}
          </div>
        </div>

        {/* Outreach Pipeline — coming soon */}
        <div className="mb-6 opacity-40 pointer-events-none select-none">
          <div className="flex items-center gap-2 px-2 mb-3">
            <h3 className="text-xs font-mono uppercase tracking-widest text-slate-500">
              Outreach Pipeline
            </h3>
            <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded font-medium">
              Soon
            </span>
          </div>
          <div className="space-y-1">
            {pipelineItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-500"
              >
                <item.icon size={16} className="flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tools — coming soon */}
        <div className="opacity-40 pointer-events-none select-none">
          <div className="flex items-center gap-2 px-2 mb-3">
            <h3 className="text-xs font-mono uppercase tracking-widest text-slate-500">
              Tools
            </h3>
            <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded font-medium">
              Soon
            </span>
          </div>
          <div className="space-y-1">
            {toolsItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-500"
              >
                <item.icon size={16} className="flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>Synced • Google Sheets</span>
        </div>
        <div className="text-xs font-mono text-slate-600">
          <div>Auto-detect: ON</div>
          <div>Last sync: 05:34 PM</div>
          <div>Status: <span className="text-emerald-400">active</span></div>
          <div className="mt-2">
            <span className="text-emerald-400">Automation:</span> <span className="text-emerald-400">running</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
