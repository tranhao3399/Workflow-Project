import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type DepartmentPositionDocument = HydratedDocument<DepartmentPosition>;

@Schema({ timestamps: true, collection: 'department_positions' })
export class DepartmentPosition {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Department', required: true, index: true })
  departmentId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Position', required: true, index: true })
  jobTitleId: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const DepartmentPositionSchema = SchemaFactory.createForClass(DepartmentPosition);
DepartmentPositionSchema.index({ departmentId: 1, jobTitleId: 1 }, { unique: true });
