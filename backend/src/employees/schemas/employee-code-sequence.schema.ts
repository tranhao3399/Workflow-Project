import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EmployeeCodeSequenceDocument =
  HydratedDocument<EmployeeCodeSequence>;

@Schema({ collection: 'employee_code_sequences' })
export class EmployeeCodeSequence {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  key: string;

  @Prop({ required: true, default: 0, min: 0 })
  sequence: number;
}

export const EmployeeCodeSequenceSchema = SchemaFactory.createForClass(
  EmployeeCodeSequence,
);
