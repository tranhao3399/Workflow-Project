import { HttpException } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { Connection, Model } from 'mongoose';
import { AppModule } from '../src/app.module.js';
import { ApprovalHistory } from '../src/approvals/schemas/approval-history.schema.js';
import { ApprovalTask } from '../src/approvals/schemas/approval-task.schema.js';
import { ApprovalsService } from '../src/approvals/approvals.service.js';
import type { RequestWithContext } from '../src/common/http/request-context.interface.js';
import { DefinitionPublishingService } from '../src/definition-packages/definition-publishing.service.js';
import { Department } from '../src/departments/schemas/department.schema.js';
import { Employee } from '../src/employees/schemas/employee.schema.js';
import { EmploymentType } from '../src/employees/enums/employment-type.enum.js';
import { FilesService } from '../src/files/files.service.js';
import { StoredFile } from '../src/files/schemas/stored-file.schema.js';
import { FILE_STORAGE, type StorageAdapter } from '../src/files/storage/storage-adapter.js';
import { FormDefinition } from '../src/form-definitions/schemas/form-definition.schema.js';
import { Position } from '../src/positions/schemas/position.schema.js';
import { Request } from '../src/requests/schemas/request.schema.js';
import { RequestsService } from '../src/requests/requests.service.js';
import { Role } from '../src/roles/schemas/role.schema.js';
import { User } from '../src/users/schemas/user.schema.js';
import type { SafeUser } from '../src/users/users.service.js';
import { WorkflowDefinition } from '../src/workflow-definitions/schemas/workflow-definition.schema.js';
import { WorkspaceModuleGroup } from '../src/workspace-modules/enums/workspace-module-group.enum.js';
import { WorkspaceModule } from '../src/workspace-modules/schemas/workspace-module.schema.js';

const TEST_MONGODB_URI = process.env.MONGODB_TEST_URI
  ?? 'mongodb://127.0.0.1:27017/workflow_integration_test?replicaSet=rs0';
const TEST_DATABASE_NAME = TEST_MONGODB_URI.match(/\/([^/?]+)(?:\?|$)/)?.[1];

if (!TEST_DATABASE_NAME?.endsWith('_test')) {
  throw new Error('MONGODB_TEST_URI must target a database whose name ends with _test.');
}
process.env.MONGODB_URI = TEST_MONGODB_URI;

const REQUEST_PERMISSIONS = [
  'REQUESTS.VIEW_OWN',
  'REQUESTS.CREATE',
  'REQUESTS.UPDATE_OWN_DRAFT',
  'REQUESTS.SUBMIT',
] as const;
const APPROVAL_PERMISSIONS = [
  'APPROVALS.VIEW_ASSIGNED',
  'APPROVALS.APPROVE_ASSIGNED',
] as const;

interface BusinessFixture {
  requesterUserId: string;
  approverUserId: string;
  outsiderUserId: string;
  requester: SafeUser;
  approver: SafeUser;
  outsider: SafeUser;
  formId: string;
  workflowId: string;
}

