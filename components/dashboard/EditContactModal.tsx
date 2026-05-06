import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Contact, STATUS_LABELS } from './types';
import { deriveStatus, MANUAL_PIPELINE_STAGES } from '@/lib/utils/deriveStatus';

interface EditContactModalProps {
  contact: Contact | null;
  onClose: () => void;
  onSave: (contact: Contact) => Promise<void>;
  onDelete: (id: string) => void;
}

export function EditContactModal({ contact, onClose, onSave, onDelete }: EditContactModalProps) {
  const [edited, setEdited] = useState<Contact | null>(() => contact ? { ...contact } : null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!contact || !edited) return null;

  const set = (field: keyof Contact, value: any) =>
    setEdited(prev => prev ? { ...prev, [field]: value } : prev);

  const handleSave = async () => {
    if (!edited) return;
    setSaving(true);
    await onSave(edited);
    setSaving(false);
    onClose();
  };

  const handleDelete = () => {
    if (window.confirm(`Delete ${contact.domain}? This cannot be undone.`)) {
      onDelete(contact.id);
      onClose();
    }
  };

  const inputCls = 'w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500';
  const readCls = 'w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-400';
  const labelCls = 'block text-xs font-mono text-slate-500 mb-1';

  const effectiveStatus = deriveStatus(edited);
  const isManualStage = MANUAL_PIPELINE_STAGES.includes(edited.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 flex-shrink-0">
          <div>
            <h2 className="text-lg font-black text-slate-100">{contact.domain}</h2>
            <p className="text-xs font-mono text-slate-500 mt-0.5">{contact.niche}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-100 transition-colors rounded-lg hover:bg-slate-800">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6">
          <div className="grid grid-cols-2 gap-6">

            {/* Contact Info */}
            <div className="space-y-3">
              <h3 className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-3">Contact Info</h3>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelCls}>Domain</label>
                  <div className={readCls}>{edited.domain}</div>
                </div>
                <div className="w-20">
                  <label className={labelCls}>DR</label>
                  <div className={`${readCls} text-center font-bold`}>{edited.dr ?? '—'}</div>
                </div>
              </div>
              <div>
                <label className={labelCls}>Contact Name</label>
                <input className={inputCls} value={edited.contact} onChange={e => set('contact', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" className={inputCls} value={edited.email} onChange={e => set('email', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Niche</label>
                <input className={inputCls} value={edited.niche} onChange={e => set('niche', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Website</label>
                <input type="url" className={inputCls} value={edited.website || ''} onChange={e => set('website', e.target.value)} />
              </div>
            </div>

            {/* Pipeline Status */}
            <div className="space-y-3">
              <h3 className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-3">Pipeline Status</h3>
              <div>
                <label className={labelCls}>Current Stage</label>
                <div className={`${readCls} font-mono`}>{STATUS_LABELS[effectiveStatus]}</div>
              </div>
              <div>
                <label className={labelCls}>Advance Stage</label>
                <select
                  className={inputCls}
                  value={isManualStage ? edited.status : ''}
                  onChange={e => set('status', e.target.value || 'start_outreach')}
                >
                  <option value="">— Auto (based on dates) —</option>
                  {MANUAL_PIPELINE_STAGES.map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Outreach Date</label>
                <input type="date" className={inputCls} value={edited.outreachDate || ''} onChange={e => set('outreachDate', e.target.value || undefined)} />
              </div>
              <div>
                <label className={labelCls}>Follow-up Date</label>
                <input type="date" className={inputCls} value={edited.followupDate || ''} onChange={e => set('followupDate', e.target.value || undefined)} />
              </div>
              <div>
                <label className={labelCls}>Response Date</label>
                <input type="date" className={inputCls} value={edited.responseDate || ''} onChange={e => set('responseDate', e.target.value || undefined)} />
              </div>
            </div>

            {/* Deal Terms */}
            <div className="space-y-3">
              <h3 className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-3">Deal Terms</h3>
              <div>
                <label className={labelCls}>Price (EUR)</label>
                <input type="number" className={inputCls} value={edited.price || ''} onChange={e => set('price', e.target.value ? Number(e.target.value) : undefined)} placeholder="Optional" />
              </div>
              <div>
                <label className={labelCls}>TAT</label>
                <input className={inputCls} value={edited.tat || ''} onChange={e => set('tat', e.target.value || undefined)} placeholder="e.g. 5 days" />
              </div>
              <div>
                <label className={labelCls}>Link Type</label>
                <input className={inputCls} value={edited.linkType || ''} onChange={e => set('linkType', e.target.value)} placeholder="e.g. Dofollow, Guest Post" />
              </div>
            </div>

            {/* Placement */}
            <div className="space-y-3">
              <h3 className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-3">Placement</h3>
              <div>
                <label className={labelCls}>Publish Date</label>
                <input type="date" className={inputCls} value={edited.publishDate || ''} onChange={e => set('publishDate', e.target.value || undefined)} />
              </div>
              <div>
                <label className={labelCls}>Live URL</label>
                <input type="url" className={inputCls} value={edited.liveUrl || ''} onChange={e => set('liveUrl', e.target.value || undefined)} placeholder="https://..." />
              </div>
              <div>
                <label className={labelCls}>Payment Status</label>
                <select className={inputCls} value={edited.paymentStatus || ''} onChange={e => set('paymentStatus', e.target.value || undefined)}>
                  <option value="">— None —</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="invoiced">Invoiced</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
            </div>

            {/* Site Details (read-only) */}
            <div className="space-y-3">
              <h3 className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-3">Site Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Traffic</label>
                  <div className={readCls}>{edited.traffic?.toLocaleString() ?? '—'}</div>
                </div>
                <div>
                  <label className={labelCls}>Top Country</label>
                  <div className={`${readCls} uppercase`}>{edited.topCountry ?? '—'}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Market</label>
                  <div className={readCls}>{edited.market ?? '—'}</div>
                </div>
                <div>
                  <label className={labelCls}>Language</label>
                  <div className={readCls}>{edited.language ?? '—'}</div>
                </div>
              </div>
              <div>
                <label className={labelCls}>Micro Niche</label>
                <div className={readCls}>{edited.microNiche ?? '—'}</div>
              </div>
              {edited.qaFailReason && (
                <div>
                  <label className={labelCls}>QA Fail Reason</label>
                  <div className="w-full bg-red-500/10 border border-red-500/20 rounded px-3 py-2 text-sm text-red-400">{edited.qaFailReason}</div>
                </div>
              )}
            </div>

            {/* Acceptance */}
            <div className="space-y-3">
              <h3 className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-3">Acceptance</h3>
              <div className="flex flex-wrap gap-2">
                {([['Casino', 'acceptCasino'], ['Betting', 'acceptBetting'], ['Link Insert', 'linkInsert'], ['Sponsored', 'sponsored']] as [string, keyof Contact][]).map(([label, key]) => (
                  <span key={key} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono border ${
                    edited[key] === true ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : edited[key] === false ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : 'bg-slate-700 text-slate-500 border-slate-600'
                  }`}>
                    {label}: {edited[key] === true ? 'Yes' : edited[key] === false ? 'No' : '—'}
                  </span>
                ))}
              </div>
              {(edited.originalCost || edited.originalCurrency) && (
                <div>
                  <label className={labelCls}>Original Price</label>
                  <div className={`${readCls} font-mono`}>{edited.originalCurrency} {edited.originalCost ?? '—'}</div>
                </div>
              )}
            </div>

            {/* Notes (full width) */}
            <div className="col-span-2 space-y-3">
              <h3 className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-3">Notes</h3>
              <div>
                <label className={labelCls}>Notes</label>
                <textarea className={`${inputCls} h-20 resize-none`} value={edited.notes || ''} onChange={e => set('notes', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Content Guideline</label>
                <textarea className={`${inputCls} h-20 resize-none`} value={edited.contentGuideline || ''} onChange={e => set('contentGuideline', e.target.value || undefined)} placeholder="e.g. 800+ words, 2 dofollow links…" />
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-700 flex-shrink-0 flex-wrap">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-500 disabled:opacity-60 transition-colors text-sm"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-slate-700 text-slate-100 font-bold rounded-lg hover:bg-slate-600 transition-colors text-sm">
            Cancel
          </button>
          {effectiveStatus === 'response_received' && (
            <button
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                await onSave({ ...edited, status: 'under_negotiation' })
                setSaving(false)
                onClose()
              }}
              className="px-4 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-500 disabled:opacity-60 transition-colors text-sm"
            >
              Start Negotiation
            </button>
          )}
          {effectiveStatus === 'under_negotiation' && (
            <button
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                await onSave({ ...edited, status: 'negotiated' })
                setSaving(false)
                onClose()
              }}
              className="px-4 py-2 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-500 disabled:opacity-60 transition-colors text-sm"
            >
              Mark as Negotiated
            </button>
          )}
          <button onClick={handleDelete} className="px-4 py-2 bg-red-600/20 text-red-400 font-bold rounded-lg hover:bg-red-600/30 transition-colors text-sm border border-red-500/20 ml-auto">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
