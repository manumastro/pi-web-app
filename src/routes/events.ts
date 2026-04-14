// ── SSE (Server-Sent Events) Routes ──
// GET /api/events - Real-time event stream

import type { Request, Response } from 'express';
import type { CwdSession } from '../types/index.js';
import { cwdSessions, findSessionForClient } from '../services/sessionManager.js';

// Store active SSE connections
const sseConnections = new Set<{
  res: Response;
  sessionId?: string;
  cwd?: string;
}>();

/**
 * SSE endpoint - streams events to client
 * Follows OpenCode Web UI architecture pattern
 */
export function handleSSE(req: Request, res: Response): void {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  // Add to connections
  const connection = { res };
  sseConnections.add(connection);

  console.log(`📡 SSE connection opened (total: ${sseConnections.size})`);

  // Send initial connection event
  res.write(`event: server.connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);

  // Heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`); // SSE comment (ignored by client)
  }, 30000);

  // Cleanup on close
  req.on('close', () => {
    clearInterval(heartbeat);
    sseConnections.delete(connection);
    console.log(`📡 SSE connection closed (remaining: ${sseConnections.size})`);
  });
}

/**
 * Broadcast event to all SSE connections for a specific CWD
 * Or broadcast to all if no cwd specified
 */
export function broadcastSSE(cwd: string | null, event: any): void {
  const eventData = JSON.stringify(event);
  const eventName = event.type || 'message';

  for (const conn of sseConnections) {
    // Filter by CWD if specified
    if (cwd && conn.cwd !== cwd) continue;
    
    try {
      conn.res.write(`event: ${eventName}\ndata: ${eventData}\n\n`);
    } catch (e) {
      // Connection might be closed
      sseConnections.delete(conn);
    }
  }
}

/**
 * Register SSE connection to a specific CWD
 */
export function registerSSEConnection(ws: any, cwd: string): void {
  for (const conn of sseConnections) {
    // Find connection by response object (hacky but works for now)
    // In Phase 2 full implementation, we'll properly track connections
  }
}

/**
 * Get SSE connection count for a CWD
 */
export function getSSEConnectionCount(cwd?: string): number {
  if (!cwd) return sseConnections.size;
  return Array.from(sseConnections).filter(c => c.cwd === cwd).length;
}