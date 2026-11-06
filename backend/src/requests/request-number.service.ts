import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import {
  RequestSequence,
  type RequestSequenceDocument,
} from './schemas/request-sequence.schema.js';

const REQUEST_SEQUENCE_WIDTH = 6;

export function formatRequestNumber(formCode: string, sequence: number): string {
  return `${formCode.trim().toUpperCase()}-${String(sequence).padStart(REQUEST_SEQUENCE_WIDTH, '0')}`;
}
@Injectable()
export class RequestNumberService {
  constructor(
    @InjectModel(RequestSequence.name)
    private readonly sequences: Model<RequestSequenceDocument>,
  ) {}

  async next(formCode: string, session: ClientSession): Promise<string> {
    const normalizedFormCode = formCode.trim().toUpperCase();
    const counter = await this.sequences.findOneAndUpdate(
      { formCode: normalizedFormCode },
      {
        $inc: { sequence: 1 },
        $setOnInsert: { formCode: normalizedFormCode },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        session,
      },
    ).lean().exec();

    if (!counter) throw new Error('Unable to allocate request number.');
    return formatRequestNumber(normalizedFormCode, counter.sequence);
  }
}
