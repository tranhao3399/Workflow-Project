import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { AvatarFileInput, AvatarStorageAdapter, StoredAvatar } from './avatar-storage.adapter.js';

@Injectable()
export class LocalAvatarStorageAdapter implements AvatarStorageAdapter {
  private readonly avatarDirectory = join(process.cwd(), 'uploads', 'avatars');

  async store(input: AvatarFileInput): Promise<StoredAvatar> {
    await mkdir(this.avatarDirectory, { recursive: true });
    const extension = input.contentType === 'image/png' ? '.png' : '.jpg';
    const key = `${randomUUID()}${extension}`;
    await writeFile(join(this.avatarDirectory, key), input.buffer, { flag: 'wx' });
    return { key, contentType: input.contentType, size: input.buffer.length };
  }

  async remove(key: string): Promise<void> {
    const safeKey = basename(key);
    if (!safeKey || safeKey !== key) return;
    try {
      await unlink(join(this.avatarDirectory, safeKey));
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
  }

  getPublicUrl(key: string): string {
    return `/uploads/avatars/${encodeURIComponent(basename(key))}`;
  }
}
