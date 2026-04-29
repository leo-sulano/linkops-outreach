import React, { useState } from 'react';
import { Contact } from './types';
import { ContactTableRow } from './ContactTableRow';
import { EditContactModal } from './EditContactModal';

interface ContactTableProps {
  contacts: Contact[];
  onUpdateContact: (contact: Contact) => Promise<void>;
  onDeleteContact: (contactId: string) => void;
  stage?: string;
}

export function ContactTable({
  contacts,
  onUpdateContact,
  onDeleteContact,
  stage = 'all',
}: ContactTableProps) {
  const [modalContact, setModalContact] = useState<Contact | null>(null);

  if (contacts.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-8 text-center text-slate-400 text-sm">
        No contacts found
      </div>
    );
  }

  return (
    <>
      <EditContactModal
        key={modalContact?.id ?? 'none'}
        contact={modalContact}
        onClose={() => setModalContact(null)}
        onSave={async (updated) => {
          await onUpdateContact(updated);
          setModalContact(null);
        }}
        onDelete={(id) => {
          onDeleteContact(id);
          setModalContact(null);
        }}
      />
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-x-auto">
        <table className="w-full min-w-max">
          <thead>
            <tr className="bg-slate-900/50 border-b border-slate-700">
              <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Domain</th>
              <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">DR</th>
              <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">Traffic</th>
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
              <ContactTableRow
                key={contact.id}
                contact={contact}
                onClick={() => setModalContact(contact)}
                stage={stage}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
