import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type QueryFilter } from 'mongoose';
import { ApprovalTask } from '../approvals/schemas/approval-task.schema.js';
import { AuditLog } from '../audit-logs/schemas/audit-log.schema.js';
import { OrganizationScopeService } from '../common/organization/organization-scope.service.js';
import { Department } from '../departments/schemas/department.schema.js';
import { Employee } from '../employees/schemas/employee.schema.js';
import { FormDefinition } from '../form-definitions/schemas/form-definition.schema.js';
import { Position } from '../positions/schemas/position.schema.js';
import { Request } from '../requests/schemas/request.schema.js';
import { User } from '../users/schemas/user.schema.js';
import type { SafeUser } from '../users/users.service.js';
import { WorkflowDefinition } from '../workflow-definitions/schemas/workflow-definition.schema.js';
import { WorkspaceModule } from '../workspace-modules/schemas/workspace-module.schema.js';
import type { DashboardView } from './dto/dashboard-query.dto.js';

type DashboardTone = 'neutral' | 'warning' | 'success' | 'danger';

export interface DashboardMetric {
  key: string;
  label: string;
  value: number;
  description: string;
  tone: DashboardTone;
  target?: string;
}

const hasAnyPermission = (
  permissions: ReadonlySet<string>,
  expected: readonly string[],
) => expected.some((permission) => permissions.has(permission));

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Department.name) private readonly departments: Model<Department>,
    @InjectModel(Position.name) private readonly positions: Model<Position>,
    @InjectModel(Request.name) private readonly requests: Model<Request>,
    @InjectModel(ApprovalTask.name) private readonly approvalTasks: Model<ApprovalTask>,
    @InjectModel(FormDefinition.name) private readonly forms: Model<FormDefinition>,
    @InjectModel(WorkflowDefinition.name) private readonly workflows: Model<WorkflowDefinition>,
    @InjectModel(AuditLog.name) private readonly auditLogs: Model<AuditLog>,
    @InjectModel(WorkspaceModule.name) private readonly workspaceModules: Model<WorkspaceModule>,
    private readonly organizationScope: OrganizationScopeService,
  ) {}

  async getDashboard(
    user: SafeUser,
    permissionKeys: readonly string[],
    requestedView?: DashboardView,
  ) {
    const permissions = new Set(permissionKeys);
    const availableViews = this.availableViews(user, permissions);
    const activeView = requestedView ?? availableViews[0];
    if (!availableViews.includes(activeView)) {
      throw new ForbiddenException('Bạn không có quyền xem góc nhìn dashboard này.');
    }

    const base = {
      profile: {
        fullName: user.fullName,
        position: user.position,
        department: user.department,
        employeeCode: user.employeeCode,
      },
      availableViews,
      activeView,
      canCreateRequest: permissions.has('REQUESTS.CREATE'),
    };

    if (activeView === 'HR') {
      return { ...base, ...(await this.hrDashboard(user, permissions)) };
    }
    if (activeView === 'SYSTEM') {
      return { ...base, ...(await this.systemDashboard(permissions)) };
    }
    return { ...base, ...(await this.myWorkDashboard(user, permissions)) };
  }

  private availableViews(
    user: SafeUser,
    permissions: ReadonlySet<string>,
  ): DashboardView[] {
    const views: DashboardView[] = [];
    if (
      user.employeeId ||
      hasAnyPermission(permissions, [
        'REQUESTS.VIEW_OWN',
        'REQUESTS.CREATE',
        'APPROVALS.VIEW_ASSIGNED',
      ])
    ) {
      views.push('MY_WORK');
    }
    if (
      hasAnyPermission(permissions, [
        'EMPLOYEE.VIEW',
        'DEPARTMENT.VIEW',
        'JOB_TITLE.VIEW',
        'REQUESTS.VIEW_SCOPE',
        'REQUESTS.VIEW_ALL',
      ])
    ) {
      views.push('HR');
    }
    if (
      hasAnyPermission(permissions, [
        'USER.VIEW',
        'AUDIT_LOG.VIEW',
        'WORKSPACE_MODULE.VIEW',
      ])
    ) {
      views.push('SYSTEM');
    }
    return views.length ? views : ['MY_WORK'];
  }

  private async myWorkDashboard(
    user: SafeUser,
    permissions: ReadonlySet<string>,
  ) {
    const userObjectId = new Types.ObjectId(user.id);
    const canViewOwnRequests = permissions.has('REQUESTS.VIEW_OWN');
    const canViewApprovals = permissions.has('APPROVALS.VIEW_ASSIGNED');
    const now = new Date();
    const requestFilter = { requesterUserId: userObjectId };

    const [
      pendingApprovals,
      overdueApprovals,
      inProgressRequests,
      approvedRequests,
      revisionRequests,
      rejectedRequests,
      draftRequests,
      recentRequests,
      approvalRows,
      quickForms,
      directReports,
    ] = await Promise.all([
      canViewApprovals
        ? this.approvalTasks.countDocuments({ assigneeUserId: userObjectId, status: 'PENDING' }).exec()
        : 0,
      canViewApprovals
        ? this.approvalTasks.countDocuments({ assigneeUserId: userObjectId, status: 'PENDING', dueAt: { $lt: now } }).exec()
        : 0,
      canViewOwnRequests
        ? this.requests.countDocuments({ ...requestFilter, status: 'IN_PROGRESS' }).exec()
        : 0,
      canViewOwnRequests
        ? this.requests.countDocuments({ ...requestFilter, status: 'APPROVED' }).exec()
        : 0,
      canViewOwnRequests
        ? this.requests.countDocuments({ ...requestFilter, status: 'REVISION_REQUESTED' }).exec()
        : 0,
      canViewOwnRequests
        ? this.requests.countDocuments({ ...requestFilter, status: 'REJECTED' }).exec()
        : 0,
      canViewOwnRequests
        ? this.requests.countDocuments({ ...requestFilter, status: 'DRAFT' }).exec()
        : 0,
      canViewOwnRequests
        ? this.requests.find(requestFilter).sort({ updatedAt: -1 }).limit(5).lean().exec()
        : [],
      canViewApprovals
        ? this.approvalTasks
            .find({ assigneeUserId: userObjectId, status: 'PENDING' })
            .sort({ dueAt: 1, assignedAt: 1 })
            .limit(5)
            .lean()
            .exec()
        : [],
      permissions.has('REQUESTS.CREATE') ? this.quickForms() : [],
      user.employeeId
        ? this.employees
            .find({ managerId: new Types.ObjectId(user.employeeId), isActive: true })
            .select({ employeeCode: 1, fullName: 1, departmentId: 1, positionId: 1, employmentType: 1, isActive: 1 })
            .sort({ fullName: 1 })
            .limit(5)
            .lean()
            .exec()
        : [],
    ]);

    const approvalRequestIds = approvalRows.map((task) => task.requestId);
    const approvalRequests = approvalRequestIds.length
      ? await this.requests.find({ _id: { $in: approvalRequestIds } }).lean().exec()
      : [];
    const approvalRequestById = new Map(
      approvalRequests.map((request) => [request._id.toString(), request]),
    );

    const metrics: DashboardMetric[] = canViewApprovals
      ? [
          { key: 'pending-approvals', label: 'Chờ tôi duyệt', value: pendingApprovals, description: 'Công việc cần bạn quyết định.', tone: pendingApprovals ? 'warning' : 'neutral', target: 'approval-inbox' },
          { key: 'overdue-approvals', label: 'Quá hạn xử lý', value: overdueApprovals, description: 'Task vẫn giữ trạng thái chờ xử lý.', tone: overdueApprovals ? 'danger' : 'neutral', target: 'approval-inbox' },
          { key: 'in-progress-requests', label: 'Phiếu đang xử lý', value: inProgressRequests, description: 'Đề xuất của bạn đang chạy quy trình.', tone: 'neutral', target: 'my-requests' },
          { key: 'revision-requests', label: 'Cần bổ sung', value: revisionRequests, description: 'Phiếu cần bạn cập nhật thêm thông tin.', tone: revisionRequests ? 'warning' : 'neutral', target: 'my-requests' },
        ]
      : [
          { key: 'in-progress-requests', label: 'Đang chờ duyệt', value: inProgressRequests, description: 'Đề xuất đang chạy quy trình.', tone: 'warning', target: 'my-requests' },
          { key: 'approved-requests', label: 'Đã được phê duyệt', value: approvedRequests, description: 'Đề xuất đã hoàn tất phê duyệt.', tone: 'success', target: 'my-requests' },
          { key: 'attention-requests', label: 'Cần lưu ý', value: revisionRequests + rejectedRequests, description: 'Phiếu cần bổ sung hoặc đã bị từ chối.', tone: revisionRequests + rejectedRequests ? 'danger' : 'neutral', target: 'my-requests' },
          { key: 'draft-requests', label: 'Bản nháp', value: draftRequests, description: 'Phiếu chưa gửi đang chờ hoàn thiện.', tone: 'neutral', target: 'my-requests' },
        ];

    return {
      scopeLabel: 'Dữ liệu cá nhân',
      metrics,
      recentRequests: recentRequests.map((request) => this.requestItem(request)),
      approvalQueue: approvalRows.flatMap((task) => {
        const request = approvalRequestById.get(task.requestId.toString());
        if (!request) return [];
        return [{
          id: task._id.toString(),
          requestId: request._id.toString(),
          requestNo: request.requestNo,
          title: request.title,
          requester: request.requesterSnapshot.fullName,
          department: request.requesterSnapshot.departmentName,
          stepName: task.stepNameSnapshot,
          assignedAt: task.assignedAt,
          dueAt: task.dueAt,
          isOverdue: Boolean(task.dueAt && task.dueAt < now),
        }];
      }),
      quickForms,
      directReports: await this.employeeItems(directReports),
      recentEmployees: [],
      securityEvents: [],
      workspaceModules: [],
      analytics: [],
    };
  }

  private async hrDashboard(
    user: SafeUser,
    permissions: ReadonlySet<string>,
  ) {
    const employeeScope = await this.organizationScope.employeeFilter(user.id);
    const resolvedScope = await this.organizationScope.resolve(user.id);
    const activeEmployeeFilter: QueryFilter<Employee> = {
      $and: [employeeScope, { isActive: true }],
    };
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const canViewEmployees = permissions.has('EMPLOYEE.VIEW');
    const canViewDepartments = permissions.has('DEPARTMENT.VIEW');
    const canViewPositions = permissions.has('JOB_TITLE.VIEW');
    const canViewManagedRequests = hasAnyPermission(permissions, ['REQUESTS.VIEW_SCOPE', 'REQUESTS.VIEW_ALL']);
    const linkedEmployeeIds = canViewEmployees
      ? await this.users.distinct('employeeId', { employeeId: { $exists: true } }).exec()
      : [];
    const managedRequestFilter = canViewManagedRequests
      ? await this.organizationScope.managedRequestFilter(user.id)
      : { _id: { $in: [] } };

    const [activeEmployees, newEmployees, unlinkedEmployees, activeDepartments, activePositions, runningRequests, recentEmployees, unitDistribution, employmentDistribution] = await Promise.all([
      canViewEmployees ? this.employees.countDocuments(activeEmployeeFilter).exec() : 0,
      canViewEmployees ? this.employees.countDocuments({ $and: [activeEmployeeFilter, { hiredAt: { $gte: startOfMonth } }] }).exec() : 0,
      canViewEmployees ? this.employees.countDocuments({ $and: [activeEmployeeFilter, { _id: { $nin: linkedEmployeeIds } }] }).exec() : 0,
      canViewDepartments ? this.departments.countDocuments({ isActive: true }).exec() : 0,
      canViewPositions ? this.positions.countDocuments({ isActive: true }).exec() : 0,
      canViewManagedRequests ? this.requests.countDocuments({ $and: [managedRequestFilter, { status: 'IN_PROGRESS' }] }).exec() : 0,
      canViewEmployees
        ? this.employees.find(employeeScope).select({ employeeCode: 1, fullName: 1, departmentId: 1, workUnitId: 1, positionId: 1, employmentType: 1, isActive: 1, hiredAt: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(6).lean().exec()
        : [],
      canViewEmployees ? this.employeeDistribution(activeEmployeeFilter, 'unit') : [],
      canViewEmployees ? this.employeeDistribution(activeEmployeeFilter, 'employment') : [],
    ]);

    const metrics: DashboardMetric[] = [];
    if (canViewEmployees) {
      metrics.push(
        { key: 'active-employees', label: 'Nhân viên đang hoạt động', value: activeEmployees, description: 'Trong phạm vi bạn được phép xem.', tone: 'success', target: 'employees' },
        { key: 'new-employees', label: 'Nhân sự mới trong tháng', value: newEmployees, description: 'Theo ngày vào làm trong tháng hiện tại.', tone: 'neutral', target: 'employees' },
        { key: 'unlinked-employees', label: 'Hồ sơ chưa có tài khoản', value: unlinkedEmployees, description: 'Cần xem xét cấp tài khoản hệ thống.', tone: unlinkedEmployees ? 'warning' : 'neutral', target: 'employees' },
      );
    }
    if (canViewManagedRequests) {
      metrics.push({ key: 'running-requests', label: 'Phiếu đang vận hành', value: runningRequests, description: 'Phiếu đang xử lý trong phạm vi quản lý.', tone: 'warning', target: 'my-requests' });
    } else if (canViewDepartments) {
      metrics.push({ key: 'active-departments', label: 'Đơn vị đang hoạt động', value: activeDepartments, description: 'Cơ cấu tổ chức hiện có.', tone: 'neutral', target: 'departments' });
    } else if (canViewPositions) {
      metrics.push({ key: 'active-positions', label: 'Chức danh đang hoạt động', value: activePositions, description: 'Danh mục chức danh hiện có.', tone: 'neutral', target: 'job-titles' });
    }

    return {
      scopeLabel: resolvedScope.fullAccess ? 'Toàn hệ thống' : resolvedScope.departmentIds.length ? 'Phạm vi quản lý' : 'Hồ sơ cá nhân',
      metrics: metrics.slice(0, 4),
      recentRequests: [],
      approvalQueue: [],
      quickForms: [],
      directReports: [],
      recentEmployees: await this.employeeItems(recentEmployees),
      securityEvents: [],
      workspaceModules: [],
      analytics: [
        { key: 'units', label: 'Cơ cấu nhân sự theo đơn vị', items: unitDistribution },
        { key: 'employment', label: 'Cơ cấu theo loại hợp đồng', items: employmentDistribution },
      ],
    };
  }

  private async systemDashboard(permissions: ReadonlySet<string>) {
    const canViewUsers = permissions.has('USER.VIEW');
    const canViewAudit = permissions.has('AUDIT_LOG.VIEW');
    const canViewModules = permissions.has('WORKSPACE_MODULE.VIEW');
    const since24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [activeUsers, unlinkedUsers, enabledModules, failedLogins, securityEvents, workspaceModules, auditDistribution] = await Promise.all([
      canViewUsers ? this.users.countDocuments({ isActive: true }).exec() : 0,
      canViewUsers ? this.users.countDocuments({ isActive: true, employeeId: { $exists: false } }).exec() : 0,
      canViewModules ? this.workspaceModules.countDocuments({ isEnabled: true }).exec() : 0,
      canViewAudit ? this.auditLogs.countDocuments({ action: 'USER.LOGIN_FAILED', occurredAt: { $gte: since24Hours } }).exec() : 0,
      canViewAudit
        ? this.auditLogs.find({ action: { $in: ['USER.LOGIN_FAILED', 'USER.ACCOUNT_LOCKED', 'USER.SESSION_REVOKED'] } }).sort({ occurredAt: -1 }).limit(6).lean().exec()
        : [],
      canViewModules
        ? this.workspaceModules.find().select({ moduleKey: 1, name: 1, isEnabled: 1, groupKey: 1 }).sort({ groupKey: 1, sortOrder: 1 }).lean().exec()
        : [],
      canViewAudit
        ? this.auditLogs.aggregate<{ _id: string; value: number }>([
            { $match: { occurredAt: { $gte: since7Days } } },
            { $group: { _id: '$resource.type', value: { $sum: 1 } } },
            { $sort: { value: -1 } },
            { $limit: 8 },
          ]).exec()
        : [],
    ]);

    const metrics: DashboardMetric[] = [];
    if (canViewUsers) {
      metrics.push(
        { key: 'active-users', label: 'Tài khoản đang hoạt động', value: activeUsers, description: 'Tài khoản có thể truy cập hệ thống.', tone: 'success', target: 'users' },
        { key: 'unlinked-users', label: 'Tài khoản chưa liên kết hồ sơ', value: unlinkedUsers, description: 'Cần liên kết với hồ sơ nhân viên.', tone: unlinkedUsers ? 'warning' : 'neutral', target: 'users' },
      );
    }
    if (canViewModules) {
      metrics.push({ key: 'enabled-modules', label: 'Phân hệ đang bật', value: enabledModules, description: 'Phân hệ hiện có trong không gian làm việc.', tone: 'neutral', target: 'workspace-modules' });
    }
    if (canViewAudit) {
      metrics.push({ key: 'failed-logins', label: 'Đăng nhập thất bại trong 24 giờ', value: failedLogins, description: 'Sự kiện cần theo dõi về bảo mật.', tone: failedLogins ? 'danger' : 'neutral', target: 'audit-logs' });
    }

    return {
      scopeLabel: 'Toàn hệ thống',
      metrics,
      recentRequests: [],
      approvalQueue: [],
      quickForms: [],
      directReports: [],
      recentEmployees: [],
      securityEvents: securityEvents.map((event) => ({
        id: event._id.toString(),
        action: event.action,
        description: event.description,
        actor: event.actor.fullName ?? event.actor.email ?? 'Hệ thống',
        outcome: event.outcome,
        occurredAt: event.occurredAt,
        ipAddress: event.context?.ipAddress,
      })),
      workspaceModules: workspaceModules.map((module) => ({
        key: module.moduleKey,
        name: module.name,
        isEnabled: module.isEnabled,
        group: module.groupKey,
      })),
      analytics: canViewAudit
        ? [{ key: 'audit-modules', label: 'Lưu lượng thao tác theo phân hệ trong 7 ngày', items: auditDistribution.map((item) => ({ key: item._id, label: this.resourceLabel(item._id), value: item.value })) }]
        : [],
    };
  }

  private async quickForms() {
    const formIds = await this.workflows.distinct('formDefinitionId', { status: 'PUBLISHED' }).exec();
    if (!formIds.length) return [];
    const forms = await this.forms
      .find({ _id: { $in: formIds }, status: 'PUBLISHED' })
      .select({ code: 1, name: 1, category: 1, updatedAt: 1 })
      .sort({ updatedAt: -1 })
      .limit(6)
      .lean()
      .exec();
    return forms.map((form) => ({
      id: form._id.toString(),
      code: form.code,
      name: form.name,
      category: form.category,
    }));
  }

  private requestItem(request: Request & { _id: Types.ObjectId }) {
    return {
      id: request._id.toString(),
      requestNo: request.requestNo,
      title: request.title,
      requester: request.requesterSnapshot.fullName,
      department: request.requesterSnapshot.departmentName,
      status: request.status,
      submittedAt: request.submittedAt,
      updatedAt: request.updatedAt,
    };
  }

  private async employeeItems(employees: Array<Employee & { _id: Types.ObjectId }>) {
    if (!employees.length) return [];
    const departmentIds = [...new Set(employees.flatMap((employee) => [employee.departmentId?.toString(), employee.workUnitId?.toString()].filter((value): value is string => Boolean(value))))];
    const positionIds = [...new Set(employees.map((employee) => employee.positionId?.toString()).filter((value): value is string => Boolean(value)))];
    const [departments, positions] = await Promise.all([
      this.departments.find({ _id: { $in: departmentIds } }).select({ name: 1 }).lean().exec(),
      this.positions.find({ _id: { $in: positionIds } }).select({ name: 1 }).lean().exec(),
    ]);
    const departmentById = new Map(departments.map((department) => [department._id.toString(), department.name]));
    const positionById = new Map(positions.map((position) => [position._id.toString(), position.name]));
    return employees.map((employee) => ({
      id: employee._id.toString(),
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      department: departmentById.get((employee.workUnitId ?? employee.departmentId).toString()) ?? 'Chưa xác định',
      position: positionById.get(employee.positionId.toString()) ?? 'Chưa xác định',
      employmentType: employee.employmentType,
      isActive: employee.isActive,
      hiredAt: employee.hiredAt,
    }));
  }

  private async employeeDistribution(
    filter: QueryFilter<Employee>,
    kind: 'unit' | 'employment',
  ) {
    if (kind === 'employment') {
      const groups = await this.employees.aggregate<{ _id: string; value: number }>([
        { $match: filter },
        { $group: { _id: '$employmentType', value: { $sum: 1 } } },
        { $sort: { value: -1 } },
      ]).exec();
      return groups.map((group) => ({ key: group._id, label: this.employmentLabel(group._id), value: group.value }));
    }
    const groups = await this.employees.aggregate<{ _id: Types.ObjectId; value: number }>([
      { $match: filter },
      { $group: { _id: { $ifNull: ['$workUnitId', '$departmentId'] }, value: { $sum: 1 } } },
      { $sort: { value: -1 } },
      { $limit: 8 },
    ]).exec();
    const departments = await this.departments.find({ _id: { $in: groups.map((group) => group._id) } }).select({ name: 1 }).lean().exec();
    const names = new Map(departments.map((department) => [department._id.toString(), department.name]));
    return groups.map((group) => ({ key: group._id.toString(), label: names.get(group._id.toString()) ?? 'Chưa xác định', value: group.value }));
  }

  private employmentLabel(value: string) {
    return ({ OFFICIAL: 'Chính thức', FULL_TIME: 'Toàn thời gian', PART_TIME: 'Bán thời gian', CONTRACT: 'Thử việc', INTERN: 'Thực tập' } as Record<string, string>)[value] ?? value;
  }

  private resourceLabel(value: string) {
    const labels: Record<string, string> = {
      USER: 'Tài khoản',
      EMPLOYEE: 'Nhân viên',
      DEPARTMENT: 'Cơ cấu tổ chức',
      POSITION: 'Chức danh',
      JOB_TITLE: 'Chức danh',
      REQUEST: 'Phiếu yêu cầu',
      APPROVAL_TASK: 'Phê duyệt',
      FORM_DEFINITION: 'Biểu mẫu',
      WORKFLOW_DEFINITION: 'Quy trình',
      WORKSPACE_MODULE: 'Không gian làm việc',
      SESSION: 'Xác thực',
    };
    return labels[value] ?? value;
  }
}
