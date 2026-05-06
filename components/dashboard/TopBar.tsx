import { RefreshCw, Loader2, Send, Reply } from 'lucide-react';

interface TopBarProps {
  onRefresh: () => void;
  isLoading?: boolean;
  onSendCampaign: () => void;
  onSendFollowup: () => void;
  followupCount?: number;
}

export function TopBar({ onRefresh, isLoading = false, onSendCampaign, onSendFollowup, followupCount = 0 }: TopBarProps) {
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
        {followupCount > 0 && (
          <button
            onClick={onSendFollowup}
            className="relative flex items-center gap-2 px-4 py-2 border border-amber-500/50 text-amber-400 font-bold rounded-lg hover:bg-amber-500/10 transition-colors text-sm"
          >
            <Reply size={15} />
            Send Follow-up
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-black text-[10px] font-black px-1">
              {followupCount}
            </span>
          </button>
        )}
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
