import React, { useState } from 'react';
import { Contact } from './types';
import { usePaulQualify } from '@/lib/hooks/usePaul';

interface ContactTableRowProps {
  contact: Contact;
  isExpanded: boolean;
  onClick: () => void;
  onQualify?: (contactId: string, score: any) => void;
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

function getCategoryColor(category?: string) {
  const colors: Record<string, string> = {
    reject: 'bg-red-500/20 text-red-300',
    standard: 'bg-blue-500/20 text-blue-300',
    warm: 'bg-amber-500/20 text-amber-300',
    premium: 'bg-emerald-500/20 text-emerald-300',
  };
  return colors[category || 'standard'] || colors.standard;
}

export function ContactTableRow({
  contact,
  isExpanded,
  onClick,
  onQualify,
}: ContactTableRowProps) {
  const { qualify, loading: qualifyLoading } = usePaulQualify();
  const statusLabel =
    contact.status.charAt(0).toUpperCase() +
    contact.status.slice(1).replace('_', ' ');

  const handleQualify = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const result = await qualify({
        domain: contact.domain,
        domainAuthority: 50, // Mock value - Phase 2: real DA lookup
        trafficPercentile: 50, // Mock value - Phase 2: real traffic lookup
        niches: [contact.niche],
        isSpam: false,
        niche: contact.niche
      });
      onQualify?.(contact.id, result);
    } catch (error) {
      console.error('Qualification failed:', error);
    }
  };

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
      <td className="px-4 py-3 text-sm">
        {contact.qualificationScore !== undefined ? (
          <div className="flex items-center gap-2">
            <span
              className={`inline-block px-2 py-1 rounded text-xs font-bold ${getCategoryColor(
                contact.qualificationCategory
              )}`}
            >
              {contact.qualificationCategory?.toUpperCase()}
            </span>
            <span className="text-xs text-slate-400">
              {contact.qualificationScore}
            </span>
          </div>
        ) : (
          <button
            onClick={handleQualify}
            disabled={qualifyLoading}
            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-xs rounded text-white font-medium transition-colors"
          >
            {qualifyLoading ? 'Scoring...' : 'Qualify'}
          </button>
        )}
      </td>
    </tr>
  );
}
