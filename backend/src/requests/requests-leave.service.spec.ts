import { ConflictException } from '@nestjs/common';
import { Types, type ClientSession } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { RequestsService } from './requests.service.js';

describe('RequestsService leave balance guard and void refund', () => {
  function createServiceWithTransaction({
    requestDoc,
    actorProfile,
    formDoc,
    employeeUpdateResult,
  }: {
    requestDoc?: Record<string, unknown>;
    actorProfile?: Record<string, unknown>;
    formDoc?: Record<string, unknown>;
    employeeUpdateResult?: Record<string, unknown> | null;
  }) {
    const session = {
      withTransaction: vi.fn(async (work: () => Promise<void>) => {
        await work();
      }),
      endSession: vi.fn().mockResolvedValue(undefined),
    };
    const connection = { startSession: vi.fn().mockResolvedValue(session) };
    const requests = {
      findById: vi.fn().mockReturnValue({
        session: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(requestDoc ?? null),
        }),
      }),
    };
    const forms = {
      findOne: vi.fn().mockReturnValue({
        session: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(formDoc ?? null),
        }),
      }),
    };
    const workflows = {
      findOne: vi.fn().mockReturnValue({
        session: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'PUBLISHED', version: 1 }),
        }),
      }),
    };
    const tasks = {
      updateMany: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
      }),
      find: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          session: vi.fn().mockReturnValue({
            lean: vi.fn().mockReturnValue({
              exec: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    };
    const employees = {
      findOneAndUpdate: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(employeeUpdateResult ?? { annualLeaveDays: 12 }),
        }),
      }),
    };
    const actorContext = {
      resolve: vi.fn().mockResolvedValue({
        userId: new Types.ObjectId(),
        employeeId: new Types.ObjectId(),
        requesterSnapshot: { employeeCode: 'NV001', fullName: 'Nguyễn A' },
        autoFillProfile: actorProfile ?? {},
      }),
    };
    const accessPolicy = {
      ownedRequest: vi.fn().mockResolvedValue(requestDoc),
      isVoidable: vi.fn().mockReturnValue(true),
    };
    const dynamicFormValidator = {
      assertFormDataValid: vi.fn(),
    };
    const files = {
      assertRequestFileReferencesValid: vi.fn().mockResolvedValue(undefined),
    };
    const workflowHistory = { record: vi.fn().mockResolvedValue(undefined) };
    const auditLogs = { record: vi.fn().mockResolvedValue(undefined) };
    const notifications = { createPersonal: vi.fn().mockResolvedValue(undefined) };
    const queryService = {
      findOne: vi.fn().mockResolvedValue({ id: 'req-id', status: 'VOIDED' }),
      listApprovalParticipants: vi.fn(),
    };

    const service = new RequestsService(
      connection as never,
      requests as never,
      forms as never,
      workflows as never,
      tasks as never,
      employees as never,
      dynamicFormValidator as never,
      files as never,
      {} as never,
      workflowHistory as never,
      auditLogs as never,
      notifications as never,
      queryService as never,
      accessPolicy as never,
      actorContext as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, employees, workflowHistory, session: session as unknown as ClientSession };
  }

  it('given availableAnnualLeaveDays smaller than requested days, when submitting request, then INSUFFICIENT_ANNUAL_LEAVE conflict is thrown', async () => {
    const requestDoc = {
      _id: new Types.ObjectId(),
      requestNo: 'LEAVE-0002',
      status: 'DRAFT',
      formDefinitionId: new Types.ObjectId(),
      workflowDefinitionId: new Types.ObjectId(),
      formData: { so_ngay_nghi: 5 },
      markModified: vi.fn(),
    };
    const formDoc = {
      _id: requestDoc.formDefinitionId,
      status: 'PUBLISHED',
      fields: [{ key: 'so_ngay_nghi', label: 'Số ngày nghỉ', type: 'NUMBER', required: true, order: 10 }],
      settings: { leaveDeduction: { enabled: true, fieldKey: 'so_ngay_nghi', allowNegative: false } },
    };
    const { service } = createServiceWithTransaction({
      requestDoc,
      formDoc,
      actorProfile: {
        annualLeaveDays: 10,
        pendingHeldLeaveDays: 6,
        availableAnnualLeaveDays: 4,
      },
    });
    vi.spyOn(service as never, 'publishedPackage' as never).mockResolvedValue({
      form: formDoc,
      workflow: { _id: requestDoc.workflowDefinitionId, status: 'PUBLISHED', version: 1 },
    } as never);

    await expect(
      service.submit({} as never, new Types.ObjectId().toString(), requestDoc._id.toString()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('given an APPROVED request with leaveDeductionApplied, when voidRequest runs, then leave days are atomically refunded and refundedAt is marked', async () => {
    const employeeId = new Types.ObjectId();
    const requestDoc: Record<string, unknown> = {
      _id: new Types.ObjectId(),
      requestNo: 'LEAVE-0003',
      title: 'Đơn xin nghỉ phép',
      status: 'APPROVED',
      formDefinitionId: new Types.ObjectId(),
      workflowDefinitionId: new Types.ObjectId(),
      requesterUserId: new Types.ObjectId(),
      requesterEmployeeId: employeeId,
      leaveDeductionApplied: {
        fieldKey: 'so_ngay_nghi',
        days: 3,
        deductedAt: new Date('2026-11-10T00:00:00.000Z'),
      },
      save: vi.fn().mockResolvedValue(undefined),
      markModified: vi.fn(),
    };
    const { service, employees, workflowHistory } = createServiceWithTransaction({
      requestDoc,
      employeeUpdateResult: { annualLeaveDays: 12 },
    });

    await service.voidRequest(
      {} as never,
      new Types.ObjectId().toString(),
      (requestDoc._id as Types.ObjectId).toString(),
      'Hủy kế hoạch nghỉ phép',
    );

    expect(employees.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: employeeId },
      { $inc: { annualLeaveDays: 3 } },
      expect.objectContaining({ returnDocument: 'after' }),
    );
    expect((requestDoc.leaveDeductionApplied as { refundedAt?: Date }).refundedAt).toBeInstanceOf(Date);
    expect(workflowHistory.record).toHaveBeenCalledWith(
      requestDoc,
      expect.objectContaining({
        action: 'VOIDED',
        metadata: { leaveRefundedDays: 3 },
      }),
      expect.anything(),
    );
  });
});
