import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export const approvalHistoryActions = [
  'CREATED',
  'SUBMITTED',
  'ASSIGNED',
  'CONDITION_EVALUATED',
  'APPROVED',
  'REJECTED',
  'REVISION_REQUESTED',
  'REASSIGNED',
  'RESUBMITTED',
  'CANCELLED',
  'VOIDED',
  'AUTO_SKIPPED',
  'COMPLETED',
] as const;
export type ApprovalHistoryAction = (typeof approvalHistoryActions)[number];

@Schema({ _id: false })
export class ApprovalActorSnapshot {
  @Prop({ required: false, trim: true, maxlength: 160 }) fullName?: string;
  @Prop({ required: false, trim: true, maxlength: 40 }) employeeCode?: string;
  @Prop({ required: false, trim: true, maxlength: 160 }) departmentName?: string;
  @Prop({ required: false, trim: true, maxlength: 160 }) positionName?: string;
}
export const ApprovalActorSnapshotSchema = SchemaFactory.createForClass(ApprovalActorSnapshot);

export type ApprovalHistoryDocument = HydratedDocument<ApprovalHistory>;

@Schema({ collection: 'approval_histories', timestamps: { createdAt: true, updatedAt: false } })
export class ApprovalHistory {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Request', required: true }) requestId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ApprovalTask', required: false }) taskId?: Types.ObjectId;
  @Prop({ required: false, trim: true, uppercase: true, maxlength: 80 }) stepKey?: string;
  @Prop({ required: false, min: 1 }) stepRunNo?: number;
  @Prop({ required: false, min: 0 }) revisionRound?: number;
  @Prop({ required: true, min: 1 }) sequenceNo: number;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false }) actorUserId?: Types.ObjectId;
  @Prop({ type: ApprovalActorSnapshotSchema, required: false }) actorSnapshot?: ApprovalActorSnapshot;
  @Prop({ required: true, type: String, enum: approvalHistoryActions }) action: ApprovalHistoryAction;
  @Prop({ required: false, trim: true, maxlength: 80 }) fromStatus?: string;
  @Prop({ required: false, trim: true, maxlength: 80 }) toStatus?: string;
  @Prop({ required: false, trim: true, maxlength: 2000 }) comment?: string;
  @Prop({ type: MongooseSchema.Types.Mixed, required: false }) metadata?: Record<string, unknown>;
  @Prop({ required: true, default: Date.now }) occurredAt: Date;
  createdAt: Date;
}

export const ApprovalHistorySchema = SchemaFactory.createForClass(ApprovalHistory);
ApprovalHistorySchema.index({ requestId: 1, sequenceNo: 1 }, { unique: true });
ApprovalHistorySchema.index({ requestId: 1, occurredAt: 1, _id: 1 });
ApprovalHistorySchema.index({ actorUserId: 1, occurredAt: -1 });
ApprovalHistorySchema.index({ taskId: 1 });
