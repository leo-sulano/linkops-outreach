import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Contact } from './types';
import { ContactTable } from './ContactTable';

interface AllContactsModalProps {
  contacts: Contact[];
  onUpdateContact: (contact: Contact) => Promise<void>;
  onDeleteContact: (contactId: string) => void;
  onClose: () => void;
}

export function AllContactsModal({
  contacts,
  onUpdateContact,
  onDeleteContact,
  onClose,
}: AllContactsModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-[95vw] h-[95vh] bg-slate-900 border border-slate-700 rounded-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-100">All Contacts</h2>
            <span className="font-mono text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
              {contacts.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          <ContactTable
            contacts={contacts}
            onUpdateContact={onUpdateContact}
            onDeleteContact={onDeleteContact}
            stage="all"
          />
        </div>
      </div>
    </div>
  );
}
