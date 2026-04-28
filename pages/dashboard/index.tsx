'use client';

import { useState, useMemo, useEffect } from 'react';
import { Contact, DashboardMetrics, NavCounts, PipelineStatus, STATUS_LABELS } from '@/components/dashboard/types';
import { isDueForFollowup } from '@/lib/utils/followup';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { TopBar } from '@/components/dashboard/TopBar';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { ContactTable } from '@/components/dashboard/ContactTable';

const CACHE_KEY = 'linkops_contacts';

const STAGE_TO_STATUS: Record<string, PipelineStatus | null> = {
  all: null,
  'start-outreach': 'start_outreach',
  'outreach-sent': 'outreach_sent',
  'send-followup': 'send_followup',
  'response-received': 'response_received',
  'under-negotiation': 'under_negotiation',
  'negotiated': 'negotiated',
  'approved': 'approved',
  'payment-sent': 'payment_sent',
  'live': 'live',
};

const STAGE_LABELS: Record<string, string> = {
  all: 'All Contacts',
  'start-outreach': 'Start Outreach',
  'outreach-sent': 'Outreach Sent',
  'send-followup': 'Send Follow-up',
  'response-received': 'Response Received',
  'under-negotiation': 'Under Negotiation',
  'negotiated': 'Negotiated',
  'approved': 'Approved',
  'payment-sent': 'Payment Sent',
  'live': 'Live',
};

function loadCached(): Contact[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCache(contacts: Contact[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(contacts));
  } catch {
    // Storage full or unavailable — non-fatal
  }
}

export default function DashboardPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  // Calculate metrics
  const metrics: DashboardMetrics = useMemo(() => {
    const total = contacts.length;

    const RESPONDED_STATUSES: PipelineStatus[] = [
      'response_received',
      'under_negotiation',
      'negotiated',
      'approved',
      'payment_sent',
      'live',
    ];

    const APPROVED_STATUSES: PipelineStatus[] = [
      'approved',
      'payment_sent',
      'live',
    ];

    const totalResponses = contacts.filter(c =>
      RESPONDED_STATUSES.includes(c.status)
    ).length;

    const totalApproved = contacts.filter(c =>
      APPROVED_STATUSES.includes(c.status)
    ).length;

    const conversionRate = total > 0
      ? Math.round((totalApproved / total) * 100)
      : 0;

    return { totalOutreach: total, totalResponses, totalApproved, conversionRate };
  }, [contacts]);

  // Calculate nav counts
  const navCounts: NavCounts = useMemo(() => ({
    all: contacts.length,
    startOutreach: contacts.filter(c => c.status === 'start_outreach').length,
    outreachSent: contacts.filter(c => c.status === 'outreach_sent').length,
    sendFollowup: contacts.filter(c => c.status === 'send_followup' || isDueForFollowup(c)).length,
    responseReceived: contacts.filter(c => c.status === 'response_received').length,
    underNegotiation: contacts.filter(c => c.status === 'under_negotiation').length,
    negotiated: contacts.filter(c => c.status === 'negotiated').length,
    approved: contacts.filter(c => c.status === 'approved').length,
    paymentSent: contacts.filter(c => c.status === 'payment_sent').length,
    live: contacts.filter(c => c.status === 'live').length,
  }), [contacts]);

  // Filter contacts based on selected stage
  const filteredContacts = useMemo(() => {
    if (selectedStage === 'all') return contacts;
    if (selectedStage === 'send-followup') {
      return contacts.filter(c => c.status === 'send_followup' || isDueForFollowup(c));
    }
    const targetStatus = STAGE_TO_STATUS[selectedStage];
    if (!targetStatus) return contacts;
    return contacts.filter(c => c.status === targetStatus);
  }, [contacts, selectedStage]);

  // Handlers
  const handleUpdateContact = (updatedContact: Contact) => {
    setContacts(prev => {
      const updated = prev.map(c => c.id === updatedContact.id ? updatedContact : c);
      saveCache(updated);
      return updated;
    });
  };

  const handleDeleteContact = (contactId: string) => {
    setContacts(prev => {
      const updated = prev.filter(c => c.id !== contactId);
      saveCache(updated);
      return updated;
    });
  };

  const handleStartOutreach = () => {
    console.log('Start outreach clicked');
    alert('Outreach would start here (not yet wired to API)');
  };

  const syncContactsFromSheet = async () => {
    setIsLoading(true);
    setSyncError(null);
    try {
      const response = await fetch('/api/sync-sheets', {
        headers: { 'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '' },
      });
      const data = await response.json();

      if (!response.ok) {
        const msg = data.error || `Server error (${response.status})`;
        setSyncError(`Sync failed: ${msg}`);
        return;
      }

      if (data.contacts && data.contacts.length > 0) {
        setContacts(data.contacts);
        saveCache(data.contacts);
        setLastSynced(new Date().toLocaleTimeString());
        console.log(`✓ Synced ${data.contacts.length} contacts from Google Sheet`);
      } else {
        setContacts([]);
        saveCache([]);
        console.warn('Sheet returned 0 contacts');
      }
    } catch (error) {
      console.error('Failed to sync from Sheet:', error);
      setSyncError('Failed to reach server. Check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  // On mount: load cache immediately, then sync from Sheet in background
  useEffect(() => {
    const cached = loadCached();
    if (cached.length > 0) {
      setContacts(cached);
    }
    syncContactsFromSheet();
  }, []);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <Sidebar navCounts={navCounts} selectedStage={selectedStage} onSelectStage={setSelectedStage} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <TopBar onStartOutreach={handleStartOutreach} onRefresh={syncContactsFromSheet} isLoading={isLoading} />

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 w-full">
            {syncError && (
              <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {syncError}
              </div>
            )}

            {/* Metrics Grid */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              <StatsCard label="Total Outreach" value={metrics.totalOutreach} />
              <StatsCard label="Total Responses" value={metrics.totalResponses} />
              <StatsCard label="Approved Deals" value={metrics.totalApproved} />
              <StatsCard label="Conversion Rate" value={`${metrics.conversionRate}%`} />
            </div>

            {/* Contact Table */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-100">
                  {STAGE_LABELS[selectedStage]} ({filteredContacts.length})
                </h2>
                {lastSynced && (
                  <span className="text-xs font-mono text-slate-500">
                    Last synced {lastSynced}
                  </span>
                )}
              </div>
              <ContactTable
                contacts={filteredContacts}
                onUpdateContact={handleUpdateContact}
                onDeleteContact={handleDeleteContact}
                stage={selectedStage}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
