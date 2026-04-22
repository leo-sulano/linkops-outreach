interface StatsCardProps {
  label: string;
  value: number | string;
  trend?: string; // e.g., "+5 this week"
}

export function StatsCard({ label, value, trend }: StatsCardProps) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors">
      <div className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-2">
        {label}
      </div>
      <div className="text-3xl font-bold text-slate-100 tracking-tight">
        {value}
      </div>
      {trend && (
        <div className="text-xs text-slate-500 font-mono mt-2">
          {trend}
        </div>
      )}
    </div>
  );
}
