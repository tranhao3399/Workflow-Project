import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Model } from 'mongoose';
import type { QueryFilter } from 'mongoose';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import type { SafeUser } from '../users/users.service.js';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto.js';
import { AuditOutcome } from './enums/audit-outcome.enum.js';
import {
  AuditActor,
  AuditChangeSet,
  AuditLog,
  AuditResource,
} from './schemas/audit-log.schema.js';

const CHANGE_ALLOWLIST = new Set([
  'fullName',
  'email',
  'role',
  'department',
  'isActive',
  'status',
  'title',
  'formId',
  'workflowId',
  'assigneeId',
  'approverId',
  'submittedAt',
  'approvedAt',
  'rejectedAt',
  'amount',
  'moduleKey',
  'name',
  'group',
  'sortOrder',
  'isEnabled',
  'visibleToRoles',
  'employeeCode',
  'workEmail',
  'position',
  'positions',
  'phone',
  'hiredAt',
  'managerId',
  'userId',
  'employeeId',
  'roles',
  'roleIds',
  'lastLoginAt',
  'code',
  'parentId',
  'managerEmployeeId',
  'departmentId',
  'positionId',
  'permissions',
  'permissionKeys',
  'isSystem',
  'employmentType',
  'avatarUpdated',
  'avatarRemoved',
]);

const BLOCKED_KEY_PATTERN = /password|secret|token|jwt|authorization|cookie|binary|filedata/i;
const MAX_VALUE_DEPTH = 5;

export interface AuditLogEvent {
  action: string;
  resource: AuditResource;
  outcome: AuditOutcome;
  changes?: AuditChangeSet;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(@InjectModel(AuditLog.name) private readonly auditLogModel: Model<AuditLog>) {}

  async record(request: RequestWithContext, event: AuditLogEvent): Promise<void> {
    await this.write(request, request.user, event);
  }

  // Used by authentication flows before Passport has attached a JWT user to the request.
  async recordForResolvedActor(
    request: RequestWithContext,
    actor: SafeUser | undefined,
    event: AuditLogEvent,
  ): Promise<void> {
    await this.write(request, actor, event);
  }

  async findAll(query: ListAuditLogsDto) {
    const filter: QueryFilter<AuditLog> = {};

    if (query.actorId) filter['actor.userId'] = query.actorId;
    if (query.action) filter.action = query.action.toUpperCase();
    if (query.resourceType) filter['resource.type'] = query.resourceType.toUpperCase();
    if (query.resourceId) filter['resource.id'] = query.resourceId;
    if (query.startDate || query.endDate) {
      filter.occurredAt = {};
      if (query.startDate) filter.occurredAt.$gte = new Date(query.startDate);
      if (query.endDate) filter.occurredAt.$lte = new Date(query.endDate);
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .sort({ occurredAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean()
        .exec(),
      this.auditLogModel.countDocuments(filter).exec(),
    ]);

    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  private async write(
    request: RequestWithContext,
    actor: SafeUser | undefined,
    event: AuditLogEvent,
  ): Promise<void> {
    try {
      await this.auditLogModel.create({
        occurredAt: new Date(),
        requestId: request.requestId ?? randomUUID(),
        actor: this.resolveActor(actor),
        action: event.action.trim().toUpperCase(),
        resource: this.sanitizeResource(event.resource),
        outcome: event.outcome,
        changes: this.sanitizeChanges(event.changes),
        metadata: this.sanitizeMetadata(event.metadata),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown audit persistence error';
      this.logger.error(`Unable to persist audit log for ${event.action}: ${errorMessage}`);
    }
  }

  private resolveActor(actor?: SafeUser): AuditActor {
    return actor
      ? { userId: actor.id, fullName: actor.fullName, rolesAtTime: actor.roles?.length ? actor.roles : [actor.role] }
      : { rolesAtTime: [] };
  }

  private sanitizeResource(resource: AuditResource): AuditResource {
    return {
      type: resource.type.trim().toUpperCase(),
      id: resource.id.trim(),
      ...(resource.code ? { code: resource.code.trim() } : {}),
    };
  }

  private sanitizeChanges(changes?: AuditChangeSet): AuditChangeSet | undefined {
    if (!changes) return undefined;

    const before = this.sanitizeChangeSnapshot(changes.before);
    const after = this.sanitizeChangeSnapshot(changes.after);
    if (!before && !after) return undefined;

    return { ...(before ? { before } : {}), ...(after ? { after } : {}) };
  }

  private sanitizeChangeSnapshot(snapshot?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!snapshot) return undefined;

    const sanitized = Object.entries(snapshot).reduce<Record<string, unknown>>((result, [key, value]) => {
      if (!CHANGE_ALLOWLIST.has(key) || BLOCKED_KEY_PATTERN.test(key)) return result;
      const safeValue = this.sanitizeValue(value);
      if (safeValue !== undefined) result[key] = safeValue;
      return result;
    }, {});

    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }

  private sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!metadata) return undefined;
    const sanitized = this.sanitizeObject(metadata, 0);
    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }

  private sanitizeValue(value: unknown, depth = 0): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (value instanceof Date) return value.toISOString();
    if (depth >= MAX_VALUE_DEPTH || this.isBinary(value)) return undefined;
    if (Array.isArray(value)) {
      return value
        .map((item) => this.sanitizeValue(item, depth + 1))
        .filter((item) => item !== undefined);
    }
    if (typeof value === 'object') return this.sanitizeObject(value as Record<string, unknown>, depth + 1);
    return undefined;
  }

  private sanitizeObject(value: Record<string, unknown>, depth: number): Record<string, unknown> {
    return Object.entries(value).reduce<Record<string, unknown>>((result, [key, entryValue]) => {
      if (BLOCKED_KEY_PATTERN.test(key)) return result;
      const safeValue = this.sanitizeValue(entryValue, depth);
      if (safeValue !== undefined) result[key] = safeValue;
      return result;
    }, {});
  }

  private isBinary(value: unknown): boolean {
    return Buffer.isBuffer(value)
      || value instanceof ArrayBuffer
      || ArrayBuffer.isView(value);
  }
}
