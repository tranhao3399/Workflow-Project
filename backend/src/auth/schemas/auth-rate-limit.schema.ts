import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuthRateLimitDocument = HydratedDocument<AuthRateLimit>;

export const authRateLimitActions = [
  'LOGIN_IP',
  'LOGIN_FAILURE',
  'PASSWORD_RESET_REQUEST',
  'PASSWORD_RESET_COOLDOWN',
] as const;
export type AuthRateLimitAction = (typeof authRateLimitActions)[number];

@Schema({ collection: 'auth_rate_limits', timestamps: false })
export class AuthRateLimit {
  @Prop({ required: true, type: String, enum: authRateLimitActions })
  action: AuthRateLimitAction;

  @Prop({ required: true, trim: true, maxlength: 64 })
  subjectHash: string;

  @Prop({ required: true, default: 0 })
  count: number;

  @Prop({ required: true })
  windowStartedAt: Date;

  @Prop({ required: false })
  blockedUntil?: Date;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ required: true, default: Date.now })
  updatedAt: Date;
}

export const AuthRateLimitSchema = SchemaFactory.createForClass(AuthRateLimit);

AuthRateLimitSchema.index({ action: 1, subjectHash: 1 }, { unique: true });
AuthRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
