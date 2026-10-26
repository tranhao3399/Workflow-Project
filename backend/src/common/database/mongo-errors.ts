export interface MongoDuplicateKeyError {
  code: 11000;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
  message?: string;
}

export function isMongoDuplicateKeyError(error: unknown): error is MongoDuplicateKeyError {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 11000;
}
