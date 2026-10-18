import type { Readable } from 'node:stream';
import type { StorageProvider } from '../schemas/stored-file.schema.js';

export interface StoreFileInput {
  buffer: Buffer;
  extension: string;
}

export interface StoredPrivateFile {
  storageProvider: StorageProvider;
  storageKey: string;
  sizeBytes: number;
}

export interface StorageAdapter {
  readonly provider: StorageProvider;
  store(input: StoreFileInput): Promise<StoredPrivateFile>;
  open(storageKey: string): Promise<Readable>;
  remove(storageKey: string): Promise<void>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');
