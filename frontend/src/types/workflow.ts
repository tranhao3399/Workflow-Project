export const definitionStatuses = ['DRAFT', 'PUBLISHED', 'INACTIVE', 'ARCHIVED'] as const
export type DefinitionStatus = (typeof definitionStatuses)[number]

export const formFieldTypes = [
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'CURRENCY',
  'EMAIL',
  'PHONE',
  'DATE',
  'DATETIME',
  'SELECT',
  'MULTI_SELECT',
  'RADIO',
  'CHECKBOX',
  'BOOLEAN',
  'FILE',
] as const
export type FormFieldType = (typeof formFieldTypes)[number]

export const conditionOperators = ['EQUALS', 'NOT_EQUALS', 'IN', 'GREATER_THAN', 'LESS_THAN'] as const
export type ConditionOperator = (typeof conditionOperators)[number]

export interface FormFieldOption {
  value: string
  label: string
  order: number
  isActive?: boolean
}

export interface FormFieldValidation {
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  errorMessage?: string
}

export interface FormFieldVisibilityCondition {
  fieldKey: string
  operator: ConditionOperator
  value: unknown
}

export interface FormFileConfig {
  multiple: boolean
  allowedMimeTypes: string[]
  maxFileSizeBytes: number
  maxFiles: number
}

export interface FormField {
  key: string
  label: string
  type: FormFieldType
  required: boolean
  order: number
  placeholder?: string
  helpText?: string
  defaultValue?: unknown
  options?: FormFieldOption[]
  validation?: FormFieldValidation
  visibilityCondition?: FormFieldVisibilityCondition
  layout?: Record<string, unknown>
  fileConfig?: FormFileConfig
}

export interface DynamicFormValidationError {
  fieldKey: string
  code: string
  message: string
}

export interface DynamicFormValidationResult {
  valid: boolean
  errors: DynamicFormValidationError[]
}

export interface FormSettings {
  allowSaveDraft?: boolean
  allowCancelAfterSubmit?: boolean
  titleTemplate?: string
  instructions?: string
}

export interface FormDefinition {
  id: string
  code: string
  version: number
  name: string
  description?: string
  status: DefinitionStatus
  fields: FormField[]
  settings: FormSettings
  previousVersionId?: string
  updatedBy?: { id: string; name: string }
  createdAt: string
  updatedAt: string
}

export type FormDefinitionSnapshot = Pick<FormDefinition, 'id' | 'code' | 'version' | 'name' | 'fields' | 'settings'>

export const workflowStepTypes = ['APPROVAL', 'CONDITION', 'END'] as const
export type WorkflowStepType = (typeof workflowStepTypes)[number]
export const workflowEndResults = ['APPROVED', 'REJECTED'] as const
export type WorkflowEndResult = (typeof workflowEndResults)[number]
export const approvalModes = ['ANY', 'ALL', 'MAJORITY'] as const
export type ApprovalMode = (typeof approvalModes)[number]
export const assigneeRuleTypes = [
  'REQUESTER_DIRECT_MANAGER',
  'REQUESTER_DEPARTMENT_MANAGER',
  'ROLE',
  'ROLE_IN_REQUESTER_DEPARTMENT',
  'POSITION_IN_REQUESTER_DEPARTMENT',
  'SPECIFIC_USER',
] as const
export type AssigneeRuleType = (typeof assigneeRuleTypes)[number]
export const workflowConditionSources = ['FORM_FIELD', 'REQUESTER_ATTRIBUTE'] as const
export type WorkflowConditionSource = (typeof workflowConditionSources)[number]

export interface WorkflowAssigneeRule {
  type: AssigneeRuleType
  roleIds?: string[]
  positionIds?: string[]
  userIds?: string[]
  departmentId?: string
  includeInactive: boolean
}

export interface WorkflowCondition {
  source: WorkflowConditionSource
  fieldKey: string
  operator: ConditionOperator
  value: unknown
}

