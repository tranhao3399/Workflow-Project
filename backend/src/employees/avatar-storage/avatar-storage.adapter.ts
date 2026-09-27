export interface AvatarFileInput {
  buffer: Buffer;
  contentType: 'image/jpeg' | 'image/png';
}

export interface StoredAvatar {
  key: string;
  contentType: 'image/jpeg' | 'image/png';
  size: number;
}

/** Storage boundary for local files now and object storage in deployed environments later. */
export interface AvatarStorageAdapter {
  store(input: AvatarFileInput): Promise<StoredAvatar>;
  remove(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}

export const AVATAR_STORAGE = Symbol('AVATAR_STORAGE');
