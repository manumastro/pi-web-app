/**
 * Pi Web App — SDK Bridge (v3)
 *
 * Backend: pi SDK direttamente in-process (nessun subprocess)
 * - AgentSessionRuntime per CWD con gestione sessioni nativa
 * - Eventi via session.subscribe()
 * - Session management via SessionManager + AgentSessionRuntime
 */
import express from "express";
// ── WebSocket Server (DEPRECATED - using SSE instead) ──
// import { WebSocket, WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { execSync } from "child_process";
import {
  type Model,
  type AgentSession,
  createAgentSession,
  SessionManager,
  SettingsManager,
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  getAgentDir,
} from "@mariozechner/pi-coding-agent";
import type { AgentSessionEvent } from "@mariozechner/pi-agent-core";
import { categorizeError } from "./services/errorCategorizer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Global Error Handlers (Error-Proof Logging) ──
process.on('uncaughtException', (err, origin) => {
  console.error(`💥 UNCAUGHT EXCEPTION [origin=${origin}]:`, err.message, err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`💥 UNHANDLED REJECTION at`, promise, `reason:`, reason);
});

// ── Configuration ──
const PORT = parseInt(process.env.PI_WEB_PORT || "3211");
const HOME = process.env.HOME || "/home/manu";
const AGENT_DIR = path.join(HOME, ".pi", "agent");
const SESSIONS_DIR = path.join(AGENT_DIR, "sessions");
const AUTH_TOKEN = process.env.PI_WEB_AUTH_TOKEN || "";

// ── Express Setup ──
const app = express();

app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  next();
});

app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "..", "public"), {
  setHeaders: (res, filePath) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
}));

// ── SSE & REST Routes (Phase 2) ──
import { registerSSERoutes } from "./routes/events";
import { registerMessageRoutes } from "./routes/messages";
import { registerSessionRoutes, type RegisterSessionRoutesType } from "./routes/sessions";

// Register SSE and Message routes early (they use context setters)
registerSSERoutes(app);
registerMessageRoutes(app);
// NOTE: registerSessionRoutes is called AFTER setSessionContext (see below)

// ── Session Discovery (reads JSONL files directly — no running process needed) ──
function decodeDirName(encoded: string): string {
  const inner = encoded.replace(/^-+|-+$/g, "");
  if (inner === "home-manu") return HOME;
  if (inner.startsWith("home-manu-")) return HOME + "/" + inner.slice("home-manu-".length);
  return "/" + inner.replace(/--/g, "/");
}

function encodeDirName(dirPath: string): string {
  if (dirPath === HOME) return "--home-manu--";
  if (dirPath.startsWith(HOME + "/")) return "--home-manu-" + dirPath.slice((HOME + "/").length) + "--";
  return "--" + dirPath.replace(/^\//, "").replace(/\//g, "--") + "--";
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter((c: any) => c?.type === "text").map((c: any) => c.text || "").join(" ");
  return "";
}

interface SessionInfo {
  id: string; cwd: string; cwdLabel: string; createdAt: string;
  lastModified: number; name: string | null; messageCount: number; lastMessage: string | null;
  lastMessageType: string | null; model: string | null;
}

function parseSessionFilePath(filePath: string, cwdHint?: string, cwdLabelHint?: string): SessionInfo | null {
  try {
    const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n").filter(Boolean);
    if (!lines.length) return null;
    const fileName = path.basename(filePath);
    const id = fileName.replace(".jsonl", "").split("_").slice(1).join("_");
    const dm = fileName.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/);
    const createdAt = dm ? `${dm[1]}T${dm[2]}:${dm[3]}:${dm[4]}Z` : "";
    const lastModified = fs.statSync(filePath).mtimeMs;
    let name: string | null = null, lastMessage: string | null = null, lastMessageType: string | null = null;
    let userMsgCount = 0, assistantMsgCount = 0, model: string | null = null;
    let cwd = cwdHint || null, cwdLabel = cwdLabelHint || null;
    for (const line of lines) {
      try {
        const e = JSON.parse(line);
        if (e.type === "session" && e.cwd && !cwd) {
          cwd = e.cwd;
          cwdLabel = cwd.replace(HOME, "~");
        }
        if (e.type === "model_change" && e.modelId && !model) model = e.provider ? `${e.provider}/${e.modelId}` : e.modelId;
        if (e.type === "message" && e.message) {
          if (e.message.role === "user") { userMsgCount++; if (!name) name = extractText(e.message.content).substring(0, 80); lastMessage = extractText(e.message.content).substring(0, 120) || null; lastMessageType = "user"; }
          else if (e.message.role === "assistant") { assistantMsgCount++; const t = extractText(e.message.content).substring(0, 120); if (t) { lastMessage = t; lastMessageType = "assistant"; } if (!model && e.message.model) model = e.message.model; }
        }
      } catch {}
    }
    if (!cwd) cwd = "unknown";
    if (!cwdLabel) cwdLabel = cwd.replace(HOME, "~");
    return { id, cwd, cwdLabel, createdAt, lastModified, name, messageCount: userMsgCount + assistantMsgCount, lastMessage, lastMessageType, model };
  } catch { return null; }
}

function getAllSessions(): SessionInfo[] {
  const sessions: SessionInfo[] = [];
  if (!fs.existsSync(SESSIONS_DIR)) return sessions;
  for (const entry of fs.readdirSync(SESSIONS_DIR)) {
    const fp = path.join(SESSIONS_DIR, entry);
    if (!fs.statSync(fp).isDirectory()) continue;
    const cwd = decodeDirName(entry);
    for (const f of fs.readdirSync(fp).filter(x => x.endsWith(".jsonl"))) {
      const info = parseSessionFilePath(path.join(fp, f), cwd, cwd.replace(HOME, "~"));
      if (info) sessions.push(info);
    }
  }
  return sessions.sort((a, b) => b.lastModified - a.lastModified);
}

function getSessionsForCwd(cwd: string): SessionInfo[] {
  const dp = path.join(SESSIONS_DIR, encodeDirName(cwd));
  if (!fs.existsSync(dp)) return [];
  const sessions = fs.readdirSync(dp).filter(x => x.endsWith(".jsonl"))
    .map(f => parseSessionFilePath(path.join(dp, f), cwd, cwd.replace(HOME, "~")))
    .filter((s): s is SessionInfo => s !== null);
  return sessions.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
}

function findSessionFileBySessionId(cwd: string, sessionId: string): string | null {
  const dp = path.join(SESSIONS_DIR, encodeDirName(cwd));
  if (!fs.existsSync(dp)) return null;
  for (const f of fs.readdirSync(dp)) {
    if (f.endsWith(".jsonl") && f.includes(sessionId)) {
      return path.join(dp, f);
    }
  }
  return null;
}

