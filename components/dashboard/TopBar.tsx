interface TopBarProps {
  onStartOutreach: () => void;
  onRefresh: () => void;
}

export function TopBar({ onStartOutreach, onRefresh }: TopBarProps) {
  return (
    <div className="bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
      <div className="min-w-0">
        <h1 className="text-xl font-black text-slate-100 tracking-tight">
          Domains
        </h1>
        <p className="text-xs font-mono text-slate-500 mt-1">
          Manage your outreach contacts
        </p>
      </div>

      <div className="flex gap-3 flex-shrink-0">
        <button
          onClick={onStartOutreach}
          className="px-4 py-2 bg-emerald-500 text-black font-black rounded-lg hover:bg-emerald-400 transition-colors text-sm"
        >
          🚀 START OUTREACH
        </button>
        <button
          onClick={onRefresh}
          className="px-4 py-2 bg-slate-700 text-slate-100 font-bold rounded-lg hover:bg-slate-600 transition-colors text-sm"
        >
          🔄 Refresh
        </button>
      </div>
    </div>
  );
}
