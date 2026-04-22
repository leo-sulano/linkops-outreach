import { useState } from 'react';
import { Contact } from './types';
import { ContactTableRow } from './ContactTableRow';
import { ExpandedRowDetail } from './ExpandedRowDetail';

interface ContactTableProps {
  contacts: Contact[];
  onUpdateContact: (contact: Contact) => void;
  onDeleteContact: (contactId: string) => void;
}

export function ContactTable({
  contacts,
  onUpdateContact,
  onDeleteContact,
}: ContactTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (contacts.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-8 text-center text-slate-400 text-sm">
        No contacts found
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-900/50 border-b border-slate-700">
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Domain
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Niche
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Primary Email
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Standard Price
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Gambling Price
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Date Confirmed
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {contacts.map((contact) => (
            <div key={contact.id} className="contents">
              <ContactTableRow
                contact={contact}
                isExpanded={expandedId === contact.id}
                onClick={() =>
                  setExpandedId(
                    expandedId === contact.id ? null : contact.id
                  )
                }
              />
              {expandedId === contact.id && (
                <ExpandedRowDetail
                  contact={contact}
                  onSave={onUpdateContact}
                  onDelete={() => {
                    onDeleteContact(contact.id);
                    setExpandedId(null);
                  }}
                />
              )}
            </div>
          ))}
        </tbody>
      </table>
    </div>
  );
}
