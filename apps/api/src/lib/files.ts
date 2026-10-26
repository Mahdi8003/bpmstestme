import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../env.js';

export function uploadRoot(): string {
  return path.resolve(process.cwd(), env.UPLOAD_DIR);
}

export function safeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

export async function saveUpload(input: {
  tenantId: string;
  caseId: string;
  fileName: string;
  data: Buffer;
}): Promise<{ storagePath: string; size: number; name: string }> {
  const safe = safeFileName(input.fileName) || 'document';
  const relative = path.join(input.tenantId, input.caseId, `${randomUUID()}-${safe}`);
  const absolute = path.join(uploadRoot(), relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, input.data);
  return { storagePath: relative, size: input.data.length, name: safe };
}

export function resolveStoredFile(storagePath: string): string | null {
  const root = uploadRoot();
  const absolute = path.resolve(root, storagePath);
  if (!absolute.startsWith(root + path.sep)) return null;
  if (!existsSync(absolute)) return null;
  return absolute;
}

export function openStoredFile(storagePath: string) {
  const absolute = resolveStoredFile(storagePath);
  if (!absolute) return null;
  return createReadStream(absolute);
}
