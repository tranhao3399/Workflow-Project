import { describe, expect, it } from 'vitest';
import { detectAllowedTextFile } from './text-file-detection.js';

describe('detectAllowedTextFile', () => {
  it('given valid UTF-8 CSV allowed by policy, when content is inspected, then the text file is accepted', () => {
    expect(
      detectAllowedTextFile(
        Buffer.from('employeeCode,fullName\nNV-001,Nguyen Van A', 'utf8'),
        'employees.csv',
        'text/csv',
        ['text/csv'],
      ),
    ).toEqual({ ext: 'csv', mime: 'text/csv' });
  });

  it('given a text extension not allowed by policy, when content is inspected, then the file is rejected', () => {
    expect(
      detectAllowedTextFile(
        Buffer.from('plain text', 'utf8'),
        'notes.txt',
        'text/plain',
        ['application/pdf'],
      ),
    ).toBeUndefined();
  });

  it('given binary bytes disguised as text, when content is inspected, then the file is rejected', () => {
    expect(
      detectAllowedTextFile(
        Buffer.from([0xff, 0xfe, 0x00, 0x01]),
        'notes.txt',
        'text/plain',
        ['text/plain'],
      ),
    ).toBeUndefined();
  });

  it('given malformed JSON, when content is inspected, then the JSON file is rejected', () => {
    expect(
      detectAllowedTextFile(
        Buffer.from('{"missing":', 'utf8'),
        'data.json',
        'application/json',
        ['application/json'],
      ),
    ).toBeUndefined();
  });
});
