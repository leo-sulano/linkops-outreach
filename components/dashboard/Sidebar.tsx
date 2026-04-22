interface SidebarProps {
  navCounts: {
    domains: number;
    pending: number;
    confirmed: number;
  };
}

export function Sidebar({ navCounts }: SidebarProps) {
  const navItems = [
    { label: 'Domains', count: navCounts.domains, icon: '📊' },
    { label: 'Pending', count: navCounts.pending, icon: '⏳' },
    { label: 'Confirmed', count: navCounts.confirmed, icon: '✅' },
    { label: 'Settings', count: undefined, icon: '⚙️' },
  ];

  return (
    <aside className="w-60 bg-slate-900 border-r border-slate-700 flex flex-col flex-shrink-0">
      {/* Logo Section */}
      <div className="border-b border-slate-700 px-4 py-4">
        <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-1">
          LinkOps
        </div>
        <h1 className="text-2xl font-black text-slate-100 tracking-tight">
          Link<span className="text-emerald-400">Ops</span>
        </h1>

        {/* Paul Status */}
        <div className="mt-3 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-xs font-bold text-black flex-shrink-0">
            P
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black text-emerald-400">Paul</div>
            <div className="text-xs font-mono text-slate-400">Active</div>
          </div>
          <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse"></div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-4">
          <div className="text-xs font-mono uppercase tracking-widest text-slate-600 px-2 mb-2">
            Menu
          </div>
          {navItems.map((item) => (
            <a
              key={item.label}
              href="#"
              className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-bold text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors mb-1"
            >
              <span className="text-lg">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.count !== undefined && (
                <span className="font-mono text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400">
                  {item.count}
                </span>
              )}
            </a>
          ))}
        </div>
      </nav>

      {/* Sync Button */}
      <div className="px-2 pb-3">
        <button className="w-full flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-all">
          <span className="text-sm">🔄</span>
          <span>Sync Now</span>
        </button>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-700 px-4 py-3 text-xs font-mono text-slate-600 leading-relaxed">
        <div>Last synced:</div>
        <div className="text-slate-500">Just now</div>
      </div>
    </aside>
  );
}