function getAllCwds() {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  return fs.readdirSync(SESSIONS_DIR).filter(f => fs.statSync(path.join(SESSIONS_DIR, f)).isDirectory())
    .map(dir => { const cwd = decodeDirName(dir); return { path: cwd, label: cwd.replace(HOME, "~"), sessionCount: fs.readdirSync(path.join(SESSIONS_DIR, dir)).filter(x => x.endsWith(".jsonl")).length }; })
    .sort((a, b) => b.sessionCount - a.sessionCount);
}

// ── REST API ──
app.get("/api/sessions", (req, res) => {
  const cwd = req.query.cwd as string | undefined;
  const limit = parseInt(req.query.limit as string) || 100;
  res.json((cwd ? getSessionsForCwd(cwd) : getAllSessions()).slice(0, limit));
});

app.get("/api/sessions/:id", (req, res) => {
  if (!fs.existsSync(SESSIONS_DIR)) return res.status(404).json({ error: "Not found" });
  for (const dir of fs.readdirSync(SESSIONS_DIR)) {
    const dp = path.join(SESSIONS_DIR, dir);
    if (!fs.statSync(dp).isDirectory()) continue;
    const files = fs.readdirSync(dp).filter(f => f.includes(req.params.id));
    if (files.length) {
      const messages = fs.readFileSync(path.join(dp, files[0]), "utf-8").trim().split("\n")
        .filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      return res.json({ id: req.params.id, cwd: decodeDirName(dir), messages });
    }
  }
  res.status(404).json({ error: "Session not found" });
});

app.get("/api/cwds", (_req, res) => res.json(getAllCwds()));

// Get info for any cwd (not just those with sessions)
app.get("/api/cwd", (req, res) => {
  const cwd = req.query.path as string;
  if (!cwd) return res.status(400).json({ error: "path required" });
  const exists = fs.existsSync(cwd);
  const isDir = exists && fs.statSync(cwd).isDirectory();
  const sessionCount = isDir ? getSessionsForCwd(cwd).length : 0;
  res.json({ path: cwd, exists: isDir, isDirectory: isDir, sessionCount, label: cwd.replace(HOME, "~") });
});
app.get("/api/settings", (_req, res) => {
  const p = path.join(AGENT_DIR, "settings.json");
  try { res.json(fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : {}); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.get("/api/enabled-models", (_req, res) => {
  const p = path.join(AGENT_DIR, "settings.json");
  try {
    const s = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : {};
    res.json({ models: s.enabledModels || [] });
  } catch { res.json({ models: [] }); }
});

app.get("/api/logs", async (_req, res) => {
  const { spawn } = await import("child_process");
  const lines = parseInt(_req.query.lines as string) || 100;
  const proc = spawn("journalctl", ["-u", "pi-web", "-n", String(lines), "--no-pager", "-o", "cat"]);
  let output = "";
  proc.stdout.on("data", d => output += d.toString());
  proc.stderr.on("data", d => output += d.toString());
  proc.on("close", () => res.json({ logs: output.trim().split("\n").filter(Boolean) }));
});

// File tree API - list directory contents
interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: number;
}

app.get("/api/files", (req, res) => {
  const dir = (req.query.path as string) || HOME;
  const filter = req.query.filter as string | undefined;
  
  try {
    if (!fs.existsSync(dir)) {
      return res.status(404).json({ error: "Directory not found" });
    }
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: "Not a directory" });
    }
    
    const entries: FileEntry[] = [];
    for (const name of fs.readdirSync(dir)) {
      // Skip hidden files/folders unless explicitly showing all
      if (!filter && name.startsWith(".")) continue;
      
      const fp = path.join(dir, name);
      try {
        const s = fs.statSync(fp);
        entries.push({
          name,
          path: fp,
          isDirectory: s.isDirectory(),
          size: s.isDirectory() ? 0 : s.size,
          modified: s.mtimeMs,
        });
      } catch {}
    }
    
    // Sort: directories first, then by name
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    
    res.json({ path: dir, entries });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/sessions/:id", (req, res) => {
  const sessionId = req.params.id;
  if (!fs.existsSync(SESSIONS_DIR)) return res.status(404).json({ error: "Not found" });
  let deleted = false;
  for (const dir of fs.readdirSync(SESSIONS_DIR)) {
    const dp = path.join(SESSIONS_DIR, dir);
    if (!fs.statSync(dp).isDirectory()) continue;
    const files = fs.readdirSync(dp).filter(f => f.includes(sessionId));
    for (const f of files) {
      const fp = path.join(dp, f);
      if (f.endsWith(".jsonl") && f.includes(sessionId)) {
        fs.unlinkSync(fp);
        deleted = true;
      }
    }
  }
  if (deleted) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Session not found" });
  }
});

// ── Auth middleware for WebSocket ──
function authenticateWs(ws: WebSocket, req: any): boolean {
  if (!AUTH_TOKEN) return true;
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const token = url.searchParams.get("token");
  if (token !== AUTH_TOKEN) {
    ws.send(JSON.stringify({ type: "error", message: "Authentication required." }));
    ws.close(1008, "Unauthorized");
    return false;
  }
  return true;
}

// ── SDK Session Manager ──
interface CwdSession {
  cwd: string;
  session: AgentSession;
  clients: Set<WebSocket>;
  unsubscribe: (() => void) | null;
  idle: boolean;
  lastPromptMsg: string | null;
  lastPromptImages: any[] | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  lastActivity: number;
  settingsManager: SettingsManager;
  // State tracking (per reconnection)
  stateVersion: number;
  workingStartTime: number | null;
  lastEventType: string | null;
}

const cwdSessions = new Map<string, CwdSession>();

// Auth & model registry (shared) — with explicit paths
const authStorage = AuthStorage.create(path.join(HOME, ".pi", "agent", "auth.json"));
const modelRegistry = ModelRegistry.create(authStorage, path.join(HOME, ".pi", "agent"));

/** Create a new SDK session for a CWD */
async function createSdkSession(cwd: string, sessionFile?: string): Promise<AgentSession> {
  const settingsManager = SettingsManager.create(cwd, AGENT_DIR);
  const resourceLoader = new DefaultResourceLoader({ cwd, agentDir: getAgentDir() });
  await resourceLoader.reload();

  let sm: SessionManager;
  if (sessionFile) {
    sm = SessionManager.open(sessionFile);
  } else {
    try {
      sm = await SessionManager.continueRecent(cwd);
    } catch {
      sm = SessionManager.create(cwd);
    }
  }

  const { session } = await createAgentSession({
    cwd,
    agentDir: AGENT_DIR,
    authStorage,
    modelRegistry,
    resourceLoader,
    settingsManager,
    sessionManager: sm,
  });

  return session;
}

// ── Extension-based model loading ──
let extensionsLoaded = false;

