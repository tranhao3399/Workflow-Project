import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { describe, expect, it } from 'vitest';
import { CreateEmployeeDto } from './create-employee.dto.js';
import { UpdateEmployeeDto } from './update-employee.dto.js';
import { ListEmployeesDto } from './list-employees.dto.js';
import { Gender } from '../enums/gender.enum.js';
import { EmploymentType } from '../enums/employment-type.enum.js';

describe('Employee DTO validation', () => {
  it('rejects an invalid work email and manager identifier', async () => {
    const dto = Object.assign(new CreateEmployeeDto(), {
      employeeCode: 'NV-1001',
      fullName: 'Nguyen Van A',
      workEmail: 'not-an-email',
      department: 'Engineering',
      position: 'Developer',
      managerId: 'not-an-object-id',
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['workEmail', 'workUnitId', 'managerId']),
    );
  });

  it('given a new employee, when the organization relations are valid, then the work unit is accepted separately from the functional department', async () => {
    const dto = Object.assign(new CreateEmployeeDto(), {
      fullName: 'Nguyen Van A',
      workEmail: 'a@example.com',
      workUnitId: '64b64b64b64b64b64b64b601',
      departmentId: '64b64b64b64b64b64b64b602',
      positionId: '64b64b64b64b64b64b64b603',
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('permits null when unlinking the optional employee relations', async () => {
    const dto = Object.assign(new UpdateEmployeeDto(), {
      managerId: null,
      userId: null,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts an ISO date of birth and rejects an invalid date value', async () => {
    const validDto = Object.assign(new UpdateEmployeeDto(), {
      dateOfBirth: '1996-05-18T00:00:00.000Z',
    });
    const invalidDto = Object.assign(new UpdateEmployeeDto(), {
      dateOfBirth: 'not-a-date',
    });
    expect(await validate(validDto)).toHaveLength(0);
    expect(
      (await validate(invalidDto)).map((error) => error.property),
    ).toContain('dateOfBirth');
  });

  it('accepts fractional annual leave days and rejects values outside the allowed range', async () => {
    const validDto = Object.assign(new UpdateEmployeeDto(), {
      annualLeaveDays: 12.5,
    });
    const negativeDto = Object.assign(new UpdateEmployeeDto(), {
      annualLeaveDays: -0.5,
    });
    const excessiveDto = Object.assign(new UpdateEmployeeDto(), {
      annualLeaveDays: 365.5,
    });

    expect(await validate(validDto)).toHaveLength(0);
    expect(
      (await validate(negativeDto)).map((error) => error.property),
    ).toContain('annualLeaveDays');
    expect(
      (await validate(excessiveDto)).map((error) => error.property),
    ).toContain('annualLeaveDays');
  });

  it('permits null when clearing annual leave days from an employee profile', async () => {
    const dto = Object.assign(new UpdateEmployeeDto(), {
      annualLeaveDays: null,
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts a supported gender and a 12-digit citizen identifier', async () => {
    const dto = Object.assign(new UpdateEmployeeDto(), {
      gender: Gender.FEMALE,
      citizenId: '079123456789',
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an unsupported gender or malformed citizen identifier', async () => {
    const dto = Object.assign(new UpdateEmployeeDto(), {
      gender: 'UNKNOWN',
      citizenId: '123ABC',
    });

    expect((await validate(dto)).map((error) => error.property)).toEqual(
      expect.arrayContaining(['gender', 'citizenId']),
    );
  });

  it('permits null when clearing gender and citizen identifier', async () => {
    const dto = Object.assign(new UpdateEmployeeDto(), {
      gender: null,
      citizenId: null,
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts official, part-time and probation employment types', async () => {
    const official = Object.assign(new UpdateEmployeeDto(), {
      employmentType: EmploymentType.OFFICIAL,
    });
    const partTime = Object.assign(new UpdateEmployeeDto(), {
      employmentType: EmploymentType.PART_TIME,
    });
    const probation = Object.assign(new UpdateEmployeeDto(), {
      employmentType: EmploymentType.CONTRACT,
    });

    expect(await validate(official)).toHaveLength(0);
    expect(await validate(partTime)).toHaveLength(0);
    expect(await validate(probation)).toHaveLength(0);
  });

  it('accepts the simplified active flag and rejects non-boolean values', async () => {
    const active = Object.assign(new UpdateEmployeeDto(), { isActive: false });
    const invalid = Object.assign(new UpdateEmployeeDto(), {
      isActive: 'false',
    });

    expect(await validate(active)).toHaveLength(0);
    expect((await validate(invalid)).map((error) => error.property)).toContain(
      'isActive',
    );
  });

  it('given server-side employee filters, when query values are transformed, then work unit, employment type and pagination remain valid', async () => {
    const dto = plainToInstance(ListEmployeesDto, {
      workUnitId: '64b64b64b64b64b64b64b601',
      employmentType: 'FULL_TIME',
      page: '2',
      limit: '100',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(100);
  });
});
