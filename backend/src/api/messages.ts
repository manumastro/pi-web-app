import type { Router, Request, Response } from 'express';
import express from 'express';
import type { RunnerOrchestrator } from '../runner/orchestrator.js';
import { THINKING_LEVELS, type ThinkingLevel } from '../types/thinking.js';
import type { PromptRequest } from '../runner/orchestrator.js';

export function createMessagesRouter(runner: RunnerOrchestrator): Router {
  const router = express.Router();

  router.post('/prompt', async (req: Request, res: Response) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const thinkingLevelRaw = typeof req.body?.thinkingLevel === 'string' ? req.body.thinkingLevel.trim().toLowerCase() : '';
    const thinkingLevel = THINKING_LEVELS.includes(thinkingLevelRaw as ThinkingLevel)
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
      const result = await runner.prompt(promptPayload);
      res.status(202).json(result);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      res.status(500).json({ error });
    }
  });

  router.post('/question/answer', async (req: Request, res: Response) => {
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
    const questionId = typeof req.body?.questionId === 'string' ? req.body.questionId : '';
    const answer = typeof req.body?.answer === 'string' ? req.body.answer.trim() : '';
    if (!sessionId || !questionId || !answer) {
      res.status(400).json({ error: 'sessionId, questionId and answer are required' });
      return;
    }

    try {
      await runner.answerQuestion(sessionId, questionId, answer);
      res.status(202).json({ ok: true });
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

    try {
      await runner.abort(sessionId);
      res.json({ ok: true });
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      res.status(503).json({ error });
    }
  });

  return router;
}
