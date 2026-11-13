import { ConflictException } from '@nestjs/common';
import { Types, type ClientSession } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import type { RequestDocument } from '../requests/schemas/request.schema.js';
import { WorkflowRuntimeService } from './workflow-runtime.service.js';

describe('WorkflowRuntimeService annual leave deduction on completion', () => {
  function createRuntime(employeesModel: Record<string, unknown>) {
    const history = { record: vi.fn().mockResolvedValue(undefined) };
    const notifications = { createPersonal: vi.fn().mockResolvedValue(undefined) };
    const service = new WorkflowRuntimeService(
      {} as never,
      employeesModel as never,
      {} as never,
      {} as never,
      history as never,
      notifications as never,
    );
    return { service, history, notifications };
  }

  function makeRequest(overrides: Partial<RequestDocument> = {}): RequestDocument {
    return {
      _id: new Types.ObjectId(),
      requestNo: 'LEAVE-0001',
      status: 'IN_PROGRESS',
      currentStepRunNo: 1,
      requesterUserId: new Types.ObjectId(),
      requesterEmployeeId: new Types.ObjectId(),
      formData: { so_ngay_nghi: 2.5 },
      formSnapshot: {
        settings: {
          leaveDeduction: {
            enabled: true,
            fieldKey: 'so_ngay_nghi',
            allowNegative: false,
          },
        },
      },
      save: vi.fn().mockResolvedValue(undefined),
      markModified: vi.fn(),
      ...overrides,
    } as unknown as RequestDocument;
  }

  it('given an APPROVED end step with leaveDeduction enabled, when balance is sufficient, then employee annualLeaveDays is atomically decremented and recorded', async () => {
    const employees = {
      findOneAndUpdate: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue({ annualLeaveDays: 9.5 }),
        }),
      }),
    };
    const { service, history } = createRuntime(employees);
    const request = makeRequest();
    const session = {} as ClientSession;

    const outcome = await service.complete(
      request,
      { stepKey: 'END_APPROVED', name: 'Hoàn tất', type: 'END', endResult: 'APPROVED' } as never,
      session,
    );

    expect(outcome).toEqual({ state: 'COMPLETED', requestStatus: 'APPROVED' });
    expect(employees.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: request.requesterEmployeeId, annualLeaveDays: { $gte: 2.5 } },
      { $inc: { annualLeaveDays: -2.5 } },
      { session, returnDocument: 'after' },
    );
    expect(request.leaveDeductionApplied).toEqual(expect.objectContaining({
      fieldKey: 'so_ngay_nghi',
      days: 2.5,
    }));
    expect(history.record).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        metadata: expect.objectContaining({
          endResult: 'APPROVED',
          leaveDeductedDays: 2.5,
          remainingAnnualLeaveDays: 9.5,
        }),
      }),
      session,
    );
  });

  it('given insufficient employee balance when allowNegative is false, when APPROVED step completes, then ConflictException is thrown to roll back transaction', async () => {
    const employees = {
      findOneAndUpdate: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(null),
        }),
      }),
    };
    const { service } = createRuntime(employees);
    const request = makeRequest();

    await expect(
      service.complete(
        request,
        { stepKey: 'END_APPROVED', name: 'Hoàn tất', type: 'END', endResult: 'APPROVED' } as never,
        {} as ClientSession,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(request.save).not.toHaveBeenCalled();
  });
});
