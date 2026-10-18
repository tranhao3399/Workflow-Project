import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type NotificationReadDocument = HydratedDocument<NotificationRead>;

@Schema({ collection: 'notification_reads', timestamps: { createdAt: true, updatedAt: false } })
export class NotificationRead {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Notification', required: true, index: true })
  notificationId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, default: Date.now })
  readAt: Date;

  createdAt: Date;
}

export const NotificationReadSchema = SchemaFactory.createForClass(NotificationRead);
NotificationReadSchema.index({ notificationId: 1, userId: 1 }, { unique: true });
NotificationReadSchema.index({ userId: 1, notificationId: 1 });
