import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';
import { Types } from 'mongoose';
import { ApprovalTask } from '../approvals/schemas/approval-task.schema.js';
import {
  Request,
  type RequestDocument,
  type RequestStatus,
} from './schemas/request.schema.js';
import type {
  AvailableActions,
  RequestDefinitionVersion,
  StoredRequest,
} from './request.types.js';
import { OrganizationScopeService } from '../common/organization/organization-scope.service.js';

const VOIDABLE_STATUSES = new Set<RequestStatus>([
  'IN_PROGRESS',
  'REVISION_REQUESTED',
  'APPROVED',
  'REJECTED',
]);

@Injectable()
export class RequestAccessPolicy {
  constructor(
    @InjectModel(Request.name) private readonly requests: Model<Request>,
    @InjectModel(ApprovalTask.name) private readonly tasks: Model<ApprovalTask>,
    private readonly organizationScope: OrganizationScopeService,
  ) {}

  async ownedRequest(
    id: string,
    userId: string,
    session: ClientSession,
  ): Promise<RequestDocument> {
    const request = await this.requests
      .findOne({ _id: id, requesterUserId: userId })
      .session(session)
      .exec();
    if (!request) throw this.notFound();
    return request;
  }

  async requireReadAccess(
    request: Pick<
      StoredRequest,
      '_id' | 'requesterUserId' | 'requesterSnapshot'
    >,
    userId: string,
    permissionKeys: readonly string[],
  ): Promise<void> {
    if (
      request.requesterUserId.toString() === userId ||
      permissionKeys.includes('REQUESTS.VIEW_ALL')
    )
      return;
    if (
      permissionKeys.includes('REQUESTS.VIEW_SCOPE') &&
      (await this.organizationScope.canAccessDepartment(
        userId,
        request.requesterSnapshot.workUnitId ??
          request.requesterSnapshot.departmentId,
      ))
    )
      return;
    const hasTask = await this.tasks.exists({
      requestId: request._id,
      assigneeUserId: userId,
    });
    if (!hasTask) throw this.notFound();
  }

  availableActions(
    request: StoredRequest,
    userId: string,
    permissionKeys: readonly string[],
    hasPendingTask: boolean,
    definitionVersion: RequestDefinitionVersion,
  ): AvailableActions {
    const permissions = new Set(permissionKeys);
    const owner = request.requesterUserId.toString() === userId;
    const editable =
      request.status === 'REVISION_REQUESTED' ||
      (request.status === 'DRAFT' && definitionVersion.status === 'CURRENT');
    const pendingTask =
      request.status === 'IN_PROGRESS' &&
      hasPendingTask &&
      permissions.has('APPROVALS.APPROVE_ASSIGNED');
    return {
      canEdit:
        owner && editable && permissions.has('REQUESTS.UPDATE_OWN_DRAFT'),
      canSubmit:
        owner &&
        request.status === 'DRAFT' &&
        definitionVersion.status === 'CURRENT' &&
        permissions.has('REQUESTS.SUBMIT'),
      canResubmit:
        owner &&
        request.status === 'REVISION_REQUESTED' &&
        permissions.has('REQUESTS.SUBMIT'),
      canCancel:
        owner &&
        (request.status === 'IN_PROGRESS' ||
          request.status === 'REVISION_REQUESTED') &&
        this.isCancellationAllowed(request.formSnapshot) &&
        permissions.has('REQUESTS.CANCEL_OWN'),
      canApprove: pendingTask,
      canReject: pendingTask,
      canRequestRevision: pendingTask,
      canReassign:
        request.status === 'IN_PROGRESS' &&
        hasPendingTask &&
        this.isReassignAllowed(request) &&
        (permissions.has('APPROVALS.APPROVE_ASSIGNED') ||
          permissions.has('APPROVALS.REASSIGN')),
      canVoid:
        this.isVoidable(request.status) && permissions.has('REQUESTS.VOID'),
      canDelete:
        owner &&
        request.status === 'DRAFT' &&
        !request.submittedAt &&
        permissions.has('REQUESTS.DELETE_OWN_DRAFT'),
      canRecreate:
        owner &&
        request.status === 'DRAFT' &&
        definitionVersion.status === 'OUTDATED' &&
        Boolean(
          definitionVersion.currentForm && definitionVersion.currentWorkflow,
        ) &&
        permissions.has('REQUESTS.CREATE'),
    };
  }

  async currentApprovalTaskId(
    request: StoredRequest,
    userId: string,
    permissionKeys: readonly string[],
  ): Promise<string | undefined> {
    if (
      request.status !== 'IN_PROGRESS' ||
      !permissionKeys.includes('APPROVALS.APPROVE_ASSIGNED')
    ) {
      return undefined;
    }
    const task = await this.tasks
      .findOne({
        requestId: request._id,
        assigneeUserId: new Types.ObjectId(userId),
        stepKey: request.currentStepKey,
        stepRunNo: request.currentStepRunNo,
        status: 'PENDING',
      })
      .select({ _id: 1 })
      .lean()
      .exec();
    return task?._id.toString();
  }

  isCancellationAllowed(
    snapshot: Record<string, unknown> | undefined,
  ): boolean {
    if (
      !snapshot ||
      typeof snapshot.settings !== 'object' ||
      snapshot.settings === null
    )
      return false;
    return (
      'allowCancelAfterSubmit' in snapshot.settings &&
      snapshot.settings.allowCancelAfterSubmit === true
    );
  }

  isVoidable(status: RequestStatus): boolean {
    return VOIDABLE_STATUSES.has(status);
  }

  isReassignAllowed(
    request: Pick<StoredRequest, 'workflowSnapshot' | 'currentStepKey'>,
  ): boolean {
    const snapshot = request.workflowSnapshot;
    if (
      !snapshot ||
      typeof snapshot !== 'object' ||
      !('steps' in snapshot) ||
      !Array.isArray(snapshot.steps) ||
      !request.currentStepKey
    ) {
      return true;
    }
    const step = snapshot.steps.find(
      (candidate) =>
        typeof candidate === 'object' &&
        candidate !== null &&
        'stepKey' in candidate &&
        candidate.stepKey === request.currentStepKey,
    );
    if (!step || typeof step !== 'object') return true;
    return !('allowReassign' in step) || step.allowReassign !== false;
  }

  notFound(): NotFoundException {
    return new NotFoundException('Không tìm thấy phiếu yêu cầu.');
  }
}
