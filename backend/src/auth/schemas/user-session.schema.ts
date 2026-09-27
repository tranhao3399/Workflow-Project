import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type UserSessionDocument = HydratedDocument<UserSession>;

@Schema({ collection: 'user_sessions', timestamps: false })
export class UserSession {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true, trim: true })
  refreshTokenHash: string;

  // Retained only to detect a refresh token reused immediately after rotation.
  @Prop({ required: false, unique: true, sparse: true, trim: true })
  previousRefreshTokenHash?: string;

  @Prop({ required: false, maxlength: 1000 })
  userAgent?: string;

  @Prop({ required: false, maxlength: 100 })
  ipAddress?: string;

  @Prop({ required: true, default: Date.now })
  createdAt: Date;

  @Prop({ required: true, default: Date.now })
  lastSeenAt: Date;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Date, required: false, default: null })
  revokedAt?: Date | null;

  @Prop({ required: false, trim: true, maxlength: 80 })
  revokedReason?: string;
}

export const UserSessionSchema = SchemaFactory.createForClass(UserSession);

UserSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });
UserSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