export interface WorkflowStep {
  stepKey: string
  name: string
  type: WorkflowStepType
  uiPosition?: { x: number; y: number }
  assigneeRule?: WorkflowAssigneeRule
  approvalMode?: ApprovalMode
  allowSelfApproval?: boolean
  dueInHours?: number
  condition?: WorkflowCondition
  endResult?: WorkflowEndResult
  onApproveStepKey?: string
  onRejectStepKey?: string
  onRevisionStepKey?: string
  onTrueStepKey?: string
  onFalseStepKey?: string
}

export interface WorkflowDefinition {
  id: string
  code: string
  version: number
  revision: number
  previousVersionId?: string
  name: string
  description?: string
  formDefinitionId: string
  formDefinition?: Pick<FormDefinition, 'id' | 'code' | 'name' | 'version' | 'status'>
  status: DefinitionStatus
  bpmnXml?: string
  startStepKey: string
  steps: WorkflowStep[]
  createdBy: string
  updatedBy?: string
  publishedBy?: string
  publishedAt?: string
  createdAt: string
  updatedAt: string
}

export interface WorkflowGraphValidationError {
  code: string
  path: string
  stepKey?: string
  elementId?: string
  message: string
}

export interface WorkflowGraphValidationResult {
  valid: boolean
  errors: WorkflowGraphValidationError[]
}

export interface WorkflowBuilderReferenceData {
  roles: Array<{ id: string; key: string; name: string }>
  positions: Array<{ id: string; code: string; name: string }>
  users: Array<{ id: string; name: string; email: string; employeeCode?: string }>
}

export type WorkflowDefinitionSnapshot = Pick<WorkflowDefinition, 'id' | 'code' | 'version' | 'name' | 'startStepKey' | 'steps'>

export const requestStatuses = [
  'DRAFT',
  'IN_PROGRESS',
  'REVISION_REQUESTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'VOIDED',
] as const
export type RequestStatus = (typeof requestStatuses)[number]
export const requestStatus = {
  draft: 'DRAFT',
  inProgress: 'IN_PROGRESS',
  revisionRequested: 'REVISION_REQUESTED',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  cancelled: 'CANCELLED',
  voided: 'VOIDED',
} as const satisfies Record<string, RequestStatus>

export interface RequesterSnapshot {
  employeeCode: string
  fullName: string
  departmentId: string
  departmentName: string
  positionId: string
  positionName: string
  managerEmployeeId?: string
}

export interface RequestSnapshot {
  requester: RequesterSnapshot
  form?: FormDefinitionSnapshot
  workflow?: WorkflowDefinitionSnapshot
}

export interface AvailableActions {
  canEdit: boolean
  canSubmit: boolean
  canResubmit: boolean
  canCancel: boolean
  canApprove: boolean
  canReject: boolean
  canRequestRevision: boolean
  canVoid: boolean
  canDelete: boolean
  canRecreate: boolean
}

export type RequestDefinitionVersionStatus = 'CURRENT' | 'OUTDATED' | 'SNAPSHOT_LOCKED'

export interface RequestDefinitionSummary {
  id: string
  code: string
  name: string
  version: number
}

export interface RequestDefinitionVersion {
  status: RequestDefinitionVersionStatus
  currentForm?: RequestDefinitionSummary
  currentWorkflow?: RequestDefinitionSummary
}

export type DraftMigrationReviewReason =
  | 'FILE_REUPLOAD_REQUIRED'
  | 'FIELD_REMOVED'
  | 'TYPE_CHANGED'
  | 'VALUE_INVALID'
  | 'REQUIRED_VALUE_MISSING'

export interface DraftMigrationReviewItem {
  fieldKey: string
  label: string
  reason: DraftMigrationReviewReason
  message: string
}

export interface RecreateDraftResult {
  request: Request
  migration: {
    copiedFieldKeys: string[]
    reviewItems: DraftMigrationReviewItem[]
  }
}

