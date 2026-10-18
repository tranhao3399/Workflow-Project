import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { EmploymentType } from '../enums/employment-type.enum.js';

export type EmployeeDocument = HydratedDocument<Employee>;

@Schema({ timestamps: true, collection: 'employees' })
export class Employee {
  @Prop({ required: true, unique: true, index: true, trim: true, uppercase: true, maxlength: 40 })
  employeeCode: string;

  @Prop({ required: true, trim: true, maxlength: 100 })
  fullName: string;

  @Prop({ required: true, trim: true, maxlength: 100, select: false })
  fullNameNormalized: string;

  @Prop({ required: true, unique: true, index: true, trim: true, lowercase: true, maxlength: 255 })
  workEmail: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Department', required: true, index: true })
  departmentId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Position', required: true, index: true })
  positionId: Types.ObjectId;

  @Prop({ required: false, trim: true, maxlength: 30 })
  phone?: string;

  @Prop({ required: false, trim: true, maxlength: 255 })
  address?: string;

  @Prop({ required: false })
  hiredAt?: Date;

  @Prop({ required: false })
  endedAt?: Date;

  @Prop({ required: false })
  dateOfBirth?: Date;

  @Prop({ required: true, type: String, enum: Object.values(EmploymentType), default: EmploymentType.FULL_TIME })
  employmentType: EmploymentType;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Employee', required: false, index: true })
  managerId?: Types.ObjectId;

  @Prop({ required: true, default: true, index: true })
  isActive: boolean;

  @Prop({ required: false, trim: true, maxlength: 80 })
  avatarKey?: string;

  @Prop({
    type: {
      contentType: { type: String, enum: ['image/jpeg', 'image/png'], required: true },
      size: { type: Number, required: true, min: 1, max: 2 * 1024 * 1024 },
      updatedAt: { type: Date, required: true },
    },
    required: false,
    _id: false,
  })
  avatar?: { contentType: 'image/jpeg' | 'image/png'; size: number; updatedAt: Date };

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false })
  createdBy?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false })
  updatedBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);
EmployeeSchema.index({ departmentId: 1, isActive: 1, createdAt: -1 });
EmployeeSchema.index({ managerId: 1, isActive: 1 });
EmployeeSchema.index({ fullNameNormalized: 1 });
