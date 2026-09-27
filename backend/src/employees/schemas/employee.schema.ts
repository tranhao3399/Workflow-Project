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

  @Prop({ required: true, unique: true, index: true, trim: true, lowercase: true, maxlength: 255 })
  workEmail: string;

  @Prop({ required: true, trim: true, maxlength: 100, index: true })
  department: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Department', required: false, index: true })
  departmentId?: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 120 })
  position: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Position', required: false, index: true })
  positionId?: Types.ObjectId;

  @Prop({ required: false, trim: true, maxlength: 30 })
  phone?: string;

  @Prop({ required: false })
  hiredAt?: Date;

  @Prop({ required: false })
  dateOfBirth?: Date;

  @Prop({ required: true, type: String, enum: Object.values(EmploymentType), default: EmploymentType.FULL_TIME })
  employmentType: EmploymentType;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Employee', required: false, index: true })
  managerId?: Types.ObjectId;

  @Prop({ required: true, default: true, index: true })
  isActive: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false, unique: true, sparse: true })
  userId?: Types.ObjectId;

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

  createdAt: Date;
  updatedAt: Date;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);
EmployeeSchema.index({ departmentId: 1, isActive: 1, createdAt: -1 });