/**
 * Load extensions from settings.json and register their providers/models with modelRegistry.
 */
async function loadExtensionsForModels(): Promise<void> {
  if (extensionsLoaded) return;
  
  const settingsPath = path.join(AGENT_DIR, "settings.json");
  let settingsPackages: string[] = [];
  try {
    if (fs.existsSync(settingsPath)) {
      const settingsData = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      settingsPackages = settingsData.packages || [];
    }
  } catch (e: any) {
    console.error(`[loadExtensionsForModels] settings error: ${e.message}`);
    return;
  }

  const resolveExtPath = (p: string): string | null => {
    let resolved: string;
    
    if (p.startsWith("../../")) {
      // ../../ means go up 2 directories from AGENT_DIR, then use the rest
      resolved = path.resolve(AGENT_DIR, "..", "..", p.replace(/^\.\.\/\.\.\//, ""));
    } else if (p.startsWith("./")) {
      resolved = path.join(AGENT_DIR, p.slice(2));
    } else if (p.startsWith("npm:")) {
      const pkgName = p.replace("npm:", "");
      resolved = path.join(HOME, ".nvm/versions/node/v24.12.0/lib/node_modules", pkgName, "index.ts");
    } else {
      resolved = p;
    }
    
    return fs.existsSync(resolved) ? resolved : null;
  };

  const allExtensionPaths = settingsPackages.map(resolveExtPath).filter(Boolean);
  
  if (allExtensionPaths.length === 0) {
    extensionsLoaded = true;
    return;
  }

  try {
    const resourceLoader = new DefaultResourceLoader({
      cwd: HOME,
      agentDir: AGENT_DIR,
      additionalExtensionPaths: allExtensionPaths,
    });
    await resourceLoader.reload();
    
    const extensionsResult = resourceLoader.getExtensions();
    const runtime = (extensionsResult as any).runtime;
    
    if (runtime?.pendingProviderRegistrations?.length > 0) {
      for (const { name, config } of runtime.pendingProviderRegistrations) {
        modelRegistry.registerProvider(name, config);
      }
    }
    
    extensionsLoaded = true;
  } catch (e: any) {
    console.error(`[loadExtensionsForModels] Error: ${e.message}`);
    extensionsLoaded = true;
  }
}

// ── Custom models (providers registered by extensions, not built-in) ──
const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** Build custom models for all qwen-oauth accounts from profiles file */
function getCustomModels(): Record<string, Model<any>> {
  const models: Record<string, Model<any>> = {};

  // Default qwen-oauth model
  models["qwen-oauth/coder-model"] = {
    id: "coder-model",
    name: "Qwen Coder",
    provider: "qwen-oauth",
    reasoning: true,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: 1000000,
    maxTokens: 65536,
    baseUrl: "https://portal.qwen.ai/v1",
    api: "openai-completions",
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
      thinkingFormat: "qwen",
    },
    headers: {
      "X-DashScope-AuthType": "qwen-oauth",
    },
  };

  // Additional accounts from qwen-oauth-profiles.json
  try {
    const profilesPath = path.join(AGENT_DIR, "qwen-oauth-profiles.json");
    if (fs.existsSync(profilesPath)) {
      const profiles = JSON.parse(fs.readFileSync(profilesPath, "utf-8"));
      if (profiles.accounts && Array.isArray(profiles.accounts)) {
        for (const account of profiles.accounts) {
          if (account.provider === "qwen-oauth") continue; // already added
          const label = account.label || account.provider.split("-").pop();
          models[`${account.provider}/coder-model`] = {
            id: "coder-model",
            name: `Qwen Coder (${label})`,
            provider: account.provider,
            reasoning: true,
            input: ["text"],
            cost: ZERO_COST,
            contextWindow: 1000000,
            maxTokens: 65536,
            baseUrl: "https://portal.qwen.ai/v1",
            api: "openai-completions",
            compat: {
              supportsDeveloperRole: false,
              maxTokensField: "max_tokens",
              thinkingFormat: "qwen",
            },
            headers: {
              "X-DashScope-AuthType": "qwen-oauth",
            },
          };
        }
      }
    }
  } catch (e: any) {
    console.error(`[qwen-profiles] Error reading profiles: ${e.message}`);
  }

  return models;
}

/** Resolve model: built-in registry first, then custom models */
function resolveModel(provider: string, modelId: string): Model<any> | undefined {
  const custom = getCustomModels();
  const key = `${provider}/${modelId}`;
  if (custom[key]) return custom[key];
  return modelRegistry.find(provider, modelId);
}

//** Normalize payload for Qwen Portal API — system messages must be content parts */
function normalizeQwenPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as any).messages)) return payload;
  const p = payload as Record<string, unknown>;
  const messages = [...(p.messages as any[])];
  const sysIdx = messages.findIndex((m: any) => m?.role === "system");
  if (sysIdx >= 0) {
    const sys = messages[sysIdx];
    if (typeof sys.content === "string") {
      messages[sysIdx] = { ...sys, content: [{ type: "text", text: sys.content }] };
    }
  } else {
    messages.unshift({ role: "system", content: [{ type: "text", text: "" }] });
  }
  return { ...p, messages };
}

/** Get OAuth access token for a qwen-oauth provider from auth.json */
function getQwenOAuthToken(provider: string): string | null {
  try {
    const authPath = path.join(AGENT_DIR, "auth.json");
    if (!fs.existsSync(authPath)) return null;
    const auth = JSON.parse(fs.readFileSync(authPath, "utf-8"));
    const entry = auth[provider];
    if (!entry || typeof entry !== "object") return null;
    if (entry.access && typeof entry.access === "string" && entry.expires && typeof entry.expires === "number") {
      if (Date.now() < entry.expires) return entry.access;
    }
  } catch (e: any) {
    console.error(`[${provider}] Auth read error: ${e.message}`);
  }
  return null;
}

/** Resolve model with current auth (for custom OAuth providers) */
async function resolveModelWithAuth(provider: string, modelId: string): Promise<Model<any> | undefined> {
  const model = resolveModel(provider, modelId);
  if (!model) return undefined;

  // For qwen-oauth providers, register runtime API key so the SDK can resolve it
  if (provider.startsWith("qwen-oauth")) {
    const token = getQwenOAuthToken(provider);
    if (token) {
      authStorage.setRuntimeApiKey(provider, token);
      return model;
    } else {
      console.error(`[${provider}] No valid token — please run /login ${provider}`);
    }
  }
  return model;
}

