import type { FormAutoFillSource } from '../form-definitions/schemas/form-definition.schema.js';
import type { RequestActorAutoFillProfile } from './request-actor-context.service.js';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function hasLockedAutoFillFields(fields: readonly unknown[]): boolean {
  return fields.some((field) => {
    if (!isRecord(field) || !isRecord(field.autoFill)) return false;
    return field.autoFill.readOnly === true && typeof field.autoFill.source === 'string';
  });
}

export function buildInitialRequestFormData(
  fields: readonly unknown[],
  profile: RequestActorAutoFillProfile | undefined,
  now = new Date(),
): Record<string, unknown> {
  const formData: Record<string, unknown> = {};
  for (const field of fields) {
    if (!isRecord(field) || typeof field.key !== 'string') continue;
    if (field.defaultValue !== undefined && field.defaultValue !== '') {
      formData[field.key] = structuredClone(field.defaultValue);
    }
    if (isRecord(field.autoFill) && typeof field.autoFill.source === 'string') {
      const resolved = resolveAutoFillValue(
        field.autoFill.source as FormAutoFillSource,
        typeof field.type === 'string' ? field.type : 'TEXT',
        profile,
        now,
      );
      if (resolved !== undefined && resolved !== '') {
        formData[field.key] = resolved;
      }
    }
  }
  return formData;
}

export function enforceLockedAutoFillFormData(
  fields: readonly unknown[],
  incomingFormData: Readonly<Record<string, unknown>>,
  existingFormData: Readonly<Record<string, unknown>>,
  profile: RequestActorAutoFillProfile | undefined,
  now = new Date(),
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...incomingFormData };
  for (const field of fields) {
    if (!isRecord(field) || typeof field.key !== 'string' || !isRecord(field.autoFill)) continue;
    if (field.autoFill.readOnly !== true || typeof field.autoFill.source !== 'string') continue;

    const source = field.autoFill.source as FormAutoFillSource;
    const fieldType = typeof field.type === 'string' ? field.type : 'TEXT';
    if (source === 'REQUEST_CODE' || source === 'REQUEST_STATUS') {
      delete next[field.key];
      continue;
    }
    if (source === 'CURRENT_DATE') {
      const existingValue = existingFormData[field.key];
      if (typeof existingValue === 'string' && existingValue.trim()) {
        next[field.key] = existingValue;
      } else {
        const resolved = resolveAutoFillValue(source, fieldType, profile, now);
        if (resolved) next[field.key] = resolved;
      }
      continue;
    }

    const resolved = resolveAutoFillValue(source, fieldType, profile, now);
    if (resolved !== undefined && resolved !== '') {
      next[field.key] = resolved;
    } else if (typeof existingFormData[field.key] === 'string' && String(existingFormData[field.key]).trim()) {
      next[field.key] = existingFormData[field.key];
    }
  }
  return next;
}

export function applyAutoFillToMigratedFormData(
  fields: readonly unknown[],
  migratedFormData: Readonly<Record<string, unknown>>,
  profile: RequestActorAutoFillProfile | undefined,
  now = new Date(),
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...migratedFormData };
  for (const field of fields) {
    if (!isRecord(field) || typeof field.key !== 'string' || !isRecord(field.autoFill)) continue;
    if (typeof field.autoFill.source !== 'string') continue;
    const source = field.autoFill.source as FormAutoFillSource;
    const fieldType = typeof field.type === 'string' ? field.type : 'TEXT';
    if (source === 'REQUEST_CODE' || source === 'REQUEST_STATUS') {
      delete next[field.key];
      continue;
    }
    const current = next[field.key];
    const isEmpty = current === undefined || current === null || current === '';
    if (field.autoFill.readOnly === true || isEmpty) {
      const resolved = resolveAutoFillValue(source, fieldType, profile, now);
      if (resolved !== undefined && resolved !== '') {
        next[field.key] = resolved;
      }
    }
  }
  return next;
}

function resolveAutoFillValue(
  source: FormAutoFillSource,
  fieldType: string,
  profile: RequestActorAutoFillProfile | undefined,
  now: Date,
): string | undefined {
  switch (source) {
    case 'REQUEST_CODE':
    case 'REQUEST_STATUS':
      return undefined;
    case 'REQUESTER_EMPLOYEE_CODE':
      return profile?.employeeCode;
    case 'REQUESTER_FULL_NAME':
      return profile?.fullName;
    case 'REQUESTER_EMAIL':
      return profile?.email;
    case 'REQUESTER_PHONE':
      return profile?.phone;
    case 'REQUESTER_DEPARTMENT_NAME':
      return profile?.departmentName;
    case 'REQUESTER_WORK_UNIT_NAME':
      return profile?.workUnitName;
    case 'REQUESTER_POSITION_NAME':
      return profile?.positionName;
    case 'CURRENT_DATE':
      return formatCurrentDateForField(fieldType, now);
    default:
      return undefined;
  }
}

function formatCurrentDateForField(fieldType: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '00';
  const datePart = `${pick('year')}-${pick('month')}-${pick('day')}`;
  if (fieldType === 'DATETIME') {
    return `${datePart}T${pick('hour')}:${pick('minute')}`;
  }
  return datePart;
}
