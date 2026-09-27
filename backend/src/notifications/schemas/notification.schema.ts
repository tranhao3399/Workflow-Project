import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export const notificationTypes = ['APPROVAL', 'REVISION', 'DECISION', 'SLA', 'SYSTEM'] as const;
export type NotificationType = (typeof notificationTypes)[number];
export type NotificationDocument = HydratedDocument<Notification>;

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false, index: true })
  userId?: Types.ObjectId;

  @Prop({ required: true, type: String, enum: notificationTypes, index: true })
  type: NotificationType;

  @Prop({ required: true, trim: true, maxlength: 160 })
  title: string;

  @Prop({ required: true, trim: true, maxlength: 500 })
  description: string;

  @Prop({ required: true, default: false, index: true })
  isRead: boolean;

  @Prop({ required: false, trim: true, maxlength: 200 })
  link?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
