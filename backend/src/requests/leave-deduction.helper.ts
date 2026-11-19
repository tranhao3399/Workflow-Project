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

export function extractEffectiveLeaveDeductionConfig(
  settings: unknown,
  workflowSteps?: unknown,
): ParsedLeaveDeductionConfig | undefined {
  const formConfig = extractLeaveDeductionConfig(settings);
  if (formConfig?.enabled) return formConfig;
  if (Array.isArray(workflowSteps)) {
    for (const step of workflowSteps) {
      if (!isPlainObject(step) || step.type !== 'ACTION' || !isPlainObject(step.actionConfig)) continue;
      const actionConfig = step.actionConfig;
      if (actionConfig.actionType !== 'BALANCE_DEDUCT') continue;
      const fieldKey = typeof actionConfig.fieldKey === 'string' ? actionConfig.fieldKey.trim() : '';
      if (fieldKey) {
        return {
          enabled: true,
          fieldKey,
          allowNegative: actionConfig.allowNegative === true,
        };
      }
    }
  }
  return formConfig;
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
