# All Contacts Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "All Contacts" sidebar item open a full-screen modal showing all contacts in the same table view as the main dashboard.

**Architecture:** A new `AllContactsModal` component wraps the existing `ContactTable`. The `Sidebar` gains an `onAllContactsOpen` prop triggered only for the `all` item. The dashboard page adds a boolean state flag `showAllContacts` and renders the modal.

**Tech Stack:** Next.js (Pages Router), React, TypeScript, Tailwind CSS, existing `ContactTable` / `EditContactModal` components.

---

### Task 1: Create `AllContactsModal` component

**Files:**
- Create: `components/dashboard/AllContactsModal.tsx`

This modal renders as a fixed full-screen overlay (z-50, inset-0) with a dark backdrop. It contains a header bar with title + contact count + close button, and the full `ContactTable` in scrollable body.

- [ ] **Step 1: Create the component file**

Create `components/dashboard/AllContactsModal.tsx` with this exact content:

```tsx
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Contact } from './types';
import { ContactTable } from './ContactTable';

interface AllContactsModalProps {
  contacts: Contact[];
  onUpdateContact: (contact: Contact) => Promise<void>;
  onDeleteContact: (contactId: string) => void;
  onClose: () => void;
}

export function AllContactsModal({
  contacts,
  onUpdateContact,
  onDeleteContact,
  onClose,
}: AllContactsModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-[95vw] h-[95vh] bg-slate-900 border border-slate-700 rounded-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-100">All Contacts</h2>
            <span className="font-mono text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
              {contacts.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          <ContactTable
            contacts={contacts}
            onUpdateContact={onUpdateContact}
            onDeleteContact={onDeleteContact}
            stage="all"
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the file was created**

Run: `ls components/dashboard/AllContactsModal.tsx`
Expected: file path printed with no error.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/AllContactsModal.tsx
git commit -m "feat: add AllContactsModal component"
```

---

### Task 2: Update `Sidebar` to trigger modal for "All Contacts" click

**Files:**
- Modify: `components/dashboard/Sidebar.tsx`

Add an `onAllContactsOpen` optional prop. When the `all` item is clicked, call `onAllContactsOpen` instead of `onSelectStage('all')`. All other items continue to call `onSelectStage` as before.

- [ ] **Step 1: Add `onAllContactsOpen` to `SidebarProps`**

In `components/dashboard/Sidebar.tsx`, replace:

```ts
interface SidebarProps {
  navCounts: NavCounts;
  selectedStage?: string;
  onSelectStage?: (stage: string) => void;
}
```

with:

```ts
interface SidebarProps {
  navCounts: NavCounts;
  selectedStage?: string;
  onSelectStage?: (stage: string) => void;
  onAllContactsOpen?: () => void;
}
```

- [ ] **Step 2: Destructure the new prop**

Replace:

```ts
export function Sidebar({ navCounts, selectedStage = 'all', onSelectStage }: SidebarProps) {
```

with:

```ts
export function Sidebar({ navCounts, selectedStage = 'all', onSelectStage, onAllContactsOpen }: SidebarProps) {
```

- [ ] **Step 3: Update the click handler for the `all` item**

In the `pipelineItems.map()` section, replace the `onClick` handler:

```tsx
onClick={(e) => {
  e.preventDefault();
  onSelectStage?.(item.id);
}}
```

with:

```tsx
onClick={(e) => {
  e.preventDefault();
  if (item.id === 'all') {
    onAllContactsOpen?.();
  } else {
    onSelectStage?.(item.id);
  }
}}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/Sidebar.tsx
git commit -m "feat: add onAllContactsOpen callback to Sidebar for All Contacts click"
```

---

### Task 3: Wire up modal in dashboard page

**Files:**
- Modify: `pages/dashboard/index.tsx`

Add `showAllContacts` boolean state. Pass `onAllContactsOpen` to `Sidebar`. Render `AllContactsModal` when `showAllContacts` is true, passing all contacts and handlers.

- [ ] **Step 1: Add `showAllContacts` state and import**

In `pages/dashboard/index.tsx`, add the import at the top with the other component imports:

```ts
import { AllContactsModal } from '@/components/dashboard/AllContactsModal';
```

Inside `DashboardPage`, after the existing `useState` declarations, add:

```ts
const [showAllContacts, setShowAllContacts] = useState(false);
```

- [ ] **Step 2: Pass `onAllContactsOpen` to Sidebar**

Replace:

```tsx
<Sidebar navCounts={navCounts} selectedStage={selectedStage} onSelectStage={setSelectedStage} />
```

with:

```tsx
<Sidebar
  navCounts={navCounts}
  selectedStage={selectedStage}
  onSelectStage={setSelectedStage}
  onAllContactsOpen={() => setShowAllContacts(true)}
/>
```

- [ ] **Step 3: Render the modal**

Inside the return JSX, add the modal just before the closing `</div>` of the outermost wrapper:

```tsx
{showAllContacts && (
  <AllContactsModal
    contacts={contacts}
    onUpdateContact={handleUpdateContact}
    onDeleteContact={handleDeleteContact}
    onClose={() => setShowAllContacts(false)}
  />
)}
```

The full return block should look like:

```tsx
return (
  <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
    <Sidebar
      navCounts={navCounts}
      selectedStage={selectedStage}
      onSelectStage={setSelectedStage}
      onAllContactsOpen={() => setShowAllContacts(true)}
    />

    <main className="flex-1 flex flex-col overflow-hidden">
      {/* ... existing content unchanged ... */}
    </main>

    {showAllContacts && (
      <AllContactsModal
        contacts={contacts}
        onUpdateContact={handleUpdateContact}
        onDeleteContact={handleDeleteContact}
        onClose={() => setShowAllContacts(false)}
      />
    )}
  </div>
);
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Start dev server and manually verify**

Run: `npm run dev`

Check:
1. Click "All Contacts" in sidebar → full-screen modal opens showing all contacts
2. Contact count in modal header matches sidebar badge number
3. Click a contact row → `EditContactModal` opens inside the overlay
4. Click the X button → modal closes
5. Click the dark backdrop → modal closes
6. Press Escape key → modal closes
7. All other sidebar items (Start Outreach, Outreach Sent, etc.) still filter the main table as before

- [ ] **Step 6: Commit**

```bash
git add pages/dashboard/index.tsx
git commit -m "feat: wire AllContactsModal into dashboard — All Contacts click opens full-screen overlay"
```
