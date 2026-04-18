# OpenChamber Component Analysis for Pi-Web-App Migration

> **Goal**: Make pi-web-app frontend components **identical** to OpenChamber's UI/UX, using the same component structure, styling, and behavior patterns.

**Source**: `~/openchamber/packages/ui/src/`  
**Target**: `~/pi-web-app/frontend/src/`  
**Date**: 2026-04-18

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [File Structure](#2-file-structure)
3. [Component Inventory](#3-component-inventory)
4. [Styling System](#4-styling-system)
5. [State Management](#5-state-management)
6. [Key Dependencies](#6-key-dependencies)
7. [Migration Checklist](#7-migration-checklist)

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

```
~/openchamber/packages/ui/src/
├── App.tsx                    # Root: wires providers, reads URL params, delegates
├── main.tsx                  # Entry point
├── index.css                 # Global styles + Tailwind imports
│
├── components/               # All UI components (by feature domain)
│   ├── auth/                 # Authentication gates
│   ├── chat/                 # Chat UI (messages, input, permissions, questions)
│   ├── comments/             # Inline comments
│   ├── desktop/              # Desktop-specific UI
│   ├── icons/                # Custom SVG icons
│   ├── layout/               # Layout components (Header, Sidebar, MainLayout)
│   ├── mcp/                  # MCP (Model Context Protocol) UI
│   ├── multirun/             # Multi-run sessions
│   ├── onboarding/           # First-run / connection recovery screens
│   ├── providers/             # Context providers
│   ├── sections/              # Sidebar sections (agents, projects, skills, etc.)
│   ├── session/              # Session management (sidebar, dialogs, trees)
│   │   └── sidebar/          # Session sidebar sub-components
│   ├── terminal/             # Terminal UI
│   ├── ui/                   # Primitive UI components (Button, Dialog, Tooltip...)
│   └── views/                # View containers (ChatView, FilesView, GitView...)
│       └── index.ts          # Re-exports all views
│
├── contexts/                # React context providers
├── hooks/                   # Shared React hooks
├── lib/                     # Utilities (API, config, theme, shortcuts...)
├── stores/                  # Zustand state stores (50+)
├── styles/                  # Global CSS (design-system.css, typography.css)
├── sync/                    # Sync system (real-time state synchronization)
└── types/                   # TypeScript type definitions
```

### 1.2 App Entry Point (`App.tsx`)

OpenChamber's `App.tsx` (~525 lines) orchestrates:
1. **Config initialization** — loads providers, agents
2. **Session bootstrap** — reads URL params (`ocPanel`, `sessionId`, `directory`), hydrates current session
3. **Provider wiring** — wraps in `SyncProvider`, `TooltipProvider`, `RuntimeAPIProvider`, `VoiceProvider`, etc.
4. **Layout selection** — chooses `MainLayout` (desktop) vs `VSCodeLayout` (VSCode)
5. **View routing** — renders `ChatView`, `AgentManagerView`, or `OnboardingScreen` based on boot state
6. **Effect hooks** — `useKeyboardShortcuts`, `useSessionStatusBootstrap`, `usePwaManifestSync`, etc.

**Key pattern**: App.tsx is a **thin orchestrator** — it delegates all rendering to child components.

### 1.3 Component Patterns

| Pattern | Description |
|---------|-------------|
| **View containers** | `ChatView`, `GitView`, `FilesView` — thin wrappers that compose sub-components |
| **Layout components** | `MainLayout`, `Header`, `Sidebar`, `RightSidebar` — structural chrome |
| **Feature components** | `ChatContainer`, `MessageList`, `ChatInput` — domain-specific UI |
| **Primitive UI** | `Button`, `Dialog`, `Tooltip`, `Select` — reusable atoms in `components/ui/` |
| **Sidebars/dialogs** | Heavy components (`SessionSidebar`, `SessionDialogs`) split into sub-components in `sidebar/` |

---

## 2. File Structure

### 2.1 Source Structure (OpenChamber)

```
components/
├── auth/
│   └── SessionAuthGate.tsx
├── chat/
│   ├── AgentMentionAutocomplete.tsx      (8.4KB)
│   ├── ChatContainer.tsx                (33KB) ★ Main chat orchestrator
│   ├── ChatEmptyState.tsx                (1.3KB)
│   ├── ChatErrorBoundary.tsx             (2.9KB)
│   ├── ChatInput.tsx                     (158KB) ★ Main input (3714 lines)
│   ├── ChatMessage.tsx                   (47KB) ★ Message renderer (1129 lines)
│   ├── CommandAutocomplete.tsx           (16KB)
│   ├── DiffPreview.tsx                   (6.6KB)
│   ├── FileAttachment.tsx                (33KB)
│   ├── FileMentionAutocomplete.tsx      (21KB)
│   ├── MarkdownRenderer.tsx              (48KB) ★ Markdown with code highlighting
│   ├── MessageList.tsx                  (66KB) ★ Virtualized message list (1666 lines)
│   ├── MobileAgentButton.tsx            (3.5KB)
│   ├── MobileModelButton.tsx             (1.4KB)
│   ├── MobileSessionStatusBar.tsx       (56KB)
│   ├── ModelControls.tsx                 (143KB) ★ Model selector (2803 lines)
│   ├── PermissionCard.tsx                (19KB) ★ Permission request card
│   ├── PermissionRequest.tsx            (4.4KB)
│   ├── PermissionToastActions.tsx       (4.3KB)
│   ├── QuestionCard.tsx                 (18KB) ★ Question/answer card
│   ├── QueuedMessageChips.tsx            (4.3KB)
│   ├── SkillAutocomplete.tsx            (5.5KB)
│   ├── StatusChip.tsx                   (3KB)
│   ├── StatusRow.tsx                    (11KB)
│   ├── StatusRowContainer.tsx           (1.4KB)
│   ├── StreamingTextDiff.tsx            (0KB - empty)
│   ├── TimelineDialog.tsx               (24KB)
│   ├── UnifiedControlsDrawer.tsx       (26KB)
│   ├── components/                      # Sub-components
│   │   ├── ScrollToBottomButton.tsx
│   │   └── TurnItem.tsx
│   ├── hooks/                          # Chat-specific hooks
│   │   ├── useChatScrollManager.ts
│   │   ├── useChatTimelineController.ts
│   │   ├── useChatTurnNavigation.ts
│   │   └── useTurnRecords.ts
│   ├── lib/
│   │   ├── blockingRequests.ts
│   │   └── turns/
│   │       ├── applyRetryOverlay.ts
│   │       └── types.ts
│   └── message/                         # Message sub-components
│       ├── FadeInOnReveal.tsx
│       ├── MessageBody.tsx
│       ├── MessageHeader.tsx
│       ├── ToolOutputDialog.tsx
│       └── types.ts
├── layout/
│   ├── BottomTerminalDock.tsx          (6.9KB)
│   ├── ContextPanel.tsx                (58KB)
│   ├── ContextSidebarTab.tsx          (24KB)
│   ├── Header.tsx                      (93KB) ★ Header (2234 lines)
│   ├── MainLayout.tsx                  (44KB) ★ Main layout (967 lines)
│   ├── ProjectActionsButton.tsx        (82KB)
│   ├── ProjectEditDialog.tsx           (44KB)
│   ├── RightSidebar.tsx                (19KB)
│   ├── RightSidebarTabs.tsx            (14KB)
│   ├── Sidebar.tsx                    (16KB)
│   ├── SidebarContextSummary.tsx      (6.2KB)
│   └── SidebarFilesTree.tsx           (93KB)
├── session/
│   ├── BranchPickerDialog.tsx         (58KB)
│   ├── DirectoryAutocomplete.tsx      (31KB)
│   ├── DirectoryExplorerDialog.tsx    (36KB)
│   ├── DirectoryTree.tsx               (106KB) ★ File tree
│   ├── GitHubIntegrationDialog.tsx     (62KB)
│   ├── GitHubIssuePickerDialog.tsx    (71KB)
│   ├── GitHubPrPickerDialog.tsx        (45KB)
│   ├── NewWorktreeDialog.tsx          (202KB)
│   ├── ProjectNotesTodoPanel.tsx       (62KB)
│   ├── SaveProjectPlanDialog.tsx      (7.1KB)
│   ├── ScheduledTaskEditorDialog.tsx  (148KB)
│   ├── ScheduledTasksDialog.tsx        (59KB)
│   ├── SessionDialogs.tsx              (79KB)
│   ├── SessionFolderItem.tsx           (34KB)
│   ├── SessionSidebar.tsx              (156KB) ★ Session sidebar (1564 lines)
│   └── sidebar/                        # Session sidebar sub-components
│       ├── ConfirmDialogs.tsx
│       ├── SidebarActivitySections.tsx
│       ├── SidebarFooter.tsx
│       ├── SidebarHeader.tsx
│       ├── SidebarProjectsList.tsx
│       ├── SessionGroupSection.tsx
│       ├── SessionNodeItem.tsx
│       ├── activitySections.tsx
│       ├── hooks/
│       ├── sessionFolderDnd.tsx
│       ├── sortableItems.tsx
│       └── types.ts
├── ui/
│   ├── AboutDialog.tsx                (20KB)
│   ├── button.tsx                     (62B) ★ shadcn-style button with CVA
│   ├── card.tsx                       (92B)
│   ├── checkbox.tsx                   (68B)
│   ├── command.tsx                    (238B) ★ cmdk command palette
│   ├── dialog.tsx                     (160B) ★ Radix Dialog
│   ├── dropdown-menu.tsx              (265B) ★ Radix DropdownMenu
│   ├── ErrorBoundary.tsx              (101B)
│   ├── GridLoader.tsx / grid-loader.tsx
│   ├── input.tsx                      (26B)
│   ├── Select.tsx / select.tsx        (199B) ★ Radix Select
│   ├── Separator.tsx / separator.tsx
│   ├── Skeleton.tsx                   (13B)
│   ├── sonner.tsx                     (50B) ★ Sonner toast
│   ├── switch.tsx                     (29B)
│   ├── Text.tsx / text.tsx            (227B)
│   ├── Textarea.tsx / textarea.tsx   (49B)
│   ├── Toggle.tsx / toggle.tsx        (47B)
│   ├── Tooltip.tsx / tooltip.tsx     (66B) ★ Radix Tooltip
│   └── ... (many more primitives)
├── views/
│   ├── index.ts                       # Re-exports
│   ├── ChatView.tsx                   (505B) ★ Thin wrapper
│   ├── DiffView.tsx                   (72KB)
│   ├── FilesView.tsx                  (114KB)
│   ├── GitView.tsx                    (81KB)
│   ├── SettingsView.tsx               (29KB)
│   └── TerminalView.tsx               (45KB)
```

---

## 3. Component Inventory

### 3.1 Layout Components

#### `MainLayout` (`layout/MainLayout.tsx` — 967 lines)
The root desktop layout with **4-panel structure**:
- **Left**: Sidebar (projects, sessions, activity) — resizable 250–500px
- **Center**: Main content area with `ChatView` / `FilesView` / etc.
- **Right**: RightSidebar (context, agents, skills) — resizable 400–860px
- **Bottom**: BottomTerminalDock — collapsible

**Key props/behavior:**
- Manages sidebar open/close state
- Handles right sidebar auto-open/close at breakpoint widths
- Bottom terminal auto open/close at height breakpoints
- Mobile drawer animation using `framer-motion`
- Context panel visibility per directory
- Session switcher integration

#### `Header` (`layout/Header.tsx` — 2234 lines)
The **top navigation bar** (56px height):
- **Left section**: Back button, layout toggle, session title
- **Center section**: Tabs (Chat, Plan, Git, Diff, Files, Terminal)
- **Right section**: GitHub controls, MCP dropdown, Quota display, Settings, Help

**Key components inside Header:**
- `DesktopGitHubControl` — GitHub account switcher
- `QuotaDisplay` — Usage progress bar
- `ProviderLogo` — Model provider icons
- `McpDropdownContent` — MCP server status
- `ProjectActionsButton` — Project action menu
- `OpenInAppButton` — Desktop app deep link

#### `Sidebar` (`layout/Sidebar.tsx` — 164 lines)
The **left navigation panel** with:
- Toggle button
- Session list (from `SessionSidebar`)
- Activity sections (agents, skills, etc.)

#### `SessionSidebar` (`session/SessionSidebar.tsx` — 1564 lines)
The **project/session tree** in the sidebar:
- Project folders with session lists
- Session grouping (by directory/time)
- Drag-and-drop reordering with `@dnd-kit`
- Session search
- New session / multi-run buttons
- Scheduled tasks access

**Sub-components:**
- `SidebarHeader` — Action buttons (Add project, New session, Search, Settings)
- `SidebarProjectsList` — Project groups with DnD
- `SessionGroupSection` — Group of sessions with folder support
- `SessionNodeItem` — Individual session row
- `SidebarFooter` — Footer actions
- `SidebarActivitySections` — Agent/Skill activity

#### `RightSidebar` (`layout/RightSidebar.tsx` — 188 lines)
Context panel on the right:
- Tabs for Agents, Skills, MCP, Context
- `ContextPanel` (58KB) — File tree, context management

### 3.2 Chat Components

#### `ChatView` (`views/ChatView.tsx` — 505B)
Thin wrapper that renders:
```tsx
<ChatErrorBoundary>
  <ChatContainer />
</ChatErrorBoundary>
```

#### `ChatContainer` (`chat/ChatContainer.tsx` — 827 lines)
The **main chat orchestrator** that:
- Fetches session messages from sync store
- Manages scroll position
- Composes `ChatViewport` + `ChatInput`
- Handles "Load older messages" pagination
- Shows retry overlays

**Key sub-components:**
- `ChatViewport` — Scrollable message area with virtualization
- `ChatInput` (or `MobileSessionStatusBar` on mobile)
- `ScrollToBottomButton` — Floating button
- `ScrollShadow` — Top shadow on scroll

#### `MessageList` (`chat/MessageList.tsx` — 1666 lines)
**Virtualized message list** using `@tanstack/react-virtual`:
- Virtualizes 40+ messages for performance
- Turn grouping (user + assistant in one block)
- Skeleton loading for older messages
- "Load more" trigger
- Streaming message highlight
- Animation handlers for content changes

**Key logic:**
- Groups messages into turns (user → assistant responses)
- Hides shell bridge marker messages
- Applies retry overlays
- Handles user send animation (fade-in)

#### `ChatMessage` (`chat/ChatMessage.tsx` — 1129 lines)
**Individual message renderer**:
- Role indicator (user/assistant/system)
- Tool call sections (expandable/collapsible)
- Markdown body with syntax highlighting
- Code copy button
- Branch/revert/fork actions
- Streaming phase indicator

**Key features:**
- Tool output caching (expanded/collapsed state)
- `react-syntax-highlighter` for code blocks
- File diff rendering for edit/write tools
- Inline comment support

#### `ChatInput` (`chat/ChatInput.tsx` — 3714 lines)
**The main input component** (most complex):
- Auto-expanding textarea (max 8 lines visible)
- File attachment via drag-drop or button
- `@` mentions for files and agents
- `/` commands (slash commands)
- Model controls (`ModelControls`)
- Queued message chips
- Voice input button (browser)
- VS Code drop data handling
- Draft persistence (localStorage)

**Key sub-features:**
- File URI encoding for absolute paths
- IME composition support
- Drag-and-drop file parsing
- Tool state (attach file, voice, agent selector)

#### `MarkdownRenderer` (`chat/MarkdownRenderer.tsx` — 1486 lines)
**Rich markdown rendering**:
- `marked` for parsing
- `rehype-katex` for math (`$...$` and `$$...$$`)
- Syntax highlighting with `Prism`
- `react-syntax-highlighter` for code blocks
- Mermaid diagram rendering
- Link handling (external open, internal navigate)
- Table support
- Code copy button

#### `PermissionCard` (`chat/PermissionCard.tsx` — 469 lines)
**Permission request card** for tool execution:
- Tool type detection (bash, edit, write, webfetch)
- Context-specific rendering:
  - Bash: shows command with syntax highlighting
  - Edit/Write: shows diff preview
- "Once" / "Always" / "Reject" buttons
- Subagent permission forwarding indicator
- Syntax-highlighted code in diff previews

**Key props:**
```tsx
interface PermissionCardProps {
  permission: PermissionRequest;
  onResponse?: (response: 'once' | 'always' | 'reject') => void;
}
```

#### `QuestionCard` (`chat/QuestionCard.tsx` — 427 lines)
**Multi-step question/answer card**:
- Tabbed interface for multiple questions
- Checkbox / radio options
- Custom text input option
- Required validation
- Summary tab (overview of all answers)
- "Next unanswered" navigation
- Dismiss / Confirm buttons

**Key props:**
```tsx
interface QuestionCardProps {
  question: QuestionRequest;
}
```

#### `StatusRow` (`chat/StatusRow.tsx` — 326 lines)
**Session status display** (shown at bottom of chat):
- Working indicator (dots animation)
- Abort button
- Retry info
- Todo list display (in-progress, completed, pending)
- Permission waiting state
- Aborted state

#### `StatusChip` (`chat/StatusChip.tsx` — 65 lines)
**Compact status indicator** in header:
- Shows agent name, model name, effort variant
- Click opens controls drawer
- 28px height, rounded border

#### `ModelControls` (`chat/ModelControls.tsx` — 2803 lines)
**Model selection dropdown** (complex):
- Provider grouping
- Model search/filter
- Favorites
- Effort/efficiency variants
- Quota display per model
- Keyboard navigation

#### `ChatEmptyState` (`chat/ChatEmptyState.tsx` — 29 lines)
- OpenChamberLogo centered
- Error state if not reachable
- "Start a new chat" text

### 3.3 UI Primitives (`components/ui/`)

These are **shadcn-style** components built on Radix primitives:

| Component | File | Base | Key Features |
|-----------|------|------|-------------|
| `Button` | `button.tsx` | CVA variants | `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`; sizes: `default`, `sm`, `xs`, `lg`, `icon` |
| `Dialog` | `dialog.tsx` | `@radix-ui/react-dialog` | Full-featured modal with overlays |
| `DropdownMenu` | `dropdown-menu.tsx` | `@radix-ui/react-dropdown-menu` | Nested sub-menus, separators, labels |
| `Select` | `select.tsx` | `@radix-ui/react-select` | Grouped items, separators |
| `Tooltip` | `tooltip.tsx` | `@radix-ui/react-tooltip` | Arrow, animations, custom styling |
| `Textarea` | `textarea.tsx` | Native textarea | Consistent styling |
| `Input` | `input.tsx` | Native input | Consistent styling |
| `Checkbox` | `checkbox.tsx` | `@radix-ui/react-checkbox` | |
| `Switch` | `switch.tsx` | `@radix-ui/react-switch` | |
| `Toggle` | `toggle.tsx` | `@radix-ui/react-toggle` | |
| `Separator` | `separator.tsx` | `@radix-ui/react-separator` | |
| `Collapsible` | `collapsible.tsx` | `@radix-ui/react-collapsible` | |
| `ScrollArea` | `scroll-area.tsx` | `@radix-ui/react-scroll-area` | Custom scrollbar styling |
| `Command` | `command.tsx` | `cmdk` | Keyboard-driven command palette |
| `Skeleton` | `skeleton.tsx` | Div + animation | Pulse animation, rounded |
| `Card` | `card.tsx` | `card` class | Subtle border, rounded |
| `Alert` | `alert.tsx` | `alert` class | Destructive/info variants |
| `Sonner` | `sonner.tsx` | `sonner` | Toast notifications |
| `ErrorBoundary` | `ErrorBoundary.tsx` | React ErrorBoundary | Error recovery UI |
| `QuickOpenDialog` | `QuickOpenDialog.tsx` | `Command` | Ctrl+P file search |
| `CommandPalette` | `CommandPalette.tsx` | `Command` | Global shortcut (Ctrl+K) |

### 3.4 Session Components

#### `SessionDialogs` (`session/SessionDialogs.tsx` — 789 lines)
Orchestrates all session-related dialogs:
- Branch picker
- Directory explorer
- GitHub PR/Issue pickers
- Worktree creation
- Scheduled tasks
- Project notes / todos

#### `DirectoryTree` (`session/DirectoryTree.tsx` — 1065 lines)
**File browser tree**:
- Recursive directory rendering
- Git status indicators (modified, added, etc.)
- File type icons
- Expand/collapse state
- Hover actions (open, diff)

#### `NewWorktreeDialog` (`session/NewWorktreeDialog.tsx` — 2026 lines)
Complex worktree management:
- Branch selection / creation
- Worktree path configuration
- Existing worktree listing
- Delete worktree

---

## 4. Styling System

### 4.1 CSS Architecture

OpenChamber uses **Tailwind CSS + CSS Custom Properties** (no CSS-in-JS):

```
~/openchamber/packages/ui/src/styles/
├── design-system.css     # CSS custom properties (design tokens)
├── typography.css        # Semantic typography classes
└── mobile.css            # Mobile-specific overrides
```

### 4.2 Design Tokens (`design-system.css`)

Uses **OKLCH color space** for perceptually uniform colors:

```css
:root {
  /* Typography scale */
  --text-markdown: 0.9375rem;   /* 15px */
  --text-code: 0.8125rem;        /* 13px */
  --text-ui-header: 0.9375rem;
  --text-ui-label: 0.875rem;     /* 14px */
  --text-meta: 0.875rem;
  --text-micro: 0.875rem;

  /* Header height */
  --oc-header-height: 56px;

  /* Light theme */
  --background: oklch(0.97 0.02 85);    /* Warm sand */
  --foreground: oklch(0.25 0.02 40);    /* Dark warm text */
  --primary: oklch(0.65 0.2 55);         /* Orange accent */
  --border: oklch(0.85 0.02 70);
  /* ... */
}

.dark {
  /* Dark theme - Flexoki palette */
  --background: oklch(0.16 0.01 30);     /* #151313 */
  --foreground: oklch(0.85 0.02 90);    /* #cdccc3 */
  --card: oklch(0.19 0.01 40);          /* #1C1B1A */
  --primary: oklch(0.77 0.17 85);       /* #edb449 - golden sand */
  --secondary: oklch(0.29 0.01 40);     /* #343331 */
  --muted: oklch(0.33 0.01 40);         /* #403E3C */
  --border: oklch(0.31 0.01 35);        /* #393836 */
  --accent: oklch(0.77 0.17 85);         /* Golden */
  --destructive: oklch(0.65 0.15 30);   /* #d98678 */
  --ring: oklch(0.77 0.17 85);

  /* Charts */
  --chart-1: oklch(0.68 0.12 230);       /* Blue */
  --chart-2: oklch(0.68 0.12 145);       /* Green */
  --chart-3: oklch(0.7 0.13 95);         /* Yellow */
  --chart-4: oklch(0.65 0.14 45);        /* Coral */
  --chart-5: oklch(0.68 0.12 55);        /* Orange */
}
```

### 4.3 Typography Classes (`typography.css`)

Semantic typography system:

```css
.typography-markdown { font-size: var(--text-markdown); }
.typography-code { font-size: var(--text-code); }
.typography-ui-header { font-size: var(--text-ui-header); }
.typography-ui-label { font-size: var(--text-ui-label); }
.typography-meta { font-size: var(--text-meta); }
.typography-micro { font-size: var(--text-micro); }

/* Chat column width */
.chat-column {
  width: min(100%, 48rem);
  margin-inline: auto;
  padding-inline: calc(clamp(0.75rem, 2.5vw, 1rem) * var(--padding-scale, 1));
}
```

### 4.4 Global CSS (`index.css`)

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "./styles/design-system.css";
@import "./styles/typography.css";
@import "./styles/mobile.css";
@source "./**/*.{ts,tsx,css}";
```

### 4.5 Tailwind Integration

Uses Tailwind's `@layer` system:
- `@layer base` — CSS custom properties, element resets
- `@layer components` — Semantic classes
- `@layer utilities` — Utility classes

### 4.6 Mobile Styles (`mobile.css`)

Responsive breakpoints:
- Desktop: > 1024px
- Mobile: ≤ 1024px with `.mobile-pointer` class

Key mobile adaptations:
- Font size scaling (`--font-scale: 0.9`)
- Touch target minimum 36px
- iOS keyboard prevention (font-size: 16px on inputs)
- Mobile-only / desktop-only class toggles

---

## 5. State Management

### 5.1 Zustand Stores (`stores/`)

OpenChamber uses **Zustand** for global state with ~50+ stores:

| Store | Purpose |
|-------|---------|
| `useConfigStore` | Providers, agents, model configs |
| `useSessionUIStore` | Current session, errors, streaming state |
| `useUIStore` | Sidebar state, active tab, display settings |
| `useDirectoryStore` | Current working directory |
| `useGitStore` | Git branches, status |
| `useQuotaStore` | API quota tracking |
| `usePermissionStore` | Permission requests queue |
| `useMultiRunStore` | Multi-run session management |
| `useSkillsStore` | Available skills |
| `useMcpStore` | MCP server configurations |
| `useProjectsStore` | Project definitions |
| `useGlobalSessionsStore` | All sessions |
| `messageQueueStore` | Queued messages |
| `permissionStore` | Permission state |

### 5.2 Sync System (`sync/`)

The **sync system** is OpenChamber's real-time state synchronization layer:

```
sync/
├── sync-context.tsx         # React context for sync
├── use-sync.ts              # Hook for sync operations
├── session-ui-store.ts       # Session UI state
├── session-worktree-store.ts # Worktree state
├── viewport-store.ts         # Scroll position
├── input-store.ts            # Input state
├── notification-store.ts     # Notifications
├── selection-store.ts        # Selection state
├── content-cache.ts          # Message content cache
├── session-cache.ts          # Session cache
├── streaming.ts              # Streaming state
├── event-pipeline.ts         # Event handling pipeline
├── optimistic.ts             # Optimistic updates
├── submit.ts                 # Message submission
├── retry.ts                  # Retry logic
└── persist-cache.ts          # Local persistence
```

### 5.3 Store Patterns

```tsx
// Typical store definition pattern:
const useMyStore = create<MyState>()((set, get) => ({
  // State
  items: [],
  loading: false,

  // Actions
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
  setLoading: (loading) => set({ loading }),
}));

// Usage:
const items = useMyStore((s) => s.items);
const addItem = useMyStore((s) => s.addItem);
```

---

## 6. Key Dependencies

### 6.1 UI Components

| Package | Purpose |
|---------|---------|
| `react` + `react-dom` ^19 | UI framework |
| `@radix-ui/react-*` | Accessible primitives (Dialog, Dropdown, Tooltip, Select, etc.) |
| `tailwindcss` | Utility-first CSS |
| `class-variance-authority` | Component variant system |
| `clsx` | Conditional class merging |
| `@remixicon/react` | Icon library |
| `@tanstack/react-virtual` | Virtualized lists |
| `@dnd-kit/core` + `@dnd-kit/sortable` | Drag and drop |
| `framer-motion` | Animations |
| `sonner` | Toast notifications |
| `cmdk` | Command palette |
| `@fontsource/ibm-plex-*` | IBM Plex fonts |

### 6.2 Markdown & Code

| Package | Purpose |
|---------|---------|
| `marked` | Markdown parsing |
| `rehype-katex` + `remark-math` | Math rendering |
| `prismjs` | Syntax highlighting |
| `react-syntax-highlighter` | Code block rendering |
| `react-markdown` | React wrapper for marked |

### 6.3 Code Editor

| Package | Purpose |
|---------|---------|
| `@codemirror/*` | CodeMirror 6 modules |
| `@pierre/diffs` | Diff rendering |

### 6.4 Other

| Package | Purpose |
|---------|---------|
| `zustand` | State management |
| `@opencode-ai/sdk` | SDK types and utilities |
| `motion` | Animations |
| `fuse.js` | Fuzzy search |
| `dompurify` | HTML sanitization |

---

## 7. Migration Checklist

### Phase 1: Project Structure

- [ ] Create `frontend/src/components/layout/` directory
- [ ] Create `frontend/src/components/chat/` directory
- [ ] Create `frontend/src/components/chat/components/` directory
- [ ] Create `frontend/src/components/chat/message/` directory
- [ ] Create `frontend/src/components/chat/hooks/` directory
- [ ] Create `frontend/src/components/chat/lib/` directory
- [ ] Create `frontend/src/components/session/` directory
- [ ] Create `frontend/src/components/session/sidebar/` directory
- [ ] Create `frontend/src/components/ui/` directory
- [ ] Create `frontend/src/components/views/` directory
- [ ] Create `frontend/src/styles/` directory
- [ ] Create `frontend/src/stores/` directory
- [ ] Create `frontend/src/lib/` directory
- [ ] Create `frontend/src/contexts/` directory
- [ ] Create `frontend/src/hooks/` directory

### Phase 2: UI Primitives (copy from openchamber)

- [ ] Copy `components/ui/button.tsx`
- [ ] Copy `components/ui/skeleton.tsx`
- [ ] Copy `components/ui/tooltip.tsx`
- [ ] Copy `components/ui/dialog.tsx`
- [ ] Copy `components/ui/dropdown-menu.tsx`
- [ ] Copy `components/ui/select.tsx`
- [ ] Copy `components/ui/textarea.tsx`
- [ ] Copy `components/ui/input.tsx`
- [ ] Copy `components/ui/scroll-area.tsx`
- [ ] Copy `components/ui/ErrorBoundary.tsx`
- [ ] Copy `components/ui/sonner.tsx`
- [ ] Copy `components/ui/command.tsx`
- [ ] Copy `lib/utils.ts` (cn helper)

### Phase 3: Styling (copy from openchamber)

- [ ] Copy `styles/design-system.css`
- [ ] Copy `styles/typography.css`
- [ ] Copy `styles/mobile.css`
- [ ] Update `index.css` to import tailwind + design system
- [ ] Add tailwind.config with custom theme tokens

### Phase 4: Layout Components

- [ ] Create `components/layout/MainLayout.tsx`
- [ ] Create `components/layout/Header.tsx` (simplified)
- [ ] Create `components/layout/Sidebar.tsx`

### Phase 5: Chat Components

- [ ] Create `components/views/ChatView.tsx`
- [ ] Create `components/chat/ChatContainer.tsx` (from openchamber)
- [ ] Create `components/chat/MessageList.tsx` (simplified, no virtualization initially)
- [ ] Create `components/chat/ChatMessage.tsx` (simplified)
- [ ] Create `components/chat/ChatInput.tsx` (simplified, from openchamber)
- [ ] Create `components/chat/ChatEmptyState.tsx`
- [ ] Create `components/chat/ChatErrorBoundary.tsx`
- [ ] Create `components/chat/PermissionCard.tsx` (adapt from current)
- [ ] Create `components/chat/QuestionCard.tsx` (adapt from current)
- [ ] Create `components/chat/StatusRow.tsx`
- [ ] Create `components/chat/StatusChip.tsx`

### Phase 6: Session Components

- [ ] Create `components/session/SessionSidebar.tsx` (simplified from openchamber)
- [ ] Move directory/session list from current `SidebarPanel.tsx`

### Phase 7: Composer / Input

- [ ] Create `components/chat/ComposerPanel.tsx` (rename from current)

### Phase 8: Refactor App.tsx

- [ ] Simplify `App.tsx` to delegate to `MainLayout` + `ChatView`
- [ ] Move API logic to hooks or stores
- [ ] Extract conversation/message state to stores

### Phase 9: Dependencies

- [ ] Add `tailwindcss`, `tailwind-merge`, `clsx`, `class-variance-authority`
- [ ] Add `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tooltip`, `@radix-ui/react-select`
- [ ] Add `@remixicon/react` (or keep current icons)
- [ ] Add `sonner`
- [ ] Add `@fontsource/ibm-plex-sans` + `@fontsource/ibm-plex-mono`
- [ ] Add `@tanstack/react-virtual` (optional, can defer virtualization)
- [ ] Add `marked`, `react-markdown`, `react-syntax-highlighter` (for markdown)
- [ ] Add `zustand`

### Phase 10: State Management

- [ ] Create `stores/chatStore.ts` for conversation state
- [ ] Create `stores/sessionStore.ts` for session state
- [ ] Create `stores/uiStore.ts` for UI state
- [ ] Migrate from `useState` in `App.tsx` to Zustand stores

### Phase 11: Integration & Testing

- [ ] Ensure build passes
- [ ] Ensure all components render correctly
- [ ] Test conversation flow (send message, receive response)
- [ ] Test permission/question cards
- [ ] Test model selection
- [ ] Test session switching

---

## Appendix A: Component Props Reference

### ChatView
```tsx
// ~/openchamber/packages/ui/src/components/views/ChatView.tsx
export const ChatView: React.FC = () => {
    const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
    return (
        <ChatErrorBoundary sessionId={currentSessionId || undefined}>
            <ChatContainer />
        </ChatErrorBoundary>
    );
};
```

### ChatContainer
```tsx
// State: messages from sync, scroll refs, turn navigation
// Renders: ChatViewport + ChatInput (desktop) or MobileSessionStatusBar (mobile)
```

### ChatInput
```tsx
// Props: (none - reads from stores)
// Features: textarea, file attachment, @ mentions, / commands, model controls
// Key hooks: useInputStore, useSessionUIStore, useMessageQueueStore
```

### PermissionCard
```tsx
interface PermissionCardProps {
  permission: PermissionRequest;
  onResponse?: (response: 'once' | 'always' | 'reject') => void;
}
```

### QuestionCard
```tsx
interface QuestionCardProps {
  question: QuestionRequest;
}
// Renders: Tabbed interface with options, custom text, summary
```

### SessionSidebar
```tsx
interface SessionSidebarProps {
  mobileVariant?: boolean;
  onSessionSelected?: (sessionId: string) => void;
  allowReselect?: boolean;
  hideDirectoryControls?: boolean;
  showOnlyMainWorkspace?: boolean;
}
```

---

## Appendix B: Current Pi-Web-App Components

```
frontend/src/
├── App.tsx              (480 lines) — monolithic, needs decomposition
├── api.ts               — REST API client
├── chatState.ts         — message parsing (SSE → ConversationItem[])
├── interactionMessages.ts
├── types.ts             — SessionInfo, ModelInfo, DirectoryInfo, StreamingState
├── hooks/
│   └── useSessionStream.ts — SSE connection management
├── components/
│   ├── ComposerPanel.tsx    (119 lines)
│   ├── ConversationPanel.tsx (143 lines)
│   ├── QuestionPermissionPanel.tsx (107 lines)
│   └── SidebarPanel.tsx     (264 lines)
└── styles.css           (CSS custom properties, Flexoki dark)
```

---

## Appendix C: Design Token Reference

### Dark Theme (Current)

```css
:root {
  /* Backgrounds */
  --background: #151313;        /* Main background */
  --surface: #1c1b1a;           /* Cards, panels */
  --surface-2: #1f1e1d;         /* Elevated surfaces */
  --surface-3: #282726;         /* Popovers, dropdowns */

  /* Text */
  --foreground: #cecdc3;        /* Primary text */
  --muted: #807e79;             /* Secondary text */
  --muted-foreground: #b6b4ab;  /* Tertiary text */

  /* Accent (Warm Orange) */
  --accent: #da702c;
  --accent-hover: #f9ae77;
  --accent-soft: rgba(218, 112, 44, 0.14);

  /* Borders */
  --border: #343331;
  --border-hover: #403e3c;

  /* Semantic */
  --destructive: #d14d41;
  --success: #a0af54;
  --warning: #da702c;
  --info: #4385be;
}
```

### Typography Scale

```css
--text-markdown: 0.9375rem;  /* 15px - message content */
--text-code: 0.8125rem;        /* 13px - code blocks */
--text-ui-label: 0.875rem;    /* 14px - UI labels */
--text-meta: 0.8125rem;        /* 13px - metadata */
```

### Spacing

```css
--sidebar-width: 280px;
--header-height: 48px;
--radius: 0.625rem;            /* 10px */
```

---

## Appendix D: Key Differences to Address

| Aspect | Current Pi-Web-App | OpenChamber |
|--------|-------------------|-------------|
| Layout | Single file in App.tsx | MainLayout with panels |
| Styling | Custom CSS | Tailwind + CSS custom properties |
| State | useState in App.tsx | Zustand stores (~50+) |
| Icons | Custom SVG | @remixicon/react |
| Markdown | Raw text | marked + react-markdown + syntax highlighting |
| Sessions | Simple list | Project groups + folders + DnD |
| Input | Textarea | Full ChatInput with mentions, attachments |
| Messages | Simple list | Virtualized with turn grouping |
| Permissions | Inline buttons | Dedicated PermissionCard with syntax highlighting |
| Questions | Simple form | Tabbed QuestionCard |
| Components | Flat structure | Nested by domain |

---

*Analysis generated: 2026-04-18*
