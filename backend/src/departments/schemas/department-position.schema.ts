import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type DepartmentPositionDocument = HydratedDocument<DepartmentPosition>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'department_positions' })
export class DepartmentPosition {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Department', required: true, index: true })
  departmentId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Position', required: true, index: true })
  positionId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false })
  createdBy?: Types.ObjectId;

  createdAt: Date;
}

export const DepartmentPositionSchema = SchemaFactory.createForClass(DepartmentPosition);
DepartmentPositionSchema.index({ departmentId: 1, positionId: 1 }, { unique: true });
DepartmentPositionSchema.index({ positionId: 1, departmentId: 1 });
