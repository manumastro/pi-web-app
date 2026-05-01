import type { Router, Request, Response } from 'express';
import express from 'express';
import type { RunnerOrchestrator } from '../runner/orchestrator.js';
import { THINKING_LEVELS, type ThinkingLevel } from '../types/thinking.js';
import type { PromptRequest } from '../runner/orchestrator.js';
import type { ImageUploadStore } from '../uploads/image-store.js';

function buildPromptWithImageAttachments(message: string, imagePaths: string[]): string {
  const header = 'Use the read tool to inspect these image files when needed:';
  const lines = imagePaths.map((imagePath) => `- ${imagePath}`);
  const attachmentsBlock = `${header}\n${lines.join('\n')}`;
  return message.trim().length > 0 ? `${message}\n\n${attachmentsBlock}` : attachmentsBlock;
}

export function createMessagesRouter(runner: RunnerOrchestrator, imageUploads: ImageUploadStore): Router {
  const router = express.Router();

  router.post('/prompt', async (req: Request, res: Response) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const attachmentIds = Array.isArray(req.body?.attachments)
      ? req.body.attachments
          .map((entry: unknown) => {
            if (!entry || typeof entry !== 'object') return '';
            const uploadId = (entry as { uploadId?: unknown }).uploadId;
            return typeof uploadId === 'string' ? uploadId.trim() : '';
          })
          .filter((value: string) => value.length > 0)
      : [];

    if (!message && attachmentIds.length === 0) {
      res.status(400).json({ error: 'message or attachments are required' });
      return;
    }

    const thinkingLevelRaw = typeof req.body?.thinkingLevel === 'string' ? req.body.thinkingLevel.trim().toLowerCase() : '';
    const thinkingLevel = THINKING_LEVELS.includes(thinkingLevelRaw as ThinkingLevel)
      ? (thinkingLevelRaw as ThinkingLevel)
      : undefined;

    const requestSessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined;

    let promptMessage = message;
    let attachmentPayloads: PromptRequest['attachments'] | undefined;
    if (attachmentIds.length > 0) {
      if (!requestSessionId) {
        res.status(400).json({ error: 'sessionId is required when attachments are provided' });
        return;
      }
      const uploads = await Promise.all(attachmentIds.map((uploadId: string) => imageUploads.getUpload(requestSessionId, uploadId)));
      const missing = uploads.some((entry) => !entry);
      if (missing) {
        res.status(400).json({ error: 'One or more image uploads are missing or expired' });
        return;
      }
      const filteredUploads = uploads.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
      attachmentPayloads = filteredUploads.map((upload) => ({
        uploadId: upload.uploadId,
        fileName: upload.fileName,
        mimeType: upload.mimeType,
        size: upload.size,
      }));
      const imagePaths = filteredUploads.map((entry) => entry.path);
      promptMessage = buildPromptWithImageAttachments(message, imagePaths);
    }

    const promptPayload: PromptRequest = {
      sessionId: requestSessionId,
      cwd: typeof req.body?.cwd === 'string' ? req.body.cwd : undefined,
      message: promptMessage,
      displayMessage: message,
      ...(attachmentPayloads ? { attachments: attachmentPayloads } : {}),
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
