import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
export type PositionDocument = HydratedDocument<Position>;
@Schema({ timestamps: true, collection: 'positions' })
export class Position {
  @Prop({ required: true, unique: true, trim: true, uppercase: true, maxlength: 40, index: true }) code: string;
  @Prop({ required: true, trim: true, maxlength: 120, index: true }) name: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Department', required: false, index: true }) departmentId?: Types.ObjectId;
  @Prop({ required: true, default: true, index: true }) isActive: boolean;
  @Prop({ required: true, default: 0, min: 0, max: 10000, index: true }) sortOrder: number;
}
export const PositionSchema = SchemaFactory.createForClass(Position);
PositionSchema.index({ isActive: 1, departmentId: 1, sortOrder: 1, name: 1 });
