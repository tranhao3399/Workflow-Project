import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export const requestStatuses = [
  'DRAFT',
  'IN_PROGRESS',
  'REVISION_REQUESTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'VOIDED',
] as const;
export type RequestStatus = (typeof requestStatuses)[number];

@Schema({ _id: false })
export class RequesterSnapshot {
  @Prop({ required: true, trim: true, maxlength: 40 }) employeeCode: string;
  @Prop({ required: true, trim: true, maxlength: 160 }) fullName: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Department', required: true }) departmentId: Types.ObjectId;
  @Prop({ required: true, trim: true, maxlength: 160 }) departmentName: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Position', required: true }) positionId: Types.ObjectId;
  @Prop({ required: true, trim: true, maxlength: 160 }) positionName: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Employee', required: false }) managerEmployeeId?: Types.ObjectId;
}
export const RequesterSnapshotSchema = SchemaFactory.createForClass(RequesterSnapshot);

export type RequestDocument = HydratedDocument<Request>;

@Schema({ timestamps: true, collection: 'requests', optimisticConcurrency: true })
export class Request {
  @Prop({ required: true, unique: true, trim: true, uppercase: true, maxlength: 80 }) requestNo: string;
  @Prop({ required: true, trim: true, maxlength: 300 }) title: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'FormDefinition', required: true }) formDefinitionId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WorkflowDefinition', required: true }) workflowDefinitionId: Types.ObjectId;
  @Prop({ required: true, min: 1 }) formVersion: number;
  @Prop({ required: true, min: 1 }) workflowVersion: number;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true }) requesterUserId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Employee', required: true }) requesterEmployeeId: Types.ObjectId;
  @Prop({ type: RequesterSnapshotSchema, required: true }) requesterSnapshot: RequesterSnapshot;
  @Prop({ type: MongooseSchema.Types.Mixed, required: true, default: () => ({}) }) formData: Record<string, unknown>;
  @Prop({ type: MongooseSchema.Types.Mixed, required: false }) formSnapshot?: Record<string, unknown>;
  @Prop({ type: MongooseSchema.Types.Mixed, required: false }) workflowSnapshot?: Record<string, unknown>;
  @Prop({ required: true, type: String, enum: requestStatuses, default: 'DRAFT' }) status: RequestStatus;
  @Prop({ required: false, trim: true, uppercase: true, maxlength: 80 }) currentStepKey?: string;
  @Prop({ required: false, min: 1 }) currentStepRunNo?: number;
  @Prop({ required: true, default: 0, min: 0 }) revisionRound: number;
  @Prop({ required: true, default: 0, min: 0 }) historySequence: number;
  @Prop({ required: false }) submittedAt?: Date;
  @Prop({ required: false }) completedAt?: Date;
  @Prop({ required: false }) cancelledAt?: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false }) cancelledBy?: Types.ObjectId;
  @Prop({ required: false, trim: true, maxlength: 1000 }) cancelReason?: string;
  @Prop({ required: false }) voidedAt?: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false }) voidedBy?: Types.ObjectId;
  @Prop({ required: false, trim: true, maxlength: 1000 }) voidReason?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false }) updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const RequestSchema = SchemaFactory.createForClass(Request);
RequestSchema.pre('validate', function validateRequestState() {
  if (this.status !== 'DRAFT') {
    if (!this.formSnapshot) this.invalidate('formSnapshot', 'formSnapshot is required after submission');
    if (!this.workflowSnapshot) this.invalidate('workflowSnapshot', 'workflowSnapshot is required after submission');
    if (!this.submittedAt) this.invalidate('submittedAt', 'submittedAt is required after submission');
  }
  if ((this.status === 'APPROVED' || this.status === 'REJECTED') && !this.completedAt) {
    this.invalidate('completedAt', 'completedAt is required for a completed request');
  }
  if (this.status === 'CANCELLED') {
    if (!this.cancelledAt) this.invalidate('cancelledAt', 'cancelledAt is required for a cancelled request');
    if (!this.cancelledBy) this.invalidate('cancelledBy', 'cancelledBy is required for a cancelled request');
    if (!this.cancelReason) this.invalidate('cancelReason', 'cancelReason is required for a cancelled request');
  }
  if (this.status === 'VOIDED') {
    if (!this.voidedAt) this.invalidate('voidedAt', 'voidedAt is required for a voided request');
    if (!this.voidedBy) this.invalidate('voidedBy', 'voidedBy is required for a voided request');
    if (!this.voidReason) this.invalidate('voidReason', 'voidReason is required for a voided request');
  }
});
RequestSchema.index({ requesterUserId: 1, status: 1, createdAt: -1 });
RequestSchema.index({ requesterEmployeeId: 1, createdAt: -1 });
RequestSchema.index({ status: 1, currentStepKey: 1, updatedAt: -1 });
RequestSchema.index({ formDefinitionId: 1, status: 1 });
RequestSchema.index({ workflowDefinitionId: 1, status: 1 });
