import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RequestSequenceDocument = HydratedDocument<RequestSequence>;

@Schema({ collection: 'request_sequences' })
export class RequestSequence {
  @Prop({
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    maxlength: 80,
  })
  formCode: string;

  @Prop({ required: true, default: 0, min: 0 })
  sequence: number;
}

export const RequestSequenceSchema = SchemaFactory.createForClass(RequestSequence);
