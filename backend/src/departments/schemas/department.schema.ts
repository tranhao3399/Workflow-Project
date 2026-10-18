import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type DepartmentDocument = HydratedDocument<Department>;

@Schema({ timestamps: true, collection: 'departments' })
export class Department {
  @Prop({ required: true, unique: true, trim: true, uppercase: true, maxlength: 40, index: true })
  code: string;

  @Prop({ required: true, trim: true, maxlength: 120 })
  name: string;

  @Prop({ required: true, unique: true, trim: true, lowercase: true, maxlength: 120, select: false })
  nameNormalized: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Department', required: false })
  parentId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Employee', required: false })
  managerEmployeeId?: Types.ObjectId;

  @Prop({ required: true, default: true, index: true })
  isActive: boolean;

  @Prop({ required: true, default: 0, min: 0, max: 10000, index: true })
  sortOrder: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false })
  createdBy?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false })
  updatedBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const DepartmentSchema = SchemaFactory.createForClass(Department);
DepartmentSchema.index({ isActive: 1, sortOrder: 1, name: 1 });
DepartmentSchema.index({ parentId: 1, isActive: 1 });
DepartmentSchema.index({ managerEmployeeId: 1 });
