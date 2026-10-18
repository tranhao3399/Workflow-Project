import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { PERMISSION_KEYS } from '../roles/permission-registry.js';
import { UpdateWorkspaceModuleDto } from './dto/update-workspace-module.dto.js';
import { WorkspaceModuleGroup } from './enums/workspace-module-group.enum.js';
import { WorkspaceModule } from './schemas/workspace-module.schema.js';

type WorkspaceModuleSeed = Pick<WorkspaceModule, 'moduleKey' | 'name' | 'path' | 'icon' | 'groupKey' | 'sortOrder' | 'isEnabled' | 'requiredPermission' | 'isCore'>;

const SEEDS: WorkspaceModuleSeed[] = [
  { moduleKey: 'DASHBOARD', name: 'Tổng quan', path: '/overview', icon: 'layout-dashboard', groupKey: WorkspaceModuleGroup.WORKSPACE, sortOrder: 10, isEnabled: true, requiredPermission: 'DASHBOARD.VIEW', isCore: true },
  { moduleKey: 'MY_REQUESTS', name: 'Phiếu của tôi', path: '/my-requests', icon: 'file-text', groupKey: WorkspaceModuleGroup.WORKSPACE, sortOrder: 20, isEnabled: true, requiredPermission: 'REQUESTS.VIEW_OWN', isCore: false },
  { moduleKey: 'APPROVAL_INBOX', name: 'Chờ phê duyệt', path: '/approval-inbox', icon: 'check-square', groupKey: WorkspaceModuleGroup.WORKSPACE, sortOrder: 30, isEnabled: true, requiredPermission: 'APPROVALS.VIEW_ASSIGNED', isCore: false },
  { moduleKey: 'FORM_BUILDER', name: 'Form Builder', path: '/form-builder', icon: 'file-pen-line', groupKey: WorkspaceModuleGroup.WORKSPACE, sortOrder: 40, isEnabled: true, requiredPermission: 'FORM_BUILDER.VIEW', isCore: false },
  { moduleKey: 'WORKFLOW_BUILDER', name: 'Workflow Builder', path: '/workflow-builder', icon: 'git-branch', groupKey: WorkspaceModuleGroup.WORKSPACE, sortOrder: 50, isEnabled: true, requiredPermission: 'WORKFLOW_BUILDER.VIEW', isCore: false },
  { moduleKey: 'EMPLOYEES', name: 'Nhân viên', path: '/employees', icon: 'contact-round', groupKey: WorkspaceModuleGroup.ADMIN, sortOrder: 10, isEnabled: true, requiredPermission: 'EMPLOYEE.VIEW', isCore: false },
  { moduleKey: 'DEPARTMENTS', name: 'Phòng ban', path: '/departments', icon: 'building-2', groupKey: WorkspaceModuleGroup.ADMIN, sortOrder: 15, isEnabled: true, requiredPermission: 'DEPARTMENT.VIEW', isCore: false },
  { moduleKey: 'JOB_TITLES', name: 'Chức danh', path: '/job-titles', icon: 'briefcase-business', groupKey: WorkspaceModuleGroup.ADMIN, sortOrder: 16, isEnabled: true, requiredPermission: 'JOB_TITLE.VIEW', isCore: false },
  { moduleKey: 'USERS', name: 'Tài khoản người dùng', path: '/users', icon: 'users', groupKey: WorkspaceModuleGroup.ADMIN, sortOrder: 20, isEnabled: true, requiredPermission: 'USER.VIEW', isCore: false },
  { moduleKey: 'ROLE_PERMISSIONS', name: 'Vai trò & phân quyền', path: '/permissions', icon: 'shield-check', groupKey: WorkspaceModuleGroup.ADMIN, sortOrder: 30, isEnabled: true, requiredPermission: 'ROLE.VIEW', isCore: false },
  { moduleKey: 'AUDIT_LOGS', name: 'Nhật ký hệ thống', path: '/audit-logs', icon: 'scroll-text', groupKey: WorkspaceModuleGroup.ADMIN, sortOrder: 40, isEnabled: true, requiredPermission: 'AUDIT_LOG.VIEW', isCore: false },
  { moduleKey: 'WORKSPACE_MODULES', name: 'Quản lý không gian làm việc', path: '/workspace-modules', icon: 'panel-left', groupKey: WorkspaceModuleGroup.ADMIN, sortOrder: 50, isEnabled: true, requiredPermission: 'WORKSPACE_MODULE.VIEW', isCore: true },
];

@Injectable()
export class WorkspaceModulesService implements OnModuleInit {
  constructor(
    @InjectModel(WorkspaceModule.name) private readonly modules: Model<WorkspaceModule>,
    private readonly auditLogs: AuditLogService,
  ) {}

  async onModuleInit() {
    for (const seed of SEEDS) {
      if (!PERMISSION_KEYS.has(seed.requiredPermission)) throw new Error(`Workspace permission is not registered: ${seed.requiredPermission}`);
      const { isEnabled, ...metadata } = seed;
      await this.modules.updateOne(
        { moduleKey: seed.moduleKey },
        { $set: metadata, $setOnInsert: { isEnabled } },
        { upsert: true, runValidators: true },
      ).exec();
    }
  }

  async findEnabled(permissionKeys: readonly string[]) {
    return this.modules.find({ isEnabled: true, requiredPermission: { $in: permissionKeys } })
      .sort({ groupKey: 1, sortOrder: 1, name: 1 }).lean().exec();
  }

  async findAll() {
    return this.modules.find().sort({ groupKey: 1, sortOrder: 1, name: 1 }).lean().exec();
  }

  async update(request: RequestWithContext, moduleKey: string, updateDto: UpdateWorkspaceModuleDto) {
    const normalizedKey = moduleKey.toUpperCase();
    const existing = await this.modules.findOne({ moduleKey: normalizedKey }).exec();
    if (!existing) throw new NotFoundException('Không tìm thấy module.');
    if (existing.isCore && updateDto.isEnabled === false) throw new BadRequestException('Không thể tắt module lõi.');
    const updated = await this.modules.findOneAndUpdate(
      { moduleKey: normalizedKey },
      { $set: updateDto },
      { returnDocument: 'after', runValidators: true },
    ).exec();
    if (!updated) throw new NotFoundException('Không tìm thấy module.');
    await this.auditLogs.record(request, {
      action: 'WORKSPACE_MODULE.UPDATED',
      outcome: AuditOutcome.SUCCESS,
      resource: { type: 'WORKSPACE_MODULE', id: updated.moduleKey, code: updated.moduleKey },
      changes: { before: this.snapshot(existing), after: this.snapshot(updated) },
    });
    return updated.toObject();
  }

  private snapshot(module: WorkspaceModule) {
    return { moduleKey: module.moduleKey, name: module.name, groupKey: module.groupKey, requiredPermission: module.requiredPermission, sortOrder: module.sortOrder, isEnabled: module.isEnabled };
  }
}
