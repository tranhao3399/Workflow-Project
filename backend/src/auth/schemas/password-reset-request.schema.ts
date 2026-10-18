import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type PasswordResetRequestDocument = HydratedDocument<PasswordResetRequest>;

export const passwordResetStatuses = ['PENDING', 'VERIFIED', 'USED', 'INVALIDATED'] as const;
export type PasswordResetStatus = (typeof passwordResetStatuses)[number];

@Schema({ collection: 'password_reset_requests', timestamps: true })
export class PasswordResetRequest {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true, lowercase: true, index: true })
  emailSnapshot: string;

  @Prop({ required: true, select: false })
  otpHash: string;

  @Prop({ required: true, default: 0, min: 0 })
  attemptCount: number;

  @Prop({ required: true, min: 1 })
  maxAttempts: number;

  @Prop({ required: true })
  lastSentAt: Date;

  @Prop({ required: true, type: String, enum: passwordResetStatuses, index: true })
  status: PasswordResetStatus;

  @Prop({ type: Date, required: false })
  verifiedAt?: Date;

  @Prop({ required: false, select: false, unique: true, sparse: true })
  resetTokenHash?: string;

  @Prop({ type: Date, required: false })
  resetTokenExpiresAt?: Date;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Date, required: false })
  usedAt?: Date;

  @Prop({ type: Date, required: false })
  invalidatedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const PasswordResetRequestSchema = SchemaFactory.createForClass(PasswordResetRequest);
PasswordResetRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
PasswordResetRequestSchema.index({ emailSnapshot: 1, status: 1 });
