'use client';

import { useState, useMemo } from 'react';
import { mockContacts } from '@/lib/mockData';
import { Contact, DashboardStats } from '@/components/dashboard/types';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { TopBar } from '@/components/dashboard/TopBar';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { ContactTable } from '@/components/dashboard/ContactTable';

export default function DashboardPage() {
  const [contacts, setContacts] = useState<Contact[]>(mockContacts);

  // Calculate stats
  const stats: DashboardStats = useMemo(() => {
    const total = contacts.length;
    const avgPrice =
      total > 0
        ? Math.round(
            contacts.reduce((sum, c) => sum + c.standardPrice, 0) / total
          )
        : 0;
    const confirmed = contacts.filter((c) => c.dateConfirmed).length;
    const casinoFriendly = contacts.filter((c) => c.acceptCasino).length;

    return {
      totalDomains: total,
      averagePrice: avgPrice,
      confirmedDeals: confirmed,
      casinoFriendly,
    };
  }, [contacts]);

  // Calculate nav counts
  const navCounts = useMemo(
    () => ({
      domains: contacts.length,
      pending: contacts.filter((c) => c.status === 'pending').length,
      confirmed: contacts.filter((c) => c.dateConfirmed).length,
    }),
    [contacts]
  );

  // Handlers
  const handleUpdateContact = (updatedContact: Contact) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === updatedContact.id ? updatedContact : c))
    );
  };

  const handleDeleteContact = (contactId: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== contactId));
  };

  const handleRunPaul = () => {
    console.log('Run Paul clicked');
    alert('Paul outreach would start here (not yet wired to API)');
  };

  const handleRefresh = () => {
    console.log('Refresh clicked');
    // In future: fetch from /api/contacts
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sidebar */}
      <Sidebar navCounts={navCounts} />

      {/* Main Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <TopBar onRunPaul={handleRunPaul} onRefresh={handleRefresh} />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-7xl">
            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              <StatsCard label="Total Domains" value={stats.totalDomains} />
              <StatsCard
                label="Average Price (EUR)"
                value={`€${stats.averagePrice}`}
              />
              <StatsCard label="Confirmed Deals" value={stats.confirmedDeals} />
              <StatsCard
                label="Casino-Friendly"
                value={stats.casinoFriendly}
              />
            </div>

            {/* Contact Table */}
            <div>
              <h2 className="text-lg font-bold text-slate-100 mb-4">
                Contacts
              </h2>
              <ContactTable
                contacts={contacts}
                onUpdateContact={handleUpdateContact}
                onDeleteContact={handleDeleteContact}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
