import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { UserRole } from '../../users/enums/user-role.enum.js';
import { AuditOutcome } from '../enums/audit-outcome.enum.js';

@Schema({ _id: false })
export class AuditActor {
  @Prop({ required: false })
  userId?: string;

  @Prop({ required: false, trim: true, maxlength: 100 })
  fullName?: string;

  @Prop({ type: [String], enum: Object.values(UserRole), default: [] })
  rolesAtTime: UserRole[];
}

export const AuditActorSchema = SchemaFactory.createForClass(AuditActor);

@Schema({ _id: false })
export class AuditResource {
  @Prop({ required: true, trim: true, uppercase: true })
  type: string;

  @Prop({ required: true, trim: true })
  id: string;

  @Prop({ required: false, trim: true })
  code?: string;
}

export const AuditResourceSchema = SchemaFactory.createForClass(AuditResource);

export interface AuditChangeSet {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ collection: 'audit_logs', timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ required: true, default: Date.now, index: true })
  occurredAt: Date;

  @Prop({ required: true, index: true, trim: true })
  requestId: string;

  @Prop({ required: true, type: AuditActorSchema })
  actor: AuditActor;

  @Prop({ required: true, trim: true, uppercase: true, index: true })
  action: string;

  @Prop({ required: true, type: AuditResourceSchema })
  resource: AuditResource;

  @Prop({ required: true, type: String, enum: Object.values(AuditOutcome), index: true })
  outcome: AuditOutcome;

  @Prop({ type: MongooseSchema.Types.Mixed, required: false })
  changes?: AuditChangeSet;

  @Prop({ type: MongooseSchema.Types.Mixed, required: false })
  metadata?: Record<string, unknown>;

  createdAt: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ 'actor.userId': 1, occurredAt: -1 });
AuditLogSchema.index({ 'resource.id': 1, occurredAt: -1 });
AuditLogSchema.index({ action: 1, occurredAt: -1 });
