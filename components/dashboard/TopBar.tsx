import { RefreshCw, Loader2, Send } from 'lucide-react';

interface TopBarProps {
  onRefresh: () => void;
  isLoading?: boolean;
  onSendCampaign: () => void;
}

export function TopBar({ onRefresh, isLoading = false, onSendCampaign }: TopBarProps) {
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
          onClick={onSendCampaign}
          className="flex items-center gap-2 px-4 py-2 border border-emerald-500/50 text-emerald-400 font-bold rounded-lg hover:bg-emerald-500/10 transition-colors text-sm"
        >
          <Send size={15} />
          Send Campaign
        </button>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-100 font-bold rounded-lg hover:bg-slate-600 disabled:bg-slate-600 disabled:opacity-60 transition-colors text-sm"
        >
          {isLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {isLoading ? 'Syncing...' : 'Sync Sheet'}
        </button>
      </div>
    </div>
  );
}
