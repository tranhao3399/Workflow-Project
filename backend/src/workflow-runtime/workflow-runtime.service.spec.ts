import { ConflictException } from '@nestjs/common';
import { Types, type ClientSession } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import type { RequestDocument } from '../requests/schemas/request.schema.js';
import { ConditionEvaluatorService } from './condition-evaluator.service.js';
import { WorkflowRuntimeService } from './workflow-runtime.service.js';

describe('WorkflowRuntimeService annual leave deduction on completion', () => {
  function createRuntime(
    employeesModel: Record<string, unknown>,
    assigneeResolver: Record<string, unknown> = {},
  ) {
    const history = { record: vi.fn().mockResolvedValue(undefined) };
    const notifications = { createPersonal: vi.fn().mockResolvedValue(undefined) };
    const service = new WorkflowRuntimeService(
      {} as never,
      employeesModel as never,
      assigneeResolver as never,
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

  it('given a workflow with BALANCE_DEDUCT and SEND_NOTIFICATION ACTION steps, when advanced to END_APPROVED, then leave is deducted once and notifications are dispatched', async () => {
    const recipientUserId = new Types.ObjectId();
    const employees = {
      findOneAndUpdate: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue({ annualLeaveDays: 7.5 }),
        }),
      }),
    };
    const assigneeResolver = {
      resolveNotificationRecipients: vi.fn().mockResolvedValue([
        { userId: recipientUserId, snapshot: { fullName: 'HR Admin' } },
      ]),
    };
    const { service, notifications } = createRuntime(employees, assigneeResolver);
    const request = makeRequest({
      requesterSnapshot: {
        employeeCode: 'EMP0001',
        fullName: 'Nguyen Van A',
        departmentId: new Types.ObjectId(),
        departmentName: 'Vận hành',
        positionId: new Types.ObjectId(),
        positionName: 'Nhân viên',
      },
      workflowSnapshot: {
        startStepKey: 'ACTION_DEDUCT',
        steps: [
          {
            stepKey: 'ACTION_DEDUCT',
            name: 'Trừ quỹ phép năm',
            type: 'ACTION',
            actionConfig: {
              actionType: 'BALANCE_DEDUCT',
              fieldKey: 'so_ngay_nghi',
              allowNegative: false,
            },
            onNextStepKey: 'ACTION_NOTIFY',
          },
          {
            stepKey: 'ACTION_NOTIFY',
            name: 'Thông báo HR',
            type: 'ACTION',
            actionConfig: {
              actionType: 'SEND_NOTIFICATION',
              assigneeRule: { type: 'REQUESTER_DIRECT_MANAGER', includeInactive: false },
              notificationTitle: 'Có đơn nghỉ phép được duyệt',
            },
            onNextStepKey: 'END_APPROVED',
          },
          {
            stepKey: 'END_APPROVED',
            name: 'Đã duyệt',
            type: 'END',
            endResult: 'APPROVED',
          },
        ],
      },
    } as Partial<RequestDocument>);

    const result = await service.advance(request, 'ACTION_DEDUCT', {} as ClientSession);

    expect(result).toEqual({ state: 'COMPLETED', requestStatus: 'APPROVED' });
    // Even though formSnapshot.settings.leaveDeduction.enabled is true AND ACTION_DEDUCT ran,
    // findOneAndUpdate must only be called ONCE (preventing double deduction).
    expect(employees.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(notifications.createPersonal).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId,
        type: 'SYSTEM',
        title: 'Có đơn nghỉ phép được duyệt',
      }),
      expect.anything(),
    );
  });

  it('given a request with leaveDeductionApplied from an earlier ACTION step, when workflow ends at REJECTED, then deducted leave is refunded', async () => {
    const employees = {
      findOneAndUpdate: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue({ annualLeaveDays: 12 }),
        }),
      }),
    };
    const { service } = createRuntime(employees);
    const request = makeRequest({
      leaveDeductionApplied: {
        fieldKey: 'so_ngay_nghi',
        days: 2.5,
        deductedAt: new Date(),
      },
    });
    const session = {} as ClientSession;

    const outcome = await service.complete(
      request,
      { stepKey: 'END_REJECTED', name: 'Từ chối', type: 'END', endResult: 'REJECTED' } as never,
      session,
    );

    expect(outcome).toEqual({ state: 'COMPLETED', requestStatus: 'REJECTED' });
    expect(employees.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: request.requesterEmployeeId },
      { $inc: { annualLeaveDays: 2.5 } },
      { session, returnDocument: 'after' },
    );
    expect(request.leaveDeductionApplied?.refundedAt).toBeInstanceOf(Date);
  });

  it('given an APPROVAL step routing via onNextStepKey to an APPROVAL_OUTCOME gateway, when approved or rejected, then request routes to matching END step', async () => {
    const history = { record: vi.fn().mockResolvedValue(undefined) };
    const notifications = { createPersonal: vi.fn().mockResolvedValue(undefined) };
    const service = new WorkflowRuntimeService(
      {} as never,
      {} as never,
      {} as never,
      new ConditionEvaluatorService(),
      history as never,
      notifications as never,
    );
    const snapshot = {
      startStepKey: 'APPROVAL_1',
      steps: [
        {
          stepKey: 'APPROVAL_1',
          name: 'Phê duyệt',
          type: 'APPROVAL',
          approvalMode: 'ANY',
          allowSelfApproval: false,
          assigneeRule: { type: 'REQUESTER_DIRECT_MANAGER', includeInactive: false },
          onNextStepKey: 'CONDITION_1',
        },
        {
          stepKey: 'CONDITION_1',
          name: 'Kết quả duyệt?',
          type: 'CONDITION',
          condition: { source: 'APPROVAL_OUTCOME', fieldKey: 'decision', operator: 'EQUALS', value: 'APPROVED' },
          onTrueStepKey: 'END_APPROVED',
          onFalseStepKey: 'END_REJECTED',
        },
        { stepKey: 'END_APPROVED', name: 'Đã phê duyệt', type: 'END', endResult: 'APPROVED' },
        { stepKey: 'END_REJECTED', name: 'Đã từ chối', type: 'END', endResult: 'REJECTED' },
      ],
    };
    const session = {} as ClientSession;

    const approvedReq = makeRequest({
      currentStepKey: 'APPROVAL_1',
      formSnapshot: {},
      workflowSnapshot: snapshot as never,
    });
    const approvedResult = await service.continueTransition(approvedReq, 'APPROVED', session);
    expect(approvedResult).toEqual({ state: 'COMPLETED', requestStatus: 'APPROVED' });

    const rejectedReq = makeRequest({
      currentStepKey: 'APPROVAL_1',
      formSnapshot: {},
      workflowSnapshot: snapshot as never,
    });
    const rejectedResult = await service.continueTransition(rejectedReq, 'REJECTED', session);
    expect(rejectedResult).toEqual({ state: 'COMPLETED', requestStatus: 'REJECTED' });
  });
});
