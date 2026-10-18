import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
export type PositionDocument = HydratedDocument<Position>;
@Schema({ timestamps: true, collection: 'positions' })
export class Position {
  @Prop({ required: true, unique: true, trim: true, uppercase: true, maxlength: 40, index: true }) code: string;
  @Prop({ required: true, trim: true, maxlength: 120 }) name: string;
  @Prop({ required: true, unique: true, trim: true, maxlength: 120, select: false }) nameNormalized: string;
  @Prop({ required: true, default: true, index: true }) isActive: boolean;
  @Prop({ required: true, default: 0, min: 0, max: 10000, index: true }) sortOrder: number;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false }) createdBy?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false }) updatedBy?: Types.ObjectId;
}
export const PositionSchema = SchemaFactory.createForClass(Position);
PositionSchema.index({ isActive: 1, sortOrder: 1, name: 1 });
