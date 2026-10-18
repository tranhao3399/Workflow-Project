import { Types } from 'mongoose';
import type {
  ApprovalMode,
  AssigneeRuleType,
  WorkflowConditionOperator,
  WorkflowConditionSource,
  WorkflowEndResult,
  WorkflowStepType,
} from '../workflow-definitions/schemas/workflow-definition.schema.js';
import type { RequestStatus } from '../requests/schemas/request.schema.js';

export interface RuntimeAssigneeRule {
  type: AssigneeRuleType;
  roleIds?: Types.ObjectId[];
  positionIds?: Types.ObjectId[];
  userIds?: Types.ObjectId[];
  departmentId?: Types.ObjectId;
  includeInactive: boolean;
}

export interface RuntimeCondition {
  source: WorkflowConditionSource;
  fieldKey: string;
  operator: WorkflowConditionOperator;
  value: unknown;
}

export interface RuntimeWorkflowStep {
  stepKey: string;
  name: string;
  type: WorkflowStepType;
  assigneeRule?: RuntimeAssigneeRule;
  approvalMode?: ApprovalMode;
  allowSelfApproval: boolean;
  dueInHours?: number;
  condition?: RuntimeCondition;
  endResult?: WorkflowEndResult;
  onApproveStepKey?: string;
  onRejectStepKey?: string;
  onRevisionStepKey?: string;
  onTrueStepKey?: string;
  onFalseStepKey?: string;
}

export interface RuntimeWorkflowSnapshot {
  startStepKey: string;
  steps: RuntimeWorkflowStep[];
}

export interface ResolvedAssigneeSnapshot {
  fullName: string;
  employeeCode?: string;
  departmentName?: string;
  positionName?: string;
}

export interface ResolvedAssignee {
  userId: Types.ObjectId;
  employeeId?: Types.ObjectId;
  snapshot: ResolvedAssigneeSnapshot;
}

export type ApprovalTransitionOutcome = 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED';
export type WorkflowRuntimeState = 'AWAITING_APPROVAL' | 'REVISION_REQUESTED' | 'COMPLETED';

export interface WorkflowRuntimeResult {
  state: WorkflowRuntimeState;
  requestStatus: RequestStatus;
  currentStepKey?: string;
  stepRunNo?: number;
  taskIds?: string[];
  requiredApprovals?: number;
}
