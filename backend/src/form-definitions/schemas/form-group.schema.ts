import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type FormGroupDocument = HydratedDocument<FormGroup>;

@Schema({ timestamps: true, collection: 'form_groups' })
export class FormGroup {
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 80, match: /^[A-Z][A-Z0-9_]*$/ })
  code: string;

  @Prop({ required: true, trim: true, maxlength: 160 })
  name: string;

  @Prop({ required: true, trim: true, lowercase: true, maxlength: 160 })
  nameNormalized: string;

  @Prop({ required: false, trim: true, maxlength: 1000 })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;

  @Prop({ required: true, default: 0, min: 0, max: 9999 })
  sortOrder: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false })
  updatedBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const FormGroupSchema = SchemaFactory.createForClass(FormGroup);
FormGroupSchema.index({ code: 1 }, { unique: true });
FormGroupSchema.index({ nameNormalized: 1 }, { unique: true });
FormGroupSchema.index({ isActive: 1, sortOrder: 1, name: 1 });
