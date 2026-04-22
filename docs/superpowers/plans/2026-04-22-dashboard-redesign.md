# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully-featured contact dashboard with collapsible rows, real-time stats, sidebar navigation, and CRUD operations for managing domain outreach contacts.

**Architecture:** Component-based React app using mock data initially. Dashboard page orchestrates state, child components handle UI and user interactions. Collapsible row pattern for hiding detail data until needed. All styling via Tailwind CSS. Ready to swap mock data for real API without component changes.

**Tech Stack:** React 18, TypeScript, Next.js 14, Tailwind CSS (no new dependencies)

---

## Task 1: TypeScript Types & Mock Data

**Files:**
- Create: `components/dashboard/types.ts`
- Create: `lib/mockData.ts`

- [ ] **Step 1: Create types.ts with contact interface**

Create file `components/dashboard/types.ts`:

```typescript
export interface Contact {
  id: string;
  domain: string;
  niche: string;
  priceFromBacklinker: number;
  email1: string;
  name1: string;
  email2?: string;
  name2?: string;
  email3?: string;
  name3?: string;
  status: 'pending' | 'confirmed' | 'no_deal' | 'negotiation' | 'follow_up';
  emailAccount: string;
  currency: string;
  standardPrice: number;
  gamblingPrice: number;
  negotiatedPrice?: number;
  acceptCasino: boolean;
  acceptBetting: boolean;
  sponsored: boolean;
  linkTerm: string;
  dateConfirmed?: string; // ISO date string
  notes: string;
  contentGuidelines: string;
  reply: 'yes' | 'no' | 'pending';
}

export interface DashboardStats {
  totalDomains: number;
  averagePrice: number;
  confirmedDeals: number;
  casinoFriendly: number;
}
```

- [ ] **Step 2: Create mock data file**

Create file `lib/mockData.ts`:

```typescript
import { Contact } from '@/components/dashboard/types';

export const mockContacts: Contact[] = [
  {
    id: '1',
    domain: 'example.com',
    niche: 'Business',
    priceFromBacklinker: 250,
    email1: 'john@example.com',
    name1: 'John Doe',
    email2: 'jane@example.com',
    name2: 'Jane Doe',
    email3: undefined,
    name3: undefined,
    status: 'pending',
    emailAccount: 'outreach@linkops.com',
    currency: 'EUR',
    standardPrice: 250,
    gamblingPrice: 350,
    negotiatedPrice: 225,
    acceptCasino: true,
    acceptBetting: false,
    sponsored: false,
    linkTerm: '6 months',
    dateConfirmed: undefined,
    notes: 'Good domain authority',
    contentGuidelines: 'Professional tone, 500 words min',
    reply: 'pending',
  },
  {
    id: '2',
    domain: 'casino-hub.com',
    niche: 'Casino',
    priceFromBacklinker: 500,
    email1: 'contact@casino-hub.com',
    name1: 'Alex Smith',
    email2: undefined,
    name2: undefined,
    email3: undefined,
    name3: undefined,
    status: 'confirmed',
    emailAccount: 'outreach@linkops.com',
    currency: 'EUR',
    standardPrice: 450,
    gamblingPrice: 600,
    negotiatedPrice: 425,
    acceptCasino: true,
    acceptBetting: true,
    sponsored: false,
    linkTerm: '1 year',
    dateConfirmed: '2026-04-15',
    notes: 'Fast response, easy to work with',
    contentGuidelines: 'Gaming industry standard',
    reply: 'yes',
  },
  {
    id: '3',
    domain: 'techblog.org',
    niche: 'Technology',
    priceFromBacklinker: 180,
    email1: 'editor@techblog.org',
    name1: 'Sarah Chen',
    email2: 'submissions@techblog.org',
    name2: 'Editorial Team',
    email3: undefined,
    name3: undefined,
    status: 'negotiation',
    emailAccount: 'outreach@linkops.com',
    currency: 'EUR',
    standardPrice: 200,
    gamblingPrice: 250,
    negotiatedPrice: undefined,
    acceptCasino: false,
    acceptBetting: false,
    sponsored: true,
    linkTerm: '3 months',
    dateConfirmed: undefined,
    notes: 'Waiting on their counter offer',
    contentGuidelines: 'Tech-focused, no promotional tone',
    reply: 'pending',
  },
  {
    id: '4',
    domain: 'sportsbeat.net',
    niche: 'Sports',
    priceFromBacklinker: 320,
    email1: 'press@sportsbeat.net',
    name1: 'Mike Johnson',
    email2: undefined,
    name2: undefined,
    email3: undefined,
    name3: undefined,
    status: 'no_deal',
    emailAccount: 'outreach@linkops.com',
    currency: 'EUR',
    standardPrice: 300,
    gamblingPrice: 400,
    negotiatedPrice: undefined,
    acceptCasino: false,
    acceptBetting: true,
    sponsored: false,
    linkTerm: undefined,
    dateConfirmed: undefined,
    notes: 'Not interested in partnerships',
    contentGuidelines: 'Sports news format',
    reply: 'no',
  },
  {
    id: '5',
    domain: 'financialjournal.io',
    niche: 'Finance',
    priceFromBacklinker: 400,
    email1: 'contributors@financialjournal.io',
    name1: 'David Brown',
    email2: 'editor@financialjournal.io',
    name2: 'Lisa Wong',
    email3: undefined,
    name3: undefined,
    status: 'follow_up',
    emailAccount: 'outreach@linkops.com',
    currency: 'EUR',
    standardPrice: 380,
    gamblingPrice: 500,
    negotiatedPrice: undefined,
    acceptCasino: false,
    acceptBetting: false,
    sponsored: false,
    linkTerm: '4 months',
    dateConfirmed: undefined,
    notes: 'Sent follow-up email 2 days ago',
    contentGuidelines: 'Financial analysis focus',
    reply: 'pending',
  },
];
```

