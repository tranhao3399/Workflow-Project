import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuthRateLimitDocument = HydratedDocument<AuthRateLimit>;

@Schema({ collection: 'auth_rate_limits', timestamps: false })
export class AuthRateLimit {
  @Prop({ required: true, unique: true, trim: true })
  key: string;

  @Prop({ required: true, default: 0 })
  count: number;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ required: true, default: Date.now })
  updatedAt: Date;
}

export const AuthRateLimitSchema = SchemaFactory.createForClass(AuthRateLimit);

AuthRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
