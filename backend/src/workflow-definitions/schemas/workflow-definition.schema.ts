import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { definitionStatuses, type DefinitionStatus } from '../../form-definitions/schemas/form-definition.schema.js';

export const workflowStepTypes = ['APPROVAL', 'CONDITION', 'END'] as const;
export type WorkflowStepType = (typeof workflowStepTypes)[number];
export const workflowEndResults = ['APPROVED', 'REJECTED'] as const;
export type WorkflowEndResult = (typeof workflowEndResults)[number];
export const approvalModes = ['ANY', 'ALL', 'MAJORITY'] as const;
export type ApprovalMode = (typeof approvalModes)[number];
export const assigneeRuleTypes = [
  'REQUESTER_DIRECT_MANAGER',
  'REQUESTER_DEPARTMENT_MANAGER',
  'ROLE',
  'ROLE_IN_REQUESTER_DEPARTMENT',
  'POSITION_IN_REQUESTER_DEPARTMENT',
  'SPECIFIC_USER',
] as const;
export type AssigneeRuleType = (typeof assigneeRuleTypes)[number];
export const workflowConditionSources = ['FORM_FIELD', 'REQUESTER_ATTRIBUTE'] as const;
export type WorkflowConditionSource = (typeof workflowConditionSources)[number];
export const workflowConditionOperators = ['EQUALS', 'NOT_EQUALS', 'IN', 'GREATER_THAN', 'LESS_THAN'] as const;
export type WorkflowConditionOperator = (typeof workflowConditionOperators)[number];
export const MAX_BPMN_XML_BYTES = 1_000_000;
export const MAX_BPMN_XML_CHARACTERS = 1_000_000;
export const WORKFLOW_BPMN_EXTENSION_NAMESPACE = 'https://workflow-erp.local/schema/bpmn/1.0';

@Schema({ _id: false })
export class WorkflowUiPosition {
  @Prop({ required: true }) x: number;
  @Prop({ required: true }) y: number;
}
export const WorkflowUiPositionSchema = SchemaFactory.createForClass(WorkflowUiPosition);

@Schema({ _id: false })
export class WorkflowAssigneeRule {
  @Prop({ required: true, type: String, enum: assigneeRuleTypes }) type: AssigneeRuleType;
  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'Role', required: false, default: undefined }) roleIds?: Types.ObjectId[];
  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'Position', required: false, default: undefined }) positionIds?: Types.ObjectId[];
  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'User', required: false, default: undefined }) userIds?: Types.ObjectId[];
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Department', required: false }) departmentId?: Types.ObjectId;
  @Prop({ required: true, default: false }) includeInactive: boolean;
}
export const WorkflowAssigneeRuleSchema = SchemaFactory.createForClass(WorkflowAssigneeRule);

@Schema({ _id: false })
export class WorkflowCondition {
  @Prop({ required: true, type: String, enum: workflowConditionSources }) source: WorkflowConditionSource;
  @Prop({ required: true, trim: true, maxlength: 80 }) fieldKey: string;
  @Prop({ required: true, type: String, enum: workflowConditionOperators }) operator: WorkflowConditionOperator;
  @Prop({ required: true, type: MongooseSchema.Types.Mixed }) value: unknown;
}
export const WorkflowConditionSchema = SchemaFactory.createForClass(WorkflowCondition);

@Schema({ _id: false })
export class WorkflowStep {
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 80, match: /^[A-Z][A-Z0-9_]*$/ }) stepKey: string;
  @Prop({ required: true, trim: true, maxlength: 160 }) name: string;
  @Prop({ required: true, type: String, enum: workflowStepTypes }) type: WorkflowStepType;
  @Prop({ type: WorkflowUiPositionSchema, required: false }) uiPosition?: WorkflowUiPosition;
  @Prop({ type: WorkflowAssigneeRuleSchema, required: false }) assigneeRule?: WorkflowAssigneeRule;
  @Prop({ type: String, enum: approvalModes, required: false }) approvalMode?: ApprovalMode;
  @Prop({
    required: function (this: { type?: WorkflowStepType }) {
      return this.type === 'APPROVAL';
    },
    default: function (this: { type?: WorkflowStepType }) {
      return this.type === 'APPROVAL' ? false : undefined;
    },
  })
  allowSelfApproval?: boolean;
  @Prop({ required: false, min: 1 }) dueInHours?: number;
  @Prop({ type: WorkflowConditionSchema, required: false }) condition?: WorkflowCondition;
  @Prop({
    type: String,
    enum: workflowEndResults,
    required: function (this: { type?: WorkflowStepType }) {
      return this.type === 'END';
    },
  })
  endResult?: WorkflowEndResult;
  @Prop({ required: false, trim: true, uppercase: true, maxlength: 80 }) onApproveStepKey?: string;
  @Prop({ required: false, trim: true, uppercase: true, maxlength: 80 }) onRejectStepKey?: string;
  @Prop({ required: false, trim: true, uppercase: true, maxlength: 80 }) onRevisionStepKey?: string;
  @Prop({ required: false, trim: true, uppercase: true, maxlength: 80 }) onTrueStepKey?: string;
  @Prop({ required: false, trim: true, uppercase: true, maxlength: 80 }) onFalseStepKey?: string;
}
export const WorkflowStepSchema = SchemaFactory.createForClass(WorkflowStep);

export type WorkflowDefinitionDocument = HydratedDocument<WorkflowDefinition>;

