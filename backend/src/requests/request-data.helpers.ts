import { randomUUID } from 'node:crypto';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function createRequestNumber(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `REQ-${date}-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
}
