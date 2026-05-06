import { useState, useMemo } from 'react';
import { Contact, DashboardMetrics, NavCounts, PipelineStatus } from '@/components/dashboard/types';
import { deriveStatus } from '@/lib/utils/deriveStatus';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { TopBar } from '@/components/dashboard/TopBar';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { ContactTable } from '@/components/dashboard/ContactTable';
import { CountryFilter } from '@/components/dashboard/CountryFilter';
import { AllContactsModal } from '@/components/dashboard/AllContactsModal';
import { SendCampaignModal } from '@/components/dashboard/SendCampaignModal';
import { SendFollowupModal } from '@/components/dashboard/SendFollowupModal';
import { fetchContactsFromSheet } from '@/lib/integrations/sheets';
import { upsertSheetContacts, getSheetContacts } from '@/lib/integrations/supabase';

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

const API_HEADERS = { 'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '' };

export async function getServerSideProps() {
  const sheetId = process.env.GOOGLE_SHEET_ID || '';
  const sheetTab = process.env.GOOGLE_SHEET_TAB || 'Sheet1';
  try {
    const contacts = await fetchContactsFromSheet(sheetId, sheetTab);
    await upsertSheetContacts(contacts);
    return { props: { initialContacts: contacts } };
  } catch {
    const contacts = await getSheetContacts();
    return { props: { initialContacts: contacts } };
  }
}

export default function DashboardPage({ initialContacts }: { initialContacts: Contact[] }) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [showSendCampaign, setShowSendCampaign] = useState(false);
  const [showSendFollowup, setShowSendFollowup] = useState(false);

  const metrics: DashboardMetrics = useMemo(() => {
    const total = contacts.length;
    const RESPONDED: PipelineStatus[] = ['response_received', 'under_negotiation', 'negotiated', 'approved', 'payment_sent', 'live'];
    const APPROVED: PipelineStatus[] = ['approved', 'payment_sent', 'live'];
    const totalResponses = contacts.filter(c => RESPONDED.includes(c.status)).length;
    const totalApproved = contacts.filter(c => APPROVED.includes(c.status)).length;
    return {
      totalOutreach: total,
      totalResponses,
      totalApproved,
      conversionRate: total > 0 ? Math.round((totalApproved / total) * 100) : 0,
    };
  }, [contacts]);

  const navCounts: NavCounts = useMemo(() => ({
    all: contacts.length,
    startOutreach: contacts.filter(c => deriveStatus(c) === 'start_outreach').length,
    outreachSent: contacts.filter(c => deriveStatus(c) === 'outreach_sent').length,
    sendFollowup: contacts.filter(c => deriveStatus(c) === 'send_followup').length,
    responseReceived: contacts.filter(c => deriveStatus(c) === 'response_received').length,
    underNegotiation: contacts.filter(c => deriveStatus(c) === 'under_negotiation').length,
    negotiated: contacts.filter(c => deriveStatus(c) === 'negotiated').length,
    approved: contacts.filter(c => deriveStatus(c) === 'approved').length,
    paymentSent: contacts.filter(c => deriveStatus(c) === 'payment_sent').length,
    live: contacts.filter(c => deriveStatus(c) === 'live').length,
  }), [contacts]);

  const availableCountries = useMemo(() => {
    const seen = new Set<string>();
    contacts.forEach(c => { if (c.market) seen.add(c.market); });
    return Array.from(seen).sort();
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    let result = contacts;
    if (selectedStage !== 'all') {
      const targetStatus = STAGE_TO_STATUS[selectedStage];
      if (targetStatus) result = result.filter(c => deriveStatus(c) === targetStatus);
    }
    if (selectedCountry) result = result.filter(c => c.market === selectedCountry);
    return result;
  }, [contacts, selectedStage, selectedCountry]);

  // Used by modal onRefresh callbacks after send actions
  const loadFromSupabase = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/contacts', { headers: API_HEADERS });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Error ${res.status}`);
        return;
      }
      setContacts(data.contacts || []);
    } catch (err) {
      setError('Failed to reach server.');
    } finally {
      setIsLoading(false);
    }
  };

  // Manual mid-session sync from Google Sheet
  const syncFromSheet = async () => {
    setIsSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/sync-sheets', { headers: API_HEADERS });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Sync error ${res.status}`);
        return;
      }
      setContacts(data.contacts || []);
      setLastSynced(new Date().toLocaleTimeString());
    } catch (err) {
      setError('Sync failed. Check your connection.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateContact = async (updatedContact: Contact) => {
    const rowIndex = parseInt(updatedContact.id, 10);
    try {
      const res = await fetch('/api/save-contact', {
        method: 'POST',
        headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: updatedContact, rowIndex }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || `Save failed (${res.status})`);
        return;
      }
    } catch {
      setError('Failed to save contact.');
      return;
    }
    setContacts(prev => prev.map(c => c.id === updatedContact.id ? updatedContact : c));
  };

  const handleDeleteContact = (contactId: string) => {
    setContacts(prev => prev.filter(c => c.id !== contactId));
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <Sidebar
        navCounts={navCounts}
        selectedStage={selectedStage}
        onSelectStage={setSelectedStage}
        onAllContactsOpen={() => setShowAllContacts(true)}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          onRefresh={syncFromSheet}
          isLoading={isSyncing}
          onSendCampaign={() => setShowSendCampaign(true)}
          onSendFollowup={() => setShowSendFollowup(true)}
          followupCount={navCounts.sendFollowup}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 w-full">
            {error && (
              <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-4 gap-4 mb-8">
              <StatsCard label="Total Outreach" value={metrics.totalOutreach} />
              <StatsCard label="Total Responses" value={metrics.totalResponses} />
              <StatsCard label="Approved Deals" value={metrics.totalApproved} />
              <StatsCard label="Conversion Rate" value={`${metrics.conversionRate}%`} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-slate-100">
                  {isLoading ? 'Loading...' : `${STAGE_LABELS[selectedStage]} (${filteredContacts.length})`}
                </h2>
                {lastSynced && (
                  <span className="text-xs font-mono text-slate-500">
                    Last synced {lastSynced}
                  </span>
                )}
              </div>
              <div className="mb-4">
                <CountryFilter
                  countries={availableCountries}
                  selected={selectedCountry}
                  onSelect={setSelectedCountry}
                />
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

      {showAllContacts && (
        <AllContactsModal
          contacts={contacts}
          onUpdateContact={handleUpdateContact}
          onDeleteContact={handleDeleteContact}
          onClose={() => setShowAllContacts(false)}
        />
      )}

      {showSendCampaign && (
        <SendCampaignModal
          onClose={() => setShowSendCampaign(false)}
          onRefresh={loadFromSupabase}
        />
      )}

      {showSendFollowup && (
        <SendFollowupModal
          followupCount={navCounts.sendFollowup}
          onClose={() => setShowSendFollowup(false)}
          onRefresh={loadFromSupabase}
        />
      )}
    </div>
  );
}
