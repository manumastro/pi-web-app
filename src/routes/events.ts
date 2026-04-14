// ── SSE (Server-Sent Events) Routes ──
// GET /api/events - Real-time event stream
// Following OpenCode Web UI architecture

import type { Request, Response } from 'express';
import { cwdSessions } from './sessionManager.js';

// Store active SSE connections with CWD binding
interface SSEConnection {
  res: Response;
  cwd: string;
  connectedAt: number;
}

const sseConnections = new Map<string, SSEConnection[]>(); // cwd -> connections[]

/**
 * SSE endpoint - streams events to client
 * Client connects to: GET /api/events?cwd=/path/to/project
 */
export function handleSSE(req: Request, res: Response): void {
  const cwd = req.query.cwd as string || process.env.HOME || '/home/manu';
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  // Initialize CWD bucket if needed
  if (!sseConnections.has(cwd)) {
    sseConnections.set(cwd, []);
  }
  
  const connection: SSEConnection = { 
    res, 
    cwd, 
    connectedAt: Date.now() 
  };
  sseConnections.get(cwd)!.push(connection);

  console.log(`📡 SSE connection opened for ${cwd} (total: ${sseConnections.get(cwd)!.length})`);

  // Send initial connection event
  res.write(`event: server.connected\ndata: ${JSON.stringify({ cwd, timestamp: Date.now() })}\n\n`);

  // Send current state if session exists
  const cr = cwdSessions.get(cwd);
  if (cr) {
    const s = cr.session;
    res.write(`event: state\ndata: ${JSON.stringify({
      model: s.model?.id,
      provider: s.model?.provider,
      thinkingLevel: s.thinkingLevel,
      messages: s.messages.length,
      sessionId: s.sessionId,
      isWorking: !cr.idle,
      cwd: cr.cwd,
    })}\n\n`);
    
    // Send full messages
    res.write(`event: rpc_response\ndata: ${JSON.stringify({
      command: 'get_messages',
      data: {
        messages: s.messages,
        isWorking: !cr.idle,
        sessionId: s.sessionId,
      }
    })}\n\n`);
  }

  // Heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`); // SSE comment (ignored by client)
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000);

  // Cleanup on close
  req.on('close', () => {
    clearInterval(heartbeat);
    const connections = sseConnections.get(cwd);
    if (connections) {
      const idx = connections.findIndex(c => c.res === res);
      if (idx >= 0) connections.splice(idx, 1);
    }
    console.log(`📡 SSE connection closed for ${cwd} (remaining: ${sseConnections.get(cwd)?.length || 0})`);
  });
}

/**
 * Broadcast event to all SSE connections for a specific CWD
 * Called from event forwarding when SDK events occur
 */
export function broadcastToSSE(cwd: string, eventType: string, data: any): void {
  const connections = sseConnections.get(cwd);
  if (!connections || connections.length === 0) return;
  
  const eventData = JSON.stringify(data);
  
  for (const conn of connections) {
    try {
      conn.res.write(`event: ${eventType}\ndata: ${eventData}\n\n`);
    } catch (e) {
      // Connection might be closed, remove it
      const idx = connections.findIndex(c => c.res === conn.res);
      if (idx >= 0) connections.splice(idx, 1);
    }
  }
}

/**
 * Get SSE connection count for a CWD
 */
export function getSSEConnectionCount(cwd?: string): number {
  if (!cwd) {
    let total = 0;
    for (const connections of sseConnections.values()) {
      total += connections.length;
    }
    return total;
  }
  return sseConnections.get(cwd)?.length || 0;
}

/**
 * Express route registration
 */
export function registerSSERoutes(app: any): void {
  app.get('/api/events', handleSSE);
}