interface SidebarProps {
  navCounts: {
    domains: number;
    pending: number;
    confirmed: number;
  };
}

export function Sidebar({ navCounts }: SidebarProps) {
  const pipelineItems = [
    { label: 'Start Outreach', count: navCounts.pending, icon: '📧' },
    { label: 'Send Followup', count: 1, icon: '↩️' },
    { label: 'Under Negotiation', count: 1, icon: '⚖️' },
    { label: 'Approved', count: navCounts.confirmed, icon: '✅' },
  ];

  const toolsItems = [
    { label: 'Link Tracker', count: 2, icon: '🔗' },
    { label: 'Inbox Monitor', count: 3, icon: '📨' },
    { label: 'Outreach Templates', count: 5, icon: '📋' },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-700 flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="px-4 py-3">
        <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-2">
          🚀 AI Outreach
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
        {/* Outreach Pipeline Section */}
        <div className="mb-6">
          <h3 className="text-xs font-mono uppercase tracking-widest text-slate-500 px-2 mb-3">
            Outreach Pipeline
          </h3>
          <div className="space-y-1">
            {pipelineItems.map((item) => (
              <a
                key={item.label}
                href="#"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
              >
                <span className="text-base">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.count > 0 && (
                  <span className="font-mono text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                    {item.count}
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>

        {/* Tools Section */}
        <div>
          <h3 className="text-xs font-mono uppercase tracking-widest text-slate-500 px-2 mb-3">
            Tools
          </h3>
          <div className="space-y-1">
            {toolsItems.map((item) => (
              <a
                key={item.label}
                href="#"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
              >
                <span className="text-base">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.count > 0 && (
                  <span className="font-mono text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                    {item.count}
                  </span>
                )}
              </a>
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