export interface RequestSummary {
  id: string
  requestNo: string
  title: string
  status: RequestStatus
  formDefinitionId: string
  formVersion: number
  form?: { id: string; code: string; name: string; version: number }
  requesterUserId: string
  requesterSnapshot: RequesterSnapshot
  submittedAt?: string
  completedAt?: string
  currentStepKey?: string
  currentStepName?: string
  createdAt: string
  updatedAt: string
}

export interface Request extends RequestSummary {
  workflowDefinitionId: string
  workflowVersion: number
  formData: Record<string, unknown>
  formSnapshot?: FormDefinitionSnapshot
  workflowSnapshot?: WorkflowDefinitionSnapshot
  currentStepKey?: string
  currentStepRunNo?: number
  revisionRound: number
  historySequence: number
  cancelledAt?: string
  cancelReason?: string
  voidedAt?: string
  voidReason?: string
  currentApprovalTaskId?: string
  definitionVersion: RequestDefinitionVersion
  availableActions: AvailableActions
}

export type WorkflowRequest = Request

export interface AvailableFormDefinition {
  id: string
  code: string
  version: number
  name: string
  description?: string
  category?: string
  icon?: string
  fields: FormField[]
  settings: FormSettings
  workflow: Pick<WorkflowDefinition, 'id' | 'code' | 'version'>
}

export interface DefinitionPackageInput {
  formDefinitionId: string
  workflowDefinitionId: string
}

export const definitionPackagePublishModes = ['FULL_PACKAGE', 'WORKFLOW_ONLY'] as const
export type DefinitionPackagePublishMode = (typeof definitionPackagePublishModes)[number]

export interface PublishDefinitionPackageInput extends DefinitionPackageInput {
  publishMode?: DefinitionPackagePublishMode
}

export interface DefinitionPackageItem {
  id: string
  code: string
  version: number
  status: DefinitionStatus
}

export interface DefinitionPackage {
  status: DefinitionStatus
  publishMode?: DefinitionPackagePublishMode
  formDefinition: DefinitionPackageItem
  workflowDefinition: DefinitionPackageItem
}

export const approvalTaskStatuses = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'REVISION_REQUESTED',
  'CANCELLED',
  'SKIPPED',
  'EXPIRED',
] as const
export type ApprovalTaskStatus = (typeof approvalTaskStatuses)[number]
export const approvalTaskStatus = {
  pending: 'PENDING',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  revisionRequested: 'REVISION_REQUESTED',
  cancelled: 'CANCELLED',
  skipped: 'SKIPPED',
  expired: 'EXPIRED',
} as const satisfies Record<string, ApprovalTaskStatus>

export interface ApprovalActorSnapshot {
  fullName?: string
  employeeCode?: string
  departmentName?: string
  positionName?: string
}

export interface ApprovalRequestSummary {
  id: string
  requestNo: string
  title: string
  status: RequestStatus
  requesterSnapshot: RequesterSnapshot
  submittedAt?: string
  form?: { id?: string; code?: string; name?: string; version: number }
  formData?: Record<string, unknown>
  formSnapshot?: FormDefinitionSnapshot
}

export interface ApprovalTaskActions {
  canApprove: boolean
  canReject: boolean
  canRequestRevision: boolean
  canReassign: boolean
}

export interface ApprovalTask {
  id: string
  requestId: string
  stepKey: string
  stepName: string
  stepRunNo: number
  assigneeUserId: string
  assigneeSnapshot: ApprovalActorSnapshot & { fullName: string }
  approvalMode: ApprovalMode
  requiredApprovals: number
  revisionRound: number
  status: ApprovalTaskStatus
  assignedAt: string
  dueAt?: string
  actedAt?: string
  decisionComment?: string
  isOverdue: boolean
  request?: ApprovalRequestSummary
  history?: ApprovalHistory[]
  availableActions?: ApprovalTaskActions
}

