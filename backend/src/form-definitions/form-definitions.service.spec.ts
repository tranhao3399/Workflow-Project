import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { FormDefinitionsService } from './form-definitions.service.js';

function listQuery<T>(value: T) {
  const chain = {
    sort: vi.fn(),
    skip: vi.fn(),
    limit: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn().mockResolvedValue(value),
  };
  chain.sort.mockReturnValue(chain);
  chain.skip.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}

function createService(forms: Record<string, unknown>, validator: Record<string, unknown>) {
  return new FormDefinitionsService(
    forms as never,
    { find: vi.fn() } as never,
    {} as never,
    {} as never,
    { find: vi.fn() } as never,
    { find: vi.fn() } as never,
    validator as never,
    { requireAssignable: vi.fn() } as never,
    { record: vi.fn().mockResolvedValue(undefined) } as never,
  );
}

describe('FormDefinitionsService system fields and grouping', () => {
  it('given ordinary client fields, when a form is created, then required system fields are normalized before validation and persistence', async () => {
    const normalizedFields = [
      { key: 'request_code', autoFill: { source: 'REQUEST_CODE', readOnly: true } },
      { key: 'request_status', autoFill: { source: 'REQUEST_STATUS', readOnly: true } },
      { key: 'reason', type: 'TEXT' },
    ];
    const validator = {
      ensureSystemRequestFields: vi.fn().mockReturnValue(normalizedFields),
      assertDefinitionValid: vi.fn(),
      assertSystemRequestFieldsValid: vi.fn(),
    };
    const item = {
      _id: new Types.ObjectId(),
      code: 'LEAVE',
      version: 1,
      name: 'Đơn xin nghỉ phép',
      status: 'DRAFT',
      fields: normalizedFields,
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const forms = {
      exists: vi.fn().mockResolvedValue(false),
      create: vi.fn().mockResolvedValue(item),
    };
    const service = createService(forms, validator);

    await service.create(
      { user: { id: new Types.ObjectId().toString() } } as never,
      {
        code: 'leave',
        name: 'Đơn xin nghỉ phép',
        fields: [{ key: 'reason', type: 'TEXT' }],
      } as never,
    );

    expect(validator.assertDefinitionValid).toHaveBeenCalledWith(normalizedFields);
    expect(validator.assertSystemRequestFieldsValid).toHaveBeenCalledWith(normalizedFields);
    expect(forms.create).toHaveBeenCalledWith(
      expect.objectContaining({ fields: normalizedFields }),
    );
  });

  it('given missing and explicit-null group identifiers, when ungrouped forms are listed, then one MongoDB null filter covers both states', async () => {
    const forms = {
      find: vi.fn().mockReturnValue(listQuery([])),
      countDocuments: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(0) }),
    };
    const validator = { ensureSystemRequestFields: vi.fn() };
    const service = createService(forms, validator);

    await service.findAll({
      ungrouped: 'true',
      page: 1,
      limit: 20,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    } as never);

    expect(forms.find).toHaveBeenCalledWith({ groupId: null });
    expect(forms.countDocuments).toHaveBeenCalledWith({ groupId: null });
  });

  it('given an editable draft, when its code is changed, then the normalized code is checked and persisted', async () => {
    const id = new Types.ObjectId();
    const fields = [{ key: 'request_code', type: 'TEXT' }];
    const current = {
      _id: id,
      code: 'OLD_CODE',
      version: 1,
      name: 'Biểu mẫu cũ',
      status: 'DRAFT',
      fields,
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      get: vi.fn().mockReturnValue(0),
      toObject: vi.fn().mockReturnValue({ fields, settings: {} }),
    };
    const updated = { ...current, code: 'NEW_CODE' };
    const findOneAndUpdate = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(updated),
    });
    const forms = {
      findById: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(current) }),
      exists: vi.fn().mockResolvedValue(false),
      findOneAndUpdate,
    };
    const validator = {
      ensureSystemRequestFields: vi.fn().mockImplementation((value) => value),
      assertDefinitionValid: vi.fn(),
      assertSystemRequestFieldsValid: vi.fn(),
    };
    const service = createService(forms, validator);

    const result = await service.update(
      { user: { id: new Types.ObjectId().toString() } } as never,
      id.toString(),
      { code: ' new_code ' } as never,
    );

    expect(forms.exists).toHaveBeenCalledWith({ code: 'NEW_CODE', _id: { $ne: id } });
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: id, status: 'DRAFT' }),
      expect.objectContaining({ $set: expect.objectContaining({ code: 'NEW_CODE' }) }),
      expect.objectContaining({ runValidators: true }),
    );
    expect(result.code).toBe('NEW_CODE');
  });

  it('given another form already uses the requested code, when a draft is updated, then the duplicate code is rejected', async () => {
    const id = new Types.ObjectId();
    const current = {
      _id: id,
      code: 'OLD_CODE',
      status: 'DRAFT',
    };
    const findOneAndUpdate = vi.fn();
    const forms = {
      findById: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(current) }),
      exists: vi.fn().mockResolvedValue(true),
      findOneAndUpdate,
    };
    const service = createService(forms, {});

    await expect(service.update(
      { user: { id: new Types.ObjectId().toString() } } as never,
      id.toString(),
      { code: 'EXISTING_CODE' } as never,
    )).rejects.toThrow('Mã biểu mẫu đã tồn tại.');
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
});
