import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: false, trim: true, maxlength: 100 })
  displayName?: string;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({
    type: [MongooseSchema.Types.ObjectId],
    ref: 'Role',
    required: true,
    validate: {
      validator: (roleIds: Types.ObjectId[]) => Array.isArray(roleIds) && roleIds.length > 0,
      message: 'User must have at least one role',
    },
  })
  roleIds: Types.ObjectId[];

  @Prop({ required: true, default: true, index: true })
  isActive: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Employee', required: false })
  employeeId?: Types.ObjectId;

  @Prop({ required: false })
  lastLoginAt?: Date;

  @Prop({ required: true, default: 0, min: 0 })
  failedLoginCount: number;

  @Prop({ required: false })
  firstFailedLoginAt?: Date;

  @Prop({ required: false })
  lastFailedLoginAt?: Date;

  @Prop({ required: false })
  loginLockedUntil?: Date;

  @Prop({ required: true, default: Date.now })
  passwordChangedAt: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false })
  createdBy?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false })
  updatedBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ employeeId: 1 }, { unique: true, partialFilterExpression: { employeeId: { $type: 'objectId' } } });
UserSchema.index({ roleIds: 1, isActive: 1 });
