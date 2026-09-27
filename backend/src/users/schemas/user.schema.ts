import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { UserRole } from '../enums/user-role.enum.js';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ required: true, type: String, enum: Object.values(UserRole), default: UserRole.EMPLOYEE })
  role: UserRole;

  // `role` remains during the transition so existing JWTs and legacy users keep working.
  @Prop({ type: [String], enum: Object.values(UserRole), default: [] })
  roles: UserRole[];

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'Role', default: [] })
  roleIds: Types.ObjectId[];

  @Prop({ required: true, trim: true })
  department: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Employee', required: false, unique: true, sparse: true })
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

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
