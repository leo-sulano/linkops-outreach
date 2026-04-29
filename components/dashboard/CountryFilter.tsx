interface CountryFilterProps {
  countries: string[];
  selected: string | null;
  onSelect: (country: string | null) => void;
}

export function CountryFilter({ countries, selected, onSelect }: CountryFilterProps) {
  if (countries.length === 0) return null;

  return (
    <select
      value={selected ?? ''}
      onChange={(e) => onSelect(e.target.value || null)}
      className="bg-slate-800 border border-slate-600 text-slate-300 text-xs font-bold rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer"
    >
      <option value="">All Countries</option>
      {countries.map(country => (
        <option key={country} value={country}>{country}</option>
      ))}
    </select>
  );
}
