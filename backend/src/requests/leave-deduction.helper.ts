export interface ParsedLeaveDeductionConfig {
  enabled: boolean;
  fieldKey?: string;
  allowNegative: boolean;
}

export function roundLeaveDays(value: number): number {
  return Math.round(value * 100) / 100;
}

export function extractLeaveDeductionConfig(
  settings: unknown,
): ParsedLeaveDeductionConfig | undefined {
  if (!isPlainObject(settings) || !isPlainObject(settings.leaveDeduction)) {
    return undefined;
  }
  const config = settings.leaveDeduction;
  if (config.enabled !== true) {
    return { enabled: false, allowNegative: false };
  }
  const fieldKey = typeof config.fieldKey === 'string' ? config.fieldKey.trim() : '';
  return {
    enabled: true,
    ...(fieldKey ? { fieldKey } : {}),
    allowNegative: config.allowNegative === true,
  };
}

export function extractLeaveDaysFromFormData(
  formData: unknown,
  fieldKey: string | undefined,
): number | undefined {
  if (!fieldKey || !isPlainObject(formData)) return undefined;
  const raw = formData[fieldKey];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  return roundLeaveDays(raw);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