/** Factory: crea un runtime bound a un CWD */
async function createCwdSession(cwd: string, sessionManager?: SessionManager): Promise<CwdSession> {
  const settingsManager = SettingsManager.create(cwd, AGENT_DIR);

  // Load extensions dynamically from settings.json packages + base extensions
  const settingsPath = path.join(AGENT_DIR, "settings.json");
  let settingsData: any = {};
  let settingsPackages: string[] = [];
  try {
    if (fs.existsSync(settingsPath)) {
      settingsData = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      settingsPackages = settingsData.packages || [];
    }
  } catch (e: any) {
    console.error(`[loadExtensions] settings read error: ${e.message}`);
  }

  const baseExtensions = [
    "/home/manu/.nvm/versions/node/v24.12.0/lib/node_modules/pi-agent-browser/index.ts",
  ];
  // Resolve relative paths to absolute
  const resolvePath = (p: string) => {
    if (p.startsWith("../../")) {
      return path.join(HOME, ".nvm/versions/node/v24.12.0/lib/node_modules", p.replace(/^\.\.\/\.\.\//, ""));
    }
    if (p.startsWith("npm:")) {
      const pkgName = p.replace("npm:", "");
      return path.join(HOME, ".nvm/versions/node/v24.12.0/lib/node_modules", pkgName, "index.ts");
    }
    return p;
  };
  const allExtensionPaths = [...baseExtensions, ...settingsPackages.map(resolvePath)].filter(p => p && fs.existsSync(p));

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: AGENT_DIR,
    additionalExtensionPaths: allExtensionPaths,
  });
  await resourceLoader.reload();

  let sm = sessionManager;
  if (!sm) {
    try {
      sm = await SessionManager.continueRecent(cwd);
    } catch {
      sm = SessionManager.create(cwd);
    }
  }

  const { session } = await createAgentSession({
    cwd,
    agentDir: AGENT_DIR,
    authStorage,
    modelRegistry,
    resourceLoader,
    settingsManager,
    sessionManager: sm,
  });

  // Apply other settings from settings.json
  try {
    if (settingsData.compaction) settingsManager.applyOverrides({ compaction: settingsData.compaction });
    if (settingsData.retry) settingsManager.applyOverrides({ retry: settingsData.retry });
    if (settingsData.defaultThinkingLevel) session.setThinkingLevel(settingsData.defaultThinkingLevel);
    if (settingsData.defaultProvider && settingsData.defaultModel) {
      const model = await resolveModelWithAuth(settingsData.defaultProvider, settingsData.defaultModel);
      if (model) await session.setModel(model);
    }
  } catch (e: any) {
    console.error(`[createCwdSession] settings load error: ${e.message}`);
  }

  await session.bindExtensions({});

  const cr: CwdSession = {
    cwd,
    session,
    clients: new Set(),
    unsubscribe: null,
    idle: true,
    lastPromptMsg: null,
    lastPromptImages: null,
    idleTimer: null,
    lastActivity: Date.now(),
    settingsManager,
    // State tracking
    stateVersion: 0,
    workingStartTime: null,
    lastEventType: null,
  };

  cr.unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    forwardEvent(cr, event);
  });

  cwdSessions.set(cwd, cr);
  return cr;
}

/** Forward SDK events to WebSocket clients */
function forwardEvent(cr: CwdSession, event: AgentSessionEvent) {
  if (cr.clients.size === 0) return;

  // Map SDK events to frontend-compatible WS messages
  let wsMsg: any = null;

  switch (event.type) {
    case "message_update": {
      const ae = event.assistantMessageEvent;
      if (!ae) break;
      if (["thinking_start", "thinking_delta", "thinking_end",
           "text_start", "text_delta", "text_end",
           "toolcall_start", "toolcall_delta", "toolcall_end"].includes(ae.type)) {
        
        wsMsg = { type: ae.type };
        if (ae.delta !== undefined) wsMsg.text = ae.delta;
        if (ae.content !== undefined) wsMsg.text = ae.content;
        if (ae.text !== undefined) wsMsg.text = ae.text;
        if (ae.toolCall?.name) wsMsg.tool = ae.toolCall.name;
        if (ae.toolCall) wsMsg.toolCall = ae.toolCall;
      }
      break;
    }

    case "tool_execution_start":
      console.log(`🛠️  [${cr.cwd}] Executing tool: ${event.toolName}`);
      wsMsg = { type: "tool_exec_start", tool: event.toolName, args: event.args, toolCallId: event.toolCallId };
      break;
    case "tool_execution_update":
      if (event.partialResult?.content) {
        const text = event.partialResult.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text).join("");
        wsMsg = { type: "tool_exec_update", tool: event.toolName, text, toolCallId: event.toolCallId };
      }
      break;
    case "tool_execution_end":
      wsMsg = { type: "tool_exec_end", tool: event.toolName, isError: event.isError, result: event.result, toolCallId: event.toolCallId };
      break;

    case "agent_start":
      console.log(`🤖 [${cr.cwd}] Agent started - Setting idle=false`);
      wsMsg = { type: "agent_start" };
      cr.idle = false;
      cr.stateVersion++;
      cr.workingStartTime = Date.now();
      cr.lastEventType = "agent_start";
      // Broadcast to all clients of this CWD (even if they just reconnected)
      broadcastToClients(cr, { type: "agent_start", isWorking: true });
      break;
    case "agent_end": {
      const finalMessages = event.messages || [];
      const assistantMsgs = finalMessages.filter((m: any) => m.role === 'assistant');
      const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
      const hasContent = lastAssistant?.content?.some((c: any) => c.type === 'text' && c.text?.trim());
      
      console.log(`✅ [${cr.cwd}] Task completed - Setting idle=true`);
      console.log(`   📊 Messages: ${finalMessages.length} total, ${assistantMsgs.length} assistant responses`);
      if (!hasContent && assistantMsgs.length > 0) {
        console.error(`   ⚠️  WARNING: Last assistant message has no text content!`);
      }
      
      wsMsg = { type: "done", messages: event.messages };
      cr.idle = true;
      cr.stateVersion++;
      cr.workingStartTime = null;
      cr.lastEventType = "agent_end";
      cr.lastPromptMsg = null;
      cr.lastPromptImages = null;
      broadcastToClients(cr, { type: "done", isWorking: false });
      resetIdleTimer(cr);
      break;
    }
    case "turn_start":
      console.log(`🔄 [${cr.cwd}] Turn started (Model: ${cr.session.model?.provider}/${cr.session.model?.id})`);
      wsMsg = { type: "turn_start" };
      cr.stateVersion++;
      cr.lastEventType = "turn_start";
      break;
    case "turn_end":
      console.log(`🏁 [${cr.cwd}] Turn ended`);
      wsMsg = { type: "turn_end", message: event.message, toolResults: event.toolResults };
      cr.stateVersion++;
      cr.lastEventType = "turn_end";
      break;

    case "message_start":
      // Ignore user message echoes (model echoing our input)
      if (event.message?.role === 'user') {
        // Skip user message echo silently
        break;
      }
      console.log(`✍️  [${cr.cwd}] Generating...`);
      cr.stateVersion++;
      cr.lastEventType = "message_start";
      if (event.message?.model) {
        const m = event.message.model;
        if (!['ready', 'idle', 'busy', 'loading', 'waiting'].includes(m.toLowerCase())) {
          broadcastToClients(cr, { type: "model_info", model: m });
        }
      }
      wsMsg = { type: "message_start", message: event.message };
      break;
    case "message_end":
      // Ignore user message echoes
      if (event.message?.role === 'user') {
        break;  // Skip user message_end echo silently
      }

      const content = event.message?.content;
      const hasContent = content && Array.isArray(content) && content.some(c => c.type === 'text' && c.text?.trim());
      
      if (!hasContent) {
        console.log(`⚠️  [${cr.cwd}] Empty response`);
        break;
      }

      console.log(`📄 [${cr.cwd}] Response: ${JSON.stringify(content).length} chars`);
      wsMsg = { type: "message_end", message: event.message };
      break;

    case "compaction_start":
      wsMsg = { type: "compaction_start", reason: event.reason };
      break;
    case "compaction_end":
      wsMsg = { type: "compaction_end", reason: event.reason, aborted: event.aborted, willRetry: event.willRetry, summary: event.result?.summary, firstKeptEntryId: event.result?.firstKeptEntryId };
      break;

    case "auto_retry_start": {
      const delaySec = (event.delayMs / 1000).toFixed(1);
      const errorInfo = categorizeError(event.errorMessage);
      console.log(`🔄 [${cr.cwd}] Retry ${event.attempt}/${event.maxAttempts} (${errorInfo.category}) in ${delaySec}s: ${event.errorMessage}`);
      wsMsg = { 
        type: "auto_retry_start", 
        attempt: event.attempt, 
        maxAttempts: event.maxAttempts, 
        delayMs: event.delayMs, 
        errorMessage: event.errorMessage,
        errorCategory: errorInfo.category,
        isRetryable: errorInfo.isRetryable,
      };
      break;
    }
    case "auto_retry_end": {
      if (event.success) {
        console.log(`✅ [${cr.cwd}] Retry succeeded on attempt ${event.attempt}`);
      } else {
        console.error(`❌ [${cr.cwd}] Retry failed after ${event.attempt} attempts: ${event.finalError}`);
      }
      wsMsg = { type: "auto_retry_end", success: event.success, attempt: event.attempt, finalError: event.finalError };
      break;
    }

    case "queue_update":
      wsMsg = { type: "queue_update", steering: event.steering || [], followUp: event.followUp || [] };
      break;

    case "error":
      console.error(`❌ [${cr.cwd}] SDK ERROR: ${event.message || event.error}`);
      wsMsg = { type: "error", message: event.message || event.error };
      break;
  }

  if (wsMsg) broadcastToClients(cr, wsMsg);
}

