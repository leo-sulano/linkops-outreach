import { ChevronDown } from 'lucide-react';

interface CountryFilterProps {
  countries: string[];
  selected: string | null;
  onSelect: (country: string | null) => void;
}

export function CountryFilter({ countries, selected, onSelect }: CountryFilterProps) {
  if (countries.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => onSelect(null)}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
          selected === null
            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
            : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500 hover:text-slate-300'
        }`}
      >
        All
      </button>
      {countries.map(country => (
        <button
          key={country}
          onClick={() => onSelect(selected === country ? null : country)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
            selected === country
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
              : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500 hover:text-slate-300'
          }`}
        >
          {country}
          <ChevronDown size={11} />
        </button>
      ))}
    </div>
  );
}
