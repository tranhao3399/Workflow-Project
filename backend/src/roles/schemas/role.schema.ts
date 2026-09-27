import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
export type RoleDocument = HydratedDocument<Role>;
@Schema({ timestamps: true, collection: 'roles' })
export class Role {
  @Prop({ required: true, unique: true, trim: true, uppercase: true, match: /^[A-Z][A-Z0-9_]*$/, index: true }) key: string;
  @Prop({ required: true, trim: true, maxlength: 100 }) name: string;
  @Prop({ required: false, trim: true, maxlength: 500 }) description?: string;
  @Prop({ type: [String], default: [] }) permissions: string[];
  @Prop({ type: [String], default: [] }) permissionKeys: string[];
  @Prop({ required: true, default: false }) isSystem: boolean;
  @Prop({ required: true, default: true, index: true }) isActive: boolean;
}
export const RoleSchema = SchemaFactory.createForClass(Role);
RoleSchema.index({ isActive: 1, key: 1 });
