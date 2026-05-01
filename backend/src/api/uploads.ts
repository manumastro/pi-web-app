import type { Router, Request, Response } from 'express';
import express from 'express';
import type { ImageUploadStore } from '../uploads/image-store.js';

export function createUploadsRouter(store: ImageUploadStore): Router {
  const router = express.Router();

  router.post('/image', async (req: Request, res: Response) => {
    const dataBase64 = typeof req.body?.dataBase64 === 'string' ? req.body.dataBase64 : '';
    const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType : undefined;
    const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName : undefined;

    if (!dataBase64.trim()) {
      res.status(400).json({ error: 'dataBase64 is required' });
      return;
    }

    try {
      const upload = await store.saveBase64Image({ dataBase64, mimeType, fileName });
      res.status(201).json({ upload });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      res.status(400).json({ error: message });
    }
  });

  return router;
}