describe('Workflow business integration', () => {
  let moduleRef: TestingModule;
  let connection: Connection;
  let requestsService: RequestsService;
  let approvalsService: ApprovalsService;
  let publishingService: DefinitionPublishingService;
  let filesService: FilesService;
  let storage: StorageAdapter;
  let storedKeys: string[];

  const model = <T>(name: string): Model<T> => connection.model<T>(name);

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    requestsService = moduleRef.get(RequestsService, { strict: false });
    approvalsService = moduleRef.get(ApprovalsService, { strict: false });
    publishingService = moduleRef.get(DefinitionPublishingService, { strict: false });
    filesService = moduleRef.get(FilesService, { strict: false });
    storage = moduleRef.get(FILE_STORAGE, { strict: false });

    await connection.dropDatabase();
    await Promise.all(Object.values(connection.models).map((registeredModel) => registeredModel.syncIndexes()));
  });

  beforeEach(async () => {
    storedKeys = [];
    await Promise.all(Object.values(connection.collections).map((collection) => collection.deleteMany({})));
  });

  afterEach(async () => {
    await Promise.all(storedKeys.map((storageKey) => storage.remove(storageKey)));
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await moduleRef.close();
  });

  it('given an active requester and a published Form-Workflow package, when creating and updating a draft, then the draft keeps its owner and stores the new title and form data', async () => {
    const fixture = await seedPublishedFixture();

    const created = await requestsService.create(
      requestContext(fixture.requester, REQUEST_PERMISSIONS, 'POST', '/requests'),
      fixture.requesterUserId,
      { formDefinitionId: fixture.formId },
      REQUEST_PERMISSIONS,
    );
    const updated = await requestsService.update(
      requestContext(fixture.requester, REQUEST_PERMISSIONS, 'PATCH', `/requests/${created.id}`),
      fixture.requesterUserId,
      created.id,
      { title: 'Đề nghị mua thiết bị', formData: { reason: 'Thay thiết bị hỏng' } },
      REQUEST_PERMISSIONS,
    );

    expect(created.status).toBe('DRAFT');
    expect(updated.status).toBe('DRAFT');
    expect(updated.title).toBe('Đề nghị mua thiết bị');
    expect(updated.formData).toEqual({ reason: 'Thay thiết bị hỏng' });
    expect(updated.availableActions).toMatchObject({ canEdit: true, canSubmit: true, canDelete: false });
    const stored = await model<Request>(Request.name).findById(created.id).lean().exec();
    expect(stored?.requesterUserId.toString()).toBe(fixture.requesterUserId);
    expect(stored?.formData).toEqual({ reason: 'Thay thiết bị hỏng' });
  });

  it('given drafts owned by different users, when the requester lists drafts with search, status, sorting and pagination, then only matching owned requests and unchanged pagination metadata are returned', async () => {
    const fixture = await seedPublishedFixture();
    const first = await requestsService.create(
      requestContext(fixture.requester, REQUEST_PERMISSIONS, 'POST', '/requests'),
      fixture.requesterUserId,
      { formDefinitionId: fixture.formId },
      REQUEST_PERMISSIONS,
    );
    const second = await requestsService.create(
      requestContext(fixture.requester, REQUEST_PERMISSIONS, 'POST', '/requests'),
      fixture.requesterUserId,
      { formDefinitionId: fixture.formId },
      REQUEST_PERMISSIONS,
    );
    const outsider = await requestsService.create(
      requestContext(fixture.outsider, REQUEST_PERMISSIONS, 'POST', '/requests'),
      fixture.outsiderUserId,
      { formDefinitionId: fixture.formId },
      REQUEST_PERMISSIONS,
    );
    await Promise.all([
      requestsService.update(
        requestContext(fixture.requester, REQUEST_PERMISSIONS, 'PATCH', `/requests/${first.id}`),
        fixture.requesterUserId,
        first.id,
        { title: 'Mua laptop cho nhân viên' },
        REQUEST_PERMISSIONS,
      ),
      requestsService.update(
        requestContext(fixture.requester, REQUEST_PERMISSIONS, 'PATCH', `/requests/${second.id}`),
        fixture.requesterUserId,
        second.id,
        { title: 'Mua màn hình làm việc' },
        REQUEST_PERMISSIONS,
      ),
      requestsService.update(
        requestContext(fixture.outsider, REQUEST_PERMISSIONS, 'PATCH', `/requests/${outsider.id}`),
        fixture.outsiderUserId,
        outsider.id,
        { title: 'Mua laptop cho người khác' },
        REQUEST_PERMISSIONS,
      ),
    ]);

    const result = await requestsService.findOwn(fixture.requesterUserId, {
      search: 'laptop',
      status: 'DRAFT',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
      page: 1,
      limit: 1,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: first.id, title: 'Mua laptop cho nhân viên', status: 'DRAFT' });
    expect(result.pagination).toMatchObject({ page: 1, limit: 1, total: 1, totalPages: 1 });
  });

  it('given an owned valid draft and an eligible manager, when the requester submits, then the request becomes IN_PROGRESS and one pending task plus SUBMITTED history are committed', async () => {
    const fixture = await seedPublishedFixture();
    const submitted = await createSubmittedRequest(fixture);

    const stored = await model<Request>(Request.name).findById(submitted.requestId).lean().exec();
    const tasks = await model<ApprovalTask>(ApprovalTask.name).find({ requestId: submitted.requestId }).lean().exec();
    const histories = await model<ApprovalHistory>(ApprovalHistory.name)
      .find({ requestId: submitted.requestId })
      .sort({ sequenceNo: 1 })
      .lean()
      .exec();

    expect(stored?.status).toBe('IN_PROGRESS');
    expect(stored?.currentStepKey).toBe('MANAGER_APPROVAL');
    expect(stored?.workflowSnapshot).toBeDefined();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe('PENDING');
    expect(tasks[0].assigneeUserId.toString()).toBe(fixture.approverUserId);
    expect(histories.map((item) => item.action)).toEqual(expect.arrayContaining(['CREATED', 'SUBMITTED', 'ASSIGNED']));
  });

  it('given a draft owned by another user, when a non-owner updates or submits it, then both actions return 404 and the draft remains unchanged', async () => {
    const fixture = await seedPublishedFixture();
    const created = await requestsService.create(
      requestContext(fixture.requester, REQUEST_PERMISSIONS, 'POST', '/requests'),
      fixture.requesterUserId,
      { formDefinitionId: fixture.formId },
      REQUEST_PERMISSIONS,
    );

    await expect(requestsService.update(
      requestContext(fixture.outsider, REQUEST_PERMISSIONS, 'PATCH', `/requests/${created.id}`),
      fixture.outsiderUserId,
      created.id,
      { title: 'Unauthorized change' },
      REQUEST_PERMISSIONS,
    )).rejects.toMatchObject({ status: 404 });
    await expect(requestsService.submit(
      requestContext(fixture.outsider, REQUEST_PERMISSIONS, 'POST', `/requests/${created.id}/submit`),
      fixture.outsiderUserId,
      created.id,
      REQUEST_PERMISSIONS,
    )).rejects.toMatchObject({ status: 404 });
    const stored = await model<Request>(Request.name).findById(created.id).lean().exec();
    expect(stored?.status).toBe('DRAFT');
    expect(stored?.title).toBe('Phiếu đề nghị thiết bị');
    expect(stored?.historySequence).toBe(1);
  });

  it.each([
    {
      label: 'approves',
      expectedTaskStatus: 'APPROVED',
      expectedRequestStatus: 'APPROVED',
      act: (fixture: BusinessFixture, taskId: string) => approvalsService.approve(
        requestContext(fixture.approver, APPROVAL_PERMISSIONS, 'POST', `/approvals/tasks/${taskId}/approve`),
        fixture.approverUserId,
        taskId,
        'Đồng ý',
        APPROVAL_PERMISSIONS,
      ),
    },
    {
      label: 'rejects',
      expectedTaskStatus: 'REJECTED',
      expectedRequestStatus: 'REJECTED',
      act: (fixture: BusinessFixture, taskId: string) => approvalsService.reject(
        requestContext(fixture.approver, APPROVAL_PERMISSIONS, 'POST', `/approvals/tasks/${taskId}/reject`),
        fixture.approverUserId,
        taskId,
        'Không đáp ứng yêu cầu',
        APPROVAL_PERMISSIONS,
      ),
    },
    {
      label: 'requests revision for',
      expectedTaskStatus: 'REVISION_REQUESTED',
      expectedRequestStatus: 'REVISION_REQUESTED',
      act: (fixture: BusinessFixture, taskId: string) => approvalsService.requestRevision(
        requestContext(fixture.approver, APPROVAL_PERMISSIONS, 'POST', `/approvals/tasks/${taskId}/request-revision`),
        fixture.approverUserId,
        taskId,
        'Vui lòng bổ sung báo giá',
        APPROVAL_PERMISSIONS,
      ),
    },
  ])('given a pending task assigned to an eligible approver, when the approver $label the request, then the task and request are committed with the matching terminal or revision state', async ({ expectedTaskStatus, expectedRequestStatus, act }) => {
    const fixture = await seedPublishedFixture();
    const submitted = await createSubmittedRequest(fixture);

    await act(fixture, submitted.taskId);

    const [task, request, histories] = await Promise.all([
      model<ApprovalTask>(ApprovalTask.name).findById(submitted.taskId).lean().exec(),
      model<Request>(Request.name).findById(submitted.requestId).lean().exec(),
      model<ApprovalHistory>(ApprovalHistory.name).find({ requestId: submitted.requestId }).lean().exec(),
    ]);
    expect(task?.status).toBe(expectedTaskStatus);
    expect(request?.status).toBe(expectedRequestStatus);
    expect(histories.some((item) => item.action === expectedTaskStatus)).toBe(true);
  });

  it('given one pending approval task, when two requests approve it concurrently, then exactly one succeeds and the other returns 409 TASK_ALREADY_PROCESSED without duplicate decision history', async () => {
    const fixture = await seedPublishedFixture();
    const submitted = await createSubmittedRequest(fixture);
    const action = () => approvalsService.approve(
      requestContext(fixture.approver, APPROVAL_PERMISSIONS, 'POST', `/approvals/tasks/${submitted.taskId}/approve`),
      fixture.approverUserId,
      submitted.taskId,
      undefined,
      APPROVAL_PERMISSIONS,
    );

    const results = await Promise.allSettled([action(), action()]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(rejected).toBeDefined();
    expect(httpErrorDetails(rejected?.reason)).toMatchObject({ status: 409, code: 'TASK_ALREADY_PROCESSED' });
    const decisionCount = await model<ApprovalHistory>(ApprovalHistory.name).countDocuments({
      requestId: submitted.requestId,
      action: 'APPROVED',
    });
    expect(decisionCount).toBe(1);
  });

  it('given valid DRAFT Form and Workflow definitions, when an authorized admin publishes the package, then both definitions are published atomically with compiled steps', async () => {
    const fixture = await seedPublishedFixture();
    const draftPair = await createDraftDefinitionPair(fixture, validBpmnXml());
    const context = requestContext(
      fixture.requester,
      ['FORM_BUILDER.PUBLISH', 'WORKFLOW_BUILDER.PUBLISH'],
      'POST',
      '/definition-packages/publish',
    );

    const result = await publishingService.publish(context, {
      formDefinitionId: draftPair.formId,
      workflowDefinitionId: draftPair.workflowId,
    });

    const [form, workflow] = await Promise.all([
      model<FormDefinition>(FormDefinition.name).findById(draftPair.formId).lean().exec(),
      model<WorkflowDefinition>(WorkflowDefinition.name).findById(draftPair.workflowId).lean().exec(),
    ]);
    expect(result.status).toBe('PUBLISHED');
    expect(form?.status).toBe('PUBLISHED');
    expect(workflow?.status).toBe('PUBLISHED');
    expect(workflow?.startStepKey).toBe('MANAGER_APPROVAL');
    expect(workflow?.steps.map((step) => step.stepKey)).toEqual([
      'MANAGER_APPROVAL',
      'APPROVED_END',
      'REJECTED_END',
    ]);
  });

  it('given an invalid BPMN Workflow in a DRAFT package, when an authorized admin publishes it, then publication is rejected and both definitions remain DRAFT', async () => {
    const fixture = await seedPublishedFixture();
    const draftPair = await createDraftDefinitionPair(fixture, '<invalid-bpmn />');
    const context = requestContext(
      fixture.requester,
      ['FORM_BUILDER.PUBLISH', 'WORKFLOW_BUILDER.PUBLISH'],
      'POST',
      '/definition-packages/publish',
    );

    const attempt = publishingService.publish(context, {
      formDefinitionId: draftPair.formId,
      workflowDefinitionId: draftPair.workflowId,
    });

    await expect(attempt).rejects.toBeInstanceOf(HttpException);
    await expect(attempt).rejects.toMatchObject({ status: 400 });
    const [form, workflow] = await Promise.all([
      model<FormDefinition>(FormDefinition.name).findById(draftPair.formId).lean().exec(),
      model<WorkflowDefinition>(WorkflowDefinition.name).findById(draftPair.workflowId).lean().exec(),
    ]);
    expect(form?.status).toBe('DRAFT');
    expect(workflow?.status).toBe('DRAFT');
  });

  it('given an attached private request file, when its owner views and downloads it but an unrelated user tries the same actions, then only the owner receives metadata and bytes', async () => {
    const fixture = await seedPublishedFixture();
    const draft = await requestsService.create(
      requestContext(fixture.requester, REQUEST_PERMISSIONS, 'POST', '/requests'),
      fixture.requesterUserId,
      { formDefinitionId: fixture.formId },
      REQUEST_PERMISSIONS,
    );
    const contents = Buffer.from('%PDF-1.4 integration file');
    const storedBlob = await storage.store({ buffer: contents, extension: 'pdf' });
    storedKeys.push(storedBlob.storageKey);
    const file = await model<StoredFile>(StoredFile.name).create({
      storageProvider: storedBlob.storageProvider,
      storageKey: storedBlob.storageKey,
      originalName: 'quotation.pdf',
      detectedMimeType: 'application/pdf',
      extension: '.pdf',
      sizeBytes: contents.length,
      sha256: createHash('sha256').update(contents).digest('hex'),
      uploadedByUserId: fixture.requesterUserId,
      ownerType: 'REQUEST',
      ownerId: draft.id,
      fieldKey: 'attachment',
      status: 'ATTACHED',
      scanStatus: 'SKIPPED',
      attachedAt: new Date(),
    });

    const metadata = await filesService.getMetadata(file._id.toString(), fixture.requester, REQUEST_PERMISSIONS);
    const binary = await filesService.open(file._id.toString(), fixture.requester, REQUEST_PERMISSIONS, false);
    const downloaded = await readStream(binary.stream);

    expect(metadata.originalName).toBe('quotation.pdf');
    expect(downloaded.equals(contents)).toBe(true);
    await expect(filesService.getMetadata(file._id.toString(), fixture.outsider, []))
      .rejects.toMatchObject({ status: 403 });
    await expect(filesService.open(file._id.toString(), fixture.outsider, [], false))
      .rejects.toMatchObject({ status: 403 });
  });

  async function seedPublishedFixture(): Promise<BusinessFixture> {
    const roles = model<Role>(Role.name);
    const departments = model<Department>(Department.name);
    const positions = model<Position>(Position.name);
    const employees = model<Employee>(Employee.name);
    const users = model<User>(User.name);

    const [requesterRole, approverRole] = await roles.create([
      {
        key: 'REQUESTER',
        name: 'Người gửi phiếu',
        nameNormalized: 'nguoi gui phieu',
        permissionKeys: [...REQUEST_PERMISSIONS],
        isSystem: false,
        isActive: true,
      },
      {
        key: 'APPROVER',
        name: 'Người phê duyệt',
        nameNormalized: 'nguoi phe duyet',
        permissionKeys: [...APPROVAL_PERMISSIONS],
        isSystem: false,
        isActive: true,
      },
    ]);
    const department = await departments.create({
      code: 'OPERATIONS',
      name: 'Vận hành',
      nameNormalized: 'van hanh',
      isActive: true,
      sortOrder: 1,
    });
    const [staffPosition, managerPosition] = await positions.create([
      { code: 'STAFF', name: 'Nhân viên', nameNormalized: 'nhan vien', isActive: true, sortOrder: 1 },
      { code: 'MANAGER', name: 'Quản lý', nameNormalized: 'quan ly', isActive: true, sortOrder: 2 },
    ]);
    const approverEmployee = await employees.create({
      employeeCode: 'EMP-MANAGER',
      fullName: 'Nguyễn Quản Lý',
      fullNameNormalized: 'nguyen quan ly',
      workEmail: 'manager@nexasport.test',
      departmentId: department._id,
      positionId: managerPosition._id,
      employmentType: EmploymentType.FULL_TIME,
      isActive: true,
    });
    const requesterEmployee = await employees.create({
      employeeCode: 'EMP-REQUESTER',
      fullName: 'Trần Nhân Viên',
      fullNameNormalized: 'tran nhan vien',
      workEmail: 'requester@nexasport.test',
      departmentId: department._id,
      positionId: staffPosition._id,
      managerId: approverEmployee._id,
      employmentType: EmploymentType.FULL_TIME,
      isActive: true,
    });
    const outsiderEmployee = await employees.create({
      employeeCode: 'EMP-OUTSIDER',
      fullName: 'Lê Người Ngoài',
      fullNameNormalized: 'le nguoi ngoai',
      workEmail: 'outsider@nexasport.test',
      departmentId: department._id,
      positionId: staffPosition._id,
      employmentType: EmploymentType.FULL_TIME,
      isActive: true,
    });
    const [requesterUser, approverUser, outsiderUser] = await users.create([
      {
        displayName: requesterEmployee.fullName,
        email: requesterEmployee.workEmail,
        passwordHash: 'integration-test-hash',
        roleIds: [requesterRole._id],
        employeeId: requesterEmployee._id,
        isActive: true,
        failedLoginCount: 0,
        passwordChangedAt: new Date(),
      },
      {
        displayName: approverEmployee.fullName,
        email: approverEmployee.workEmail,
        passwordHash: 'integration-test-hash',
        roleIds: [approverRole._id],
        employeeId: approverEmployee._id,
        isActive: true,
        failedLoginCount: 0,
        passwordChangedAt: new Date(),
      },
      {
        displayName: outsiderEmployee.fullName,
        email: outsiderEmployee.workEmail,
        passwordHash: 'integration-test-hash',
        roleIds: [requesterRole._id],
        employeeId: outsiderEmployee._id,
        isActive: true,
        failedLoginCount: 0,
        passwordChangedAt: new Date(),
      },
    ]);
    await model<WorkspaceModule>(WorkspaceModule.name).create({
      moduleKey: 'MY_REQUESTS',
      name: 'Phiếu của tôi',
      path: '/my-requests',
      icon: 'file-text',
      groupKey: WorkspaceModuleGroup.WORKSPACE,
      sortOrder: 1,
      isEnabled: true,
      requiredPermission: 'REQUESTS.VIEW_OWN',
      isCore: false,
    });
    const form = await model<FormDefinition>(FormDefinition.name).create({
      code: 'EQUIPMENT_REQUEST',
      version: 1,
      name: 'Phiếu đề nghị thiết bị',
      status: 'PUBLISHED',
      fields: [
        {
          key: 'reason',
          label: 'Lý do',
          type: 'TEXT',
          required: true,
          order: 1,
          validation: { minLength: 2, maxLength: 300 },
        },
        {
          key: 'attachment',
          label: 'Chứng từ',
          type: 'FILE',
          required: false,
          order: 2,
          fileConfig: {
            multiple: true,
            allowedMimeTypes: ['application/pdf'],
            maxFileSizeBytes: 1_048_576,
            maxFiles: 3,
          },
        },
      ],
      settings: { allowSaveDraft: true, allowCancelAfterSubmit: true },
      createdBy: requesterUser._id,
      publishedBy: requesterUser._id,
      publishedAt: new Date(),
    });
    const workflow = await model<WorkflowDefinition>(WorkflowDefinition.name).create({
      code: 'EQUIPMENT_APPROVAL',
      version: 1,
      name: 'Quy trình duyệt thiết bị',
      formDefinitionId: form._id,
      status: 'PUBLISHED',
      bpmnXml: validBpmnXml(),
      startStepKey: 'MANAGER_APPROVAL',
      steps: runtimeSteps(),
      createdBy: requesterUser._id,
      publishedBy: requesterUser._id,
      publishedAt: new Date(),
    });

    return {
      requesterUserId: requesterUser._id.toString(),
      approverUserId: approverUser._id.toString(),
      outsiderUserId: outsiderUser._id.toString(),
      requester: safeUser(requesterUser._id.toString(), requesterEmployee, REQUEST_PERMISSIONS),
      approver: safeUser(approverUser._id.toString(), approverEmployee, APPROVAL_PERMISSIONS),
      outsider: safeUser(outsiderUser._id.toString(), outsiderEmployee, REQUEST_PERMISSIONS),
      formId: form._id.toString(),
      workflowId: workflow._id.toString(),
    };
  }

  async function createSubmittedRequest(fixture: BusinessFixture): Promise<{ requestId: string; taskId: string }> {
    const created = await requestsService.create(
      requestContext(fixture.requester, REQUEST_PERMISSIONS, 'POST', '/requests'),
      fixture.requesterUserId,
      { formDefinitionId: fixture.formId },
      REQUEST_PERMISSIONS,
    );
    await requestsService.update(
      requestContext(fixture.requester, REQUEST_PERMISSIONS, 'PATCH', `/requests/${created.id}`),
      fixture.requesterUserId,
      created.id,
      { formData: { reason: 'Cần thay thiết bị làm việc' } },
      REQUEST_PERMISSIONS,
    );
    await requestsService.submit(
      requestContext(fixture.requester, REQUEST_PERMISSIONS, 'POST', `/requests/${created.id}/submit`),
      fixture.requesterUserId,
      created.id,
      REQUEST_PERMISSIONS,
    );
    const task = await model<ApprovalTask>(ApprovalTask.name).findOne({ requestId: created.id }).lean().exec();
    if (!task) throw new Error('Expected submit to create an approval task.');
    return { requestId: created.id, taskId: task._id.toString() };
  }

  async function createDraftDefinitionPair(
    fixture: BusinessFixture,
    bpmnXml: string,
  ): Promise<{ formId: string; workflowId: string }> {
    const sourceForm = await model<FormDefinition>(FormDefinition.name).findById(fixture.formId).lean().exec();
    if (!sourceForm) throw new Error('Published source form was not found.');
    const form = await model<FormDefinition>(FormDefinition.name).create({
      code: sourceForm.code,
      version: 2,
      previousVersionId: sourceForm._id,
      name: sourceForm.name,
      status: 'DRAFT',
      fields: sourceForm.fields,
      settings: sourceForm.settings,
      createdBy: fixture.requesterUserId,
    });
    const workflow = await model<WorkflowDefinition>(WorkflowDefinition.name).create({
      code: 'EQUIPMENT_APPROVAL',
      version: 2,
      previousVersionId: fixture.workflowId,
      name: 'Quy trình duyệt thiết bị v2',
      formDefinitionId: form._id,
      status: 'DRAFT',
      bpmnXml,
      startStepKey: 'MANAGER_APPROVAL',
      steps: runtimeSteps(),
      createdBy: fixture.requesterUserId,
    });
    return { formId: form._id.toString(), workflowId: workflow._id.toString() };
  }
});

