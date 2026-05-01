import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MIME_EXTENSION: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export interface StoredImageUpload {
  uploadId: string;
  fileName: string;
  mimeType: string;
  size: number;
  path: string;
}

interface StoredImageUploadMeta {
  uploadId: string;
  fileName: string;
  mimeType: string;
  size: number;
  filePath: string;
  createdAt: string;
}

export interface ImageUploadStore {
  saveBase64Image: (payload: { fileName?: string; mimeType?: string; dataBase64: string }) => Promise<StoredImageUpload>;
  getUpload: (uploadId: string) => Promise<StoredImageUpload | null>;
}

function sanitizeFileName(value: string | undefined): string {
  const raw = (value ?? 'image').trim();
  const compact = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return compact.length > 0 ? compact : 'image';
}

function stripDataUrlPrefix(input: string): string {
  const trimmed = input.trim();
  const commaIndex = trimmed.indexOf(',');
  if (trimmed.startsWith('data:') && commaIndex >= 0) {
    return trimmed.slice(commaIndex + 1);
  }
  return trimmed;
}

function assertMimeType(mimeType: string | undefined): string {
  const normalized = (mimeType ?? '').trim().toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(normalized)) {
    throw new Error('Unsupported image type');
  }
  return normalized;
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export function createImageUploadStore(baseDir: string): ImageUploadStore {
  async function saveBase64Image(payload: { fileName?: string; mimeType?: string; dataBase64: string }): Promise<StoredImageUpload> {
    const mimeType = assertMimeType(payload.mimeType);
    const dataBase64 = stripDataUrlPrefix(payload.dataBase64);
    const buffer = Buffer.from(dataBase64, 'base64');

    if (!buffer.length) {
      throw new Error('Image payload is empty');
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error('Image too large (max 20MB)');
    }

    await ensureDir(baseDir);
    const uploadId = crypto.randomUUID();
    const ext = MIME_EXTENSION[mimeType] ?? '.img';
    const safeName = sanitizeFileName(payload.fileName);
    const filePath = path.join(baseDir, `${uploadId}${ext}`);
    const metaPath = path.join(baseDir, `${uploadId}.json`);

    await fs.writeFile(filePath, buffer);

    const meta: StoredImageUploadMeta = {
      uploadId,
      fileName: safeName,
      mimeType,
      size: buffer.length,
      filePath,
      createdAt: new Date().toISOString(),
    };
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));

    return {
      uploadId,
      fileName: meta.fileName,
      mimeType: meta.mimeType,
      size: meta.size,
      path: meta.filePath,
    };
  }

  async function getUpload(uploadId: string): Promise<StoredImageUpload | null> {
    const id = uploadId.trim();
    if (!id) {
      return null;
    }

    const metaPath = path.join(baseDir, `${id}.json`);
    try {
      const raw = await fs.readFile(metaPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoredImageUploadMeta>;
      if (!parsed || typeof parsed.filePath !== 'string') {
        return null;
      }
      await fs.stat(parsed.filePath);
      return {
        uploadId: typeof parsed.uploadId === 'string' ? parsed.uploadId : id,
        fileName: typeof parsed.fileName === 'string' ? parsed.fileName : 'image',
        mimeType: typeof parsed.mimeType === 'string' ? parsed.mimeType : 'image/png',
        size: typeof parsed.size === 'number' ? parsed.size : 0,
        path: parsed.filePath,
      };
    } catch {
      return null;
    }
  }

  return {
    saveBase64Image,
    getUpload,
  };
}
