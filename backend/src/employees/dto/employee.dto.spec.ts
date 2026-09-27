import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateEmployeeDto } from './create-employee.dto.js';
import { UpdateEmployeeDto } from './update-employee.dto.js';

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
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['workEmail', 'managerId']));
  });

  it('permits null when unlinking the optional employee relations', async () => {
    const dto = Object.assign(new UpdateEmployeeDto(), { managerId: null, userId: null });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts an ISO date of birth and rejects an invalid date value', async () => {
    const validDto = Object.assign(new UpdateEmployeeDto(), { dateOfBirth: '1996-05-18T00:00:00.000Z' });
    const invalidDto = Object.assign(new UpdateEmployeeDto(), { dateOfBirth: 'not-a-date' });
    expect(await validate(validDto)).toHaveLength(0);
    expect((await validate(invalidDto)).map((error) => error.property)).toContain('dateOfBirth');
  });

  it('accepts the simplified active flag and rejects non-boolean values', async () => {
    const active = Object.assign(new UpdateEmployeeDto(), { isActive: false });
    const invalid = Object.assign(new UpdateEmployeeDto(), { isActive: 'false' });

    expect(await validate(active)).toHaveLength(0);
    expect((await validate(invalid)).map((error) => error.property)).toContain('isActive');
  });
});
