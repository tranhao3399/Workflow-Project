import { ForbiddenException } from '@nestjs/common';
import type { Model } from 'mongoose';
import { describe, expect, it } from 'vitest';
import type { ApprovalTask } from '../approvals/schemas/approval-task.schema.js';
import type { AuditLog } from '../audit-logs/schemas/audit-log.schema.js';
import type { OrganizationScopeService } from '../common/organization/organization-scope.service.js';
import type { Department } from '../departments/schemas/department.schema.js';
import type { Employee } from '../employees/schemas/employee.schema.js';
import type { FormDefinition } from '../form-definitions/schemas/form-definition.schema.js';
import type { Position } from '../positions/schemas/position.schema.js';
import type { Request } from '../requests/schemas/request.schema.js';
import type { User } from '../users/schemas/user.schema.js';
import type { SafeUser } from '../users/users.service.js';
import type { WorkflowDefinition } from '../workflow-definitions/schemas/workflow-definition.schema.js';
import type { WorkspaceModule } from '../workspace-modules/schemas/workspace-module.schema.js';
import { DashboardService } from './dashboard.service.js';

const emptyModel = <T>() => ({}) as Model<T>;

const user: SafeUser = {
  id: '507f1f77bcf86cd799439011',
  fullName: 'Nguyễn Minh Anh',
  email: 'minhanh@example.com',
  role: 'EMPLOYEE',
  roles: ['EMPLOYEE'],
  department: 'Kinh doanh',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createService() {
  return new DashboardService(
    emptyModel<Employee>(),
    emptyModel<User>(),
    emptyModel<Department>(),
    emptyModel<Position>(),
    emptyModel<Request>(),
    emptyModel<ApprovalTask>(),
    emptyModel<FormDefinition>(),
    emptyModel<WorkflowDefinition>(),
    emptyModel<AuditLog>(),
    emptyModel<WorkspaceModule>(),
    {} as OrganizationScopeService,
  );
}

describe('DashboardService', () => {
  it('given no system permission, when requesting system view, then reject access', async () => {
    await expect(createService().getDashboard(user, ['DASHBOARD.VIEW'], 'SYSTEM'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('given only dashboard permission, when loading without a view, then return an empty personal workspace safely', async () => {
    const result = await createService().getDashboard(user, ['DASHBOARD.VIEW']);

    expect(result.activeView).toBe('MY_WORK');
    expect(result.availableViews).toEqual(['MY_WORK']);
    expect(result.metrics).toHaveLength(4);
    expect(result.recentRequests).toEqual([]);
  });
});
