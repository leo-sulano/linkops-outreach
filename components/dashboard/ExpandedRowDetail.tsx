import { useState } from 'react';
import { Contact, STATUS_LABELS } from './types';

interface ExpandedRowDetailProps {
  contact: Contact;
  onSave: (updatedContact: Contact) => void;
  onDelete: () => void;
  colSpan?: number;
}

export function ExpandedRowDetail({
  contact,
  onSave,
  onDelete,
  colSpan = 9,
}: ExpandedRowDetailProps) {
  const [edited, setEdited] = useState(contact);
  const [isEditing, setIsEditing] = useState(false);

  const handleFieldChange = (field: keyof Contact, value: any) => {
    setEdited({ ...edited, [field]: value });
    setIsEditing(true);
  };

  const handleSave = () => {
    onSave(edited);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEdited(contact);
    setIsEditing(false);
  };

  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-6 bg-slate-800/50 border-t border-slate-700">
        <div className="grid grid-cols-2 gap-8">
          {/* Contact Info Section */}
          <div>
            <h3 className="text-sm font-bold text-slate-200 mb-4 uppercase tracking-widest">
              Contact Information
            </h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-mono text-slate-500 mb-1">
                    Domain
                  </label>
                  <div className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-400">
                    {edited.domain}
                  </div>
                </div>
                <div className="w-20">
                  <label className="block text-xs font-mono text-slate-500 mb-1">
                    DR
                  </label>
                  <div className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-400 text-center font-bold">
                    {edited.dr ?? '—'}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Website
                </label>
                <input
                  type="url"
                  value={edited.website}
                  onChange={(e) => handleFieldChange('website', e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Niche
                </label>
                <input
                  type="text"
                  value={edited.niche}
                  onChange={(e) => handleFieldChange('niche', e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={edited.contact}
                  onChange={(e) => handleFieldChange('contact', e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={edited.email}
                  onChange={(e) => handleFieldChange('email', e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
                />
              </div>
            </div>
          </div>

          {/* Deal Terms Section */}
          <div>
            <h3 className="text-sm font-bold text-slate-200 mb-4 uppercase tracking-widest">
              Deal Terms
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Price (EUR)
                </label>
                <input
                  type="number"
                  value={edited.price || ''}
                  onChange={(e) =>
                    handleFieldChange('price', e.target.value ? Number(e.target.value) : undefined)
                  }
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  TAT (Turnaround Time)
                </label>
                <input
                  type="text"
                  value={edited.tat || ''}
                  onChange={(e) => handleFieldChange('tat', e.target.value || undefined)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
                  placeholder="e.g., 5 days"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Link Type
                </label>
                <input
                  type="text"
                  value={edited.linkType}
                  onChange={(e) => handleFieldChange('linkType', e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
                  placeholder="e.g., Dofollow, Guest Post"
                />
              </div>
            </div>
          </div>

          {/* Pipeline Status Section */}
          <div>
            <h3 className="text-sm font-bold text-slate-200 mb-4 uppercase tracking-widest">
              Pipeline Status
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Status
                </label>
                <select
                  value={edited.status}
                  onChange={(e) => handleFieldChange('status', e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
                >
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Outreach Date
                </label>
                <input
                  type="date"
                  value={edited.outreachDate || ''}
                  onChange={(e) =>
                    handleFieldChange('outreachDate', e.target.value || undefined)
                  }
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Follow-up Date
                </label>
                <input
                  type="date"
                  value={edited.followupDate || ''}
                  onChange={(e) =>
                    handleFieldChange('followupDate', e.target.value || undefined)
                  }
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Response Date
                </label>
                <input
                  type="date"
                  value={edited.responseDate || ''}
                  onChange={(e) =>
                    handleFieldChange('responseDate', e.target.value || undefined)
                  }
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Placement Section */}
          <div>
            <h3 className="text-sm font-bold text-slate-200 mb-4 uppercase tracking-widest">
              Placement
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Publish Date
                </label>
                <input
                  type="date"
                  value={edited.publishDate || ''}
                  onChange={(e) =>
                    handleFieldChange('publishDate', e.target.value || undefined)
                  }
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Live URL
                </label>
                <input
                  type="url"
                  value={edited.liveUrl || ''}
                  onChange={(e) =>
                    handleFieldChange('liveUrl', e.target.value || undefined)
                  }
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
                  placeholder="e.g., https://..."
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Payment Status
                </label>
                <select
                  value={edited.paymentStatus || ''}
                  onChange={(e) =>
                    handleFieldChange(
                      'paymentStatus',
                      e.target.value as 'unpaid' | 'invoiced' | 'paid' | undefined
                    )
                  }
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
                >
                  <option value="">— None —</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="invoiced">Invoiced</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
            </div>
          </div>

          {/* Notes Section (full width) */}
          <div className="col-span-2">
            <h3 className="text-sm font-bold text-slate-200 mb-4 uppercase tracking-widest">
              Notes
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Notes
                </label>
                <textarea
                  value={edited.notes}
                  onChange={(e) => handleFieldChange('notes', e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 h-20 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Content Guideline
                </label>
                <textarea
                  value={edited.contentGuideline || ''}
                  onChange={(e) => handleFieldChange('contentGuideline', e.target.value || undefined)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 h-24 resize-none"
                  placeholder="e.g. 800+ words, 2 dofollow links, no competitor mentions…"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-6">
          {isEditing && (
            <>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-500 transition-colors text-sm"
              >
                Save Changes
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-slate-700 text-slate-100 font-bold rounded-lg hover:bg-slate-600 transition-colors text-sm"
              >
                Cancel
              </button>
            </>
          )}
          {contact.status === 'under_negotiation' && !isEditing && (
            <button
              onClick={() => {
                onSave({ ...contact, status: 'negotiated' });
              }}
              className="px-4 py-2 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-500 transition-colors text-sm"
            >
              Agreed — Mark as Negotiated
            </button>
          )}
          <button
            onClick={() => {
              if (
                window.confirm(
                  `Delete ${contact.domain}? This cannot be undone.`
                )
              ) {
                onDelete();
              }
            }}
            className="px-4 py-2 bg-red-600/20 text-red-400 font-bold rounded-lg hover:bg-red-600/30 transition-colors text-sm border border-red-500/20 ml-auto"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
