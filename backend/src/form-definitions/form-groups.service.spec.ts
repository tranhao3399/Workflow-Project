import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { FormGroupsService } from './form-groups.service.js';

function query<T>(value: T) {
  const chain = {
    select: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn().mockResolvedValue(value),
  };
  chain.select.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}

function createService() {
  const groups = {
    findById: vi.fn(),
    findOne: vi.fn(),
    deleteOne: vi.fn(),
  };
  const forms = {
    exists: vi.fn(),
  };
  const service = new FormGroupsService(groups as never, forms as never, { record: vi.fn() } as never);
  return { service, groups, forms };
}

describe('FormGroupsService', () => {
  it('given a group containing forms, when delete is requested, then deletion is rejected and existing forms remain assigned', async () => {
    const { service, groups, forms } = createService();
    const id = new Types.ObjectId();
    groups.findById.mockReturnValue(query({ _id: id, code: 'HR', name: 'Nhân sự' }));
    forms.exists.mockResolvedValue({ _id: new Types.ObjectId() });

    await expect(service.remove({ user: { id: new Types.ObjectId().toString() } } as never, id.toString()))
      .rejects.toBeInstanceOf(ConflictException);
    expect(groups.deleteOne).not.toHaveBeenCalled();
  });

  it('given an inactive group, when a form is assigned to it, then the assignment is rejected', async () => {
    const { service, groups } = createService();
    groups.findOne.mockReturnValue(query(null));

    await expect(service.requireAssignable(new Types.ObjectId().toString()))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
