# Frontend Components

## Overview

The frontend is a React 19 SPA built with Vite 6 and styled with Tailwind CSS 4. It uses WebSocket for all real-time communication and REST for initial data loading.

## Component Tree

```
<App>
  ├── <Sidebar>
  │   ├── CWD selector (<select>)
  │   ├── Session list
  │   │   └── Session item (with delete button on hover)
  │   └── + New session button
  ├── <Header>
  │   ├── Sidebar toggle
  │   ├── CWD label
  │   ├── Server logs toggle
  │   ├── <ModelSelector dropdown>
  │   │   └── Search input
  │   │   └── Grouped model list
  │   ├── Queue info badge
  │   ├── Context usage progress bar
  │   └── Connection status
  ├── Main content area
  │   ├── WelcomeScreen (no CWD selected)
  │   ├── NoSessionScreen (CWD selected, no session)
  │   └── <MessageList>
  │       ├── UserMessage
  │       ├── AssistantMessage
  │       │   ├── ThinkingBlock
  │       │   ├── ToolBlock (×N)
  │       │   └── Markdown content
  │       ├── SystemMessage
  │       └── WorkingIndicator
  ├── Server log panel (collapsible)
  └── <InputArea>
      ├── Image previews
      ├── Image picker button
      ├── Textarea (auto-growing)
      └── Send / Stop button
```

## State Management

### URL-Driven Navigation
The URL query params are the source of truth:
- `?cwd=/path` — active working directory
- `?session=uuid` — active session ID

All state updates flow through `updateUrl()` which calls `setSearchParams({ replace: true })`.

### Message Cache
```typescript
interface CachedMessages {
  sessionId: string;
  messages: Message[];
  timestamp: number;
}
const messageCache = new Map<string, CachedMessages>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

Messages are cached per session to avoid redundant REST fetches when switching sessions rapidly.

### Streaming State
Two mutable refs track the in-progress assistant message:
- `currentAssistantRef` — points to the current `AssistantMessageState` being built
- `msgIdxRef` — index of the assistant message in the `messages` array

This avoids stale closures in `setMessages` callbacks.

### Reconnection Logic
When the WebSocket reconnects:
1. Dismiss disconnect banner
2. Refresh session list via REST
3. Send `get_state` and `get_available_models`
4. Send `load_session` (last, so the client is registered on the server)

The server then responds with state + full message history. If the agent was mid-stream, subsequent streaming events merge into the existing assistant message rather than creating duplicates.

## Key Hooks

### `useWebSocket`
```typescript
function useWebSocket(options: {
  onEvent: (event: WsEvent) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  authToken?: string;
}): { connected: boolean; send: (cmd: WsCommand) => void; reconnect: () => void }
```

Features:
- Auto-reconnects every 3 seconds on disconnect
- Guards against duplicate connections (checks `readyState`)
- Uses refs for callback stability (no stale closures)
- Dynamically selects `ws://` or `wss://` based on `location.protocol`

## Data Types

### Message
```typescript
interface Message {
  type: 'user' | 'assistant' | 'system';
  text: string;
  images?: string[];          // base64 data URIs
  assistantState?: AssistantMessageState;
  color?: string;             // for system messages
}
```

### AssistantMessageState
```typescript
interface AssistantMessageState {
  thinking: string | null;
  thinkingFinished: boolean;
  text: string;
  toolCalls: ToolCall[];
}
```

### ToolCall
```typescript
interface ToolCall {
  id?: string;                // from the model's toolCall content part
  toolCallId?: string;        // from SDK tool_execution events
  name: string;
  args: string;               // truncated for display
  argsRaw: string;            // full arguments
  result?: string;            // truncated result
  isError?: boolean;
  isRunning: boolean;
}
```

## Rendering Pipeline

### Markdown
Assistant text content is rendered as HTML via `marked` (with GitHub-flavored markdown). Code blocks are syntax-highlighted with `highlight.js` after each DOM update.

### Scroll Behavior
The `MessageList` auto-scrolls to bottom on:
- New messages
- `isWorking` state changes
- Every 200ms during active work (polling for streaming updates)

Uses `requestAnimationFrame` for smooth scrolling when not working, `auto` (instant) when the agent is actively streaming.

### Image Handling
- **Paste**: Intercepted via `handlePaste` on the textarea. Reads clipboard `File` items as base64 data URIs.
- **File picker**: Hidden `<input type="file" accept="image/*" multiple>` triggered by the "+" button.
- **Preview**: 60×60 thumbnails with remove buttons before sending.
- **Send**: Data URIs are converted to `{ type: "image", data, mimeType }` format for the SDK.

## Development Proxy

During development, the Vite dev server proxies:
- `/api` → `http://localhost:3210` (REST)
- WebSocket connections → `ws://localhost:3210`

This avoids CORS issues and allows the frontend to run on port 5173 while the backend is on 3210.