function runtimeSteps() {
  return [
    {
      stepKey: 'MANAGER_APPROVAL',
      name: 'Quản lý phê duyệt',
      type: 'APPROVAL' as const,
      approvalMode: 'ANY' as const,
      allowSelfApproval: false,
      assigneeRule: { type: 'REQUESTER_DIRECT_MANAGER' as const, includeInactive: false },
      onApproveStepKey: 'APPROVED_END',
      onRejectStepKey: 'REJECTED_END',
    },
    { stepKey: 'APPROVED_END', name: 'Đã duyệt', type: 'END' as const, endResult: 'APPROVED' as const },
    { stepKey: 'REJECTED_END', name: 'Từ chối', type: 'END' as const, endResult: 'REJECTED' as const },
  ];
}

function validBpmnXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:wf="https://workflow-erp.local/schema/bpmn/1.0" id="Definitions_1" targetNamespace="https://workflow-erp.local/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_1"><bpmn:outgoing>Flow_Start</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="Task_Manager" name="Quản lý phê duyệt">
      <bpmn:extensionElements><wf:approval stepKey="MANAGER_APPROVAL" approvalMode="ANY" allowSelfApproval="false" assigneeRuleType="REQUESTER_DIRECT_MANAGER" includeInactive="false" approveFlow="Flow_Approve" rejectFlow="Flow_Reject" /></bpmn:extensionElements>
      <bpmn:incoming>Flow_Start</bpmn:incoming><bpmn:outgoing>Flow_Approve</bpmn:outgoing><bpmn:outgoing>Flow_Reject</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="End_Approved" name="Đã duyệt">
      <bpmn:extensionElements><wf:end stepKey="APPROVED_END" endResult="APPROVED" /></bpmn:extensionElements>
      <bpmn:incoming>Flow_Approve</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="End_Rejected" name="Từ chối">
      <bpmn:extensionElements><wf:end stepKey="REJECTED_END" endResult="REJECTED" /></bpmn:extensionElements>
      <bpmn:incoming>Flow_Reject</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_Start" sourceRef="Start_1" targetRef="Task_Manager" />
    <bpmn:sequenceFlow id="Flow_Approve" sourceRef="Task_Manager" targetRef="End_Approved" />
    <bpmn:sequenceFlow id="Flow_Reject" sourceRef="Task_Manager" targetRef="End_Rejected" />
  </bpmn:process>
