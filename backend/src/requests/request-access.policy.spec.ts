import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { RequestAccessPolicy } from './request-access.policy.js';

const request = {
  _id: new Types.ObjectId(),
  requesterUserId: new Types.ObjectId(),
  requesterSnapshot: { departmentId: new Types.ObjectId() },
  status: 'IN_PROGRESS' as const,
  formSnapshot: {},
};

function createPolicy(canAccessDepartment: boolean, hasAssignedTask = false) {
  const tasks = {
    exists: vi.fn().mockResolvedValue(hasAssignedTask),
    findOne: vi.fn(),
  };
  const scope = { canAccessDepartment: vi.fn().mockResolvedValue(canAccessDepartment) };
  return { policy: new RequestAccessPolicy({} as never, tasks as never, scope as never), tasks, scope };
}

describe('RequestAccessPolicy organization scope', () => {
  it('given an HCM manager with scope permission, when opening an HCM request, then read access is allowed', async () => {
    const { policy, tasks } = createPolicy(true);

    await expect(policy.requireReadAccess(request as never, new Types.ObjectId().toString(), ['REQUESTS.VIEW_SCOPE']))
      .resolves.toBeUndefined();
    expect(tasks.exists).not.toHaveBeenCalled();
  });

  it('given an HCM manager with scope permission, when opening a Hanoi request by URL, then the API hides the request', async () => {
    const { policy } = createPolicy(false, false);

    await expect(policy.requireReadAccess(request as never, new Types.ObjectId().toString(), ['REQUESTS.VIEW_SCOPE']))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('given a manager who may view the request but has no assigned task, when actions are calculated, then approval actions remain disabled', () => {
    const { policy } = createPolicy(true);

    const actions = policy.availableActions(
      request as never,
      new Types.ObjectId().toString(),
      ['REQUESTS.VIEW_SCOPE', 'APPROVALS.APPROVE_ASSIGNED'],
      false,
      { status: 'SNAPSHOT_LOCKED' },
    );

    expect(actions.canApprove).toBe(false);
    expect(actions.canReject).toBe(false);
    expect(actions.canRequestRevision).toBe(false);
  });

  it('given a manager with an assigned pending task and approval permission, when actions are calculated, then approval actions are enabled', () => {
    const { policy } = createPolicy(true);

    const actions = policy.availableActions(
      request as never,
      new Types.ObjectId().toString(),
      ['REQUESTS.VIEW_SCOPE', 'APPROVALS.APPROVE_ASSIGNED'],
      true,
      { status: 'SNAPSHOT_LOCKED' },
    );

    expect(actions.canApprove).toBe(true);
    expect(actions.canReject).toBe(true);
    expect(actions.canRequestRevision).toBe(true);
    expect(actions.canReassign).toBe(true);
  });

  it('given a step with allowReassign=false in workflowSnapshot, when actions are calculated, then canReassign is disabled', () => {
    const { policy } = createPolicy(true);

    const actions = policy.availableActions(
      {
        ...request,
        currentStepKey: 'STEP_1',
        workflowSnapshot: {
          steps: [{ stepKey: 'STEP_1', type: 'APPROVAL', allowReassign: false }],
        },
      } as never,
      new Types.ObjectId().toString(),
      ['APPROVALS.APPROVE_ASSIGNED'],
      true,
      { status: 'SNAPSHOT_LOCKED' },
    );

    expect(actions.canApprove).toBe(true);
    expect(actions.canReassign).toBe(false);
  });
});
