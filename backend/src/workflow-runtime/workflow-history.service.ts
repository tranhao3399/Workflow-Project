import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  ApprovalHistory,
  type ApprovalHistoryAction,
  type ApprovalActorSnapshot,
} from '../approvals/schemas/approval-history.schema.js';
import { Request, type RequestDocument } from '../requests/schemas/request.schema.js';

const SENSITIVE_METADATA_KEY = /(password|token|otp|authorization|cookie|secret|formData|fieldValue|conditionValue|storageKey|internalPath|absolutePath|binary|fileData)/i;
const MAX_METADATA_BYTES = 16 * 1024;

export interface WorkflowHistoryEvent {
  taskId?: Types.ObjectId;
  stepKey?: string;
  stepRunNo?: number;
  actorUserId?: Types.ObjectId;
  actorSnapshot?: ApprovalActorSnapshot;
  action: ApprovalHistoryAction;
  fromStatus?: string;
  toStatus?: string;
  comment?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

@Injectable()
export class WorkflowHistoryService {
  constructor(
    @InjectModel(Request.name) private readonly requests: Model<Request>,
    @InjectModel(ApprovalHistory.name) private readonly histories: Model<ApprovalHistory>,
  ) {}

  async record(
    request: RequestDocument,
    event: WorkflowHistoryEvent,
    session: ClientSession,
  ) {
    const sequence = await this.requests.findOneAndUpdate(
      { _id: request._id },
      { $inc: { historySequence: 1 } },
      { returnDocument: 'after', session, projection: { historySequence: 1 } },
    ).lean().exec();
    if (!sequence) throw new NotFoundException('Không tìm thấy phiếu để ghi lịch sử Workflow.');
    request.historySequence = sequence.historySequence;

    const metadata = event.metadata ? this.sanitizeMetadata(event.metadata) : undefined;
    const [history] = await this.histories.create([{
      requestId: request._id,
      taskId: event.taskId,
      stepKey: event.stepKey,
      stepRunNo: event.stepRunNo,
      revisionRound: request.revisionRound,
      sequenceNo: sequence.historySequence,
      actorUserId: event.actorUserId,
      actorSnapshot: event.actorSnapshot,
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      comment: event.comment,
      metadata,
      occurredAt: event.occurredAt ?? new Date(),
    }], { session });
    return history;
  }

  private sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const sanitized = this.sanitizeRecord(metadata, 0);
    if (Buffer.byteLength(JSON.stringify(sanitized), 'utf8') > MAX_METADATA_BYTES) {
      throw new BadRequestException({
        code: 'WORKFLOW_HISTORY_METADATA_TOO_LARGE',
        message: 'Metadata lịch sử Workflow vượt quá giới hạn cho phép.',
      });
    }
    return sanitized;
  }

  private sanitizeRecord(record: Record<string, unknown>, depth: number): Record<string, unknown> {
    if (depth > 4) return {};
    return Object.fromEntries(Object.entries(record).flatMap(([key, value]) => {
      if (SENSITIVE_METADATA_KEY.test(key)) return [];
      return [[key, this.sanitizeValue(value, depth + 1)]];
    }));
  }

  private sanitizeValue(value: unknown, depth: number): unknown {
    if (value instanceof Types.ObjectId) return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.slice(0, 100).map((item) => this.sanitizeValue(item, depth + 1));
    if (this.isRecord(value)) return this.sanitizeRecord(value, depth);
    if (typeof value === 'string') return value.slice(0, 2000);
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
    return undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