</bpmn:definitions>`;
}

function safeUser(
  id: string,
  employee: Employee & { _id: { toString(): string } },
  permissions: readonly string[],
): SafeUser {
  const now = new Date();
  return {
    id,
    fullName: employee.fullName,
    email: employee.workEmail,
    role: 'USER',
    roles: ['USER'],
    department: 'Vận hành',
    isActive: true,
    employeeId: employee._id.toString(),
    employeeCode: employee.employeeCode,
    position: 'Nhân viên',
    permissionKeys: [...permissions],
    createdAt: now,
    updatedAt: now,
  };
}

function requestContext(
  user: SafeUser,
  permissions: readonly string[],
  method: string,
  originalUrl: string,
): RequestWithContext {
  return {
    user,
    effectivePermissionKeys: [...permissions],
    requestId: `integration-${Date.now()}-${Math.random()}`,
    method,
    originalUrl,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'vitest-integration' },
  } as RequestWithContext;
}

function httpErrorDetails(error: unknown): { status?: number; code?: unknown } {
  if (!(error instanceof HttpException)) return {};
  const response = error.getResponse();
  return {
    status: error.getStatus(),
    code: typeof response === 'object' && response !== null && 'code' in response
      ? response.code
      : undefined,
  };
}

async function readStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}
