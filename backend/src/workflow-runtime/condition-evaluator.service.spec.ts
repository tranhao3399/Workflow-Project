import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import type { RequestDocument } from '../requests/schemas/request.schema.js';
import { ConditionEvaluatorService } from './condition-evaluator.service.js';

describe('ConditionEvaluatorService', () => {
  const evaluator = new ConditionEvaluatorService();
  const workUnitId = new Types.ObjectId();
  const departmentId = new Types.ObjectId();
  const positionId = new Types.ObjectId();

  function makeRequest(formData: Record<string, unknown> = {}): RequestDocument {
    return {
      formData,
      requesterSnapshot: {
        employeeCode: 'EMP0010',
        fullName: 'Nguyen Van A',
        departmentId,
        departmentName: 'Khối Vận hành',
        workUnitId,
        workUnitName: 'Cửa hàng Quận 1',
        positionId,
        positionName: 'Nhân viên bán hàng',
      },
    } as unknown as RequestDocument;
  }

  it('evaluates requester workUnitId attribute with EQUALS and IN', () => {
    const request = makeRequest();

    expect(
      evaluator.evaluate(request, {
        source: 'REQUESTER_ATTRIBUTE',
        fieldKey: 'workUnitId',
        operator: 'EQUALS',
        value: workUnitId.toHexString(),
      }),
    ).toBe(true);

    expect(
      evaluator.evaluate(request, {
        source: 'REQUESTER_ATTRIBUTE',
        fieldKey: 'workUnitId',
        operator: 'IN',
        value: [new Types.ObjectId().toHexString(), workUnitId.toHexString()],
      }),
    ).toBe(true);
  });

  it('evaluates BOOLEAN and NUMBER IN conditions with matching primitive types', () => {
    const request = makeRequest({ is_urgent: true, leave_days: 2 });

    expect(
      evaluator.evaluate(request, {
        source: 'FORM_FIELD',
        fieldKey: 'is_urgent',
        operator: 'EQUALS',
        value: true,
      }),
    ).toBe(true);

    expect(
      evaluator.evaluate(request, {
        source: 'FORM_FIELD',
        fieldKey: 'is_urgent',
        operator: 'IN',
        value: [false],
      }),
    ).toBe(false);

    expect(
      evaluator.evaluate(request, {
        source: 'FORM_FIELD',
        fieldKey: 'leave_days',
        operator: 'IN',
        value: [1, 2, 3],
      }),
    ).toBe(true);
  });
});
