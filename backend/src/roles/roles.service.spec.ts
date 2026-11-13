import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '../users/enums/user-role.enum.js';
import { RolesService } from './roles.service.js';

function operation() {
  return { exec: vi.fn().mockResolvedValue(undefined) };
}

describe('RolesService system-role permission migration', () => {
  it('given existing system roles, when the module initializes, then every standard role receives the complete self-service request permissions', async () => {
    const model = {
      exists: vi.fn().mockResolvedValue(true),
      updateMany: vi.fn().mockImplementation(operation),
      updateOne: vi.fn().mockImplementation(operation),
    };
    const service = new RolesService(
      model as never,
      {} as never,
      {} as never,
    );

    await service.onModuleInit();

    expect(model.updateMany).toHaveBeenCalledWith(
      {
        key: {
          $in: [
            UserRole.EMPLOYEE,
            UserRole.MANAGER,
            UserRole.ACCOUNTANT,
            UserRole.DIRECTOR,
          ],
        },
        isSystem: true,
      },
      {
        $addToSet: {
          permissionKeys: {
            $each: expect.arrayContaining([
              'DASHBOARD.VIEW',
              'NOTIFICATION.VIEW',
              'REQUESTS.VIEW_OWN',
              'REQUESTS.CREATE',
              'REQUESTS.UPDATE_OWN_DRAFT',
              'REQUESTS.DELETE_OWN_DRAFT',
              'REQUESTS.SUBMIT',
              'REQUESTS.CANCEL_OWN',
            ]),
          },
        },
      },
    );
  });
});
