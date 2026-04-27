import React from 'react';
import { Contact, STATUS_COLORS, STATUS_LABELS } from './types';

interface ContactTableRowProps {
  contact: Contact;
  isExpanded: boolean;
  onClick: () => void;
  stage?: string;
}

function isDueForFollowup(contact: Contact): boolean {
  if (contact.status !== 'outreach_sent' || !contact.outreachDate) return false;
  const daysSince = (Date.now() - new Date(contact.outreachDate).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= 2;
}

export function ContactTableRow({
  contact,
  isExpanded,
  onClick,
  stage = 'all',
}: ContactTableRowProps) {
  return (
    <tr
      onClick={onClick}
      className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${
        isExpanded ? 'bg-slate-800/30' : ''
      }`}
    >
      <td className="px-4 py-3 text-sm font-semibold text-slate-100">{contact.domain}</td>
      <td className="px-4 py-3 text-sm text-center">
        {contact.dr !== undefined ? (
          <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-slate-700 text-slate-200">
            {contact.dr}
          </span>
        ) : '—'}
      </td>
      <td className="px-4 py-3 text-sm text-slate-300">{contact.niche}</td>
      <td className="px-4 py-3 text-sm text-slate-300">{contact.email}</td>

      {stage === 'send-followup' && (
        <>
          <td className="px-4 py-3 text-sm text-slate-300">{contact.contact || '—'}</td>
          <td className="px-4 py-3 text-sm">
            <div className="flex items-center gap-2">
              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-mono ${STATUS_COLORS[contact.status]}`}>
                {STATUS_LABELS[contact.status]}
              </span>
              {isDueForFollowup(contact) && (
                <span className="inline-flex px-2 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                  Due
                </span>
              )}
            </div>
          </td>
          <td className="px-4 py-3 text-sm text-slate-400">
            {contact.outreachDate ? new Date(contact.outreachDate).toLocaleDateString() : '—'}
          </td>
        </>
      )}

      {stage !== 'start-outreach' && stage !== 'send-followup' && (
        <>
          <td className="px-4 py-3 text-sm text-slate-300">
            {contact.website ? (
              <a
                href={contact.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
                onClick={(e) => e.stopPropagation()}
              >
                {contact.website}
              </a>
            ) : '—'}
          </td>
          <td className="px-4 py-3 text-sm text-slate-300">{contact.contact || '—'}</td>
          <td className="px-4 py-3 text-sm">
            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-mono ${STATUS_COLORS[contact.status]}`}>
              {STATUS_LABELS[contact.status]}
            </span>
          </td>
          <td className="px-4 py-3 text-sm font-semibold text-slate-100">
            {contact.price ? `€${contact.price}` : '—'}
          </td>
          <td className="px-4 py-3 text-sm text-slate-300">{contact.tat || '—'}</td>
          <td className="px-4 py-3 text-sm text-slate-300">{contact.linkType || '—'}</td>
          {stage === 'negotiated' && (
            <>
              <td className="px-4 py-3 text-sm text-slate-300 max-w-xs">
                <span className="line-clamp-2">{contact.notes || '—'}</span>
              </td>
              <td className="px-4 py-3 text-sm text-slate-300 max-w-xs">
                <span className="line-clamp-2">{contact.contentGuideline || '—'}</span>
              </td>
            </>
          )}
        </>
      )}
    </tr>
  );
}
