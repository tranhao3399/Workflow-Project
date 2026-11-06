import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { describe, expect, it } from 'vitest';
import { CreateEmployeeDto } from './create-employee.dto.js';
import { UpdateEmployeeDto } from './update-employee.dto.js';
import { ListEmployeesDto } from './list-employees.dto.js';

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
