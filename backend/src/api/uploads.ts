import type { Router, Request, Response } from 'express';
import express from 'express';
import type { ImageUploadStore } from '../uploads/image-store.js';

export function createUploadsRouter(store: ImageUploadStore): Router {
  const router = express.Router();

  router.post('/image', express.raw({ type: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], limit: '25mb' }), async (req: Request, res: Response) => {
    const sessionId = typeof req.headers['x-session-id'] === 'string' ? req.headers['x-session-id'].trim() : '';
    const rawFileName = typeof req.headers['x-file-name'] === 'string' ? req.headers['x-file-name'] : undefined;
    const fileName = rawFileName ? (() => { try { return decodeURIComponent(rawFileName); } catch { return rawFileName; } })() : undefined;
    const mimeType = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : undefined;

    if (!sessionId) {
      res.status(400).json({ error: 'x-session-id header is required' });
      return;
    }

    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: 'Image payload is required' });
      return;
    }

    try {
      const upload = await store.saveImageBuffer(sessionId, {
        data: body,
        ...(mimeType ? { mimeType } : {}),
        ...(fileName ? { fileName } : {}),
      });
      res.status(201).json({ upload });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      res.status(400).json({ error: message });
    }
  });

  return router;
}