function broadcastToClients(cr: CwdSession, msg: any) {
  const data = JSON.stringify(msg);
  for (const client of cr.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

function resetIdleTimer(cr: CwdSession) {
  if (cr.idleTimer) clearTimeout(cr.idleTimer);
  cr.lastActivity = Date.now();
}

async function getOrCreateSession(cwd: string, forceNew: boolean = false, sessionId?: string): Promise<CwdSession> {
  let existing = cwdSessions.get(cwd);

  if (existing) {
    if (sessionId) {
      const sessionPath = findSessionFileBySessionId(cwd, sessionId);
      if (sessionPath) {
        console.log(`📂 Switching to session ${sessionId} for ${cwd}`);
        await disposeSession(cwd);
        return await createCwdSession(cwd, SessionManager.open(sessionPath));
      }
    }
    resetIdleTimer(existing);
    return existing;
  }

  // Create new session
  let sessionManager: SessionManager | undefined;
  if (sessionId) {
    const sessionPath = findSessionFileBySessionId(cwd, sessionId);
    if (sessionPath) {
      console.log(`📂 Opening session ${sessionId} for ${cwd}`);
      sessionManager = SessionManager.open(sessionPath);
    }
  }

  if (!sessionManager) {
    if (forceNew) {
      console.log(`🆕 New session for ${cwd}`);
      sessionManager = SessionManager.create(cwd);
    } else {
      console.log(`🔄 Continue recent session for ${cwd}`);
      try {
        sessionManager = await SessionManager.continueRecent(cwd);
      } catch (e: any) {
        console.log(`⚠️  continueRecent failed for ${cwd}: ${e.message}, creating new session`);
        sessionManager = SessionManager.create(cwd);
      }
    }
  }

  return await createCwdSession(cwd, sessionManager);
}

async function disposeSession(cwd: string) {
  const cr = cwdSessions.get(cwd);
  if (!cr) return;
  cr.unsubscribe?.();
  cwdSessions.delete(cwd);
  console.log(`🗑️ Disposed runtime for ${cwd}`);
}

// ── WebSocket ──
let wss: WebSocketServer | null = null;
let server: ReturnType<typeof app.listen> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

function broadcastLog(level: "info"|"error", ...args: any[]) {
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  if (wss) {
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "server_log", level, message }));
      }
    }
  }
}

console.log = function(...args: any[]) {
  originalConsoleLog.apply(console, args);
  broadcastLog("info", ...args);
};

console.error = function(...args: any[]) {
  originalConsoleError.apply(console, args);
  broadcastLog("error", ...args);
};

function startServer(retryCount = 0) {
  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Pi Web SDK → http://0.0.0.0:${PORT} (in-process, no subprocess)`);
    if (AUTH_TOKEN) console.log(`🔐 Auth enabled`);
    const cwds = getAllCwds();
    console.log(`📂 ${cwds.length} directories, ${cwds.reduce((s, c) => s + c.sessionCount, 0)} total sessions`);
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      if (retryCount < 5) {
        console.log(`⚠️  Port ${PORT} in use, retrying... (attempt ${retryCount + 1}/5)`);
        setTimeout(() => startServer(retryCount + 1), 2000);
      } else {
        console.error(`💥 Port ${PORT} still in use — exiting`);
        process.exit(1);
      }
    }
  });

  // ── WebSocket Server (DEPRECATED - using SSE instead) ──
  // wss = new WebSocketServer({ server });
  // setupWebSocket(wss);
}

startServer();

// Setup context for route handlers (SSE and REST)
console.log('🔧 Setting up route context...');
import { setSSEContext } from './routes/events';
import { setMessageContext } from './routes/messages';
import { setSessionContext } from './routes/sessions';

// Provide access to cwdSessions and session functions to routes
setSSEContext(() => cwdSessions);
setMessageContext(
  () => cwdSessions,
  getOrCreateSession,
  (cwd: string, type: string, data: any) => { /* SSE broadcast placeholder */ }
);
setSessionContext(
  () => cwdSessions,
  createCwdSession,
  disposeSession,
  getOrCreateSession,
  findSessionFileBySessionId
);

