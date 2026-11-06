import { ConflictException, Injectable } from '@nestjs/common';
import type { Types } from 'mongoose';
import type { FormDefinition } from '../form-definitions/schemas/form-definition.schema.js';
import { DynamicFormValidatorService } from '../form-definitions/dynamic-form-validator.service.js';
import type { WorkflowDefinition } from '../workflow-definitions/schemas/workflow-definition.schema.js';
import { isRecord } from './request-data.helpers.js';

@Injectable()
export class RequestSnapshotFactory {
  constructor(private readonly dynamicFormValidator: DynamicFormValidatorService) {}

  createFormSnapshot(form: FormDefinition & { _id: Types.ObjectId }): Record<string, unknown> {
    return {
      id: form._id.toString(),
      code: form.code,
      version: form.version,
      name: form.name,
      fields: this.normalizedFormFields(form.fields),
      settings: form.settings,
    };
  }

  normalizedFormFields(fields: FormDefinition['fields']): FormDefinition['fields'] {
    return this.dynamicFormValidator.ensureSystemRequestFields(fields);
  }

  normalizeFormSnapshot(value: unknown): unknown {
    if (!isRecord(value) || !Array.isArray(value.fields)) return value;
    return {
      ...value,
      fields: this.dynamicFormValidator.ensureSystemRequestFields(value.fields),
    };
  }

  createWorkflowSnapshot(workflow: WorkflowDefinition & { _id: Types.ObjectId }): Record<string, unknown> {
    return {
      id: workflow._id.toString(),
      code: workflow.code,
      version: workflow.version,
      name: workflow.name,
      startStepKey: workflow.startStepKey,
      steps: workflow.steps,
    };
  }

  requireSnapshot(value: unknown, label: string): Record<string, unknown> {
    if (!isRecord(value)) {
      throw new ConflictException({ code: 'INVALID_REQUEST_SNAPSHOT', message: `${label} không hợp lệ.` });
    }
    return value;
  }
}