@Schema({ timestamps: true, collection: 'workflow_definitions' })
export class WorkflowDefinition {
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 80, match: /^[A-Z][A-Z0-9_]*$/ }) code: string;
  @Prop({ required: true, min: 1 }) version: number;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WorkflowDefinition', required: false }) previousVersionId?: Types.ObjectId;
  @Prop({ required: true, trim: true, maxlength: 160 }) name: string;
  @Prop({ required: false, trim: true, maxlength: 2000 }) description?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'FormDefinition', required: true }) formDefinitionId: Types.ObjectId;
  @Prop({ required: true, type: String, enum: definitionStatuses, default: 'DRAFT' }) status: DefinitionStatus;
  @Prop({ required: false, type: String, maxlength: MAX_BPMN_XML_CHARACTERS }) bpmnXml?: string;
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 80 }) startStepKey: string;
  @Prop({ type: [WorkflowStepSchema], required: true, validate: (steps: WorkflowStep[]) => steps.length > 0 }) steps: WorkflowStep[];
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true }) createdBy: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false }) updatedBy?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false }) publishedBy?: Types.ObjectId;
  @Prop({ required: false }) publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

function transitions(step: WorkflowStep): string[] {
  return [
    step.onApproveStepKey,
    step.onRejectStepKey,
    step.onRevisionStepKey,
    step.onTrueStepKey,
    step.onFalseStepKey,
  ].filter((value): value is string => Boolean(value));
}

export const WorkflowDefinitionSchema = SchemaFactory.createForClass(WorkflowDefinition);
WorkflowDefinitionSchema.pre('validate', function validateWorkflow() {
  if ((this.status === 'DRAFT' || this.status === 'PUBLISHED') && !this.bpmnXml?.trim()) {
    this.invalidate('bpmnXml', 'bpmnXml is required for DRAFT and PUBLISHED workflows');
  }
  const stepsByKey = new Map<string, WorkflowStep>();
  for (const [index, step] of this.steps.entries()) {
    if (stepsByKey.has(step.stepKey)) this.invalidate(`steps.${index}.stepKey`, `Duplicate workflow step key: ${step.stepKey}`);
    stepsByKey.set(step.stepKey, step);
    if (step.type !== 'APPROVAL' && step.allowSelfApproval !== undefined) {
      this.invalidate(`steps.${index}.allowSelfApproval`, 'allowSelfApproval is only allowed for APPROVAL steps');
    }
    if (step.type !== 'END' && step.endResult !== undefined) {
      this.invalidate(`steps.${index}.endResult`, 'endResult is only allowed for END steps');
    }
    if (step.type === 'END' && transitions(step).length) {
      this.invalidate(`steps.${index}`, 'END cannot have outgoing transitions');
    }
  }
  if (this.status !== 'PUBLISHED') return;

  for (const [index, step] of this.steps.entries()) {
    if (step.type === 'APPROVAL') {
      if (!step.assigneeRule) this.invalidate(`steps.${index}.assigneeRule`, 'APPROVAL requires assigneeRule');
      if (!step.approvalMode) this.invalidate(`steps.${index}.approvalMode`, 'APPROVAL requires approvalMode');
      const rule = step.assigneeRule;
      if (rule?.type === 'ROLE' || rule?.type === 'ROLE_IN_REQUESTER_DEPARTMENT') {
        if (!rule.roleIds?.length) this.invalidate(`steps.${index}.assigneeRule.roleIds`, `${rule.type} requires roleIds`);
      }
      if (rule?.type === 'POSITION_IN_REQUESTER_DEPARTMENT' && !rule.positionIds?.length) {
        this.invalidate(`steps.${index}.assigneeRule.positionIds`, 'POSITION_IN_REQUESTER_DEPARTMENT requires positionIds');
      }
      if (rule?.type === 'SPECIFIC_USER' && !rule.userIds?.length) {
        this.invalidate(`steps.${index}.assigneeRule.userIds`, 'SPECIFIC_USER requires userIds');
      }
    }
    if (step.type === 'CONDITION' && !step.condition) this.invalidate(`steps.${index}.condition`, 'CONDITION requires condition');
  }
  if (!stepsByKey.has(this.startStepKey)) this.invalidate('startStepKey', 'startStepKey must reference an existing step');
  for (const [index, step] of this.steps.entries()) {
    for (const target of transitions(step)) {
      if (!stepsByKey.has(target)) this.invalidate(`steps.${index}`, `Transition target does not exist: ${target}`);
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  let reachesEnd = false;
  const visit = (stepKey: string) => {
    if (visiting.has(stepKey)) {
      this.invalidate('steps', `Workflow contains a cycle at step: ${stepKey}`);
      return;
    }
    if (visited.has(stepKey)) return;
    const step = stepsByKey.get(stepKey);
    if (!step) return;
    visiting.add(stepKey);
    if (step.type === 'END') reachesEnd = true;
    for (const target of transitions(step)) visit(target);
    visiting.delete(stepKey);
    visited.add(stepKey);
  };
  visit(this.startStepKey);
  if (visited.size !== stepsByKey.size) this.invalidate('steps', 'Workflow contains orphan steps');
  if (!reachesEnd) this.invalidate('steps', 'Workflow must contain a reachable END step');
  if (!this.publishedBy) this.invalidate('publishedBy', 'publishedBy is required for a published workflow');
  if (!this.publishedAt) this.invalidate('publishedAt', 'publishedAt is required for a published workflow');
});
WorkflowDefinitionSchema.index({ code: 1, version: 1 }, { unique: true });
WorkflowDefinitionSchema.index({ formDefinitionId: 1, status: 1 });
WorkflowDefinitionSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { status: 'PUBLISHED' }, name: 'uniq_published_workflow_code' },
);
WorkflowDefinitionSchema.index(
  { formDefinitionId: 1 },
  { unique: true, partialFilterExpression: { status: 'PUBLISHED' }, name: 'uniq_published_workflow_form' },
);
