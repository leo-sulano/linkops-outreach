import React, { useState } from 'react';
import { Contact } from './types';
import { ContactTableRow } from './ContactTableRow';
import { ExpandedRowDetail } from './ExpandedRowDetail';

interface ContactTableProps {
  contacts: Contact[];
  onUpdateContact: (contact: Contact) => void;
  onDeleteContact: (contactId: string) => void;
  stage?: string;
}

export function ContactTable({
  contacts,
  onUpdateContact,
  onDeleteContact,
  stage = 'all',
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
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-x-auto">
      <table className="w-full min-w-max">
        <thead>
          <tr className="bg-slate-900/50 border-b border-slate-700">
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Domain</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">DR</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Niche</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Email</th>
            {stage === 'send-followup' && (
              <>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Outreach Date</th>
              </>
            )}
            {stage !== 'start-outreach' && stage !== 'send-followup' && (
              <>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Website</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Price</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">TAT</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Link Type</th>
                {stage === 'negotiated' && (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Notes</th>
                    <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Content Guideline</th>
                  </>
                )}
                {stage !== 'negotiated' && (
                  <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Sender</th>
                )}
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {contacts.map((contact) => (
            <React.Fragment key={contact.id}>
              <ContactTableRow
                contact={contact}
                isExpanded={expandedId === contact.id}
                onClick={() =>
                  setExpandedId(
                    expandedId === contact.id ? null : contact.id
                  )
                }
                stage={stage}
              />
              {expandedId === contact.id && (
                <ExpandedRowDetail
                  contact={contact}
                  onSave={onUpdateContact}
                  onDelete={() => {
                    onDeleteContact(contact.id);
                    setExpandedId(null);
                  }}
                  colSpan={stage === 'start-outreach' ? 4 : stage === 'send-followup' ? 7 : stage === 'negotiated' ? 12 : 11}
                />
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
