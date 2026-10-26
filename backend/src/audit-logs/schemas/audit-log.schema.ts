import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { AuditOutcome } from '../enums/audit-outcome.enum.js';

@Schema({ _id: false })
export class AuditActor {
  @Prop({ required: false })
  userId?: string;

  @Prop({ required: false, trim: true, maxlength: 100 })
  fullName?: string;

  @Prop({ required: false, trim: true, maxlength: 64 })
  employeeCode?: string;

  @Prop({ required: false, trim: true, lowercase: true, maxlength: 255 })
  email?: string;

  @Prop({ type: [String], default: [] })
  rolesAtTime: string[];
}

export const AuditActorSchema = SchemaFactory.createForClass(AuditActor);

@Schema({ _id: false })
export class AuditResource {
  @Prop({ required: true, trim: true, uppercase: true })
  type: string;

  @Prop({ required: false, trim: true })
  id?: string;

  @Prop({ required: false, trim: true })
  code?: string;

  @Prop({ required: false, trim: true, maxlength: 200 })
  name?: string;
}

export const AuditResourceSchema = SchemaFactory.createForClass(AuditResource);

@Schema({ _id: false })
export class AuditContext {
  @Prop({ required: false, trim: true, maxlength: 100 }) ipAddress?: string;
  @Prop({ required: false, trim: true, maxlength: 1000 }) userAgent?: string;
  @Prop({ required: false, trim: true, uppercase: true, maxlength: 12 }) method?: string;
  @Prop({ required: false, trim: true, maxlength: 500 }) path?: string;
}

export const AuditContextSchema = SchemaFactory.createForClass(AuditContext);

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

  @Prop({ required: true, trim: true, maxlength: 500 })
  description: string;

  @Prop({ required: true, type: AuditResourceSchema })
  resource: AuditResource;

  @Prop({ required: true, type: String, enum: Object.values(AuditOutcome), index: true })
  outcome: AuditOutcome;

  @Prop({ type: MongooseSchema.Types.Mixed, required: false })
  changes?: AuditChangeSet;

  @Prop({ type: MongooseSchema.Types.Mixed, required: false })
  metadata?: Record<string, unknown>;

  @Prop({ type: AuditContextSchema, required: false })
  context?: AuditContext;

  createdAt: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ 'actor.userId': 1, occurredAt: -1 });
AuditLogSchema.index({ 'resource.id': 1, occurredAt: -1 });
AuditLogSchema.index({ action: 1, occurredAt: -1 });
AuditLogSchema.index(
  { 'resource.type': 1, 'resource.id': 1, occurredAt: -1 },
  { name: 'idx_audit_resource_time' },
);
AuditLogSchema.index(
  { outcome: 1, occurredAt: -1 },
  { name: 'idx_audit_outcome_time' },
);
