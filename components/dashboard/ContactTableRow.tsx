import { Contact } from './types';

interface ContactTableRowProps {
  contact: Contact;
  isExpanded: boolean;
  onClick: () => void;
}

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    pending: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    confirmed: 'bg-green-500/10 text-green-400 border border-green-500/20',
    no_deal: 'bg-red-500/10 text-red-400 border border-red-500/20',
    negotiation: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    follow_up: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  };
  return colors[status] || colors.pending;
}

export function ContactTableRow({
  contact,
  isExpanded,
  onClick,
}: ContactTableRowProps) {
  const statusLabel =
    contact.status.charAt(0).toUpperCase() +
    contact.status.slice(1).replace('_', ' ');

  return (
    <tr
      onClick={onClick}
      className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${
        isExpanded ? 'bg-slate-800/30' : ''
      }`}
    >
      <td className="px-4 py-3 text-sm font-semibold text-slate-100">
        {contact.domain}
      </td>
      <td className="px-4 py-3 text-sm text-slate-300">{contact.niche}</td>
      <td className="px-4 py-3 text-sm">
        <span
          className={`inline-flex px-3 py-1 rounded-full text-xs font-mono ${getStatusColor(
            contact.status
          )}`}
        >
          {statusLabel}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-300">{contact.email1}</td>
      <td className="px-4 py-3 text-sm font-semibold text-slate-100">
        €{contact.standardPrice}
      </td>
      <td className="px-4 py-3 text-sm font-semibold text-slate-100">
        €{contact.gamblingPrice}
      </td>
      <td className="px-4 py-3 text-sm text-slate-400">
        {contact.dateConfirmed ? (
          new Date(contact.dateConfirmed).toLocaleDateString()
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
    </tr>
  );
}