- [ ] **Step 3: Verify types compile**

Run: `npm run type-check`

Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/types.ts lib/mockData.ts
git commit -m "feat: add types and mock data for dashboard redesign"
```

---

## Task 2: StatsCard Component

**Files:**
- Create: `components/dashboard/StatsCard.tsx`

- [ ] **Step 1: Create StatsCard component**

Create file `components/dashboard/StatsCard.tsx`:

```typescript
interface StatsCardProps {
  label: string;
  value: number | string;
  trend?: string; // e.g., "+5 this week"
}

export function StatsCard({ label, value, trend }: StatsCardProps) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors">
      <div className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-2">
        {label}
      </div>
      <div className="text-3xl font-bold text-slate-100 tracking-tight">
        {value}
      </div>
      {trend && (
        <div className="text-xs text-slate-500 font-mono mt-2">
          {trend}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify component exports**

Check that the file compiles: `npm run type-check`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/StatsCard.tsx
git commit -m "feat: add StatsCard component"
```

---

## Task 3: Sidebar Component

**Files:**
- Create: `components/dashboard/Sidebar.tsx`

- [ ] **Step 1: Create Sidebar with Paul status**

Create file `components/dashboard/Sidebar.tsx`:

```typescript
interface SidebarProps {
  navCounts: {
    domains: number;
    pending: number;
    confirmed: number;
  };
}

export function Sidebar({ navCounts }: SidebarProps) {
  const navItems = [
    { label: 'Domains', count: navCounts.domains, icon: '📊' },
    { label: 'Pending', count: navCounts.pending, icon: '⏳' },
    { label: 'Confirmed', count: navCounts.confirmed, icon: '✅' },
    { label: 'Settings', count: undefined, icon: '⚙️' },
  ];

  return (
    <aside className="w-60 bg-slate-900 border-r border-slate-700 flex flex-col flex-shrink-0">
      {/* Logo Section */}
      <div className="border-b border-slate-700 px-4 py-4">
        <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-1">
          LinkOps
        </div>
        <h1 className="text-2xl font-black text-slate-100 tracking-tight">
          Link<span className="text-emerald-400">Ops</span>
        </h1>

        {/* Paul Status */}
        <div className="mt-3 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-xs font-bold text-black flex-shrink-0">
            P
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black text-emerald-400">Paul</div>
            <div className="text-xs font-mono text-slate-400">Active</div>
          </div>
          <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse"></div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-4">
          <div className="text-xs font-mono uppercase tracking-widest text-slate-600 px-2 mb-2">
            Menu
          </div>
          {navItems.map((item) => (
            <a
              key={item.label}
              href="#"
              className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-bold text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors mb-1"
            >
              <span className="text-lg">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.count !== undefined && (
                <span className="font-mono text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400">
                  {item.count}
                </span>
              )}
            </a>
          ))}
        </div>
      </nav>

      {/* Sync Button */}
      <div className="px-2 pb-3">
        <button className="w-full flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-all">
          <span className="text-sm">🔄</span>
          <span>Sync Now</span>
        </button>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-700 px-4 py-3 text-xs font-mono text-slate-600 leading-relaxed">
        <div>Last synced:</div>
        <div className="text-slate-500">Just now</div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify component**

Run: `npm run type-check`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/Sidebar.tsx
git commit -m "feat: add Sidebar component with Paul status"
```

---

## Task 4: TopBar Component

**Files:**
- Create: `components/dashboard/TopBar.tsx`

- [ ] **Step 1: Create TopBar**

Create file `components/dashboard/TopBar.tsx`:

```typescript
interface TopBarProps {
  onRunPaul: () => void;
  onRefresh: () => void;
}

export function TopBar({ onRunPaul, onRefresh }: TopBarProps) {
  return (
    <div className="bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
      <div className="min-w-0">
        <h1 className="text-xl font-black text-slate-100 tracking-tight">
          Domains
        </h1>
        <p className="text-xs font-mono text-slate-500 mt-1">
          Manage your outreach contacts
        </p>
      </div>

      <div className="flex gap-3 flex-shrink-0">
        <button
          onClick={onRunPaul}
          className="px-4 py-2 bg-emerald-500 text-black font-black rounded-lg hover:bg-emerald-400 transition-colors text-sm"
        >
          🚀 RUN PAUL
        </button>
        <button
          onClick={onRefresh}
          className="px-4 py-2 bg-slate-700 text-slate-100 font-bold rounded-lg hover:bg-slate-600 transition-colors text-sm"
        >
          🔄 Refresh
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify component**

Run: `npm run type-check`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/TopBar.tsx
git commit -m "feat: add TopBar component with action buttons"
```

---

## Task 5: ContactTableRow Component (Collapsed)

**Files:**
- Create: `components/dashboard/ContactTableRow.tsx`

- [ ] **Step 1: Create collapsed row component**

Create file `components/dashboard/ContactTableRow.tsx`:

```typescript
import { Contact } from './types';

interface ContactTableRowProps {
  contact: Contact;
  isExpanded: boolean;
  onClick: () => void;
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

export function ContactTableRow({
  contact,
  isExpanded,
  onClick,
}: ContactTableRowProps) {
  const statusLabel =
    contact.status.charAt(0).toUpperCase() +
    contact.status.slice(1).replace('_', ' ');

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
    </tr>
  );
}
```

- [ ] **Step 2: Verify component**

Run: `npm run type-check`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/ContactTableRow.tsx
git commit -m "feat: add ContactTableRow component with status badges"
```

---

## Task 6: ExpandedRowDetail Component

**Files:**
- Create: `components/dashboard/ExpandedRowDetail.tsx`

- [ ] **Step 1: Create expanded detail panel**

Create file `components/dashboard/ExpandedRowDetail.tsx`:

```typescript
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
            🗑 Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: Verify component**

Run: `npm run type-check`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/ExpandedRowDetail.tsx
git commit -m "feat: add ExpandedRowDetail component with edit form"
```

---

## Task 7: ContactTable Component

**Files:**
- Create: `components/dashboard/ContactTable.tsx`

- [ ] **Step 1: Create table component**

Create file `components/dashboard/ContactTable.tsx`:

```typescript
import { useState } from 'react';
import { Contact } from './types';
import { ContactTableRow } from './ContactTableRow';
import { ExpandedRowDetail } from './ExpandedRowDetail';

interface ContactTableProps {
  contacts: Contact[];
  onUpdateContact: (contact: Contact) => void;
  onDeleteContact: (contactId: string) => void;
}

export function ContactTable({
  contacts,
  onUpdateContact,
  onDeleteContact,
}: ContactTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-900/50 border-b border-slate-700">
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Domain
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Niche
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Primary Email
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Standard Price
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Gambling Price
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Date Confirmed
            </th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => (
            <div key={contact.id}>
              <ContactTableRow
                contact={contact}
                isExpanded={expandedId === contact.id}
                onClick={() =>
                  setExpandedId(
                    expandedId === contact.id ? null : contact.id
                  )
                }
              />
              {expandedId === contact.id && (
                <ExpandedRowDetail
                  contact={contact}
                  onSave={onUpdateContact}
                  onDelete={() => {
                    onDeleteContact(contact.id);
                    setExpandedId(null);
                  }}
                />
              )}
            </div>
          ))}
        </tbody>
      </table>
      {contacts.length === 0 && (
        <div className="px-4 py-8 text-center text-slate-400 text-sm">
          No contacts found
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Fix table structure**

The table needs proper tbody structure. Update `components/dashboard/ContactTable.tsx`:

```typescript
import { useState } from 'react';
import { Contact } from './types';
import { ContactTableRow } from './ContactTableRow';
import { ExpandedRowDetail } from './ExpandedRowDetail';

interface ContactTableProps {
  contacts: Contact[];
  onUpdateContact: (contact: Contact) => void;
  onDeleteContact: (contactId: string) => void;
}

export function ContactTable({
  contacts,
  onUpdateContact,
  onDeleteContact,
}: ContactTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (contacts.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-8 text-center text-slate-400 text-sm">
        No contacts found
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-900/50 border-b border-slate-700">
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Domain
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Niche
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Primary Email
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Standard Price
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Gambling Price
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
              Date Confirmed
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {contacts.map((contact) => (
            <div key={contact.id} className="contents">
              <ContactTableRow
                contact={contact}
                isExpanded={expandedId === contact.id}
                onClick={() =>
                  setExpandedId(
                    expandedId === contact.id ? null : contact.id
                  )
                }
              />
              {expandedId === contact.id && (
                <ExpandedRowDetail
                  contact={contact}
                  onSave={onUpdateContact}
                  onDelete={() => {
                    onDeleteContact(contact.id);
                    setExpandedId(null);
                  }}
                />
              )}
            </div>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Verify component**

Run: `npm run type-check`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/ContactTable.tsx
git commit -m "feat: add ContactTable component with collapsible rows"
```

---

## Task 8: Main Dashboard Page

**Files:**
- Modify: `pages/dashboard/index.tsx`

- [ ] **Step 1: Replace dashboard page**

Replace entire content of `pages/dashboard/index.tsx`:

```typescript
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
```

- [ ] **Step 2: Verify page compiles**

Run: `npm run type-check`

Expected: No TypeScript errors

- [ ] **Step 3: Test in browser**

Run: `npm run dev`

Open: `http://localhost:3000/dashboard`

Expected: 
- Dashboard loads with sidebar, top bar, 4 stat cards, and contact table
- Sidebar shows Paul status with blinking dot
- Stats show: 5 domains, €308 avg price, 1 confirmed deal, 2 casino-friendly
- Table shows 5 contacts in collapsed view
- Click a row to expand and see full details
- Edit fields, save changes, delete (with confirmation)
- No errors in console

- [ ] **Step 4: Commit**

```bash
git add pages/dashboard/index.tsx
git commit -m "feat: implement dashboard page with all components"
```

---

## Task 9: Testing & Polish

**Files:**
- Modify: Various (styling adjustments)

- [ ] **Step 1: Test all interactions**

In browser at `http://localhost:3000/dashboard`:

- Click "Run Paul" button → See alert (should work)
- Click "Refresh" button → See console log (should work)
- Click a contact row → Expands to show details ✓
- Click another row → First collapses, second expands ✓
- Edit a field in expanded view → "Save Changes" button appears ✓
- Click Save → Changes persist and row collapses ✓
- Click Delete → Confirmation dialog, deletes on confirm ✓
- Stats update correctly as contacts change ✓
- Sidebar badge counts update as contacts change ✓

Expected: All interactions work smoothly

- [ ] **Step 2: Check responsive spacing**

View at different zoom levels (80%, 100%, 120%)

Expected: Layout remains clean, no overflow, readability maintained

- [ ] **Step 3: Test all data types**

Verify the table displays all data types correctly:
- Emails show as text ✓
- Prices display with € symbol ✓
- Dates format correctly (or show "—" if null) ✓
- Status badges color-code correctly ✓
- Checkboxes in expanded view work ✓
- Dropdowns work ✓
- Textareas wrap correctly ✓

Expected: All data displays and edits correctly

- [ ] **Step 4: Verify no console errors**

Open browser console (F12 → Console)

Expected: No red errors, only normal React dev warnings (if any)

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "test: verify all dashboard functionality working"
```

---

## Summary

✅ **Complete Component Structure:**
- Sidebar with Paul status
- TopBar with action buttons
- 4 StatCards
- ContactTable with collapsible rows
- ExpandedRowDetail with full CRUD

✅ **Features Implemented:**
- Mock data (5 sample contacts)
- Read: Display all contacts, expand to view details
- Update: Edit any field, save changes
- Delete: Remove contact with confirmation
- Stats: Auto-calculate totals, averages, counts
- Status badges with color coding

✅ **Architecture:**
- Component-based, DRY code
- State managed at page level
- Props passed down for reusability
- Ready for API integration (replace mockContacts with fetch)

✅ **Styling:**
- Tailwind CSS throughout
- Dark theme matching reference design
- Responsive grid layouts
- Smooth transitions and hover effects

**Next Phase:** Wire real API by replacing mockContacts with `fetch('/api/contacts')` and update handlers to call `/api/contacts/[id]` endpoints.
