'use client';

import { useState, useMemo, useEffect } from 'react';
import { Contact, DashboardMetrics, NavCounts, PipelineStatus, STATUS_LABELS } from '@/components/dashboard/types';
import { isDueForFollowup } from '@/lib/utils/followup';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { TopBar } from '@/components/dashboard/TopBar';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { ContactTable } from '@/components/dashboard/ContactTable';

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

export default function DashboardPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [syncError, setSyncError] = useState<string | null>(null);

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

    return {
      totalOutreach: total,
      totalResponses,
      totalApproved,
      conversionRate,
    };
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
    setContacts((prev) =>
      prev.map((c) => (c.id === updatedContact.id ? updatedContact : c))
    );
  };

  const handleDeleteContact = (contactId: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== contactId));
  };

  const handleStartOutreach = () => {
    console.log('Start outreach clicked');
    alert('Outreach would start here (not yet wired to API)');
  };

  const syncContactsFromSheet = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/sync-sheets', {
        headers: { 'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '' },
      });
      const data = await response.json();

      if (data.contacts && data.contacts.length > 0) {
        setSyncError(null);
        setContacts(data.contacts);
        console.log(`✓ Synced ${data.contacts.length} contacts from Google Sheet`);
      } else if (response.ok) {
        console.warn('No contacts found in Sheet, using mock data');
      } else {
        console.error('Sync error:', data.error);
      }
    } catch (error) {
      console.error('Failed to sync from Sheet:', error);
      setSyncError('Failed to load contacts. Check your Google Sheet connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    syncContactsFromSheet();
  };

  useEffect(() => {
    syncContactsFromSheet();
  }, []);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sidebar */}
      <Sidebar navCounts={navCounts} selectedStage={selectedStage} onSelectStage={setSelectedStage} />

      {/* Main Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <TopBar onStartOutreach={handleStartOutreach} onRefresh={handleRefresh} isLoading={isLoading} />

        {/* Content */}
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
              <h2 className="text-lg font-bold text-slate-100 mb-4">
                {STAGE_LABELS[selectedStage]} ({filteredContacts.length})
              </h2>
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
