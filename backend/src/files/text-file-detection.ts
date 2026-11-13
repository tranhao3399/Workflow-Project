import { extname } from 'node:path';
import { TextDecoder } from 'node:util';

const TEXT_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  csv: 'text/csv',
  json: 'application/json',
  txt: 'text/plain',
};

export interface DetectedTextFile {
  ext: string;
  mime: string;
}

export function detectAllowedTextFile(
  buffer: Buffer,
  originalName: string,
  suppliedMimeType: string,
  allowedMimeTypes: readonly string[],
): DetectedTextFile | undefined {
  const extension = extname(originalName).slice(1).toLowerCase();
  const expectedMimeType = TEXT_MIME_BY_EXTENSION[extension];
  if (
    !expectedMimeType
    || suppliedMimeType !== expectedMimeType
    || !allowedMimeTypes.includes(expectedMimeType)
  ) {
    return undefined;
  }

  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return undefined;
  }
  if (content.includes('\0')) return undefined;
  for (const character of content) {
    const code = character.charCodeAt(0);
    if (code < 32 && character !== '\t' && character !== '\n' && character !== '\r') {
      return undefined;
    }
  }
  if (expectedMimeType === 'application/json') {
    try {
      JSON.parse(content.replace(/^\uFEFF/, ''));
    } catch {
      return undefined;
    }
  }
  return { ext: extension, mime: expectedMimeType };
}
