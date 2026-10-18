import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import type { StorageAdapter, StoredPrivateFile, StoreFileInput } from './storage-adapter.js';

@Injectable()
export class LocalPrivateStorageAdapter implements StorageAdapter {
  readonly provider = 'LOCAL' as const;
  private readonly storageDirectory = resolve(process.cwd(), 'private-storage', 'request-files');

  constructor() {
    const publicUploadsDirectory = resolve(process.cwd(), 'uploads');
    if (
      this.storageDirectory === publicUploadsDirectory
      || this.storageDirectory.startsWith(`${publicUploadsDirectory}${sep}`)
    ) {
      throw new Error('Private file storage must not be located inside the public uploads directory.');
    }
  }

  async store(input: StoreFileInput): Promise<StoredPrivateFile> {
    const extension = input.extension.toLowerCase();
    if (!/^[a-z0-9]{1,16}$/.test(extension)) throw new Error('Invalid private file extension.');

    await mkdir(this.storageDirectory, { recursive: true });
    const storageKey = `${randomUUID()}.${extension}`;
    await writeFile(this.pathFor(storageKey), input.buffer, { flag: 'wx' });
    return { storageProvider: this.provider, storageKey, sizeBytes: input.buffer.length };
  }

  async open(storageKey: string): Promise<Readable> {
    const filePath = this.pathFor(storageKey);
    await access(filePath);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error('Stored object is not a file.');
    return createReadStream(filePath);
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await unlink(this.pathFor(storageKey));
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
  }

  private pathFor(storageKey: string): string {
    if (!/^[0-9a-f-]{36}\.[a-z0-9]{1,16}$/.test(storageKey)) throw new Error('Invalid private storage key.');
    const filePath = resolve(this.storageDirectory, storageKey);
    if (dirname(filePath) !== this.storageDirectory) throw new Error('Invalid private storage path.');
    return filePath;
  }
}
