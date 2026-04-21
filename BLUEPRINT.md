# Pi Web - Rewrite Blueprint

> **Branch**: `rewrite` | **Date**: 2026-04-19 | **Status**: Feature-complete (polishing)

---

## Table of Contents

0. [Current Implementation Snapshot](#0-current-implementation-snapshot)
1. [Vision & Principles](#1-vision--principles)
2. [Architecture Overview](#2-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [System Design](#4-system-design)
5. [Feature Planning](#5-feature-planning)
6. [V1 Scope (MVP)](#6-v1-scope-mvp)
7. [Phase 2+ Features](#7-phase-2-features)
8. [File Structure](#8-file-structure)
9. [Data Models](#9-data-models)
10. [API Specification](#10-api-specification)
11. [SSE Protocol](#11-sse-protocol)
12. [State Management](#12-state-management)
13. [Testing Strategy](#13-testing-strategy)
14. [Deployment](#14-deployment)
15. [Migration Checklist](#15-migration-checklist)

---

## 0. Current Implementation Snapshot

### 0.1 Delivered so far

- Backend SDK bridge integrated with `@mariozechner/pi-coding-agent`, including dynamic `ModelRegistry` model keys.
- Persistent JSONL session storage and replayable SSE history on disk; session status persistence now normalizes to OpenChamber-style busy/idle semantics so active runs stay marked working until the agent completes.
- REST + SSE backend wiring for sessions, messages, models, and live event streaming.
- **OpenChamber-aligned frontend** with Tailwind CSS v4, Radix UI primitives, light theme with warm/beige palette (oklch-based), IBM Plex Sans/Mono fonts, 304px sidebar, and 56px header; session resumption now flows through an OpenChamber-style `frontend/src/sync/*` layer (`bootstrap`, `child-store`, `event-reducer`, `global-sync-store`, `index`, `input-store`, `live-aggregate`, `notification-store`, `optimistic`, `persist-cache`, `selection-store`, `session-actions`, `session-cache`, `session-prefetch-cache`, `sync-context`, `sync-refs`, `sessionActivity`, `use-app-controller`, `use-sync`, `viewport-store`, `voice-store`) instead of only local transport state; session list/status are split from selection/current-session state across `frontend/src/stores/sessionStore.ts` and `frontend/src/stores/sessionUiStore.ts`; mobile chrome is now being tightened with a drawer-style sidebar/backdrop, wrapped composer controls, and touch-friendly menu visibility on narrow screens.
- OpenChamber-style project/session management now runs from `~`-rooted project paths: the sidebar has an add-project directory explorer (lazy file tree + hidden toggle), searchable sessions, per-project selection, session/project dropdown menus, inline session rename, and active project persistence; new sessions default to the current project and the backend exposes `/api/config` + `/api/directories` so the home directory and project tree can be resolved consistently.
- Model selection picker now mirrors OpenChamber's desktop model menu with search, favorites, recent models, collapsible provider groups, and the full CLI-scoped registry; availability is reflected from live auth state and model changes reuse the shared Pi auth store (`~/.pi/agent/auth.json` + env) without a second login, instead of silently swapping models.
- Question/permission interaction UI was removed from the frontend; the current renderer focuses on chat turns, thinking, and tool blocks only.
- Thinking blocks and tool calls/results now render through the new OpenChamber-style conversation panel: assistant turns are built from ordered turn records, reasoning/tool blocks start collapsed, tool output is attached to its call, user/assistant rows animate with fade/wipe reveal, and the legacy ChatMessage/TurnItem/ToolBlock/ThinkingBlock and permission/question interaction components were removed. Session history loading still reconstructs assistant reasoning/visible-answer splits and tool rows into the same turn model, so old sessions no longer leak raw thought text into the assistant body. Tool calls/results carry the originating `messageId` through the chat store and the backend persists them in session history with stringified inputs (e.g. `pwd`) and final outputs while ignoring legacy duplicate `toolResult` message-end events; the client also sends a shared turn id with each prompt so optimistic placeholders and backend SSE events stay aligned. Reloads keep the OpenChamber-style call/output blocks intact; the turn stack preserves arrival order for interleaved thinking/tool events, historical tool input formatting in `frontend/src/sync/conversation.ts` was consolidated into one helper, and the frontend now uses OpenChamber-style wipe reveal animations on mount for reasoning/tool cards. The optimistic conversation row comes from the shared chat store, the frontend now re-syncs the active model to the backend on send and now rehydrates the selected session's running state from persisted status so returning to a live session keeps the running UI visible after reload/tab/session switches, and the new Settings dialog exposes the `show reasoning traces` checkbox which is enabled by default so reasoning visibility matches OpenChamber; the reasoning placeholder no longer injects a literal `thinking…` string, the reasoning block itself now uses the same inline summary/expand pattern with mount and expand/collapse animations that no longer change the surrounding layout when hidden, the working indicator now appears as a message-level OpenChamber-style placeholder while the bottom bar stays minimal for abort/error, and the top connection banner is error-only. Session/project chrome now includes project and session dropdown menus, inline session rename, and the add-project file-tree explorer backed by `/api/directories`.
- Send-only composer (Enter to send, Shift+Enter newline), Stop button, Build chip.
- SSE reconnect backoff, session existence check on SSE route, server binds to 0.0.0.0.
- **Build/test green (55 frontend tests, 79 backend tests)**, live `pi-web.service` on `0.0.0.0:3210`.
- Frontend cache persistence is disabled by default to avoid stale client-side state; optional opt-in via `VITE_ENABLE_FRONTEND_CACHE=true`.
- Thinking level selector (`minimal`/`low`/`medium`/`high`/`xhigh`) exposed in the composer panel via a styled select dropdown; levels are fetched per-session via `GET /api/models/session/thinking`, persisted via `PUT /api/models/session/thinking`, and forwarded to `agentSession.setThinkingLevel()` on each prompt.
- Missing API key/model-auth failures no longer take down the backend process: SDK `setModel()` calls are awaited so rejections are handled in-route, and `GET /api/models/session/thinking` now returns the real error to the client instead of silently masking it; the composer now shows the same message inline under the thinking-level selector for clear UX context.
- Compaction disabled via `settingsManager.applyOverrides({ compaction: { enabled: false } })` and SDK compaction hooks no-op to prevent `totalTokens` crashes in multi-turn sessions.
- systemd service launches Bash interactively so `~/.bashrc` exports (including `OPENCODE_API_KEY`) are visible to the backend, matching CLI credentials; the CLI remains the source of truth for auth/model access.
- Model selection now persisted per-session via `PUT /api/models/session/model`; active model is selected by `isSelected` flag from the API.
- Sidebar toggle functionality with dynamic icons (PanelLeftClose/PanelLeft).
- `crypto.randomUUID()` fallback for browser compatibility.

### 0.2 OpenChamber UI/UX Components ✅ (2026-04-19)

New chat UI components aligned with OpenChamber architecture, plus the project/session chrome and dialogs that mirror OpenChamber's `~`-rooted workflow:

```
frontend/src/components/chat/
├── message/
│   ├── FadeInOnReveal.tsx      # Wipe/fade animation wrapper
│   ├── MessageHeader.tsx        # Role + timestamp header
│   ├── MessageBody.tsx          # Content renderer for all message types
│   ├── MarkdownRenderer.tsx     # Markdown with syntax highlighting
│   ├── timeFormat.ts           # Timestamp formatting utilities
│   └── parts/
│       ├── AssistantTextPart.tsx  # Assistant message text
│       ├── ReasoningPart.tsx      # Thinking/reasoning blocks
│       ├── ToolPart.tsx           # Tool call/output blocks
│       └── MinDurationShineText.tsx # Streaming text animation
├── components/
│   ├── TurnActivity.tsx         # Working indicator
│   └── ScrollToBottomButton.tsx # Scroll navigation
└── (legacy turn/message wrappers removed; ConversationPanel now renders turns directly)

frontend/src/lib/
├── codeTheme.ts                 # Syntax highlighting themes
└── useTheme.ts                  # Theme hook
```

**CSS additions:**
- `.reasoning-block`, `.reasoning-summary`, `.reasoning-body` - Thinking styling
- `.tool-block`, `.tool-header`, `.tool-section` - Tool styling
- `.streaming-dot`, `.streaming-bar` - Streaming indicators
- `.message-streaming-dots` - Assistant streaming animation
- `.shine-text-container` - Text reveal animation
- `.scroll-to-bottom-button` - Scroll navigation
- `.turn-activity`, `.turn-activity-dot` - Turn activity indicators
- `.markdown-body` - Markdown content styling

**Pending deferred items:**
- markdown rendering, syntax highlighting, virtualization, keyboard shortcuts, slash commands, todo system, command palette.

### 0.3 OpenChamber Migration Complete ✅

The frontend has been restructured to match OpenChamber's architecture:

```
frontend/src/
├── components/
│   ├── chat/          # ChatView, ConversationPanel, ComposerPanel, etc.
│   ├── layout/        # MainLayout, Header, Sidebar
│   ├── session/       # SidebarPanel (directories, sessions, models)
│   ├── ui/            # 20+ Radix-based primitives (Button, Dialog, etc.)
│   └── views/         # ChatView container
├── stores/           # Zustand stores (chatStore, sessionStore, uiStore)
├── lib/              # Utilities (cn helper)
├── styles/           # design-system.css, typography.css (Flexoki tokens)
└── types.ts
```

### 0.4 Notes

- Implementation is production-shaped and actively serving at `http://161.97.116.63:3210`; systemd now sources `~/.bashrc` so the backend sees the same API keys as the CLI, and the web app defers to the CLI's auth/config instead of duplicating credentials.
- Blueprint remains the planning source of truth for deferred items.
- **OpenChamber migration complete** - frontend now uses same component organization, styling system, and UI primitives; model picker mirrors OpenChamber with search, favorites, provider groups, and the full CLI-scoped model set, and the chat pane now uses the new turn-aware ConversationPanel renderer instead of the old legacy message wrappers.
- Zustand stores fully integrated into App.tsx (chatStore, sessionStore, uiStore).
- UI fully translated to English with light theme (warm/beige palette).
- Thinking/tool rendering now mirrors OpenChamber more closely: collapsed summary rows, hover/open icon swap for reasoning/tool cards, reasoning/answer splitting for session history, persisted tool call/output rows with string inputs, deduped legacy toolResult message-end events, compact call headers with collapsed outputs, removed duplicate section text, cleaned reasoning body styling, command/output surfaces for bash-style tools, and chronological turn-stack ordering for interleaved tool events.
- **New chat UI components** (2026-04-19): FadeInOnReveal animations, MessageHeader/MessageBody renderers, MarkdownRenderer with syntax highlighting, ConversationPanel turn grouping, TurnActivity, ScrollToBottomButton, and extensive CSS for reasoning blocks, tool blocks, and streaming indicators.
- Remaining deferred: full markdown rendering enhancements, syntax highlighting refinement, virtualization, keyboard shortcuts, slash commands, todo system, command palette.

## 1. Vision & Principles

### 1.1 Vision
A **lean, maintainable** web UI for the `@mariozechner/pi-coding-agent` SDK that:
- Works reliably for daily coding tasks
- Handles reconnections gracefully
- Is easy to extend and debug
- Can be understood by a single developer in < 1 hour

### 1.2 Design Principles

| Principle | What It Means |
|-----------|--------------|
| **Simplicity over cleverness** | No console.log interception, no global context setters, no magic refs |
| **Single source of truth** | Each piece of data lives in exactly one place |
| **Type-safe everywhere** | No `any` across the wire, strict TypeScript everywhere |
| **Explicit over implicit** | Dependency injection, not global state mutation |
| **Testable by default** | Every module can be tested in isolation |
| **Config-driven** | No hardcoded paths, ports, or credentials |
| **URL-driven navigation** | Every state is bookmarkable and shareable |

### 1.3 Lessons Learned (What NOT to Repeat)

| Problem | Root Cause | Solution |
|---------|-----------|----------|
| App.tsx grew to 1157 lines | No decomposition | Strict component boundaries, max 200 lines per component |
| Duplicate message parsing | Logic scattered in 3+ places | Single `parseJsonlToMessages()` function |
| Route modules used global setters | No DI pattern | Express.Router with constructor injection |
| Hardcoded `/home/manu` paths | No config layer | `.env` + config module |
| Port mismatch (3210 vs 3211) | No single source of truth | Single `config.ts` with defaults |
| Dead code persisted | No cleanup policy | Remove unused code immediately, no feature flags for dead features |
| Fragile streaming state via refs | No proper state manager | Zustand as single source of truth |

---

## 2. Architecture Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser (React 19)                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ ChatView    │  │ SessionPanel │  │ ModelSelector  │  │
│  │ (messages)  │  │ (sidebar)    │  │ (dropdown)     │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                │                   │           │
│  ┌──────┴────────────────┴───────────────────┴────────┐  │
│  │              Zustand Store (state)                  │  │
│  └──────┬──────────────────────────────────┬──────────┘  │
│         │                                  │              │
│  ┌──────┴──────┐                    ┌──────┴──────────┐  │
│  │ SSE Client  │◄── EventSource ─── │  Event Stream   │  │
│  │ (read)      │                    │  (text,tool,...)│  │
│  └─────────────┘                    └─────────────────┘  │
│  ┌─────────────┐                                         │
│  │ REST Client │── fetch ──► POST /api/messages/prompt   │
│  │ (write)     │              POST /api/messages/abort   │
│  └─────────────┘              PUT  /api/session/model   │
└─────────────────────────────────────────────────────────┘
                         │
                    HTTP / SSE
                         │
┌─────────────────────────────────────────────────────────┐
│              Express Server (Node.js, port 3210)         │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ REST Routes │  │ SSE Manager  │  │ Session Store  │  │
│  │ /api/       │  │ (broadcast)  │  │ (in-memory)    │  │
│  │ messages    │  │              │  │                │  │
│  │ sessions    │  │              │  │                │  │
│  │ models      │  │              │  │                │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                │                   │           │
│  ┌──────┴────────────────┴───────────────────┴────────┐  │
│  │          SDK Bridge (AgentSession factory)          │  │
│  │  • One AgentSession per CWD                         │  │
│  │  • Forward SDK events → SSE clients                │  │
│  │  • Route REST commands → SDK methods               │  │
│  └──────────────────────┬──────────────────────────────┘  │
│                         │                                  │
│  ┌──────────────────────┴──────────────────────────────┐  │
│  │  Session Persistence (JSONL files)                   │  │
│  │  ~/.pi/agent/sessions/<session-id>.jsonl            │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                         │
                    in-process
                         │
┌─────────────────────────────────────────────────────────┐
│  @mariozechner/pi-coding-agent SDK                       │
│  • AgentSession(prompt, steer, abort, setModel)         │
│  • Emits: text, thinking, tool_call, error, done...     │
│  • Persists: JSONL session files                        │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Communication Protocol

```
┌─────────────────────────────────────────────────────────┐
│                    Protocol: SSE + REST                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Client ◄── SSE ── Server                               │
│           (EventSource, streaming events)                │
│                                                          │
│  Events: text_chunk, thinking, tool_call, tool_result,   │
│          question, permission, error, done, session_end  │
│                                                          │
│  ─────────────────────────────────────────────────────   │
│                                                          │
│  Client ── REST ──► Server                              │
│           (fetch, commands)                              │
│                                                          │
│  Commands: POST /api/messages/prompt                     │
│            POST /api/messages/abort                      │
│            POST /api/messages/steer                      │
│            POST /api/messages/follow_up                  │
│            PUT  /api/session/model                       │
│            GET  /api/sessions                            │
│            POST /api/sessions                            │
│            DELETE /api/sessions/:id                      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 2.3 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **In-process SDK** | Zero overhead, direct API access, no subprocess management |
| **SSE (not WebSocket)** | Simpler, better HTTP compatibility, follows standard patterns |
| **JSONL session files** | Durable, crash-safe, no database needed, easily scannable |
| **URL as source of truth** (`?cwd=&session=`) | Bookmarkable, browser nav works, shareable |
| **Per-CWD session pooling** | Multiple tabs on same CWD share events |
| **Zustand for state** | Lightweight, simple, no boilerplate like Redux |

---

## 3. Technology Stack

### 3.1 Backend

| Component | Technology | Version | Notes |
|-----------|-----------|---------|-------|
| Runtime | Node.js | >= 20 | LTS minimum |
| Framework | Express | 4.x | Mature, well-known |
| SDK | `@mariozechner/pi-coding-agent` | latest | In-process |
| Validation | Zod | 3.x | Runtime type validation |
| Logging | pino | 9.x | Structured JSON logs |
| Testing | Vitest | 2.x | Unit + integration |
| Config | dotenv | 16.x | Environment variables |

### 3.2 Frontend

| Component | Technology | Version | Notes |
|-----------|-----------|---------|-------|
| Framework | React | 19.x | Latest stable |
| Language | TypeScript | 5.x | Strict mode |
| State | Zustand | 5.x | Minimal boilerplate |
| Build | Vite | 6.x | Fast HMR |
| Styling | CSS Modules | - | No CSS-in-JS, no Tailwind dependency |
| Testing | Vitest + Testing Library | - | Component + unit tests |
| Markdown | marked + DOMPurify | - | Sanitized rendering |
| Syntax HL | highlight.js | - | Code blocks |

### 3.3 Infrastructure

| Component | Technology | Notes |
|-----------|-----------|-------|
| Process Manager | systemd | Linux service |
| Reverse Proxy | nginx | TLS, compression |
| Package Manager | npm | Workspaces |

---

## 4. System Design

### 4.1 Module Boundaries

```
src/
├── config/           # Environment, defaults, validation
├── sdk/              # SDK bridge, AgentSession factory, event forwarding
├── sessions/         # Session lifecycle, JSONL parser, persistence
├── models/           # Model resolution, auth, listing
├── api/              # Express routes (REST endpoints)
│   ├── messages.ts   # POST /api/messages/*
│   ├── sessions.ts   # CRUD /api/sessions
│   └── models.ts     # GET /api/models
├── sse/              # SSE connection management, broadcasting
│   ├── manager.ts    # Client registry, broadcast logic
│   └── handler.ts    # GET /api/events endpoint
└── server.ts         # Express app bootstrap, startup, shutdown
```

```
frontend/src/
├── components/       # UI components
│   ├── ChatView/     # Message list, input area
│   ├── SessionPanel/ # Sidebar, session list
│   ├── ModelSelector/# Model dropdown
│   ├── Message/      # Single message rendering
│   └── Reconnect/    # Reconnection banner
├── hooks/            # Custom React hooks
│   ├── useSSE.ts     # SSE connection, EventSource lifecycle
│   ├── useSession.ts # Session loading, message fetching
│   └── useModels.ts  # Model list, selection, auth
├── store/            # Zustand stores
│   ├── session.ts    # Active session, messages, status
│   ├── models.ts     # Available models, selected model
│   └── ui.ts         # Sidebar, theme, visibility
├── services/         # API clients (REST calls)
│   ├── messages.ts   # sendPrompt, abort, steer
│   ├── sessions.ts   # listSessions, createSession, deleteSession
│   └── models.ts     # listModels, setModel
├── types/            # Shared TypeScript types
│   ├── events.ts     # SSE event types
│   ├── messages.ts   # Message, ContentPart types
│   └── session.ts    # Session, SessionStatus types
└── utils/            # Pure utility functions
    ├── jsonl.ts      # JSONL parsing, serialization
    ├── markdown.ts   # Markdown → HTML (sanitized)
    └── time.ts       # Timestamps, formatting
```

### 4.2 Dependency Injection Pattern

All route modules receive dependencies via constructor, NOT via global setters:

```typescript
// ✅ CORRECT: Explicit dependencies
export function createMessagesRouter(sdk: SdkBridge) {
  const router = express.Router();
  router.post('/prompt', async (req, res) => {
    await sdk.prompt(req.body.sessionId, req.body.message);
    res.json({ ok: true });
  });
  return router;
}

// ❌ WRONG: Global context setter (old pattern)
let messageContext: any;
export function setMessageContext(ctx: any) { messageContext = ctx; }
```

### 4.3 Configuration Layer

```typescript
// src/config/index.ts
import { z } from 'zod';

const configSchema = z.object({
  port: z.coerce.number().default(3210),
  homeDir: z.string().default(process.env.HOME ?? '/home/pi'),
  agentDir: z.string().default(process.env.PI_AGENT_DIR ?? '~/.pi'),
  sessionDir: z.string().default(process.env.PI_SESSIONS_DIR ?? '~/.pi/agent/sessions'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  nodePath: z.string().default(process.env.NODE_PATH ?? '/usr/bin/node'),
  corsOrigins: z.array(z.string()).default(['*']),
});

export const config = configSchema.parse(process.env);
```

No hardcoded paths. Ever.

---

## 5. Feature Planning

### 5.1 Feature Matrix

| Feature | Priority | Phase | Complexity | Status |
|---------|----------|-------|------------|--------|
| Send prompt, receive streaming response | **P0** | V1 | Medium | ✅ Proven |
| Abort current response | **P0** | V1 | Low | ✅ Proven |
| Session create / load / delete | **P0** | V1 | Medium | ✅ Proven |
| SSE connection with auto-reconnect | **P0** | V1 | Medium | ✅ Proven |
| Model listing + switching | **P0** | V1 | Low | ✅ Proven |
| Multi-CWD support | **P0** | V1 | Low | ✅ Proven |
| Multi-client broadcasting | **P1** | V2 | Medium | ✅ Proven |
| Message part gap recovery | **P1** | V2 | High | ⚠️ Partial |
| Event coalescing | **P1** | V2 | Medium | ⚠️ Partial |
| Chronological message ordering (optimistic + persisted merge) | **P1** | V2 | Low | ✅ Proven |
| Image support (paste/pick) | **P2** | V3 | Medium | ❌ Deferred |
| Steer / Follow-up | **P2** | V3 | Low | ✅ Proven |
| Session status in sidebar | **P1** | V2 | Low | ✅ Proven |
| OpenChamber-style working indicator placement + compact message spacing | **P1** | V2 | Low | ✅ Proven |
| Error pattern detection | **P2** | V3 | High | ⚠️ Partial |
| Context compaction display | **P2** | V3 | Low | ✅ Proven |
| Server log viewer | **P3** | V4 | Low | ✅ Proven |
| Shell mode (interactive terminal) | **P3** | V4 | High | ❌ Deferred |
| Slash commands | **P3** | V4 | Medium | ❌ Deferred |
| Todo system (AI-generated) | **P3** | V4 | Medium | ❌ Deferred |

### 5.2 V1 Feature Specifications

#### F1: Send Prompt → Receive Stream

**User Story**: As a user, I type a message and see the AI respond in real-time.

**Flow**:
```
User types → [Send] → POST /api/messages/prompt
                        ↓
                   SdkBridge.prompt(sessionId, text, images?)
                        ↓
                   AgentSession emits: text_chunk, thinking, tool_call, ...
                        ↓
                   SSE Manager broadcasts to all clients on this CWD
                        ↓
                   SSE Client receives → Zustand store updates
                        ↓
                   ChatView renders streaming content
```

**Acceptance Criteria**:
- [ ] Text appears character-by-character (or chunk-by-chunk)
- [ ] Thinking blocks are collapsible
- [ ] Tool calls show name + input, then results
- [ ] Streaming stops on `done` event
- [ ] Network error shows retry banner
- [ ] Input disabled while streaming

#### F2: Abort

**User Story**: As a user, I can stop the AI mid-response.

**Flow**:
```
User clicks [Stop] → POST /api/messages/abort
                          ↓
                     SdkBridge.abort(sessionId)
                          ↓
                     AgentSession.abort()
                          ↓
                     SSE: `done` event with `aborted: true`
                          ↓
                     UI shows "Aborted" footer
```

**Acceptance Criteria**:
- [ ] Stop button visible during streaming
- [ ] Response stops within 1-2 seconds
- [ ] "Aborted" message shown in footer
- [ ] Input re-enabled after abort

#### F3: Session Management

**User Story**: As a user, I can create, load, and delete sessions.

**Endpoints**:
- `GET /api/sessions?cwd=...` → list sessions for CWD
- `POST /api/sessions` → create new session
- `DELETE /api/sessions/:id` → delete session
- `GET /api/sessions/:id/messages` → load session messages (JSONL)

**Acceptance Criteria**:
- [ ] New session created on first message (if no session selected)
- [ ] Session list shows: id, date, last message preview
- [ ] Loading a session renders all messages
- [ ] Deleting a session removes it from list and disk
- [ ] URL updates: `?cwd=/path&session=<id>`

#### F4: SSE Auto-Reconnect

**User Story**: As a user, if the connection drops, it reconnects automatically.

**Behavior**:
```
Connection lost → Retry in 1s
                 → Retry in 2s (with jitter)
                 → Retry in 4s (with jitter)
                 → ...
                 → Max 30s interval
                 → After 5 min, give up, show banner
```

**Acceptance Criteria**:
- [ ] Reconnects automatically on network error
- [ ] Exponential backoff with jitter
- [ ] Banner shows "Reconnecting..." with attempt count
- [ ] On reconnect, re-fetches session state
- [ ] After 5 min timeout, shows "Connection lost" with manual retry button

#### F5: Model Selection

**User Story**: As a user, I can choose which AI model to use.

**Flow**:
```
GET /api/models → resolve all provider models
               → return: [{ id, name, provider, authRequired }, ...]
               → dropdown shows models
               → PUT /api/session/model { modelId } → switch
```

**Acceptance Criteria**:
- [ ] Model list loaded on startup (cached)
- [ ] Dropdown shows: name, provider icon
- [ ] Switching model shows confirmation
- [ ] Auth-required models show login prompt
- [ ] Current model highlighted in dropdown

---

## 6. V1 Scope (MVP)

### 6.1 V1 Includes

| Component | What's In |
|-----------|-----------|
| **Backend** | Express server, SDK bridge, SSE manager, REST routes (messages, sessions, models), JSONL persistence, config module, structured logging |
| **Frontend** | ChatView (messages + input), SessionPanel (sidebar with session list), ModelSelector (dropdown), SSE hook, Zustand stores, Reconnect banner |
| **Protocol** | SSE events (text_chunk, thinking, tool_call, tool_result, question, permission, error, done), REST commands (prompt, abort, steer, follow_up, setModel) |
| **Navigation** | URL params `?cwd=&session=`, browser back/forward works |
| **Testing** | Unit tests for: JSONL parser, event coalescer, state machine, message parser, config validation |

### 6.2 V1 Excludes (Deferred to V2+)

- Multi-client broadcasting (works in old code, ported in V2)
- Message part gap recovery (V2)
- Question UI (V2)
- Permission UI (V2)
- Image support (V2)
- Error pattern detection (V3)
- Server log viewer (V3)
- Shell mode (V4)
- Slash commands (V4)

### 6.3 V1 Success Criteria

- [ ] Can send a prompt and see streaming response
- [ ] Can abort a response
- [ ] Can create/load/delete sessions
- [ ] Can switch models
- [ ] SSE reconnects automatically
- [ ] All TypeScript compiles with `--strict`
- [ ] Zero `any` types in new code
- [ ] All tests pass (`npm test`)
- [ ] Can deploy with `npm run build && npm start`
- [ ] No hardcoded paths (all via config/env)
- [ ] App.tsx < 200 lines
- [ ] No component > 200 lines
- [ ] No dead code (no unused imports, no commented blocks)
- [x] Removed legacy permission/question UI and helper files from the frontend

---

## 7. Phase 2+ Features

### 7.1 V2: Reliability + Collaboration

| Feature | Description | Effort |
|---------|-------------|--------|
| **Multi-client broadcasting** | Port existing pool-based broadcast from old code | Medium |
| **Message part gap recovery** | Detect missing parts after reconnect, fetch from JSONL | High |
| **Event coalescing** | Merge redundant events (e.g., rapid text_chunks) | Medium |
| **Global session status** | Sidebar shows status of ALL sessions | Low |
| **PAUSE/RESUME state** | Add to state machine, implement in SDK bridge | Medium |

### 7.2 V3: Rich Features

| Feature | Description | Effort |
|---------|-------------|--------|
| **Image support** | Paste/drop images in prompts | Medium |
| **Steer / Follow-up** | UI for steering, answering follow-ups | Low |
| **Error pattern detection** | Provider-specific error patterns | High |
| **Context compaction display** | Show compaction summary | Low |
| **Improved reconnection** | Smart state repair on reconnect | High |

### 7.3 V4: Advanced Features

| Feature | Description | Effort |
|---------|-------------|--------|
| **Shell mode** | Interactive terminal in browser | High |
| **Slash commands** | Command discovery, pipeline | Medium |
| **Todo system** | Display AI-generated todos | Medium |
| **Settings panel** | Theme, font size, keybindings | Medium |

---

## 8. File Structure

### 8.1 Complete Project Layout

```
pi-web-app/                          # NEW repo or branch
├── .env.example                     # All config vars documented
├── .gitignore
├── package.json                     # Workspaces: backend, frontend
├── README.md                        # Quick start
├── BLUEPRINT.md                     # THIS FILE
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── config/
│   │   │   ├── index.ts             # Config schema + validation
│   │   │   └── index.test.ts        # Config validation tests
│   │   ├── sdk/
│   │   │   ├── bridge.ts            # SdkBridge: wraps AgentSession
│   │   │   ├── bridge.test.ts       # Bridge unit tests
│   │   │   ├── factory.ts           # AgentSession factory per CWD
│   │   │   └── events.ts            # SDK event → SSE event mapping
│   │   ├── sessions/
│   │   │   ├── store.ts             # Session CRUD in memory
│   │   │   ├── store.test.ts
│   │   │   ├── jsonl.ts             # JSONL read/write/parser
│   │   │   └── jsonl.test.ts
│   │   ├── models/
│   │   │   ├── resolver.ts          # Model resolution, auth
│   │   │   └── resolver.test.ts
│   │   ├── api/
│   │   │   ├── messages.ts          # POST /api/messages/*
│   │   │   ├── sessions.ts          # CRUD /api/sessions
│   │   │   ├── models.ts            # GET /api/models
│   │   │   └── index.ts             # Router aggregation
│   │   ├── sse/
│   │   │   ├── manager.ts           # SSE client registry, broadcast
│   │   │   ├── manager.test.ts
│   │   │   └── handler.ts           # GET /api/events
│   │   ├── server.ts                # Express bootstrap
│   │   └── types.ts                 # Shared backend types
│   └── tests/
│       └── integration/
│           └── api.test.ts          # End-to-end API tests
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx                 # Entry point
│       ├── App.tsx                  # Layout only (< 100 lines)
│       ├── components/
│       │   ├── ChatView/
│       │   │   ├── index.tsx        # Message list + input
│       │   │   ├── MessageList.tsx  # Virtualized list
│       │   │   ├── InputArea.tsx    # Prompt input + send button
│       │   │   ├── MessageItem.tsx  # Single message
│       │   │   └── styles.module.css
│       │   ├── SessionPanel/
│       │   │   ├── index.tsx        # Sidebar
│       │   │   ├── SessionList.tsx  # Session list items
│       │   │   └── styles.module.css
│       │   ├── ModelSelector/
│       │   │   ├── index.tsx        # Dropdown
│       │   │   └── styles.module.css
│       │   ├── Reconnect/
│       │   │   ├── index.tsx        # Reconnection banner
│       │   │   └── styles.module.css
│       │   └── shared/
│       │       ├── Markdown.tsx     # Markdown renderer
│       │       ├── CodeBlock.tsx    # Syntax-highlighted code
│       │       └── LoadingSpinner.tsx
│       ├── hooks/
│       │   ├── useSSE.ts            # SSE connection lifecycle
│       │   ├── useSSE.test.ts       # Hook tests
│       │   ├── useSession.ts        # Session loading
│       │   └── useModels.ts         # Model list + selection
│       ├── store/
│       │   ├── session.ts           # Active session, messages, status
│       │   ├── session.test.ts
│       │   ├── models.ts            # Available + selected model
│       │   └── ui.ts                # Sidebar, theme, visibility
│       ├── services/
│       │   ├── api.ts               # Base fetch wrapper
│       │   ├── messages.ts          # sendPrompt, abort, steer
│       │   ├── sessions.ts          # listSessions, create, delete
│       │   └── models.ts            # listModels, setModel
│       ├── types/
│       │   ├── events.ts            # SSE event types (Zod-validated)
│       │   ├── messages.ts          # Message, ContentPart
│       │   ├── session.ts           # Session, SessionStatus
│       │   └── models.ts            # ModelInfo
│       └── utils/
│           ├── jsonl.ts             # JSONL parsing
│           ├── jsonl.test.ts
│           ├── markdown.ts          # Markdown → HTML (sanitized)
│           └── time.ts              # Timestamp formatting
│
├── public/                          # Static assets (favicon, etc.)
├── pi-web.service                   # systemd unit file
└── nginx.conf                       # Reverse proxy config template
```

### 8.2 Lines of Code Budget

| Module | Estimated LOC | Max LOC |
|--------|--------------|---------|
| `App.tsx` | 80 | 100 |
| Each component | 50-150 | 200 |
| Each hook | 40-100 | 150 |
| Each store | 50-100 | 150 |
| Each route | 50-100 | 150 |
| `server.ts` | 100-150 | 200 |
| `bridge.ts` | 150-200 | 250 |
| `manager.ts` (SSE) | 100-150 | 200 |
| Config | 30-50 | 80 |
| **Total backend** | ~800 | ~1200 |
| **Total frontend** | ~1200 | ~1800 |
| **Total project** | ~2000 | ~3000 |

Compare to current: `server.ts` alone is 1101 lines, `App.tsx` is 1157 lines. **Target: no single file > 250 lines.**

---

## 9. Data Models

### 9.1 TypeScript Types

```typescript
// ─── Events (SSE stream) ───────────────────────────────────────

type SseEvent =
  | TextChunkEvent
  | ThinkingEvent
  | ToolCallEvent
  | ToolResultEvent
  | QuestionEvent
  | PermissionEvent
  | ErrorEvent
  | DoneEvent
  | SessionEndEvent;

interface TextChunkEvent {
  type: 'text_chunk';
  sessionId: string;
  messageId: string;
  content: string;
  timestamp: string; // ISO 8601
}

interface ThinkingEvent {
  type: 'thinking';
  sessionId: string;
  messageId: string;
  content: string;
  done?: boolean;
  timestamp: string;
}

interface ToolCallEvent {
  type: 'tool_call';
  sessionId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  timestamp: string;
}

interface ToolResultEvent {
  type: 'tool_result';
  sessionId: string;
  messageId: string;
  toolCallId: string;
  result: string;
  success: boolean;
  timestamp: string;
}

interface QuestionEvent {
  type: 'question';
  sessionId: string;
  messageId: string;
  question: string;
  options?: string[];
  timestamp: string;
}

interface PermissionEvent {
  type: 'permission';
  sessionId: string;
  messageId: string;
  permissionId: string;
  action: string;
  resource: string;
  timestamp: string;
}

interface ErrorEvent {
  type: 'error';
  sessionId: string;
  message: string;
  category: 'network' | 'auth' | 'provider' | 'sdk' | 'unknown';
  recoverable: boolean;
  timestamp: string;
}

interface DoneEvent {
  type: 'done';
  sessionId: string;
  messageId: string;
  aborted: boolean;
  timestamp: string;
}

interface SessionEndEvent {
  type: 'session_end';
  sessionId: string;
  timestamp: string;
}

// ─── Messages (UI model) ───────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: ContentPart[];
  timestamp: string;
  status: 'streaming' | 'complete' | 'aborted' | 'error';
}

type ContentPart =
  | TextPart
  | ThinkingPart
  | ToolCallPart
  | ToolResultPart
  | ImagePart;

interface TextPart {
  type: 'text';
  content: string;
}

interface ThinkingPart {
  type: 'thinking';
  content: string;
  done: boolean;
}

interface ToolCallPart {
  type: 'tool_call';
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

interface ToolResultPart {
  type: 'tool_result';
  toolCallId: string;
  result: string;
  success: boolean;
}

interface ImagePart {
  type: 'image';
  mimeType: string;
  data: string; // base64
}

// ─── Sessions ──────────────────────────────────────────────────

interface Session {
  id: string;
  cwd: string;       // Working directory
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  status: SessionStatus;
  modelId?: string;
}

type SessionStatus =
  | 'idle'
  | 'prompting'
  | 'steering'
  | 'answering'
  | 'waiting_question'
  | 'waiting_permission'
  | 'paused'
  | 'error'
  | 'done';

// ─── Models ────────────────────────────────────────────────────

interface ModelInfo {
  id: string;
  name: string;
  provider: 'copilot' | 'antigravity' | 'cloud' | 'openai' | 'qwen' | string;
  authRequired: boolean;
  authenticated: boolean;
}
```

### 9.2 JSONL Session File Format

Each line is a JSON object. Format is dictated by the SDK and must not be changed:

```jsonl
{"type":"user","content":"Hello","timestamp":"2026-04-15T10:00:00Z"}
{"type":"rpc_response","content":"Hi! How can I help?","timestamp":"2026-04-15T10:00:01Z"}
{"type":"tool_call","name":"read_file","input":{"path":"file.txt"},"timestamp":"2026-04-15T10:00:02Z"}
{"type":"tool_result","success":true,"content":"...","timestamp":"2026-04-15T10:00:03Z"}
```

The `jsonl.ts` module handles parsing these into `Message[]` objects. **Single parser, used everywhere.**

---

## 10. API Specification

### 10.1 REST Endpoints

#### POST /api/messages/prompt

Send a prompt to the current session.

```typescript
// Request
{
  "sessionId": string,    // Optional: auto-create if missing
  "cwd": string,          // Working directory
  "message": string,      // Text content
  "images"?: string[]     // Base64-encoded images (V2)
}

// Response: 200 OK
{ "ok": true, "sessionId": string }

// Response: 400 Bad Request
{ "error": "message is required" }
```

#### POST /api/messages/abort

Abort the current response.

```typescript
// Request
{ "sessionId": string }

// Response: 200 OK
{ "ok": true }

// Response: 409 Conflict (not streaming)
{ "error": "no active response" }
```

#### POST /api/messages/steer

Steer the current response.

```typescript
// Request
{ "sessionId": string, "message": string }

// Response: 200 OK
{ "ok": true }
```

#### POST /api/messages/follow_up

Answer a follow-up question.

```typescript
// Request
{ "sessionId": string, "message": string }

// Response: 200 OK
{ "ok": true }
```

#### PUT /api/session/model

Switch the model for a session.

```typescript
// Request
{ "sessionId": string, "modelId": string }

// Response: 200 OK
{ "ok": true, "model": ModelInfo }

// Response: 401 Unauthorized (needs auth)
{ "error": "authentication required", "model": ModelInfo }
```

#### GET /api/sessions

List sessions for a CWD.

```typescript
// Query: ?cwd=/path/to/project
// Response: 200 OK
{
  "sessions": [
    {
      "id": string,
      "createdAt": string,
      "updatedAt": string,
      "status": SessionStatus,
      "modelId"?: string
    }
  ]
}
```

#### POST /api/sessions

Create a new session.

```typescript
// Request
{ "cwd": string }

// Response: 201 Created
{ "id": string, "createdAt": string }
```

#### DELETE /api/sessions/:id

Delete a session.

```typescript
// Response: 200 OK
{ "ok": true }
```

#### GET /api/models

List available models.

```typescript
// Response: 200 OK
{
  "models": ModelInfo[]
}
```

---

## 11. SSE Protocol

### 11.1 Connection

```
GET /api/events?cwd=/path/to/project
Accept: text/event-stream
```

The SSE stream sends events for ALL sessions in the specified CWD.

### 11.2 Event Format

```
event: text_chunk
id: 42
data: {"type":"text_chunk","sessionId":"abc","messageId":"msg-1","content":"Hello","timestamp":"2026-04-15T10:00:00Z"}

event: done
id: 43
data: {"type":"done","sessionId":"abc","messageId":"msg-1","aborted":false,"timestamp":"2026-04-15T10:00:10Z"}
```

### 11.3 Event Types

| Event | Fields | Description |
|-------|--------|-------------|
| `text_chunk` | sessionId, messageId, content | Streaming text from AI |
| `thinking` | sessionId, messageId, content, done? | AI reasoning (collapsible) |
| `tool_call` | sessionId, messageId, toolCallId, toolName, input | AI calling a tool |
| `tool_result` | sessionId, messageId, toolCallId, result, success | Tool execution result |
| `question` | sessionId, messageId, question, options? | AI asks user a question |
| `permission` | sessionId, messageId, permissionId, action, resource | AI requests permission |
| `error` | sessionId, message, category, recoverable | Error occurred |
| `done` | sessionId, messageId, aborted | Response finished |
| `session_end` | sessionId | Session closed |

### 11.4 SSE Manager (Backend)

```typescript
interface SSEManager {
  addClient(cwd: string, clientId: string, res: ServerResponse): void;
  removeClient(clientId: string): void;
  broadcast(cwd: string, event: SseEvent): void;
  broadcastToSession(sessionId: string, event: SseEvent): void;
}
```

Clients are grouped by CWD. Events are broadcast to all clients in the same CWD.

### 11.5 SSE Client (Frontend)

```typescript
// useSSE.ts
function useSSE(cwd: string) {
  const url = `/api/events?cwd=${encodeURIComponent(cwd)}`;
  const es = new EventSource(url);

  es.onmessage = (raw) => {
    const event = parseSseEvent(raw);  // Zod-validated
    dispatch(event);                    // Updates Zustand store
  };

  es.onerror = () => {
    // Exponential backoff + jitter
    // Reconnect logic
  };

  useEffect(() => () => es.close(), []);
}
```

---

## 12. State Management

### 12.1 Zustand Stores

Three separate stores (not one monolithic store):

#### Session Store

```typescript
interface SessionState {
  // Active session
  activeSession: Session | null;
  sessionId: string | null;

  // Messages (flat array, ordered)
  messages: Message[];

  // Streaming state
  streamingMessageId: string | null;
  isStreaming: boolean;

  // Status
  status: SessionStatus;

  // Actions
  setActiveSession: (session: Session | null) => void;
  setMessages: (messages: Message[]) => void;
  appendMessage: (message: Message) => void;
  updateStreamingMessage: (part: ContentPart) => void;
  finalizeStreamingMessage: () => void;
  setStatus: (status: SessionStatus) => void;
}
```

#### Models Store

```typescript
interface ModelsState {
  models: ModelInfo[];
  selectedModelId: string | null;
  isLoading: boolean;

  loadModels: () => Promise<void>;
  selectModel: (modelId: string) => Promise<void>;
}
```

#### UI Store

```typescript
interface UIState {
  sidebarOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  cwd: string | null;

  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setCwd: (cwd: string) => void;
}
```

### 12.2 State Flow

```
SSE Event received
       ↓
useSSE hook parses + validates (Zod)
       ↓
Dispatch to Zustand store
       ↓
Components re-render (via selectors, not full store)
```

**NO refs for streaming state.** The streaming message is tracked in Zustand:
- `streamingMessageId` identifies the in-progress message
- `updateStreamingMessage` appends parts to it
- `finalizeStreamingMessage` marks it complete

### 12.3 Session Status Machine

```
┌───────┐   prompt    ┌──────────┐
│ idle  │ ─────────► │ prompting│
└───┬───┘             └────┬─────┘
    │                       │
    │     steer       ┌─────┴──────┐
    ├───────────────► │ answering  │
    │                 └─────┬──────┘
    │                       │
    │     question    ┌─────┴──────────────┐
    ├───────────────► │ waiting_question   │
    │                 └─────┬──────────────┘
    │                       │
    │     permission  ┌─────┴──────────────┐
    ├───────────────► │ waiting_permission │
    │                 └─────┬──────────────┘
    │                       │
    │     done        ┌─────┴─────┐
    └───────────────► │   done    │
                      └─────┬─────┘
                            │
                            │ new prompt
                            ▼
                          idle (cycle)
```

---

## 13. Testing Strategy

> **⚠️ MANDATORY: Test-Driven Development (TDD)**
>
> Ogni implementazione segue il ciclo TDD. I test vengono scritti PRIMA del codice.
> Nessuna feature viene implementata senza test che la guidino.

### 13.1 TDD Workflow (Obbligatorio)

```
┌─────────────────────────────────────────────────────────────┐
│                    CICLO TDD PER OGNI FEATURE                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐                 │
│   │   RED   │───►│  GREEN  │───►│ REFACTOR │                 │
│   └────┬────┘    └────┬────┘    └────┬────┘                 │
│        │               │               │                     │
│        ▼               ▼               ▼                     │
│   Scrivi test    Scrivi codice    Migliora codice            │
│   che fallisce   minimo per       mantenendo test            │
│   (non esiste    far passare      verdi (clean code)         │
│   ancora)        il test                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Regole ferree:**

| Fase | Azione | Criterio |
|------|--------|----------|
| **RED** | Scrivi test per la funzionalità desiderata | Test deve FALLIRE (il codice non esiste) |
| **GREEN** | Scrivi il minimo codice per far passare il test | Solo funzionalità necessaria, niente extra |
| **REFACTOR** | Migliora codice mantenendo test verdi | Test sempre verdi, codice più pulito |

### 13.2 TDD per Backend

**Framework:** Vitest + supertest

**Ciclo per ogni modulo backend:**

```
1. Scrivi test per il modulo (RED)
   ├── Importa modulo da testare
   ├── Mocka dipendenze esterne (SDK, filesystem)
   ├── Definisci behavior atteso con assertions
   └── Verifica che test fallisca (modulo non esiste)

2. Implementa il modulo (GREEN)
   ├── Scrivi codice minimale per far passare test
   ├── Usa solo funzionalità strettamente necessarie
   └── Verifica che tutti i test passino

3. Refactor (REFACTOR)
   ├── Estrai codice duplicato
   ├── Rinomina per chiarezza
   ├── Aggiungi JSDoc se necessario
   └── Test devono rimanere verdi
```

**Esempio struttura test backend:**

```typescript
// src/backend/__tests__/jsonl.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { parseJsonlToMessages } from '../jsonl';

describe('jsonl', () => {
  describe('parseJsonlToMessages', () => {
    it('should parse valid JSONL lines into messages', () => {
      const input = `{"type":"user","content":"Hello"}\n{"type":"assistant","content":"Hi"}`;
      const messages = parseJsonlToMessages(input);
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({ role: 'user', content: 'Hello' });
    });

    it('should skip malformed JSON lines', () => {
      const input = `{"type":"user","content":"OK"}\nINVALID_JSON\n{"type":"assistant"}`;
      const messages = parseJsonlToMessages(input);
      expect(messages).toHaveLength(2);
    });

    it('should return empty array for empty input', () => {
      expect(parseJsonlToMessages('')).toEqual([]);
    });
  });
});
```

### 13.3 TDD per Frontend

**Framework:** Vitest + @testing-library/react

**Ciclo per ogni componente/hook:**

```
1. Scrivi test per il componente (RED)
   ├── Usa @testing-library/react (no enzyme)
   ├── Testa behavior, non implementazione
   ├── Mocka API calls (MSW o mock fetch)
   ├── Definisci user interaction attesa
   └── Verifica che test fallisca

2. Implementa il componente (GREEN)
   ├── Scrivi componente minimale
   ├── Usa solo hook standard
   └── Verifica che test passino

3. Refactor (REFACTOR)
   ├── Estrai logica in hook se complesso
   ├── Split se > 200 righe
   └── Test devono rimanere verdi
```

**Esempio struttura test frontend:**

```typescript
// src/frontend/__tests__/useChatStore.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatStore } from '../stores/useChatStore';

describe('useChatStore', () => {
  it('should add message to store', async () => {
    const { result } = renderHook(() => useChatStore());

    await act(async () => {
      result.current.addMessage({
        id: '1',
        role: 'user',
        content: 'Hello',
      });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Hello');
  });
});
```

**Esempio test componente ChatView:**

```typescript
// src/frontend/__tests__/ChatView.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatView } from '../components/ChatView';

// Mock SSE hook
vi.mock('../hooks/useSSE', () => ({
  useSSE: () => ({ events: [], status: 'idle' }),
}));

describe('ChatView', () => {
  it('should render input and send button', () => {
    render(<ChatView />);
    expect(screen.getByPlaceholderText(/message/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('should send message on button click', async () => {
    const mockSend = vi.fn();
    vi.stubGlobal('fetch', mockSend);

    render(<ChatView />);
    fireEvent.change(screen.getByPlaceholderText(/message/i), {
      target: { value: 'Test message' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(mockSend).toHaveBeenCalledWith(
      expect.stringContaining('/api/messages/prompt'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
```

### 13.4 Test Pyramid

```
         ┌─────────┐
        │  E2E (5)  │    ← Manual + Playwright (future)
       ├─────────────┤
      │ Integration  │   ← API tests with supertest (~20)
     ├────────────────┤
    │    Unit (80+)   │  ← Pure function + module tests
   └───────────────────┘
```

### 13.5 TDD Coverage Requirements

**Requisiti minimi di copertura per ogni feature:**

| Tipo | Copertura Minima | Note |
|------|-----------------|------|
| Unit tests (backend) | 90% statements | Ogni funzione pura testata |
| Unit tests (frontend) | 80% statements | Componenti e hook |
| Integration tests | 100% API endpoints | Ogni endpoint REST testato |
| E2E (future) | Critical paths | Login, chat, session management |

**Criteri di accettazione TDD:**

- [ ] Test RED: Test scritto PRIMA del codice
- [ ] Test GREEN: Codice implementato per far passare il test
- [ ] Test REFACTOR: Codice migliorato senza rompere test
- [ ] Nessun test saltato o commentato
- [ ] Coverage report generato e allegato alla PR

**Checklist per ogni PR:**

```
PR Checklist - TDD Compliance
├── [ ] Test scritti PRIMA dell'implementazione (vedi git log)
├── [ ] Tutti i test passano locally
├── [ ] Coverage report allegato (>80%)
├── [ ] Nessun `it.skip` o `describe.skip`
├── [ ] Mock usati correttamente (no mock globale)
└── [ ] Test leggibili e documentati (given/when/then)
```

**Struttura test file naming:**

```
src/
├── backend/
│   ├── __tests__/           <- Test alongside source
│   │   ├── jsonl.test.ts
│   │   ├── config.test.ts
│   │   └── events.test.ts
│   ├── jsonl.ts
│   └── config.ts
└── frontend/
    ├── __tests__/
    │   ├── useChatStore.test.ts
    │   ├── useSSE.test.ts
    │   └── ChatView.test.tsx
    ├── stores/
    │   └── useChatStore.ts
    ├── components/
    │   └── ChatView.tsx
    └── hooks/
        └── useSSE.ts
```

**Pattern Given-When-Then nei test:**

```typescript
describe('useChatStore', () => {
  it('should append streaming text to last assistant message', async () => {
    // GIVEN: Un messaggio assistant esistente
    const { result } = renderHook(() => useChatStore());
    await act(async () => {
      result.current.addMessage({ id: '1', role: 'assistant', content: '' });
    });

    // WHEN: Arriva un text_chunk event
    await act(async () => {
      result.current.appendStreamingText('1', 'Hello ');
      result.current.appendStreamingText('1', 'World');
    });

    // THEN: Il contenuto e' accumulato
    expect(result.current.messages[0].content).toBe('Hello World');
  });
});
```

### 13.6 Integration Tests

| Scenario | Test |
|----------|------|
| Prompt flow | POST prompt -> SSE events received -> message in store |
| Abort flow | POST abort -> streaming stops -> done event |
| Session CRUD | Create -> list -> load -> delete -> verify |
| Model switch | PUT model -> verify model changed |
| Reconnection | Kill server -> SSE reconnects -> state recovered |

### 13.7 Test Commands

```bash
npm test                    # Run all tests
npm test -- --watch         # Watch mode
npm test -- backend/        # Backend only
npm test -- frontend/       # Frontend only
npm run test:coverage       # Coverage report
```

---

## 14. Deployment

### 14.1 Development

```bash
npm install
npm run dev         # Concurrent: backend (nodemon) + frontend (vite)
```

### 14.2 Production Build

```bash
npm run build       # Frontend: vite build → dist/public/
                    # Backend: tsc → dist/backend/
npm start           # node dist/backend/server.js
```

### 14.3 systemd Service

```ini
[Unit]
Description=Pi Web App
After=network.target

[Service]
Type=simple
User=manu
WorkingDirectory=/home/manu/pi-web-app
EnvironmentFile=/home/manu/pi-web-app/.env
ExecStart=/usr/bin/node dist/backend/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 14.4 nginx Reverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name pi.local;

    ssl_certificate     /etc/ssl/certs/pi.pem;
    ssl_certificate_key /etc/ssl/private/pi.key;

    location / {
        proxy_pass http://127.0.0.1:3210;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;

        # SSE headers
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

### 14.5 Environment Variables

```bash
# .env.example
PI_WEB_PORT=3210
PI_WEB_HOST=127.0.0.1
PI_AGENT_DIR=~/.pi
PI_SESSIONS_DIR=~/.pi/agent/sessions
PI_LOG_LEVEL=info
NODE_ENV=production
NODE_PATH=/usr/bin/node
```

---

## 15. Migration Checklist

### 15.0 Status Snapshot

> Maintenance note: after every significant change, update this snapshot **and** the `Current state` line in `AGENTS.md`.

#### Done (2026-04-18)
- Backend SDK bridge, dynamic model registry, JSONL session persistence, SSE replay, and REST/SSE wiring.
- Frontend OpenChamber-style UI: Flexoki dark palette (#151313/#da702c/#cecdc3), IBM Plex Sans/Mono fonts, 280px sidebar with project/session/model sections, 48px header with status chip.
- ConversationPanel: border-left colored per role (user=orange, assistant=green, tool=amber), streaming indicator, expandable tool call/result.
- ComposerPanel: send-only, Enter to send, Shift+Enter newline, Stop button.
- Legacy interaction panels removed from the frontend; no inline question/permission cards are rendered in the current UI.
- SSE: reconnect backoff (3s), session existence check (404), generation counter to prevent stale reconnects.
- Server binds to `0.0.0.0:3210` (accessible from public IP).
- Build green, 74 backend tests + 21 frontend tests passing, `pi-web.service` active.

#### In Progress
- Final polish: markdown rendering in messages, syntax highlighting for code blocks, keyboard shortcuts.

#### Done (2026-04-21)
- Fixed optimistic session merge ordering to sort messages chronologically by timestamp (with id fallback), preventing lexicographic-id reordering when multiple messages arrive.
- Added frontend regression tests covering out-of-order ids with in-order timestamps in `frontend/src/sync/optimistic.test.ts`.
- Prompt sends now always generate/propagate a shared turn id (frontend optimistic + backend persisted user message + SSE), and turn rendering now attaches late user rows by `messageId` (with a fallback to the latest open turn for legacy rows without `messageId`) to avoid assistant-before-user visual inversions.
- Fixed fallback lookup in `frontend/src/sync/conversation.ts` so unknown `messageId` chunks update the latest assistant/thinking entry instead of the oldest one, preventing cross-turn content bleed and “stuck streaming” placeholders when multiple turns are present.
- Added regression tests for generated turn-id propagation (`frontend/src/sync/session-actions.test.ts`), delayed user/assistant attachment (`frontend/src/components/chat/ConversationPanel.test.tsx`), latest-item fallback chunk routing (`frontend/src/sync/conversation.test.ts`), markdown spacing normalization, and GFM table rendering (`frontend/src/components/chat/MarkdownRenderer.test.tsx`).
- Removed Tailwind `prose` class from chat markdown and normalized excessive blank lines (3+ newlines collapsed to 2) in `frontend/src/components/chat/MarkdownRenderer.tsx` to prevent oversized vertical spacing in assistant answers after refresh.
- Aligned markdown output behavior with OpenChamber patterns by tightening paragraph/list/code spacing in the frontend global stylesheet (now `frontend/src/index.css`) and adding explicit GFM table rendering/styling (wrapper + bordered cells) in `frontend/src/components/chat/MarkdownRenderer.tsx`.
- Updated `ConversationPanel` fallback working indicator placement so, while generating, the global working hint is rendered as a compact tail at the bottom of the conversation (instead of appearing above existing messages), matching OpenChamber flow.
- Removed the bottom status bar (`StatusRow`) from `App.tsx` so working feedback is no longer shown in a separate footer strip; stop control remains in the composer and generation feedback stays in the assistant conversation flow (OpenChamber-aligned behavior).
- Updated streaming UX to better match OpenChamber: assistant "Working" placeholder is now shown only before text chunks arrive and hidden while tool/reasoning entries are active (never as a detached bottom-left indicator), turn entries render tool/reasoning blocks before assistant text during generation, and streaming auto-scroll now follows chunk updates with `requestAnimationFrame` for smoother motion.
- Reduced streaming render overhead by using lightweight plain-text rendering while assistant content is `streaming` plus a small text-throttle window for chunk updates (markdown parsing is applied after completion), improving perceived output smoothness.
- Replaced streaming shine/tail rendering with plain throttled text updates in `AssistantTextPart` to remove chunk-jitter and better match OpenChamber's smooth streaming behavior.
- Further tightened chat density in the frontend global stylesheet (now `frontend/src/index.css`) (message/stack/markdown + tool/reasoning spacing and paddings) to align vertical rhythm more closely with OpenChamber.
- Tightened chat vertical rhythm in the frontend global stylesheet (now `frontend/src/index.css`) (message header/content/turn-stack and markdown paragraph/list line spacing) to reduce oversized row gaps and better match OpenChamber density.
- Added explicit OpenChamber-style tool output card styling for the new tool renderer classes (`tool-block`, `tool-content`, `tool-input`, `tool-output`, `tool-timestamp`) so expanded tool payloads no longer inherit browser `pre` defaults that caused large vertical whitespace.
- Disabled inferred assistant-content splitting into pseudo-thinking on rehydration (`frontend/src/sync/conversation.ts`), so normal multi-paragraph assistant replies are no longer misclassified as reasoning blocks after refresh.
- Frontend localStorage cache persistence is now disabled by default (project/ui/model/theme + sync metadata), with an explicit opt-in flag `VITE_ENABLE_FRONTEND_CACHE=true`; startup clears stale `pi-web-app:*` and `pi.dir.*` keys when cache is disabled.
- Backend static hosting now disables HTTP caching for frontend assets + `index.html` by default via `PI_WEB_DISABLE_FRONTEND_HTTP_CACHE=true` (no-store/no-cache headers), with explicit opt-out by setting it to `false`.
- Frontend stylesheet architecture uses a single CSS entrypoint `frontend/src/index.css` importing `styles/design-system.css`, `styles/typography.css`, and `styles/mobile.css`, with project-specific compatibility/layout rules preserved in the entrypoint so existing UI classnames remain styled.
- Streaming chat rendering now follows the OpenChamber pattern more closely: assistant and reasoning text use a shared throttled streaming hook, markdown is rendered during streaming (not only on completion), and in-turn working feedback remains visible while tool/reasoning activity is in progress until assistant text arrives.

#### Deferred
- Light theme, virtualization for long conversations, slash commands, todo system, shell mode.


### 15.1 Phase 0: Setup

- [ ] Create `rewrite` branch
- [ ] Initialize new project structure (empty directories)
- [ ] Set up workspaces (backend + frontend)
- [ ] Configure TypeScript, Vite, Vitest
- [ ] Add `.env.example` with all documented variables
- [ ] Write this BLUEPRINT.md
- [ ] **Gate**: `npm install` works, `npm test` runs (zero tests, but passes)

### 15.2 Phase 1: Backend Core (V1)

- [x] Implement `config.ts` with Zod validation
- [x] Implement `jsonl.ts` parser (single source of truth)
- [x] Implement `sdk/bridge.ts` wrapping AgentSession
- [x] Implement `sdk/factory.ts` for per-CWD session creation
- [x] Implement `sdk/events.ts` event mapping (SDK → SSE)
- [x] Implement `sessions/store.ts` in-memory session store
- [x] Implement `models/resolver.ts` model resolution
- [x] Implement `sse/manager.ts` client registry + broadcast
- [x] Implement `sse/handler.ts` GET /api/events
- [x] Implement `api/messages.ts` REST routes
- [x] Implement `api/sessions.ts` REST routes
- [x] Implement `api/models.ts` REST routes
- [x] Implement `server.ts` Express bootstrap
- [x] Wire everything together
- [x] Write unit tests for: config, jsonl, bridge, manager, store
- [x] Write integration tests for: prompt flow, abort, session CRUD
- [x] **Gate**: Can send prompt via curl, receive SSE events, abort works ✅

### 15.3 Phase 2: Frontend Core (V1)

- [x] Set up Vite + React 19 + TypeScript
- [x] Create Zustand stores (session, models, ui)
- [x] Implement `useSSE.ts` hook with reconnection
- [x] Implement `useSession.ts` hook
- [x] Implement `useModels.ts` hook
- [x] Implement `services/` REST API clients
- [x] Implement `ChatView` component (messages + input)
- [x] Implement `MessageItem` component (render parts)
- [x] Implement `SessionPanel` component (sidebar + session list)
- [x] Implement `ModelSelector` component (dropdown)
- [x] Implement `Reconnect` component (banner)
- [x] Implement `App.tsx` layout
- [x] URL sync: `?cwd=&session=` drives navigation
- [x] Preserve chronological message order across optimistic + persisted session merges
- [x] Write unit tests for: stores, hooks, jsonl utils
- [x] **Gate**: Can open browser, send prompt, see streaming, abort, switch sessions, switch models ✅

### 15.4 Phase 3: Polish (V1)

- [x] CSS styling (dark theme, Flexoki palette)
- [x] Responsive layout (mobile-friendly)
- [ ] Loading states (spinners, skeletons) - deferred
- [ ] Error states (network error, auth error) - partial
- [ ] Markdown rendering (marked + DOMPurify) - deferred
- [ ] Syntax highlighting (highlight.js) - deferred
- [ ] Virtualized message list (for long sessions) - deferred
- [x] Keyboard shortcuts (Enter to send)
- [x] OpenChamber-aligned working indicator placement and compact message spacing in chat rendering
- [x] OpenChamber-style live markdown streaming + throttled text updates
- [x] OpenChamber-inspired stylesheet structure (`index.css` entrypoint + semantic tokens/typography/mobile split) with project compatibility rules
- [ ] Accessibility (ARIA labels, keyboard nav) - partial
- [ ] Favicon, meta tags
- [ ] **Gate**: Full user journey works smoothly - partial

### 15.5 Phase 4: V1 Release

- [ ] All V1 acceptance criteria met
- [ ] Zero TypeScript errors (`--strict`)
- [ ] Zero `any` types in new code
- [ ] All tests pass
- [ ] No component > 200 lines
- [ ] No file > 250 lines (except maybe bridge.ts)
- [ ] No dead code
- [ ] No hardcoded paths
- [ ] README updated with quick start
- [ ] Deploy to systemd + nginx
- [ ] **Gate**: V1 production-ready

### 15.6 Phase 5+: V2 and Beyond

- [ ] Multi-client broadcasting (port from old code)
- [ ] Message part gap recovery
- [ ] Event coalescing
- [ ] Global session status
- [ ] PAUSE/RESUME state machine
- [ ] Image support
- [ ] Error pattern detection
- ... (see Phase 2+ Features section)

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| **CWD** | Current Working Directory - the project directory the agent operates in |
| **Session** | A conversation thread with the AI agent, persisted as JSONL |
| **AgentSession** | SDK class that manages a single session |
| **SdkBridge** | Our wrapper around AgentSession (event forwarding, error handling) |
| **SSE** | Server-Sent Events - unidirectional streaming over HTTP |
| **JSONL** | JSON Lines - one JSON object per line in session files |
| **ContentPart** | A piece of message content (text, thinking, tool_call, etc.) |
| **V1/V2/V3** | Release phases: MVP → reliability → rich features |

## Appendix B: References

| Resource | Link/Path |
|----------|-----------|
| SDK npm package | `@mariozechner/pi-coding-agent` |
| SDK session files | `~/.pi/agent/sessions/*.jsonl` |
| Current project | `/home/manu/pi-web-app` |
| systemd service | `/etc/systemd/system/pi-web.service` |
| nginx config | `/etc/nginx/sites-available/pi-web` |
| Old docs | `docs/` directory |

## Appendix C: Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| SDK API changes | High | Pin SDK version, write adapter tests |
| JSONL format changes | High | Single parser module, test with real session files |
| SSE connection instability | Medium | Robust reconnection, fallback to polling (future) |
| Scope creep | Medium | Strict V1 boundary, defer features to V2+ |
| Over-engineering | Low | Keep it simple, review architecture regularly |

---

*This is a living document. Update it as decisions are made. Every architectural change should be reflected here before implementation.*
