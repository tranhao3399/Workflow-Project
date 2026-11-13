import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isMongoDuplicateKeyError } from '../common/database/mongo-errors.js';
import { Employee } from './schemas/employee.schema.js';
import {
  EmployeeCodeSequence,
  type EmployeeCodeSequenceDocument,
} from './schemas/employee-code-sequence.schema.js';

const EMPLOYEE_CODE_SEQUENCE_KEY = 'EMPLOYEE';
const EMPLOYEE_CODE_WIDTH = 3;

export function formatEmployeeCode(sequence: number): string {
  return `NV-${String(sequence).padStart(EMPLOYEE_CODE_WIDTH, '0')}`;
}

@Injectable()
export class EmployeeCodeService {
  constructor(
    @InjectModel(EmployeeCodeSequence.name)
    private readonly sequences: Model<EmployeeCodeSequenceDocument>,
    @InjectModel(Employee.name)
    private readonly employees: Model<Employee>,
  ) {}

  async previewNext(): Promise<string> {
    const sequence = await this.ensureInitialized();
    return formatEmployeeCode(sequence + 1);
  }

  async allocateNext(): Promise<string> {
    await this.ensureInitialized();
    const counter = await this.sequences
      .findOneAndUpdate(
        { key: EMPLOYEE_CODE_SEQUENCE_KEY },
        { $inc: { sequence: 1 } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();
    if (!counter) throw new Error('Unable to allocate employee code.');
    return formatEmployeeCode(counter.sequence);
  }

  private async ensureInitialized(): Promise<number> {
    const existing = await this.sequences
      .findOne({ key: EMPLOYEE_CODE_SEQUENCE_KEY })
      .lean()
      .exec();
    if (existing) return existing.sequence;

    const [latest] = await this.employees
      .aggregate<{ sequence: number }>([
        { $match: { employeeCode: /^NV-\d+$/i } },
        {
          $project: {
            sequence: {
              $convert: {
                input: { $arrayElemAt: [{ $split: ['$employeeCode', '-'] }, 1] },
                to: 'int',
                onError: 0,
                onNull: 0,
              },
            },
          },
        },
        { $sort: { sequence: -1 } },
        { $limit: 1 },
      ])
      .exec();
    const seed = latest?.sequence ?? 0;

    try {
      const initialized = await this.sequences
        .findOneAndUpdate(
          { key: EMPLOYEE_CODE_SEQUENCE_KEY },
          {
            $setOnInsert: {
              key: EMPLOYEE_CODE_SEQUENCE_KEY,
              sequence: seed,
            },
          },
          {
            returnDocument: 'after',
            upsert: true,
            setDefaultsOnInsert: true,
          },
        )
        .lean()
        .exec();
      if (initialized) return initialized.sequence;
    } catch (error) {
      if (!isMongoDuplicateKeyError(error)) throw error;
    }

    const concurrent = await this.sequences
      .findOne({ key: EMPLOYEE_CODE_SEQUENCE_KEY })
      .lean()
      .exec();
    if (!concurrent) throw new Error('Unable to initialize employee code sequence.');
    return concurrent.sequence;
  }
}