// Register session routes AFTER context is set
registerSessionRoutes(app);

console.log('✅ Route context setup complete');

function setupWebSocket(wss: WebSocketServer) {
  const PING_INTERVAL = 30000;
  pingTimer = setInterval(() => {
    for (const client of wss.clients) {
      if ((client as any).isAlive === false) {
        client.terminate();
      }
      (client as any).isAlive = false;
      client.ping();
    }
  }, PING_INTERVAL);

  function getCwd(msg: any): string { return msg.cwd || HOME; }

  function findSessionForClient(ws: WebSocket): CwdSession | null {
    for (const [, cr] of cwdSessions) {
      if (cr.clients.has(ws)) return cr;
    }
    return null;
  }

  wss.on("connection", (ws: WebSocket, req) => {
    if (!authenticateWs(ws, req)) return;

    // Assign unique client ID
    const clientId = `ws_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    (ws as any).clientId = clientId;
    (ws as any).visible = false;
    (ws as any).activeSessionId = null;
    
    console.log(`🔌 Client connected: ${clientId}`);
    (ws as any).isAlive = true;

    ws.on("pong", () => { (ws as any).isAlive = true; });

    ws.on("message", async (data: Buffer) => {
      let msg: any;
      try { msg = JSON.parse(data.toString()); } catch { return; }

      if (msg.type === "prompt") {
        const cwd = getCwd(msg);
        try {
          const cr = await getOrCreateSession(cwd, false, undefined);
          cr.clients.add(ws);
          cr.lastPromptMsg = msg.text;
          cr.lastPromptImages = msg.images || null;

          console.log(`🚀 [${cwd}] Sending prompt: ${msg.text.substring(0, 100)}${msg.text.length > 100 ? "..." : ""}`);

          const promptOpts: any = {};
          if (!cr.idle) {
            promptOpts.streamingBehavior = "steer";
          }
          if (msg.images?.length) {
            promptOpts.images = msg.images;
          }

          cr.idle = false;
          cr.session.prompt(msg.text, promptOpts).catch((err: Error) => {
            console.error(`[prompt error] ${cwd}: ${err.message}`);
            broadcastToClients(cr, { type: "error", message: err.message });
          });
        } catch (e: any) {
          console.error(`[prompt] Runtime creation failed: ${e.message}`);
          ws.send(JSON.stringify({ type: "error", message: `Failed to create session: ${e.message}` }));
        }
      }

      if (msg.type === "steer") {
        const cr = findSessionForClient(ws) || cwdSessions.get(getCwd(msg));
        if (cr) cr.session.steer(msg.text).catch(console.error);
      }

      if (msg.type === "follow_up") {
        const cr = findSessionForClient(ws) || cwdSessions.get(getCwd(msg));
        if (cr) cr.session.followUp(msg.text).catch(console.error);
      }

      if (msg.type === "abort") {
        const cwd = getCwd(msg);
        let cr = findSessionForClient(ws) || cwdSessions.get(cwd);
        
        if (!cr) {
          // No session for this client - check if there's any active session for this cwd
          console.log(`[abort] No active session for client, checking CWD ${cwd}`);
          // Can't abort if no session exists
          ws.send(JSON.stringify({ type: "error", message: "No active session to stop" }));
          return;
        }
        
        cr.session.abort().then(() => {
          console.log(`[abort] Successfully triggered abort for ${cwd}`);
          broadcastToClients(cr, { type: "rpc_info", message: "Stop command sent" });
        }).catch((e: Error) => {
          console.error(`[abort] Failed: ${e.message}`);
          broadcastToClients(cr, { type: "error", message: `Stop failed: ${e.message}` });
        });
      }

      // ── Visibility Reporting ──
      if (msg.type === "report_visibility") {
        const clientId = (ws as any).clientId;
        (ws as any).visible = msg.visible;
        (ws as any).activeSessionId = msg.activeSessionId;
        console.log(`👁️ Client ${clientId} visibility: ${msg.visible} (session: ${msg.activeSessionId})`);
      }

      // ── State & Model ──
      if (msg.type === "get_state") {
        const cwd = getCwd(msg);
        const cr = findSessionForClient(ws) || cwdSessions.get(cwd);
        if (cr) {
          const s = cr.session;
          // Include idle state so client knows if agent is working
          broadcastToClients(cr, {
            type: "state",
            model: s.model?.id,
            provider: s.model?.provider,
            thinkingLevel: s.thinkingLevel,
            messages: s.messages.length,
            sessionId: s.sessionId,
            sessionFile: s.sessionFile,
            isWorking: !cr.idle,
            stateVersion: cr.stateVersion,
            workingDuration: cr.workingStartTime ? Date.now() - cr.workingStartTime : null,
            lastEventType: cr.lastEventType,
            cwd: cr.cwd,
          });
        } else {
          // No session exists for this cwd yet - this is fine for new sessions
          ws.send(JSON.stringify({ type: "state", cwd, isWorking: false }));
        }
      }

      if (msg.type === "set_model") {
        const cwd = getCwd(msg);
        try {
          // Persist to settings.json
          try {
            const settingsPath = path.join(AGENT_DIR, "settings.json");
            if (fs.existsSync(settingsPath)) {
              const s = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
              s.defaultProvider = msg.provider;
              s.defaultModel = msg.modelId;
              fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2));
            }
          } catch (e: any) { console.error(`[set_model] write error: ${e.message}`); }

          let cr = findSessionForClient(ws) || cwdSessions.get(cwd);
          if (!cr) {
            // No active session yet — create one so the model can be set
            console.log(`[set_model] No active session for ${cwd}, creating one...`);
            cr = await createCwdSession(cwd);
          }
          cr.clients.add(ws);

          const model = await resolveModelWithAuth(msg.provider, msg.modelId);
          if (model) {
            await cr.session.setModel(model);
            broadcastToClients(cr, { type: "model_info", model: `${msg.provider}/${msg.modelId}` });
            console.log(`[set_model] Set model to ${msg.provider}/${msg.modelId} for ${cwd}`);
          } else {
            console.error(`[set_model] Model not found: ${msg.provider}/${msg.modelId}`);
            broadcastToClients(cr, { type: "rpc_error", command: "set_model", error: `Model not found: ${msg.provider}/${msg.modelId}` });
          }
        } catch (e: any) {
          console.error(`[set_model] Failed: ${e.message}`);
          const cr = cwdSessions.get(cwd);
          if (cr) {
            broadcastToClients(cr, { type: "rpc_error", command: "set_model", error: e.message });
          } else {
            ws.send(JSON.stringify({ type: "error", message: `Failed to set model: ${e.message}` }));
          }
        }
      }

      if (msg.type === "cycle_model") {
        const cr = findSessionForClient(ws);
        if (cr) {
          try {
            const result = await cr.session.cycleModel();
            if (result?.model) {
              broadcastToClients(cr, { type: "model_info", model: result.model.id });
            }
          } catch (e: any) {
            console.error(`[cycle_model] Failed: ${e.message}`);
            broadcastToClients(cr, { type: "rpc_error", command: "cycle_model", error: e.message });
          }
        }
      }

      if (msg.type === "set_thinking_level") {
        const cr = findSessionForClient(ws);
        if (cr) {
          try { cr.session.setThinkingLevel(msg.level); }
          catch (e: any) { console.error(`[set_thinking_level] Failed: ${e.message}`); }
        }
      }

      if (msg.type === "cycle_thinking_level") {
        const cr = findSessionForClient(ws);
        if (cr) {
          try { cr.session.cycleThinkingLevel(); }
          catch (e: any) { console.error(`[cycle_thinking_level] Failed: ${e.message}`); }
        }
      }

      if (msg.type === "get_messages") {
        const cr = findSessionForClient(ws);
        if (cr) {
          // Collect active tool executions (tool_call_start without matching end)
          const activeToolExecutions = new Map<string, { name: string; args?: any }>();
          // We track via the session's message history — scan for in-progress tool calls
          const messages = cr.session.messages;
          const toolCallStates: Array<{ id?: string; name: string; isRunning: boolean }> = [];
          for (const msg of messages) {
            if (msg.role === "assistant" && Array.isArray(msg.content)) {
              for (const part of msg.content) {
                if (part.type === "toolCall" && part.id) {
                  toolCallStates.push({ id: part.id, name: part.name || "unknown", isRunning: false });
                }
              }
            }
          }
          // Check for ongoing tool executions by looking at recent events
          // The SDK doesn't expose a direct API for this, so we use the idle flag
          broadcastToClients(cr, {
            type: "rpc_response",
            command: "get_messages",
            data: {
              messages,
              isWorking: !cr.idle,
              sessionId: cr.session.sessionId,
            }
          });
        }
      }

      if (msg.type === "get_available_models") {
        const cr = findSessionForClient(ws) || cwdSessions.get(getCwd(msg));
        try {
          // Load extensions first to register their models/providers
          await loadExtensionsForModels();

          // Get models from shared registry (now includes extension-registered models)
          const available = await modelRegistry.getAvailable();

          // Load models from pre-generated CLI output (models.json)
          const cliModelsPath = path.join(__dirname, '..', 'models.json');
          const cliModels = fs.existsSync(cliModelsPath)
            ? JSON.parse(fs.readFileSync(cliModelsPath, 'utf8'))
            : [];

          for (const m of cliModels) {
            if (!available.some(a => a.provider === m.provider && a.id === m.id)) {
              available.push(m);
            }
          }

          // Include custom models from getCustomModels (they have their own auth handling)
          const custom = getCustomModels();
          const customModelsList = Object.values(custom).map((m: any) => ({
            id: m.id,
            name: m.name || m.id,
            provider: m.provider,
            reasoning: m.reasoning || false,
            input: m.input || ["text"],
          }));

          // Merge and deduplicate by provider/id
          const all = [...available];
          for (const cm of customModelsList) {
            if (!all.some(m => m.provider === cm.provider && m.id === cm.id)) {
              all.push(cm);
            }
          }

          const target = cr || { clients: new Set([ws]) } as CwdSession;
          broadcastToClients(target, { type: "rpc_response", command: "get_available_models", data: { models: all } });
        } catch (e: any) {
          console.error(`[get_available_models] Failed: ${e.message}`);
        }
      }

      if (msg.type === "get_session_stats") {
        // Try to find by client first, then by cwd
        let cr = findSessionForClient(ws);
        if (!cr && msg.cwd) {
          cr = cwdSessions.get(msg.cwd);
        }
        if (cr) {
          const s = cr.session;
          const contextUsage = s.getContextUsage();
          ws.send(JSON.stringify({
            type: "rpc_response",
            command: "get_session_stats",
            data: {
              sessionId: s.sessionId,
              sessionFile: s.sessionFile,
              messages: s.messages.length,
              model: s.model?.id,
              thinkingLevel: s.thinkingLevel,
              // Context usage info
              tokensBefore: contextUsage?.tokens ?? 0,
              contextUsage: contextUsage?.percent ?? 0,
              contextWindow: contextUsage?.contextWindow ?? 0,
            }
          }));
        } else {
          // No session found, send empty stats
          ws.send(JSON.stringify({
            type: "rpc_response",
            command: "get_session_stats",
            data: {
              sessionId: '',
              sessionFile: '',
              messages: 0,
              model: '',
              thinkingLevel: '',
              tokensBefore: 0,
              contextUsage: 0,
              contextWindow: 0,
            }
          }));
        }
      }

      if (msg.type === "get_commands") {
        const cr = findSessionForClient(ws);
        if (cr) {
          broadcastToClients(cr, {
            type: "rpc_response",
            command: "get_commands",
            data: { commands: [] }
          });
        }
      }

      // ── Session Management ──
      if (msg.type === "create_session" || msg.type === "new_session") {
        const cwd = getCwd(msg);
        console.log(`[${msg.type}] cwd=${cwd}`);

        // Dispose old runtime
        await disposeSession(cwd);

        // Create fresh runtime
        const cr = await createCwdSession(cwd, SessionManager.create(cwd));
        cr.clients.add(ws);
        cr.idle = true;
        cr.lastPromptMsg = null;
        cr.lastPromptImages = null;

        broadcastToClients(cr, {
          type: "session_created",
          sessionId: cr.session.sessionId,
          sessionFile: cr.session.sessionFile,
        });
        console.log(`🆕 ${msg.type} ready for ${cwd}`);
      }

      if (msg.type === "resume_session") {
        const cwd = getCwd(msg);
        const cr = await getOrCreateSession(cwd, false, undefined);
        cr.clients.add(ws);
      }

      if (msg.type === "load_session") {
        const cwd = getCwd(msg);
        const sessionId = msg.sessionId;
        console.log(`[load_session] cwd=${cwd}, sessionId=${sessionId}`);

        const sessionPath = findSessionFileBySessionId(cwd, sessionId);
        if (!sessionPath) {
          ws.send(JSON.stringify({ type: "error", message: `Session file not found: ${sessionId}` }));
          return;
        }

        // Check if there's already an active session for this cwd
        const existingCr = cwdSessions.get(cwd);
        console.log(`[load_session] existingCr=${!!existingCr}, existingSessionId=${existingCr?.session.sessionId}, reqSessionId=${sessionId}`);
        if (existingCr && existingCr.session.sessionId === sessionId) {
          // Same session already active, just add this client and preserve state
          existingCr.clients.add(ws);
          
          // Send session loaded immediately
          ws.send(JSON.stringify({
            type: "session_loaded",
            sessionId: existingCr.session.sessionId,
            sessionFile: existingCr.session.sessionFile,
          }));
          
          // If agent is currently working, send agent_start directly to this client
          if (!existingCr.idle) {
            ws.send(JSON.stringify({ type: "agent_start", isWorking: true }));
            
            // Also send turn_start if we're in a turn
            if (existingCr.lastEventType === "turn_start" || existingCr.lastEventType === "message_start") {
              ws.send(JSON.stringify({
                type: "turn_start",
                model: existingCr.session.model?.provider + "/" + existingCr.session.model?.id
              }));
            }
          }
          
          // Send full state immediately
          const s = existingCr.session;
          ws.send(JSON.stringify({
            type: "state",
            model: s.model?.id,
            provider: s.model?.provider,
            thinkingLevel: s.thinkingLevel,
            messages: s.messages.length,
            sessionId: s.sessionId,
            sessionFile: s.sessionFile,
            isWorking: !existingCr.idle,
            stateVersion: existingCr.stateVersion,
            workingDuration: existingCr.workingStartTime ? Date.now() - existingCr.workingStartTime : null,
            lastEventType: existingCr.lastEventType,
            cwd: existingCr.cwd,
          }));
          
          // Send full message history
          ws.send(JSON.stringify({
            type: "rpc_response",
            command: "get_messages",
            data: {
              messages: s.messages,
              isWorking: !existingCr.idle,
              sessionId: s.sessionId,
            }
          }));
          
          console.log(`📖 Session ${sessionId} already active for ${cwd}, state preserved`);
          return;
        }

        // Dispose old runtime and create new one with this session
        await disposeSession(cwd);
        const cr = await createCwdSession(cwd, SessionManager.open(sessionPath));
        cr.clients.add(ws);
        // Don't force idle=true - preserve previous session state

        broadcastToClients(cr, {
          type: "session_loaded",
          sessionId: cr.session.sessionId,
          sessionFile: cr.session.sessionFile,
        });

        // Send current state after a short delay
        setTimeout(() => {
          const s = cr.session;
          broadcastToClients(cr, {
            type: "state",
            model: s.model?.id,
            provider: s.model?.provider,
            thinkingLevel: s.thinkingLevel,
            messages: s.messages.length,
            sessionId: s.sessionId,
            sessionFile: s.sessionFile,
            isWorking: !cr.idle,
            cwd: cr.cwd,
          });
          // Also send messages so client has full conversation history
          broadcastToClients(cr, {
            type: "rpc_response",
            command: "get_messages",
            data: {
              messages: s.messages,
              isWorking: !cr.idle,
              sessionId: s.sessionId,
            }
          });
        }, 100);

        console.log(`📖 Loaded session ${sessionId} for ${cwd}`);
      }

      if (msg.type === "switch_session") {
        const cr = findSessionForClient(ws);
        if (cr && msg.sessionPath) {
          // Dispose old, create new with target session
          await disposeSession(cr.cwd);
          const newCr = await createCwdSession(cr.cwd, SessionManager.open(msg.sessionPath));
          for (const c of cr.clients) newCr.clients.add(c);
          broadcastToClients(newCr, {
            type: "session_switched",
            sessionId: newCr.session.sessionId,
          });
        }
      }

      if (msg.type === "fork") {
        const cr = findSessionForClient(ws);
        if (cr && msg.entryId) {
          // Fork via session tree: create branched session
          const sm = SessionManager.open(cr.session.sessionFile!);
          sm.createBranchedSession(msg.entryId);
          // Reload with the new session
          await disposeSession(cr.cwd);
          const newCr = await createCwdSession(cr.cwd, SessionManager.continueRecent(cr.cwd));
          for (const c of cr.clients) newCr.clients.add(c);
          broadcastToClients(newCr, {
            type: "session_forked",
            sessionId: newCr.session.sessionId,
          });
        }
      }

      if (msg.type === "set_session_name") {
        const cr = findSessionForClient(ws);
        if (cr) {
          // Session naming is handled via the session file
          console.log(`[set_session_name] ${msg.name}`);
        }
      }

      // ── Compaction & Retry ──
      if (msg.type === "compact") {
        const cr = findSessionForClient(ws);
        if (cr) {
          cr.session.compact(msg.customInstructions).catch(console.error);
        }
      }

      if (msg.type === "set_auto_compaction") {
        const cr = findSessionForClient(ws);
        if (cr) {
          cr.settingsManager.applyOverrides({ compaction: { enabled: msg.enabled } });
          await cr.settingsManager.flush();
        }
      }

      if (msg.type === "set_auto_retry") {
        const cr = findSessionForClient(ws);
        if (cr) {
          cr.settingsManager.applyOverrides({ retry: { enabled: msg.enabled } });
          await cr.settingsManager.flush();
        }
      }

      if (msg.type === "set_steering_mode") {
        const cr = findSessionForClient(ws);
        if (cr) {
          cr.settingsManager.applyOverrides({ steeringMode: msg.mode });
          await cr.settingsManager.flush();
        }
      }

      if (msg.type === "set_follow_up_mode") {
        const cr = findSessionForClient(ws);
        if (cr) {
          cr.settingsManager.applyOverrides({ followUpMode: msg.mode });
          await cr.settingsManager.flush();
        }
      }

      if (msg.type === "bash") {
        const cr = findSessionForClient(ws);
        if (cr) {
          // SDK doesn't have direct bash — use prompt
          cr.session.prompt(`!${msg.command}`).catch(console.error);
        }
      }

      if (msg.type === "export_html") {
        const cr = findSessionForClient(ws);
        if (cr) {
          // Export via session file — handled by frontend or separate endpoint
          console.log(`[export_html] outputPath=${msg.outputPath}`);
        }
      }
    });

    ws.on("close", () => {
      console.log("🔌 Client disconnected");
      const cr = findSessionForClient(ws);
      if (cr) {
        cr.clients.delete(ws);
        if (cr.clients.size === 0) {
          // Don't set idle=true here — the agent may still be working.
          // The idle flag should only be set by agent_end events.
          // This ensures reconnection properly restores isWorking state.
          console.log(`📡 Last client left for ${cr.cwd}, preserving idle=${cr.idle}`);
          resetIdleTimer(cr);
        }
      }
    });
  });
}

// Graceful shutdown
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n👋 Shutting down...");
  if (pingTimer) clearInterval(pingTimer);
  for (const [, cr] of cwdSessions) {
    try { await cr.session(); } catch {}
  }
  wss?.close();
  server?.close();
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

process.on("uncaughtException", (err) => {
  if (err.message.includes("EADDRINUSE")) return;
  console.error("💥 Uncaught exception:", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("💥 Unhandled rejection:", reason);
});
