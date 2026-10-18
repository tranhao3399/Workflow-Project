import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
export type RoleDocument = HydratedDocument<Role>;
@Schema({ timestamps: true, collection: 'roles' })
export class Role {
  @Prop({ required: true, unique: true, trim: true, uppercase: true, match: /^[A-Z][A-Z0-9_]*$/, index: true }) key: string;
  @Prop({ required: true, trim: true, maxlength: 100 }) name: string;
  @Prop({ required: true, unique: true, trim: true, maxlength: 100, select: false }) nameNormalized: string;
  @Prop({ required: false, trim: true, maxlength: 500 }) description?: string;
  @Prop({ type: [String], default: [] }) permissionKeys: string[];
  @Prop({ required: true, default: false }) isSystem: boolean;
  @Prop({ required: true, default: true, index: true }) isActive: boolean;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false }) createdBy?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false }) updatedBy?: Types.ObjectId;
}
export const RoleSchema = SchemaFactory.createForClass(Role);
RoleSchema.index({ isActive: 1, key: 1 });
