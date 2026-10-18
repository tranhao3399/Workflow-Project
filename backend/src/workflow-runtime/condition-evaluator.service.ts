import { BadRequestException, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import type { RequestDocument } from '../requests/schemas/request.schema.js';
import type { RuntimeCondition } from './workflow-runtime.types.js';

const REQUESTER_ATTRIBUTE_KEYS = [
  'employeeCode',
  'departmentId',
  'positionId',
  'managerEmployeeId',
] as const;
type RequesterAttributeKey = (typeof REQUESTER_ATTRIBUTE_KEYS)[number];

type Comparable =
  | { kind: 'null'; value: null }
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'date'; value: number };

@Injectable()
export class ConditionEvaluatorService {
  evaluate(request: RequestDocument, condition: RuntimeCondition): boolean {
    const actual = condition.source === 'FORM_FIELD'
      ? request.formData[condition.fieldKey]
      : this.requesterAttribute(request, condition.fieldKey);

    switch (condition.operator) {
      case 'EQUALS':
        return this.equals(actual, condition.value);
      case 'NOT_EQUALS':
        return !this.equals(actual, condition.value);
      case 'IN':
        return this.inValues(actual, condition.value);
      case 'GREATER_THAN':
        return this.compare(actual, condition.value, (left, right) => left > right);
      case 'LESS_THAN':
        return this.compare(actual, condition.value, (left, right) => left < right);
      default:
        throw this.invalidCondition('Toán tử điều kiện Workflow không được hỗ trợ.');
    }
  }

  private requesterAttribute(request: RequestDocument, fieldKey: string): unknown {
    if (!REQUESTER_ATTRIBUTE_KEYS.includes(fieldKey as RequesterAttributeKey)) {
      throw this.invalidCondition(`Thuộc tính người gửi không được phép dùng trong điều kiện: ${fieldKey}`);
    }
    const snapshot = request.requesterSnapshot;
    switch (fieldKey as RequesterAttributeKey) {
      case 'employeeCode': return snapshot.employeeCode;
      case 'departmentId': return snapshot.departmentId;
      case 'positionId': return snapshot.positionId;
      case 'managerEmployeeId': return snapshot.managerEmployeeId;
    }
  }

  private equals(left: unknown, right: unknown): boolean {
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
      return left.every((value, index) => this.equals(value, right[index]));
    }
    const first = this.toComparable(left);
    const second = this.toComparable(right);
    return Boolean(first && second && first.kind === second.kind && first.value === second.value);
  }

  private inValues(actual: unknown, expected: unknown): boolean {
    if (!Array.isArray(expected)) throw this.invalidCondition('Giá trị của toán tử IN phải là một mảng.');
    const actualValues = Array.isArray(actual) ? actual : [actual];
    return actualValues.some((value) => expected.some((candidate) => this.equals(value, candidate)));
  }

  private compare(
    left: unknown,
    right: unknown,
    predicate: (leftValue: number | string, rightValue: number | string) => boolean,
  ): boolean {
    const first = this.toComparable(left);
    const second = this.toComparable(right);
    if (!first || !second || first.kind !== second.kind) return false;
    if (first.kind === 'number' && second.kind === 'number') return predicate(first.value, second.value);
    if (first.kind === 'string' && second.kind === 'string') return predicate(first.value, second.value);
    if (first.kind === 'date' && second.kind === 'date') return predicate(first.value, second.value);
    return false;
  }

  private toComparable(value: unknown): Comparable | undefined {
    if (value === null) return { kind: 'null', value: null };
    if (value instanceof Types.ObjectId) return { kind: 'string', value: value.toHexString() };
    if (value instanceof Date && Number.isFinite(value.getTime())) return { kind: 'date', value: value.getTime() };
    if (typeof value === 'string') return { kind: 'string', value };
    if (typeof value === 'number' && Number.isFinite(value)) return { kind: 'number', value };
    if (typeof value === 'boolean') return { kind: 'boolean', value };
    return undefined;
  }

  private invalidCondition(message: string): BadRequestException {
    return new BadRequestException({ code: 'WORKFLOW_CONDITION_INVALID', message });
  }
}
