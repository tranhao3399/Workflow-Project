import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { DynamicFormValidatorService } from '../form-definitions/dynamic-form-validator.service.js';
import {
  FormDefinition,
  type FormDefinitionDocument,
  type DefinitionStatus,
} from '../form-definitions/schemas/form-definition.schema.js';
import {
  WorkflowDefinition,
  type WorkflowDefinitionDocument,
} from '../workflow-definitions/schemas/workflow-definition.schema.js';
import {
  DefinitionPackageDto,
  type DefinitionPackagePublishMode,
  PublishDefinitionPackageDto,
} from './dto/definition-package.dto.js';
import { WorkflowGraphValidatorService } from '../workflow-definitions/workflow-graph-validator.service.js';
import { BpmnWorkflowCompilerService } from '../workflow-definitions/bpmn-workflow-compiler.service.js';

type PackageOperation = 'PUBLISH' | 'DEACTIVATE' | 'REACTIVATE' | 'ARCHIVE';

interface DefinitionPair {
  form: FormDefinitionDocument;
  workflow: WorkflowDefinitionDocument;
}

interface PublishAuditContext {
  mode: DefinitionPackagePublishMode;
  previousFormVersion?: number;
  previousWorkflowVersion?: number;
}

@Injectable()
export class DefinitionPublishingService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(FormDefinition.name) private readonly forms: Model<FormDefinition>,
    @InjectModel(WorkflowDefinition.name) private readonly workflows: Model<WorkflowDefinition>,
    private readonly formValidator: DynamicFormValidatorService,
    private readonly bpmnCompiler: BpmnWorkflowCompilerService,
    private readonly workflowValidator: WorkflowGraphValidatorService,
    private readonly auditLogs: AuditLogService,
  ) {}

  publish(request: RequestWithContext, input: PublishDefinitionPackageDto) {
    const actorId = this.actorId(request);
    return this.runInTransaction('PUBLISH', async (session) => {
      const pair = await this.loadPair(input, session);
      const mode = this.resolvePublishMode(pair, input.publishMode);
      this.requirePublishPermissions(request, mode);

      const now = new Date();
      this.formValidator.assertDefinitionValid(pair.form.fields);
      this.prepareForPublish(pair, actorId, now, true, mode);
      await this.validateForPublish(pair);
      const auditContext = mode === 'FULL_PACKAGE'
        ? await this.archivePublishedPackage(pair, actorId, session)
        : await this.archivePublishedWorkflow(pair, actorId, session);

      if (mode === 'FULL_PACKAGE') await pair.form.save({ session });
      await pair.workflow.save({ session });
      await this.recordPackageAudit(request, pair, 'PUBLISH', 'DRAFT', session, {
        mode,
        ...auditContext,
      });
      return this.toResponse(pair, mode);
    });
  }

  deactivate(request: RequestWithContext, input: DefinitionPackageDto) {
    const actorId = this.actorId(request);
    return this.runInTransaction('DEACTIVATE', async (session) => {
      const pair = await this.loadPair(input, session);
      this.requireNotArchived(pair);
      this.requirePairStatus(pair, 'PUBLISHED', 'Chỉ có thể ngưng hoạt động gói đang ở trạng thái PUBLISHED.');
      await this.saveStatus(pair, 'INACTIVE', actorId, session);
      await this.recordPackageAudit(request, pair, 'DEACTIVATE', 'PUBLISHED', session);
      return this.toResponse(pair);
    });
  }

  reactivate(request: RequestWithContext, input: DefinitionPackageDto) {
    const actorId = this.actorId(request);
    return this.runInTransaction('REACTIVATE', async (session) => {
      const pair = await this.loadPair(input, session);
      this.requireNotArchived(pair);
      this.requirePairStatus(pair, 'INACTIVE', 'Chỉ có thể kích hoạt lại gói đang ở trạng thái INACTIVE.');

      const currentForm = await this.forms
        .findOne({ code: pair.form.code, status: 'PUBLISHED', _id: { $ne: pair.form._id } })
        .session(session)
        .lean()
        .exec();
      const currentWorkflow = await this.workflows
        .findOne({ code: pair.workflow.code, status: 'PUBLISHED', _id: { $ne: pair.workflow._id } })
        .session(session)
        .lean()
        .exec();
      if (currentForm || currentWorkflow) {
        throw this.conflict(
          'DEFINITION_PACKAGE_REACTIVATION_CONFLICT',
          'Đã có phiên bản mới hơn đang được xuất bản. Không thể kích hoạt lại gói này.',
        );
      }

      const now = new Date();
      this.formValidator.assertDefinitionValid(pair.form.fields);
      this.prepareForPublish(pair, actorId, now, false);
      await this.validateForPublish(pair);
      await pair.form.save({ session });
      await pair.workflow.save({ session });
      await this.recordPackageAudit(request, pair, 'REACTIVATE', 'INACTIVE', session);
      return this.toResponse(pair);
    });
  }

  archive(request: RequestWithContext, input: DefinitionPackageDto) {
    const actorId = this.actorId(request);
    return this.runInTransaction('ARCHIVE', async (session) => {
      const pair = await this.loadPair(input, session);
      this.requireNotArchived(pair);
      if (pair.form.status !== pair.workflow.status || !['PUBLISHED', 'INACTIVE'].includes(pair.form.status)) {
        throw this.conflict(
          'DEFINITION_PACKAGE_STATE_MISMATCH',
          'Chỉ có thể lưu trữ một gói Form–Workflow đồng bộ ở trạng thái PUBLISHED hoặc INACTIVE.',
        );
      }
      const previousStatus = pair.form.status;
      await this.saveStatus(pair, 'ARCHIVED', actorId, session);
      await this.recordPackageAudit(request, pair, 'ARCHIVE', previousStatus, session);
      return this.toResponse(pair);
    });
  }

  private async loadPair(input: DefinitionPackageDto, session: ClientSession): Promise<DefinitionPair> {
    const form = await this.forms.findById(input.formDefinitionId).session(session).exec();
    if (!form) throw new NotFoundException('Không tìm thấy Form Definition.');
    const workflow = await this.workflows.findById(input.workflowDefinitionId).session(session).exec();
    if (!workflow) throw new NotFoundException('Không tìm thấy Workflow Definition.');
    if (!workflow.formDefinitionId.equals(form._id)) {
      throw this.conflict(
        'DEFINITION_PACKAGE_FORM_MISMATCH',
        'Workflow Definition không trỏ đến Form Definition đã chọn.',
      );
    }
    return { form, workflow };
  }

  private resolvePublishMode(
    pair: DefinitionPair,
    requestedMode?: DefinitionPackagePublishMode,
  ): DefinitionPackagePublishMode {
    const inferredMode = pair.form.status === 'DRAFT' && pair.workflow.status === 'DRAFT'
      ? 'FULL_PACKAGE'
      : pair.form.status === 'PUBLISHED' && pair.workflow.status === 'DRAFT'
        ? 'WORKFLOW_ONLY'
        : undefined;
    if (!inferredMode) {
      throw this.conflict(
        'DEFINITION_PACKAGE_STATE_MISMATCH',
        'Publish chỉ hỗ trợ Form DRAFT + Workflow DRAFT hoặc Form PUBLISHED + Workflow DRAFT.',
      );
    }
    if (requestedMode && requestedMode !== inferredMode) {
      throw this.conflict(
        'DEFINITION_PACKAGE_MODE_MISMATCH',
        `Trạng thái hiện tại chỉ phù hợp với publish mode ${inferredMode}.`,
      );
    }
    return inferredMode;
  }

  private requirePublishPermissions(request: RequestWithContext, mode: DefinitionPackagePublishMode): void {
    const permissions = new Set(request.effectivePermissionKeys ?? request.user?.permissionKeys ?? []);
    if (!permissions.has('WORKFLOW_BUILDER.PUBLISH')) {
      throw new ForbiddenException('Bạn không có quyền công bố Workflow.');
    }
    if (mode === 'FULL_PACKAGE' && !permissions.has('FORM_BUILDER.PUBLISH')) {
      throw new ForbiddenException('Công bố full package yêu cầu thêm quyền công bố Form.');
    }
  }

  private async archivePublishedPackage(
    pair: DefinitionPair,
    actorId: Types.ObjectId,
    session: ClientSession,
  ): Promise<{ previousFormVersion?: number; previousWorkflowVersion?: number }> {
    const currentForm = await this.forms.findOne({
      code: pair.form.code,
      status: 'PUBLISHED',
      _id: { $ne: pair.form._id },
    }).session(session).exec();
    if (!currentForm) {
      const workflowWithSameCode = await this.workflows.findOne({
        code: pair.workflow.code,
        status: 'PUBLISHED',
        _id: { $ne: pair.workflow._id },
      }).session(session).lean().exec();
      if (workflowWithSameCode) {
        throw this.conflict(
          'DEFINITION_PACKAGE_CURRENT_PAIR_INCONSISTENT',
          'Workflow cùng lineage đang PUBLISHED nhưng không tìm thấy Form PUBLISHED tương ứng.',
        );
      }
      return {};
    }

    const currentWorkflow = await this.workflows.findOne({
      formDefinitionId: currentForm._id,
      status: 'PUBLISHED',
      _id: { $ne: pair.workflow._id },
    }).session(session).exec();
    if (!currentWorkflow) {
      throw this.conflict(
        'DEFINITION_PACKAGE_CURRENT_PAIR_INCONSISTENT',
        'Form PUBLISHED hiện tại không có Workflow PUBLISHED tương ứng.',
      );
    }
    const workflowWithSameCode = await this.workflows.findOne({
      code: pair.workflow.code,
      status: 'PUBLISHED',
      _id: { $nin: [pair.workflow._id, currentWorkflow._id] },
    }).session(session).lean().exec();
    if (workflowWithSameCode) {
      throw this.conflict(
        'DEFINITION_PACKAGE_CURRENT_PAIR_INCONSISTENT',
        'Mã Workflow đang PUBLISHED bị ràng buộc với một Form khác.',
      );
    }

    currentForm.status = 'ARCHIVED';
    currentForm.updatedBy = actorId;
    await currentForm.save({ session });
    currentWorkflow.status = 'ARCHIVED';
    currentWorkflow.updatedBy = actorId;
    await currentWorkflow.save({ session });
    return {
      previousFormVersion: currentForm.version,
      previousWorkflowVersion: currentWorkflow.version,
    };
  }

  private async archivePublishedWorkflow(
    pair: DefinitionPair,
    actorId: Types.ObjectId,
    session: ClientSession,
  ): Promise<{ previousFormVersion: number; previousWorkflowVersion: number }> {
    const currentWorkflow = await this.workflows.findOne({
      formDefinitionId: pair.form._id,
      status: 'PUBLISHED',
      _id: { $ne: pair.workflow._id },
    }).session(session).exec();
    if (!currentWorkflow) {
      throw this.conflict(
        'WORKFLOW_ONLY_CURRENT_WORKFLOW_NOT_FOUND',
        'Form PUBLISHED không có Workflow PUBLISHED hiện tại để thay thế.',
      );
    }
    const workflowWithSameCode = await this.workflows.findOne({
      code: pair.workflow.code,
      status: 'PUBLISHED',
      _id: { $nin: [pair.workflow._id, currentWorkflow._id] },
    }).session(session).lean().exec();
    if (workflowWithSameCode) {
      throw this.conflict(
        'WORKFLOW_ONLY_CODE_CONFLICT',
        'Mã Workflow đang PUBLISHED thuộc một Form khác.',
      );
    }

    currentWorkflow.status = 'ARCHIVED';
    currentWorkflow.updatedBy = actorId;
    await currentWorkflow.save({ session });
    return {
      previousFormVersion: pair.form.version,
      previousWorkflowVersion: currentWorkflow.version,
    };
  }

  private requirePairStatus(pair: DefinitionPair, status: DefinitionStatus, message: string): void {
    if (pair.form.status !== status || pair.workflow.status !== status) {
      throw this.conflict('DEFINITION_PACKAGE_STATE_MISMATCH', message);
    }
  }

  private requireNotArchived(pair: DefinitionPair): void {
    if (pair.form.status === 'ARCHIVED' || pair.workflow.status === 'ARCHIVED') {
      throw this.conflict(
        'DEFINITION_PACKAGE_ARCHIVED',
        'Gói Form–Workflow đã được lưu trữ và không thể thay đổi trạng thái.',
      );
    }
  }

  private prepareForPublish(
    pair: DefinitionPair,
    actorId: Types.ObjectId,
    now: Date,
    resetPublication = true,
    mode: DefinitionPackagePublishMode = 'FULL_PACKAGE',
  ): void {
    if (mode === 'FULL_PACKAGE') {
      pair.form.status = 'PUBLISHED';
      pair.form.updatedBy = actorId;
      pair.form.publishedBy = resetPublication || !pair.form.publishedBy ? actorId : pair.form.publishedBy;
      pair.form.publishedAt = resetPublication || !pair.form.publishedAt ? now : pair.form.publishedAt;
    }
    pair.workflow.status = 'PUBLISHED';
    pair.workflow.updatedBy = actorId;
    pair.workflow.publishedBy = resetPublication || !pair.workflow.publishedBy ? actorId : pair.workflow.publishedBy;
    pair.workflow.publishedAt = resetPublication || !pair.workflow.publishedAt ? now : pair.workflow.publishedAt;
  }

  private async validateForPublish(pair: DefinitionPair): Promise<void> {
    try {
      const compiled = this.bpmnCompiler.compileOrThrow(pair.workflow.bpmnXml ?? '', pair.form.fields);
      pair.workflow.startStepKey = compiled.startStepKey;
      pair.workflow.steps = compiled.steps;
      const graphValidation = this.workflowValidator.validate(pair.workflow.startStepKey, pair.workflow.steps, pair.form.fields);
      if (!graphValidation.valid) {
        throw new BadRequestException({
          code: 'WORKFLOW_INVALID',
          message: graphValidation.errors[0]?.message ?? 'Cấu hình Workflow không hợp lệ.',
          field: graphValidation.errors[0]?.path,
        });
      }
      await pair.form.validate();
      await pair.workflow.validate();
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const message = error instanceof Error ? error.message : 'Cấu hình gói định nghĩa không hợp lệ.';
      throw new BadRequestException({ code: 'DEFINITION_PACKAGE_VALIDATION_FAILED', message });
    }
  }

  private async saveStatus(
    pair: DefinitionPair,
    status: DefinitionStatus,
    actorId: Types.ObjectId,
    session: ClientSession,
  ): Promise<void> {
    pair.form.status = status;
    pair.form.updatedBy = actorId;
    await pair.form.save({ session });
    pair.workflow.status = status;
    pair.workflow.updatedBy = actorId;
    await pair.workflow.save({ session });
  }

  private async runInTransaction<T>(operation: PackageOperation, work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      const result = await session.withTransaction(() => work(session));
      if (result === undefined) {
        throw this.conflict('DEFINITION_PACKAGE_TRANSACTION_ABORTED', 'Thao tác gói định nghĩa đã bị hủy.');
      }
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (this.isDuplicateKey(error) || this.isConcurrentTransactionError(error)) {
        throw this.conflict(
          `DEFINITION_PACKAGE_CONCURRENT_${operation}`,
          'Gói định nghĩa vừa được thay đổi bởi một thao tác khác. Vui lòng tải lại dữ liệu và thử lại.',
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private async recordPackageAudit(
    request: RequestWithContext,
    pair: DefinitionPair,
    operation: PackageOperation,
    previousStatus: DefinitionStatus,
    session: ClientSession,
    publishContext?: PublishAuditContext,
  ): Promise<void> {
    const actionByOperation: Record<PackageOperation, string> = {
      PUBLISH: 'DEFINITION_PACKAGE.PUBLISHED',
      DEACTIVATE: 'DEFINITION_PACKAGE.DEACTIVATED',
      REACTIVATE: 'DEFINITION_PACKAGE.REACTIVATED',
      ARCHIVE: 'DEFINITION_PACKAGE.ARCHIVED',
    };
    const descriptionByOperation: Record<PackageOperation, string> = {
      PUBLISH: publishContext?.mode === 'WORKFLOW_ONLY'
        ? 'Đã công bố phiên bản Workflow mới và giữ nguyên Form.'
        : 'Đã xuất bản đồng thời gói Form–Workflow.',
      DEACTIVATE: 'Đã ngưng hoạt động đồng thời gói Form–Workflow.',
      REACTIVATE: 'Đã kích hoạt lại đồng thời gói Form–Workflow.',
      ARCHIVE: 'Đã lưu trữ đồng thời gói Form–Workflow.',
    };
    await this.auditLogs.record(request, {
      action: actionByOperation[operation],
      description: descriptionByOperation[operation],
      outcome: AuditOutcome.SUCCESS,
      resource: {
        type: 'DEFINITION_PACKAGE',
        id: pair.form._id.toString(),
        code: pair.form.code,
        name: pair.form.name,
      },
      changes: {
        before: {
          status: previousStatus,
          formId: pair.form._id.toString(),
          workflowId: pair.workflow._id.toString(),
        },
        after: {
          status: pair.form.status,
          formId: pair.form._id.toString(),
          workflowId: pair.workflow._id.toString(),
        },
      },
      metadata: {
        formDefinitionId: pair.form._id.toString(),
        formVersion: pair.form.version,
        workflowDefinitionId: pair.workflow._id.toString(),
        workflowVersion: pair.workflow.version,
        ...(publishContext ? {
          publishMode: publishContext.mode,
          formVersionBefore: publishContext.previousFormVersion ?? null,
          formVersionAfter: pair.form.version,
          workflowVersionBefore: publishContext.previousWorkflowVersion ?? null,
          workflowVersionAfter: pair.workflow.version,
        } : {}),
      },
    }, session);
  }

  private actorId(request: RequestWithContext): Types.ObjectId {
    const id = request.user?.id;
    if (!id || !Types.ObjectId.isValid(id)) throw new UnauthorizedException('Không thể xác định người dùng hiện tại.');
    return new Types.ObjectId(id);
  }

  private conflict(code: string, message: string): ConflictException {
    return new ConflictException({ code, message });
  }

  private isDuplicateKey(error: unknown): boolean {
    return this.isRecord(error) && error.code === 11000;
  }

  private isConcurrentTransactionError(error: unknown): boolean {
    if (!this.isRecord(error)) return false;
    if (error.code === 112 || error.code === 251) return true;
    const labels = error.errorLabels;
    return Array.isArray(labels) && labels.some((label) =>
      label === 'TransientTransactionError' || label === 'UnknownTransactionCommitResult');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private toResponse(pair: DefinitionPair, publishMode?: DefinitionPackagePublishMode) {
    return {
      status: pair.form.status,
      ...(publishMode ? { publishMode } : {}),
      formDefinition: {
        id: pair.form._id.toString(),
        code: pair.form.code,
        version: pair.form.version,
        status: pair.form.status,
      },
      workflowDefinition: {
        id: pair.workflow._id.toString(),
        code: pair.workflow.code,
        version: pair.workflow.version,
        status: pair.workflow.status,
      },
    };
  }
}
