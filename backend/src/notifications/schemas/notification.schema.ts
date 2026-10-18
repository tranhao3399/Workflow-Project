import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export const notificationTypes = ['APPROVAL', 'REVISION', 'DECISION', 'SLA', 'SYSTEM'] as const;
export type NotificationType = (typeof notificationTypes)[number];
export const notificationTargetTypes = ['PERSONAL', 'BROADCAST'] as const;
export type NotificationTargetType = (typeof notificationTargetTypes)[number];
export type NotificationDocument = HydratedDocument<Notification>;

@Schema({ _id: false })
export class NotificationResource {
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 80 })
  type: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  id: Types.ObjectId;
}

export const NotificationResourceSchema = SchemaFactory.createForClass(NotificationResource);

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({ required: true, type: String, enum: notificationTargetTypes, index: true })
  targetType: NotificationTargetType;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false, index: true })
  recipientUserId?: Types.ObjectId;

  @Prop({ required: true, type: String, enum: notificationTypes, index: true })
  type: NotificationType;

  @Prop({ required: true, trim: true, maxlength: 160 })
  title: string;

  @Prop({ required: true, trim: true, maxlength: 500 })
  message: string;

  @Prop({ required: true, default: false, index: true })
  isRead: boolean;

  @Prop({ required: false })
  readAt?: Date;

  @Prop({ required: false, trim: true, maxlength: 200 })
  link?: string;

  @Prop({ type: NotificationResourceSchema, required: false })
  resource?: NotificationResource;

  @Prop({ type: MongooseSchema.Types.Mixed, required: false })
  data?: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false })
  createdByUserId?: Types.ObjectId;

  @Prop({ required: false })
  expiresAt?: Date;

  @Prop({ required: false, trim: true, maxlength: 160 })
  dedupeKey?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.pre('validate', function validateTarget() {
  if (this.targetType === 'PERSONAL' && !this.recipientUserId) throw new Error('Personal notification requires recipientUserId');
  if (this.targetType === 'BROADCAST') this.recipientUserId = undefined;
});
NotificationSchema.index({ recipientUserId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ targetType: 1, createdAt: -1 });
NotificationSchema.index(
  { dedupeKey: 1, recipientUserId: 1 },
  {
    name: 'uniq_notification_dedupe_recipient',
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: 'string' } },
  },
);
