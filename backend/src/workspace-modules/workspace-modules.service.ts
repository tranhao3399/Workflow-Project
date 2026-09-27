import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { UserRole } from '../users/enums/user-role.enum.js';
import { UpdateWorkspaceModuleDto } from './dto/update-workspace-module.dto.js';
import { WorkspaceModuleGroup } from './enums/workspace-module-group.enum.js';
import { WorkspaceModule } from './schemas/workspace-module.schema.js';

type WorkspaceModuleSeed = Pick<
  WorkspaceModule,
  'moduleKey' | 'name' | 'path' | 'icon' | 'group' | 'sortOrder' | 'isEnabled' | 'visibleToRoles' | 'isCore'
>;

const ALL_ROLES = Object.values(UserRole);

const WORKSPACE_MODULE_SEEDS: WorkspaceModuleSeed[] = [
  { moduleKey: 'DASHBOARD', name: 'Tổng quan', path: '/overview', icon: 'layout-dashboard', group: WorkspaceModuleGroup.WORKSPACE, sortOrder: 10, isEnabled: true, visibleToRoles: ALL_ROLES, isCore: true },
  { moduleKey: 'MY_REQUESTS', name: 'Phiếu của tôi', path: '/my-requests', icon: 'file-text', group: WorkspaceModuleGroup.WORKSPACE, sortOrder: 20, isEnabled: true, visibleToRoles: ALL_ROLES, isCore: false },
  { moduleKey: 'APPROVAL_INBOX', name: 'Chờ phê duyệt', path: '/approval-inbox', icon: 'check-square', group: WorkspaceModuleGroup.WORKSPACE, sortOrder: 30, isEnabled: true, visibleToRoles: [UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.DIRECTOR, UserRole.ADMIN], isCore: false },
  { moduleKey: 'FORM_BUILDER', name: 'Form Builder', path: '/form-builder', icon: 'file-pen-line', group: WorkspaceModuleGroup.WORKSPACE, sortOrder: 40, isEnabled: true, visibleToRoles: [UserRole.ADMIN], isCore: false },
  { moduleKey: 'WORKFLOW_BUILDER', name: 'Workflow Builder', path: '/workflow-builder', icon: 'git-branch', group: WorkspaceModuleGroup.WORKSPACE, sortOrder: 50, isEnabled: true, visibleToRoles: [UserRole.ADMIN], isCore: false },
  { moduleKey: 'EMPLOYEES', name: 'Nhân viên', path: '/employees', icon: 'contact-round', group: WorkspaceModuleGroup.ADMIN, sortOrder: 10, isEnabled: true, visibleToRoles: [UserRole.ADMIN], isCore: false },
  { moduleKey: 'ORGANIZATION', name: 'Cơ cấu tổ chức', path: '/organization', icon: 'building-2', group: WorkspaceModuleGroup.ADMIN, sortOrder: 15, isEnabled: true, visibleToRoles: [UserRole.ADMIN], isCore: false },
  { moduleKey: 'USERS', name: 'Tài khoản người dùng', path: '/users', icon: 'users', group: WorkspaceModuleGroup.ADMIN, sortOrder: 20, isEnabled: true, visibleToRoles: [UserRole.ADMIN], isCore: false },
  { moduleKey: 'ROLE_PERMISSIONS', name: 'Vai trò & phân quyền', path: '/permissions', icon: 'shield-check', group: WorkspaceModuleGroup.ADMIN, sortOrder: 30, isEnabled: true, visibleToRoles: [UserRole.ADMIN], isCore: false },
  { moduleKey: 'AUDIT_LOGS', name: 'Nhật ký hệ thống', path: '/audit-logs', icon: 'scroll-text', group: WorkspaceModuleGroup.ADMIN, sortOrder: 40, isEnabled: true, visibleToRoles: [UserRole.ADMIN], isCore: false },
  { moduleKey: 'WORKSPACE_MODULES', name: 'Quản lý không gian làm việc', path: '/workspace-modules', icon: 'panel-left', group: WorkspaceModuleGroup.ADMIN, sortOrder: 50, isEnabled: true, visibleToRoles: [UserRole.ADMIN], isCore: true },
];

@Injectable()
export class WorkspaceModulesService implements OnModuleInit {
  constructor(
    @InjectModel(WorkspaceModule.name) private readonly workspaceModuleModel: Model<WorkspaceModule>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async onModuleInit(): Promise<void> {
    await Promise.all(WORKSPACE_MODULE_SEEDS.map((module) => this.workspaceModuleModel.updateOne(
      { moduleKey: module.moduleKey },
      { $setOnInsert: module },
      { upsert: true },
    ).exec()));
    await this.workspaceModuleModel.updateOne({ moduleKey: 'ROLE_PERMISSIONS' }, { $set: { name: 'Vai trò & phân quyền' } }).exec();
  }

  async findEnabled() {
    return this.workspaceModuleModel
      .find({ isEnabled: true })
      .sort({ group: 1, sortOrder: 1, name: 1 })
      .lean()
      .exec();
  }

  async findAll() {
    return this.workspaceModuleModel.find().sort({ group: 1, sortOrder: 1, name: 1 }).lean().exec();
  }

  async update(
    request: RequestWithContext,
    moduleKey: string,
    updateDto: UpdateWorkspaceModuleDto,
  ) {
    const normalizedKey = moduleKey.toUpperCase();
    const existing = await this.workspaceModuleModel.findOne({ moduleKey: normalizedKey }).exec();
    if (!existing) throw new NotFoundException('Workspace module not found');

    this.ensureCoreAccess(existing.moduleKey, updateDto);

    const before = this.toAuditSnapshot(existing);
    const updated = await this.workspaceModuleModel.findOneAndUpdate(
      { moduleKey: normalizedKey },
      { $set: updateDto },
      { returnDocument: 'after', runValidators: true },
    ).exec();

    if (!updated) throw new NotFoundException('Workspace module not found');

    await this.auditLogService.record(request, {
      action: 'WORKSPACE_MODULE.UPDATED',
      outcome: AuditOutcome.SUCCESS,
      resource: { type: 'WORKSPACE_MODULE', id: updated.moduleKey },
      changes: { before, after: this.toAuditSnapshot(updated) },
    });

    return updated.toObject();
  }

  private ensureCoreAccess(moduleKey: string, updateDto: UpdateWorkspaceModuleDto): void {
    const isProtected = moduleKey === 'DASHBOARD' || moduleKey === 'WORKSPACE_MODULES';
    if (!isProtected) return;

    if (updateDto.isEnabled === false) {
      throw new BadRequestException(`${moduleKey} cannot be disabled`);
    }
  }

  private toAuditSnapshot(module: WorkspaceModule): Record<string, unknown> {
    return {
      moduleKey: module.moduleKey,
      name: module.name,
      group: module.group,
      sortOrder: module.sortOrder,
      isEnabled: module.isEnabled,
    };
  }
}
