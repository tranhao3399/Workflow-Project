import { describe, expect, it, vi } from 'vitest';
import { RequestQueryService } from './request-query.service.js';

type DetailMapper = {
  toDetail(
    request: Record<string, unknown>,
    availableActions: Record<string, boolean>,
  ): Record<string, unknown>;
};

describe('RequestQueryService detail mapping', () => {
  it('given a stored request without protected system fields in formData, when detail is returned, then computed request code and status values are included separately', () => {
    const snapshots = {
      normalizeFormSnapshot: vi.fn().mockReturnValue({ fields: [] }),
    };
    const service = new RequestQueryService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      snapshots as never,
      {} as never,
    );
    const request = {
      _id: { toString: () => 'request-id' },
      requestNo: 'LEAVE-000001',
      title: 'Đơn xin nghỉ phép',
      status: 'IN_PROGRESS',
      formDefinitionId: { toString: () => 'form-id' },
      formVersion: 1,
      workflowDefinitionId: { toString: () => 'workflow-id' },
      workflowVersion: 1,
      requesterUserId: { toString: () => 'user-id' },
      requesterSnapshot: {},
      formData: { reason: 'Nghỉ phép năm' },
      formSnapshot: { fields: [] },
      workflowSnapshot: {
        steps: [{ stepKey: 'manager-approval', name: 'Quản lý phê duyệt' }],
      },
      currentStepKey: 'manager-approval',
      revisionRound: 0,
      historySequence: 0,
      createdAt: new Date('2026-11-07T00:00:00.000Z'),
      updatedAt: new Date('2026-11-07T00:00:00.000Z'),
    };

    const result = (service as unknown as DetailMapper).toDetail(request, {});

    expect(result.formData).toEqual({ reason: 'Nghỉ phép năm' });
    expect(result.systemAutoFillValues).toEqual({
      REQUEST_CODE: 'LEAVE-000001',
      REQUEST_STATUS: 'Đang xử lý · Quản lý phê duyệt',
    });
  });

  it('given a DRAFT request containing annual leave autoFill, when findOne loads it after another request is submitted or rejected, then availableAnnualLeaveDays is refreshed dynamically', async () => {
    const requestDoc = {
      _id: { toString: () => 'draft-2' },
      requestNo: 'LEAVE-000002',
      title: 'Đơn xin nghỉ phép 2',
      status: 'DRAFT',
      formDefinitionId: { toString: () => 'form-id' },
      formVersion: 1,
      workflowDefinitionId: { toString: () => 'workflow-id' },
      workflowVersion: 1,
      requesterUserId: { toString: () => 'user-id' },
      requesterSnapshot: {},
      formData: { annual_leave_days: 2, so_ngay_nghi: 1 },
      formSnapshot: {
        fields: [
          {
            key: 'annual_leave_days',
            label: 'Số ngày phép còn lại',
            type: 'NUMBER',
            required: false,
            order: 10,
            autoFill: { source: 'REQUESTER_ANNUAL_LEAVE_DAYS', readOnly: true },
          },
          {
            key: 'so_ngay_nghi',
            label: 'Số ngày nghỉ',
            type: 'NUMBER',
            required: true,
            order: 20,
          },
        ],
      },
      revisionRound: 0,
      historySequence: 0,
      createdAt: new Date('2026-11-13T00:00:00.000Z'),
      updatedAt: new Date('2026-11-13T00:00:00.000Z'),
    };
    const requestsModel = {
      findById: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(requestDoc),
        }),
      }),
    };
    const formsModel = {
      findById: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue(null),
          }),
        }),
      }),
    };
    const accessPolicy = {
      notFound: vi.fn(),
      requireReadAccess: vi.fn().mockResolvedValue(undefined),
      currentApprovalTaskId: vi.fn().mockResolvedValue(undefined),
      availableActions: vi.fn().mockReturnValue({ canEdit: true }),
    };
    const snapshots = {
      normalizeFormSnapshot: vi.fn((snap) => snap),
    };
    const actorContext = {
      resolve: vi.fn().mockResolvedValue({
        autoFillProfile: { availableAnnualLeaveDays: 5 },
      }),
    };

    const service = new RequestQueryService(
      requestsModel as never,
      formsModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      accessPolicy as never,
      snapshots as never,
      {} as never,
      actorContext as never,
    );

    const detail = await service.findOne('user-id', 'draft-2', []);

    expect(actorContext.resolve).toHaveBeenCalledWith('user-id', undefined, {
      excludeRequestId: requestDoc._id,
    });
    expect(detail.formData).toEqual({ annual_leave_days: 5, so_ngay_nghi: 1 });
  });
});
