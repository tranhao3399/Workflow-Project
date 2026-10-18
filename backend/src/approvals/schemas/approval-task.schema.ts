import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { approvalModes, type ApprovalMode } from '../../workflow-definitions/schemas/workflow-definition.schema.js';

export const approvalTaskStatuses = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'REVISION_REQUESTED',
  'CANCELLED',
  'SKIPPED',
  'EXPIRED',
] as const;
export type ApprovalTaskStatus = (typeof approvalTaskStatuses)[number];

export type ApprovalTaskDocument = HydratedDocument<ApprovalTask>;

@Schema({ _id: false })
export class ApprovalAssigneeSnapshot {
  @Prop({ required: true, trim: true, maxlength: 160 }) fullName: string;
  @Prop({ required: false, trim: true, maxlength: 40 }) employeeCode?: string;
  @Prop({ required: false, trim: true, maxlength: 160 }) departmentName?: string;
  @Prop({ required: false, trim: true, maxlength: 160 }) positionName?: string;
}
export const ApprovalAssigneeSnapshotSchema = SchemaFactory.createForClass(ApprovalAssigneeSnapshot);

@Schema({ timestamps: true, collection: 'approval_tasks' })
export class ApprovalTask {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Request', required: true }) requestId: Types.ObjectId;
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 80 }) stepKey: string;
  @Prop({ required: true, trim: true, maxlength: 160 }) stepNameSnapshot: string;
  @Prop({ required: true, min: 1 }) stepRunNo: number;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true }) assigneeUserId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Employee', required: false }) assigneeEmployeeId?: Types.ObjectId;
  @Prop({ type: ApprovalAssigneeSnapshotSchema, required: true }) assigneeSnapshot: ApprovalAssigneeSnapshot;
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) assigneeRuleSnapshot: Record<string, unknown>;
  @Prop({ required: true, type: String, enum: approvalModes }) approvalMode: ApprovalMode;
  @Prop({ required: true, min: 1 }) requiredApprovals: number;
  @Prop({ required: true, min: 0 }) revisionRound: number;
  @Prop({ required: true, type: String, enum: approvalTaskStatuses, default: 'PENDING' }) status: ApprovalTaskStatus;
  @Prop({ required: true, default: Date.now }) assignedAt: Date;
  @Prop({ required: false }) dueAt?: Date;
  @Prop({ required: false }) actedAt?: Date;
  @Prop({ required: false, trim: true, maxlength: 2000 }) decisionComment?: string;
  @Prop({ required: false, trim: true, maxlength: 1000 }) cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const ApprovalTaskSchema = SchemaFactory.createForClass(ApprovalTask);
ApprovalTaskSchema.pre('validate', function validateTaskState() {
  if (['APPROVED', 'REJECTED', 'REVISION_REQUESTED'].includes(this.status) && !this.actedAt) {
    this.invalidate('actedAt', 'actedAt is required for a completed approval action');
  }
  if (this.status === 'CANCELLED' && !this.cancelReason) {
    this.invalidate('cancelReason', 'cancelReason is required for a cancelled task');
  }
});
ApprovalTaskSchema.index({ requestId: 1, stepKey: 1, stepRunNo: 1, assigneeUserId: 1 }, { unique: true });
ApprovalTaskSchema.index({ assigneeUserId: 1, status: 1, assignedAt: -1 });
ApprovalTaskSchema.index({ requestId: 1, stepRunNo: 1, status: 1 });
ApprovalTaskSchema.index({ status: 1, dueAt: 1 });
