import type { Router, Request, Response } from 'express';
import express from 'express';
import type { ThinkingLevel } from '@mariozechner/pi-ai';
import type { SdkBridge } from '../sdk/bridge.js';
import type { PromptRequest } from '../sdk/bridge.js';

export function createMessagesRouter(bridge: SdkBridge): Router {
  const router = express.Router();

  router.post('/prompt', async (req: Request, res: Response) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const allowedThinkingLevels: ThinkingLevel[] = ['minimal', 'low', 'medium', 'high', 'xhigh'];
    const thinkingLevelRaw = typeof req.body?.thinkingLevel === 'string' ? req.body.thinkingLevel.trim().toLowerCase() : '';
    const thinkingLevel = allowedThinkingLevels.includes(thinkingLevelRaw as ThinkingLevel)
      ? (thinkingLevelRaw as ThinkingLevel)
      : undefined;

    const promptPayload: PromptRequest = {
      sessionId: typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined,
      cwd: typeof req.body?.cwd === 'string' ? req.body.cwd : undefined,
      message,
      model: typeof req.body?.model === 'string' ? req.body.model : undefined,
      messageId: typeof req.body?.messageId === 'string' ? req.body.messageId : undefined,
    };
    if (thinkingLevel) {
      promptPayload.thinkingLevel = thinkingLevel;
    }

    try {
      const result = await bridge.prompt(promptPayload);
      res.status(202).json(result);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      res.status(500).json({ error });
    }
  });

  router.post('/abort', async (req: Request, res: Response) => {
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    await bridge.abort(sessionId);
    res.json({ ok: true });
  });

  return router;
}
