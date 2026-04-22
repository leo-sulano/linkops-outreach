import { useState } from 'react';
import { Contact } from './types';

interface ExpandedRowDetailProps {
  contact: Contact;
  onSave: (updatedContact: Contact) => void;
  onDelete: () => void;
}

export function ExpandedRowDetail({
  contact,
  onSave,
  onDelete,
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
      <td colSpan={7} className="px-4 py-6 bg-slate-800/50 border-t border-slate-700">
        <div className="grid grid-cols-2 gap-8">
          {/* Contact Section */}
          <div>
            <h3 className="text-sm font-bold text-slate-200 mb-4 uppercase tracking-widest">
              Contact Information
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Email 1
                </label>
                <input
                  type="email"
                  value={edited.email1}
                  onChange={(e) => handleFieldChange('email1', e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Name 1
                </label>
                <input
                  type="text"
                  value={edited.name1}
                  onChange={(e) => handleFieldChange('name1', e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Email 2
                </label>
                <input
                  type="email"
                  value={edited.email2 || ''}
                  onChange={(e) => handleFieldChange('email2', e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Name 2
                </label>
                <input
                  type="text"
                  value={edited.name2 || ''}
                  onChange={(e) => handleFieldChange('name2', e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          {/* Pricing Section */}
          <div>
            <h3 className="text-sm font-bold text-slate-200 mb-4 uppercase tracking-widest">
              Pricing (EUR)
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Standard Price
                </label>
                <input
                  type="number"
                  value={edited.standardPrice}
                  onChange={(e) =>
                    handleFieldChange('standardPrice', Number(e.target.value))
                  }
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Gambling Price
                </label>
                <input
                  type="number"
                  value={edited.gamblingPrice}
                  onChange={(e) =>
                    handleFieldChange('gamblingPrice', Number(e.target.value))
                  }
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Negotiated Price
                </label>
                <input
                  type="number"
                  value={edited.negotiatedPrice || ''}
                  onChange={(e) =>
                    handleFieldChange('negotiatedPrice', Number(e.target.value) || undefined)
                  }
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          {/* Preferences Section */}
          <div>
            <h3 className="text-sm font-bold text-slate-200 mb-4 uppercase tracking-widest">
              Preferences
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={edited.acceptCasino}
                  onChange={(e) =>
                    handleFieldChange('acceptCasino', e.target.checked)
                  }
                  className="w-4 h-4 bg-slate-700 border border-slate-600 rounded"
                />
                <span className="text-sm text-slate-300">Accept Casino</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={edited.acceptBetting}
                  onChange={(e) =>
                    handleFieldChange('acceptBetting', e.target.checked)
                  }
                  className="w-4 h-4 bg-slate-700 border border-slate-600 rounded"
                />
                <span className="text-sm text-slate-300">Accept Betting</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={edited.sponsored}
                  onChange={(e) => handleFieldChange('sponsored', e.target.checked)}
                  className="w-4 h-4 bg-slate-700 border border-slate-600 rounded"
                />
                <span className="text-sm text-slate-300">Sponsored</span>
              </label>
            </div>
          </div>

          {/* Status & Confirmation Section */}
          <div>
            <h3 className="text-sm font-bold text-slate-200 mb-4 uppercase tracking-widest">
              Status & Confirmation
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Status
                </label>
                <select
                  value={edited.status}
                  onChange={(e) =>
                    handleFieldChange(
                      'status',
                      e.target.value as Contact['status']
                    )
                  }
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="negotiation">Negotiation</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="no_deal">No Deal</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Reply
                </label>
                <select
                  value={edited.reply}
                  onChange={(e) =>
                    handleFieldChange('reply', e.target.value as Contact['reply'])
                  }
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
                >
                  <option value="pending">Pending</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Date Confirmed
                </label>
                <input
                  type="date"
                  value={edited.dateConfirmed || ''}
                  onChange={(e) =>
                    handleFieldChange('dateConfirmed', e.target.value || undefined)
                  }
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Notes Section */}
          <div className="col-span-2">
            <h3 className="text-sm font-bold text-slate-200 mb-4 uppercase tracking-widest">
              Notes
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">
                  Content Guidelines
                </label>
                <textarea
                  value={edited.contentGuidelines}
                  onChange={(e) =>
                    handleFieldChange('contentGuidelines', e.target.value)
                  }
                  className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 h-20 resize-none"
                />
              </div>
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