export const approvalHistoryActions = [
  'CREATED',
  'SUBMITTED',
  'ASSIGNED',
  'CONDITION_EVALUATED',
  'APPROVED',
  'REJECTED',
  'REVISION_REQUESTED',
  'REASSIGNED',
  'RESUBMITTED',
  'CANCELLED',
  'VOIDED',
  'AUTO_SKIPPED',
  'COMPLETED',
] as const
export type ApprovalHistoryAction = (typeof approvalHistoryActions)[number]

export interface ApprovalHistory {
  _id: string
  requestId: string
  taskId?: string
  stepKey?: string
  stepRunNo?: number
  revisionRound?: number
  sequenceNo: number
  actorUserId?: string
  actorSnapshot?: ApprovalActorSnapshot
  action: ApprovalHistoryAction
  fromStatus?: string
  toStatus?: string
  comment?: string
  metadata?: Record<string, unknown>
  occurredAt: string
  createdAt: string
}

export const fileStatuses = ['TEMPORARY', 'ATTACHED', 'DELETED'] as const
export type FileStatus = (typeof fileStatuses)[number]
export const fileScanStatuses = ['PENDING', 'CLEAN', 'INFECTED', 'FAILED', 'SKIPPED'] as const
export type FileScanStatus = (typeof fileScanStatuses)[number]

export interface FileMetadata {
  id: string
  originalName: string
  detectedMimeType: string
  extension: string
  sizeBytes: number
  fieldKey: string
  status: FileStatus
  scanStatus: FileScanStatus
  createdAt: string
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: Pagination
}

export type SortDirection = 'asc' | 'desc'
export interface PaginationFilter { page?: number; limit?: number }
export interface Filter extends PaginationFilter {
  search?: string
  sortBy?: string
  sortOrder?: SortDirection
}

export const formDefinitionSortFields = ['code', 'name', 'status', 'version', 'createdAt', 'updatedAt'] as const
export type FormDefinitionSortField = (typeof formDefinitionSortFields)[number]
export interface FormDefinitionFilter extends PaginationFilter {
  search?: string
  status?: DefinitionStatus
  sortBy?: FormDefinitionSortField
  sortOrder?: SortDirection
}

export const workflowDefinitionSortFields = ['code', 'name', 'status', 'version', 'createdAt', 'updatedAt'] as const
export type WorkflowDefinitionSortField = (typeof workflowDefinitionSortFields)[number]
export interface WorkflowDefinitionFilter extends PaginationFilter {
  search?: string
  status?: DefinitionStatus
  formDefinitionId?: string
  sortBy?: WorkflowDefinitionSortField
  sortOrder?: SortDirection
}

export const requestSortFields = ['requestNo', 'title', 'status', 'createdAt', 'updatedAt', 'submittedAt', 'completedAt'] as const
export type RequestSortField = (typeof requestSortFields)[number]
export interface RequestFilter extends PaginationFilter {
  search?: string
  status?: RequestStatus
  statusGroup?: 'DRAFT' | 'IN_PROGRESS' | 'REVISION_REQUESTED' | 'COMPLETED' | 'CANCELLED'
  formDefinitionId?: string
  dateFrom?: string
  dateTo?: string
  sortBy?: RequestSortField
  sortOrder?: SortDirection
}

export const approvalInboxScopes = ['pending', 'processed', 'closed'] as const
export type ApprovalInboxScope = (typeof approvalInboxScopes)[number]
export const approvalTaskSortFields = ['assignedAt', 'dueAt', 'actedAt', 'status', 'stepNameSnapshot', 'updatedAt'] as const
export type ApprovalTaskSortField = (typeof approvalTaskSortFields)[number]
export interface ApprovalTaskFilter extends PaginationFilter {
  scope?: ApprovalInboxScope
  search?: string
  status?: ApprovalTaskStatus
  approvalMode?: ApprovalMode
  requestStatus?: RequestStatus
  overdue?: boolean
  dateFrom?: string
  dateTo?: string
  sortBy?: ApprovalTaskSortField
  sortOrder?: SortDirection
}

export interface NotificationFilter extends PaginationFilter { isRead?: boolean }
