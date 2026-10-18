import { BadRequestException, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { FormField } from '../form-definitions/schemas/form-definition.schema.js';
import {
  approvalModes,
  assigneeRuleTypes,
  MAX_BPMN_XML_BYTES,
  workflowConditionOperators,
  workflowConditionSources,
  workflowEndResults,
  WORKFLOW_BPMN_EXTENSION_NAMESPACE,
  type WorkflowAssigneeRule,
  type WorkflowCondition,
  type WorkflowStep,
  type WorkflowUiPosition,
} from './schemas/workflow-definition.schema.js';
import { WorkflowGraphValidatorService, type WorkflowGraphValidationError } from './workflow-graph-validator.service.js';

const BPMN_MODEL_NAMESPACE = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
const BPMN_DI_NAMESPACE = 'http://www.omg.org/spec/BPMN/20100524/DI';
const STEP_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const SUPPORTED_PROCESS_ELEMENTS = new Set([
  'startEvent',
  'userTask',
  'exclusiveGateway',
  'endEvent',
  'sequenceFlow',
  'documentation',
]);

type XmlRecord = Record<string, unknown>;
type SupportedNodeType = 'START' | 'APPROVAL' | 'CONDITION' | 'END';

interface ParsedNode {
  id: string;
  name: string;
  type: SupportedNodeType;
  value: XmlRecord;
}

interface ParsedSequenceFlow {
  id: string;
  sourceRef: string;
  targetRef: string;
}

interface QualifiedChild {
  qualifiedName: string;
  value: unknown;
}

interface NamespaceContext {
  bpmnPrefixes: ReadonlySet<string>;
  bpmnDiPrefixes: ReadonlySet<string>;
  workflowPrefixes: ReadonlySet<string>;
  defaultBpmnNamespace: boolean;
}

export interface BpmnWorkflowValidationError extends WorkflowGraphValidationError {
  elementId?: string;
}

export interface CompiledBpmnWorkflow {
  startStepKey: string;
  steps: WorkflowStep[];
}

export interface BpmnWorkflowCompilationResult {
  valid: boolean;
  errors: BpmnWorkflowValidationError[];
  compiled?: CompiledBpmnWorkflow;
}

@Injectable()
export class BpmnWorkflowCompilerService {
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    processEntities: false,
    maxNestedTags: 100,
  });

  constructor(private readonly graphValidator: WorkflowGraphValidatorService) {}

  compile(bpmnXml: string, formFields: readonly FormField[]): BpmnWorkflowCompilationResult {
    const errors: BpmnWorkflowValidationError[] = [];
    if (!bpmnXml.trim()) {
      this.add(errors, 'BPMN_XML_REQUIRED', 'bpmnXml', undefined, 'BPMN XML là bắt buộc.');
      return { valid: false, errors };
    }
    if (Buffer.byteLength(bpmnXml, 'utf8') > MAX_BPMN_XML_BYTES) {
      this.add(errors, 'BPMN_XML_TOO_LARGE', 'bpmnXml', undefined, `BPMN XML không được vượt quá ${MAX_BPMN_XML_BYTES} byte.`);
      return { valid: false, errors };
    }
    if (/<!DOCTYPE|<!ENTITY/i.test(bpmnXml)) {
      this.add(errors, 'BPMN_XML_UNSAFE_DECLARATION', 'bpmnXml', undefined, 'BPMN XML không được chứa DOCTYPE hoặc ENTITY.');
      return { valid: false, errors };
    }

    const xmlValidation = XMLValidator.validate(bpmnXml, { allowBooleanAttributes: false });
    if (xmlValidation !== true) {
      this.add(
        errors,
        'BPMN_XML_INVALID',
        'bpmnXml',
        undefined,
        `BPMN XML không hợp lệ tại dòng ${xmlValidation.err.line}, cột ${xmlValidation.err.col}: ${xmlValidation.err.msg}`,
      );
      return { valid: false, errors };
    }

    let parsed: unknown;
    try {
      parsed = this.parser.parse(bpmnXml) as unknown;
    } catch {
      this.add(errors, 'BPMN_XML_INVALID', 'bpmnXml', undefined, 'Không thể phân tích BPMN XML.');
      return { valid: false, errors };
    }
    const document = this.record(parsed);
    if (!document) {
      this.add(errors, 'BPMN_DEFINITIONS_REQUIRED', 'bpmnXml', undefined, 'BPMN XML không chứa definitions hợp lệ.');
      return { valid: false, errors };
    }
    const definitionChildren = this.children(document).filter((child) => this.localName(child.qualifiedName) === 'definitions');
    if (definitionChildren.length !== 1) {
      this.add(errors, 'BPMN_DEFINITIONS_REQUIRED', 'bpmnXml', undefined, 'BPMN XML phải chứa đúng một definitions.');
      return { valid: false, errors };
    }
    const definitions = this.record(definitionChildren[0].value);
    if (!definitions) {
      this.add(errors, 'BPMN_DEFINITIONS_INVALID', 'bpmnXml', undefined, 'BPMN definitions không hợp lệ.');
      return { valid: false, errors };
    }
    const namespaces = this.namespaceContext(definitions);
    if (!namespaces.bpmnPrefixes.size && !namespaces.defaultBpmnNamespace) {
      this.add(errors, 'BPMN_NAMESPACE_REQUIRED', 'bpmnXml', undefined, `Thiếu namespace BPMN chuẩn ${BPMN_MODEL_NAMESPACE}.`);
    }
    if (!namespaces.workflowPrefixes.size) {
      this.add(errors, 'BPMN_WORKFLOW_NAMESPACE_REQUIRED', 'bpmnXml', undefined, `Thiếu namespace nghiệp vụ ${WORKFLOW_BPMN_EXTENSION_NAMESPACE}.`);
    }
    this.validateDefinitionsPalette(definitions, namespaces, errors);

    const processChildren = this.children(definitions).filter((child) => (
      this.localName(child.qualifiedName) === 'process' && this.isBpmnName(child.qualifiedName, namespaces)
    ));
    if (processChildren.length !== 1) {
      this.add(errors, 'BPMN_PROCESS_COUNT_INVALID', 'bpmnXml', undefined, 'BPMN XML phải chứa đúng một Process.');
      return { valid: false, errors };
    }
    const process = this.record(processChildren[0].value);
    if (!process) {
      this.add(errors, 'BPMN_PROCESS_INVALID', 'bpmnXml', undefined, 'BPMN Process không hợp lệ.');
      return { valid: false, errors };
    }

    const nodes: ParsedNode[] = [];
    const flows: ParsedSequenceFlow[] = [];
    const ids = new Set<string>();
    for (const child of this.children(process)) {
      if (!this.isBpmnName(child.qualifiedName, namespaces)) {
        this.add(errors, 'BPMN_ELEMENT_UNSUPPORTED', 'bpmnXml', this.elementId(child.value), `Element ${child.qualifiedName} không được hỗ trợ.`);
        continue;
      }
      const local = this.localName(child.qualifiedName);
      if (!SUPPORTED_PROCESS_ELEMENTS.has(local)) {
        this.add(errors, 'BPMN_ELEMENT_UNSUPPORTED', 'bpmnXml', this.elementId(child.value), `BPMN element ${local} chưa được Workflow Engine hỗ trợ.`);
        continue;
      }
      if (local === 'documentation') continue;
      const values = Array.isArray(child.value) ? child.value : [child.value];
      for (const value of values) {
        const element = this.record(value);
        if (!element) {
          this.add(errors, 'BPMN_ELEMENT_INVALID', 'bpmnXml', undefined, `BPMN element ${local} không hợp lệ.`);
          continue;
        }
        const id = this.attribute(element, 'id');
        if (!id) {
          this.add(errors, 'BPMN_ELEMENT_ID_REQUIRED', 'bpmnXml', undefined, `BPMN element ${local} phải có id.`);
          continue;
        }
        if (ids.has(id)) {
          this.add(errors, 'BPMN_ELEMENT_ID_DUPLICATE', 'bpmnXml', id, `BPMN element id ${id} bị trùng.`);
          continue;
        }
        ids.add(id);
        this.validateNestedElements(local, element, namespaces, id, errors);
        if (local === 'sequenceFlow') {
          const sourceRef = this.attribute(element, 'sourceRef');
          const targetRef = this.attribute(element, 'targetRef');
          if (!sourceRef || !targetRef) {
            this.add(errors, 'BPMN_SEQUENCE_FLOW_INVALID', 'bpmnXml', id, 'Sequence Flow phải có sourceRef và targetRef.');
            continue;
          }
          flows.push({ id, sourceRef, targetRef });
          continue;
        }
        const type = this.nodeType(local);
        if (!type) continue;
        const name = type === 'START' ? this.attribute(element, 'name') ?? 'Bắt đầu' : this.attribute(element, 'name')?.trim() ?? '';
        if (type !== 'START' && !name) {
          this.add(errors, 'BPMN_NODE_NAME_REQUIRED', 'bpmnXml', id, 'Node BPMN phải có tên hiển thị.');
        }
        nodes.push({ id, name, type, value: element });
      }
    }

    const starts = nodes.filter((node) => node.type === 'START');
    if (starts.length !== 1) {
      this.add(errors, 'BPMN_START_EVENT_COUNT_INVALID', 'bpmnXml', starts[0]?.id, 'Workflow phải có đúng một Start Event.');
    }
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    for (const flow of flows) {
      if (!nodesById.has(flow.sourceRef)) this.add(errors, 'BPMN_FLOW_SOURCE_NOT_FOUND', 'bpmnXml', flow.id, `Không tìm thấy sourceRef ${flow.sourceRef}.`);
      if (!nodesById.has(flow.targetRef)) this.add(errors, 'BPMN_FLOW_TARGET_NOT_FOUND', 'bpmnXml', flow.id, `Không tìm thấy targetRef ${flow.targetRef}.`);
      if (nodesById.get(flow.sourceRef)?.type === 'END') this.add(errors, 'BPMN_END_HAS_OUTGOING', 'bpmnXml', flow.sourceRef, 'End Event không được có Sequence Flow đi ra.');
      if (nodesById.get(flow.targetRef)?.type === 'START') this.add(errors, 'BPMN_START_HAS_INCOMING', 'bpmnXml', flow.targetRef, 'Start Event không được có Sequence Flow đi vào.');
    }

    const positions = this.readUiPositions(parsed, namespaces);
    const flowsById = new Map(flows.map((flow) => [flow.id, flow]));
    const stepKeyByNodeId = new Map<string, string>();
    const nodeIdByStepKey = new Map<string, string>();
    const metadataByNodeId = new Map<string, XmlRecord>();
    for (const node of nodes.filter((item) => item.type !== 'START')) {
      const metadata = this.businessMetadata(node, namespaces, errors);
      if (metadata) metadataByNodeId.set(node.id, metadata);
      const stepKey = metadata ? this.requiredMetadataAttribute(metadata, 'stepKey', node.id, errors)?.toUpperCase() : undefined;
      if (!stepKey) continue;
      if (stepKey.length > 80 || !STEP_KEY_PATTERN.test(stepKey)) {
        this.add(errors, 'BPMN_STEP_KEY_INVALID', 'bpmnXml', node.id, 'stepKey phải bắt đầu bằng chữ in hoa và chỉ gồm A-Z, 0-9 hoặc dấu gạch dưới.');
        continue;
      }
      const duplicateNode = nodeIdByStepKey.get(stepKey);
      if (duplicateNode) {
        this.add(errors, 'DUPLICATE_STEP_KEY', 'bpmnXml', node.id, `stepKey ${stepKey} đã được dùng bởi BPMN element ${duplicateNode}.`);
        continue;
      }
      stepKeyByNodeId.set(node.id, stepKey);
      nodeIdByStepKey.set(stepKey, node.id);
    }

    const compiledSteps: WorkflowStep[] = [];
    for (const node of nodes.filter((item) => item.type !== 'START')) {
      const stepKey = stepKeyByNodeId.get(node.id);
      if (!stepKey) continue;
      const metadata = metadataByNodeId.get(node.id);
      if (!metadata) continue;
      const uiPosition = positions.get(node.id);
      if (node.type === 'APPROVAL') {
        const step = this.compileApproval(node, stepKey, metadata, uiPosition, flows, flowsById, stepKeyByNodeId, errors);
        if (step) compiledSteps.push(step);
      } else if (node.type === 'CONDITION') {
        const step = this.compileCondition(node, stepKey, metadata, uiPosition, flows, flowsById, stepKeyByNodeId, errors);
        if (step) compiledSteps.push(step);
      } else {
        const step = this.compileEnd(node, stepKey, metadata, uiPosition, flows, errors);
        if (step) compiledSteps.push(step);
      }
    }

    let startStepKey = '';
    const start = starts[0];
    if (start) {
      const outgoing = flows.filter((flow) => flow.sourceRef === start.id);
      if (outgoing.length !== 1) {
        this.add(errors, 'BPMN_START_OUTGOING_INVALID', 'bpmnXml', start.id, 'Start Event phải có đúng một Sequence Flow đi ra.');
      } else {
        startStepKey = stepKeyByNodeId.get(outgoing[0].targetRef) ?? '';
        if (!startStepKey) this.add(errors, 'BPMN_START_TARGET_INVALID', 'bpmnXml', outgoing[0].id, 'Sequence Flow từ Start phải trỏ tới node được hỗ trợ có stepKey hợp lệ.');
      }
    }

    if (errors.length === 0) {
      const graphValidation = this.graphValidator.validate(startStepKey, compiledSteps, formFields);
      errors.push(...graphValidation.errors.map((error) => ({
        ...error,
        ...(error.stepKey && nodeIdByStepKey.has(error.stepKey) ? { elementId: nodeIdByStepKey.get(error.stepKey) } : {}),
      })));
    }
    if (errors.length) return { valid: false, errors };
    return { valid: true, errors: [], compiled: { startStepKey, steps: compiledSteps } };
  }

  compileOrThrow(bpmnXml: string, formFields: readonly FormField[]): CompiledBpmnWorkflow {
    const result = this.compile(bpmnXml, formFields);
    if (result.valid && result.compiled) return result.compiled;
    const first = result.errors[0];
    throw new BadRequestException({
      code: 'WORKFLOW_INVALID',
      message: first?.message ?? 'BPMN Workflow không hợp lệ.',
      field: first?.path ?? 'bpmnXml',
      errors: result.errors,
    });
  }

  private compileApproval(
    node: ParsedNode,
    stepKey: string,
    metadata: XmlRecord,
    uiPosition: WorkflowUiPosition | undefined,
    flows: readonly ParsedSequenceFlow[],
    flowsById: ReadonlyMap<string, ParsedSequenceFlow>,
    stepKeyByNodeId: ReadonlyMap<string, string>,
    errors: BpmnWorkflowValidationError[],
  ): WorkflowStep | undefined {
    const approvalMode = this.enumMetadata(metadata, 'approvalMode', approvalModes, node.id, errors);
    const allowSelfApproval = this.booleanMetadata(metadata, 'allowSelfApproval', node.id, errors, true);
    const assigneeRule = this.assigneeRule(metadata, node.id, errors);
    const approveFlow = this.requiredMetadataAttribute(metadata, 'approveFlow', node.id, errors);
    const rejectFlow = this.requiredMetadataAttribute(metadata, 'rejectFlow', node.id, errors);
    const revisionFlow = this.attribute(metadata, 'revisionFlow');
    const branchFlowIds = [approveFlow, rejectFlow, revisionFlow].filter((value): value is string => Boolean(value));
    this.validateBranchFlows(node.id, branchFlowIds, flows, flowsById, errors);
    if (new Set(branchFlowIds).size !== branchFlowIds.length) {
      this.add(errors, 'BPMN_APPROVAL_BRANCH_DUPLICATE', 'bpmnXml', node.id, 'Các nhánh approve/reject/revision phải dùng Sequence Flow khác nhau.');
    }
    const onApproveStepKey = approveFlow ? this.flowTargetStepKey(approveFlow, node.id, flowsById, stepKeyByNodeId, errors) : undefined;
    const onRejectStepKey = rejectFlow ? this.flowTargetStepKey(rejectFlow, node.id, flowsById, stepKeyByNodeId, errors) : undefined;
    const onRevisionStepKey = revisionFlow ? this.flowTargetStepKey(revisionFlow, node.id, flowsById, stepKeyByNodeId, errors) : undefined;
    const dueInHours = this.optionalPositiveIntegerMetadata(metadata, 'dueInHours', node.id, errors, 87_600);
    if (!approvalMode || allowSelfApproval === undefined || !assigneeRule || !onApproveStepKey || !onRejectStepKey) return undefined;
    return {
      stepKey,
      name: node.name,
      type: 'APPROVAL',
      ...(uiPosition ? { uiPosition } : {}),
      assigneeRule,
      approvalMode,
      allowSelfApproval,
      ...(dueInHours ? { dueInHours } : {}),
      onApproveStepKey,
      onRejectStepKey,
      ...(onRevisionStepKey ? { onRevisionStepKey } : {}),
    };
  }

  private compileCondition(
    node: ParsedNode,
    stepKey: string,
    metadata: XmlRecord,
    uiPosition: WorkflowUiPosition | undefined,
    flows: readonly ParsedSequenceFlow[],
    flowsById: ReadonlyMap<string, ParsedSequenceFlow>,
    stepKeyByNodeId: ReadonlyMap<string, string>,
    errors: BpmnWorkflowValidationError[],
  ): WorkflowStep | undefined {
    const source = this.enumMetadata(metadata, 'source', workflowConditionSources, node.id, errors);
    const fieldKey = this.requiredMetadataAttribute(metadata, 'fieldKey', node.id, errors);
    const operator = this.enumMetadata(metadata, 'operator', workflowConditionOperators, node.id, errors);
    const valueJson = this.requiredMetadataAttribute(metadata, 'valueJson', node.id, errors);
    const trueFlow = this.requiredMetadataAttribute(metadata, 'trueFlow', node.id, errors);
    const falseFlow = this.requiredMetadataAttribute(metadata, 'falseFlow', node.id, errors);
    const branchFlowIds = [trueFlow, falseFlow].filter((value): value is string => Boolean(value));
    this.validateBranchFlows(node.id, branchFlowIds, flows, flowsById, errors);
    if (trueFlow && falseFlow && trueFlow === falseFlow) {
      this.add(errors, 'BPMN_CONDITION_BRANCH_DUPLICATE', 'bpmnXml', node.id, 'Nhánh true và false phải dùng Sequence Flow khác nhau.');
    }
    const onTrueStepKey = trueFlow ? this.flowTargetStepKey(trueFlow, node.id, flowsById, stepKeyByNodeId, errors) : undefined;
    const onFalseStepKey = falseFlow ? this.flowTargetStepKey(falseFlow, node.id, flowsById, stepKeyByNodeId, errors) : undefined;
    let value: unknown;
    if (valueJson) {
      try {
        value = JSON.parse(valueJson) as unknown;
      } catch {
        this.add(errors, 'BPMN_CONDITION_VALUE_INVALID', 'bpmnXml', node.id, 'valueJson của Gateway phải là JSON hợp lệ.');
      }
    }
    if (!source || !fieldKey || !operator || valueJson === undefined || !onTrueStepKey || !onFalseStepKey) return undefined;
    const condition: WorkflowCondition = { source, fieldKey, operator, value };
    return {
      stepKey,
      name: node.name,
      type: 'CONDITION',
      ...(uiPosition ? { uiPosition } : {}),
      condition,
      onTrueStepKey,
      onFalseStepKey,
    };
  }

  private compileEnd(
    node: ParsedNode,
    stepKey: string,
    metadata: XmlRecord,
    uiPosition: WorkflowUiPosition | undefined,
    flows: readonly ParsedSequenceFlow[],
    errors: BpmnWorkflowValidationError[],
  ): WorkflowStep | undefined {
    const endResult = this.enumMetadata(metadata, 'endResult', workflowEndResults, node.id, errors);
    if (flows.some((flow) => flow.sourceRef === node.id)) {
      this.add(errors, 'BPMN_END_HAS_OUTGOING', 'bpmnXml', node.id, 'End Event không được có Sequence Flow đi ra.');
    }
    if (!endResult) return undefined;
    return {
      stepKey,
      name: node.name,
      type: 'END',
      ...(uiPosition ? { uiPosition } : {}),
      endResult,
    };
  }

  private assigneeRule(metadata: XmlRecord, elementId: string, errors: BpmnWorkflowValidationError[]): WorkflowAssigneeRule | undefined {
    const type = this.enumMetadata(metadata, 'assigneeRuleType', assigneeRuleTypes, elementId, errors);
    const includeInactive = this.booleanMetadata(metadata, 'includeInactive', elementId, errors, false) ?? false;
    const roleIds = this.objectIdListMetadata(metadata, 'roleIds', elementId, errors);
    const positionIds = this.objectIdListMetadata(metadata, 'positionIds', elementId, errors);
    const userIds = this.objectIdListMetadata(metadata, 'userIds', elementId, errors);
    const departmentValue = this.attribute(metadata, 'departmentId');
    let departmentId: Types.ObjectId | undefined;
    if (departmentValue) {
      if (!Types.ObjectId.isValid(departmentValue)) this.add(errors, 'BPMN_ASSIGNEE_DEPARTMENT_INVALID', 'bpmnXml', elementId, 'departmentId không phải ObjectId hợp lệ.');
      else departmentId = new Types.ObjectId(departmentValue);
    }
    if (!type) return undefined;
    if ((type === 'ROLE' || type === 'ROLE_IN_REQUESTER_DEPARTMENT') && !roleIds?.length) {
      this.add(errors, 'BPMN_ASSIGNEE_ROLE_REQUIRED', 'bpmnXml', elementId, `${type} cần ít nhất một roleIds.`);
    }
    if (type === 'POSITION_IN_REQUESTER_DEPARTMENT' && !positionIds?.length) {
      this.add(errors, 'BPMN_ASSIGNEE_POSITION_REQUIRED', 'bpmnXml', elementId, 'POSITION_IN_REQUESTER_DEPARTMENT cần ít nhất một positionIds.');
    }
    if (type === 'SPECIFIC_USER' && !userIds?.length) {
      this.add(errors, 'BPMN_ASSIGNEE_USER_REQUIRED', 'bpmnXml', elementId, 'SPECIFIC_USER cần ít nhất một userIds.');
    }
    return {
      type,
      ...(roleIds?.length ? { roleIds } : {}),
      ...(positionIds?.length ? { positionIds } : {}),
      ...(userIds?.length ? { userIds } : {}),
      ...(departmentId ? { departmentId } : {}),
      includeInactive,
    };
  }

  private businessMetadata(node: ParsedNode, namespaces: NamespaceContext, errors: BpmnWorkflowValidationError[]): XmlRecord | undefined {
    if (node.type === 'START') return undefined;
    const extensionElements = this.elementChildren(node.value, 'extensionElements', namespaces.bpmnPrefixes, namespaces.defaultBpmnNamespace);
    if (extensionElements.length !== 1) {
      this.add(errors, 'BPMN_EXTENSION_ELEMENTS_REQUIRED', 'bpmnXml', node.id, `${node.type} cần đúng một extensionElements.`);
      return undefined;
    }
    const extension = this.record(extensionElements[0]);
    if (!extension) {
      this.add(errors, 'BPMN_EXTENSION_ELEMENTS_INVALID', 'bpmnXml', node.id, 'extensionElements không hợp lệ.');
      return undefined;
    }
    const expectedName = node.type === 'APPROVAL' ? 'approval' : node.type === 'CONDITION' ? 'condition' : 'end';
    const businessChildren = this.children(extension);
    for (const child of businessChildren) {
      if (!this.isWorkflowName(child.qualifiedName, namespaces) || this.localName(child.qualifiedName) !== expectedName) {
        this.add(errors, 'BPMN_EXTENSION_UNSUPPORTED', 'bpmnXml', node.id, `Extension ${child.qualifiedName} không được hỗ trợ cho ${node.type}.`);
      }
    }
    const matching = businessChildren.filter((child) => this.isWorkflowName(child.qualifiedName, namespaces) && this.localName(child.qualifiedName) === expectedName);
    if (matching.length !== 1) {
      this.add(errors, 'BPMN_BUSINESS_METADATA_REQUIRED', 'bpmnXml', node.id, `${node.type} cần đúng một wf:${expectedName}.`);
      return undefined;
    }
    const metadata = this.record(matching[0].value);
    if (!metadata) {
      this.add(errors, 'BPMN_BUSINESS_METADATA_INVALID', 'bpmnXml', node.id, `wf:${expectedName} không hợp lệ.`);
      return undefined;
    }
    this.validateMetadataShape(node.type, metadata, node.id, errors);
    return metadata;
  }

  private validateNestedElements(
    elementType: string,
    element: XmlRecord,
    namespaces: NamespaceContext,
    elementId: string,
    errors: BpmnWorkflowValidationError[],
  ): void {
    const common = new Set(['documentation', 'incoming', 'outgoing']);
    const allowed = elementType === 'userTask' || elementType === 'exclusiveGateway' || elementType === 'endEvent'
      ? new Set([...common, 'extensionElements'])
      : common;
    for (const child of this.children(element)) {
      const local = this.localName(child.qualifiedName);
      if (!this.isBpmnName(child.qualifiedName, namespaces) || !allowed.has(local)) {
        this.add(errors, 'BPMN_NESTED_ELEMENT_UNSUPPORTED', 'bpmnXml', elementId, `${child.qualifiedName} không được hỗ trợ trong ${elementType}.`);
      }
    }
  }

  private validateMetadataShape(
    nodeType: Exclude<SupportedNodeType, 'START'>,
    metadata: XmlRecord,
    elementId: string,
    errors: BpmnWorkflowValidationError[],
  ): void {
    const approvalAttributes = new Set([
      'stepKey', 'approvalMode', 'allowSelfApproval', 'assigneeRuleType', 'roleIds', 'positionIds',
      'userIds', 'departmentId', 'includeInactive', 'dueInHours', 'approveFlow', 'rejectFlow', 'revisionFlow',
    ]);
    const conditionAttributes = new Set(['stepKey', 'source', 'fieldKey', 'operator', 'valueJson', 'trueFlow', 'falseFlow']);
    const endAttributes = new Set(['stepKey', 'endResult']);
    const allowed = nodeType === 'APPROVAL' ? approvalAttributes : nodeType === 'CONDITION' ? conditionAttributes : endAttributes;
    for (const [key] of Object.entries(metadata)) {
      if (key === '#text') continue;
      if (!key.startsWith('@_')) {
        this.add(errors, 'BPMN_METADATA_CHILD_UNSUPPORTED', 'bpmnXml', elementId, 'Metadata nghiệp vụ chỉ được chứa các thuộc tính đã khai báo.');
        continue;
      }
      const name = key.slice(2);
      if (!name.startsWith('xmlns') && !allowed.has(name)) {
        this.add(errors, 'BPMN_METADATA_ATTRIBUTE_UNSUPPORTED', 'bpmnXml', elementId, `Thuộc tính ${name} không được hỗ trợ cho ${nodeType}.`);
      }
    }
  }

  private validateBranchFlows(
    sourceId: string,
    configuredFlowIds: readonly string[],
    flows: readonly ParsedSequenceFlow[],
    flowsById: ReadonlyMap<string, ParsedSequenceFlow>,
    errors: BpmnWorkflowValidationError[],
  ): void {
    const outgoing = flows.filter((flow) => flow.sourceRef === sourceId);
    for (const flowId of configuredFlowIds) {
      const flow = flowsById.get(flowId);
      if (!flow) this.add(errors, 'BPMN_BRANCH_FLOW_NOT_FOUND', 'bpmnXml', sourceId, `Không tìm thấy Sequence Flow ${flowId}.`);
      else if (flow.sourceRef !== sourceId) this.add(errors, 'BPMN_BRANCH_FLOW_SOURCE_INVALID', 'bpmnXml', flowId, `Sequence Flow ${flowId} không đi ra từ ${sourceId}.`);
    }
    const configured = new Set(configuredFlowIds);
    for (const flow of outgoing) {
      if (!configured.has(flow.id)) this.add(errors, 'BPMN_OUTGOING_FLOW_UNMAPPED', 'bpmnXml', flow.id, `Sequence Flow ${flow.id} chưa được gán vào nhánh nghiệp vụ.`);
    }
  }

  private flowTargetStepKey(
    flowId: string,
    sourceId: string,
    flowsById: ReadonlyMap<string, ParsedSequenceFlow>,
    stepKeyByNodeId: ReadonlyMap<string, string>,
    errors: BpmnWorkflowValidationError[],
  ): string | undefined {
    const flow = flowsById.get(flowId);
    if (!flow || flow.sourceRef !== sourceId) return undefined;
    const target = stepKeyByNodeId.get(flow.targetRef);
    if (!target) this.add(errors, 'BPMN_BRANCH_TARGET_INVALID', 'bpmnXml', flow.id, `Đích ${flow.targetRef} không có stepKey hợp lệ.`);
    return target;
  }

  private objectIdListMetadata(metadata: XmlRecord, name: string, elementId: string, errors: BpmnWorkflowValidationError[]): Types.ObjectId[] | undefined {
    const raw = this.attribute(metadata, name);
    if (!raw?.trim()) return undefined;
    const values = raw.split(',').map((value) => value.trim()).filter(Boolean);
    if (new Set(values).size !== values.length) this.add(errors, 'BPMN_ASSIGNEE_ID_DUPLICATE', 'bpmnXml', elementId, `${name} không được chứa ID trùng.`);
    const invalid = values.find((value) => !Types.ObjectId.isValid(value));
    if (invalid) {
      this.add(errors, 'BPMN_ASSIGNEE_ID_INVALID', 'bpmnXml', elementId, `${name} chứa ObjectId không hợp lệ.`);
      return undefined;
    }
    return values.map((value) => new Types.ObjectId(value));
  }

  private enumMetadata<T extends string>(
    metadata: XmlRecord,
    name: string,
    allowed: readonly T[],
    elementId: string,
    errors: BpmnWorkflowValidationError[],
  ): T | undefined {
    const value = this.requiredMetadataAttribute(metadata, name, elementId, errors)?.toUpperCase();
    if (!value) return undefined;
    const matched = allowed.find((item) => item === value);
    if (!matched) this.add(errors, 'BPMN_METADATA_ENUM_INVALID', 'bpmnXml', elementId, `${name} phải là một trong: ${allowed.join(', ')}.`);
    return matched;
  }

  private booleanMetadata(
    metadata: XmlRecord,
    name: string,
    elementId: string,
    errors: BpmnWorkflowValidationError[],
    required: boolean,
  ): boolean | undefined {
    const value = this.attribute(metadata, name);
    if (value === undefined) {
      if (required) this.add(errors, 'BPMN_METADATA_REQUIRED', 'bpmnXml', elementId, `Thiếu thuộc tính ${name}.`);
      return undefined;
    }
    if (value !== 'true' && value !== 'false') {
      this.add(errors, 'BPMN_METADATA_BOOLEAN_INVALID', 'bpmnXml', elementId, `${name} phải là true hoặc false.`);
      return undefined;
    }
    return value === 'true';
  }

  private optionalPositiveIntegerMetadata(
    metadata: XmlRecord,
    name: string,
    elementId: string,
    errors: BpmnWorkflowValidationError[],
    maximum: number,
  ): number | undefined {
    const raw = this.attribute(metadata, name);
    if (raw === undefined || raw === '') return undefined;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > maximum) {
      this.add(errors, 'BPMN_METADATA_INTEGER_INVALID', 'bpmnXml', elementId, `${name} phải là số nguyên từ 1 đến ${maximum}.`);
      return undefined;
    }
    return value;
  }

  private requiredMetadataAttribute(metadata: XmlRecord, name: string, elementId: string, errors: BpmnWorkflowValidationError[]): string | undefined {
    const value = this.attribute(metadata, name)?.trim();
    if (!value) this.add(errors, 'BPMN_METADATA_REQUIRED', 'bpmnXml', elementId, `Thiếu thuộc tính ${name}.`);
    return value || undefined;
  }

  private readUiPositions(root: unknown, namespaces: NamespaceContext): Map<string, WorkflowUiPosition> {
    const positions = new Map<string, WorkflowUiPosition>();
    for (const child of this.descendants(root, 'BPMNShape')) {
      if (!this.isNameInPrefixes(child.qualifiedName, namespaces.bpmnDiPrefixes, false)) continue;
      const shape = this.record(child.value);
      if (!shape) continue;
      const elementId = this.attribute(shape, 'bpmnElement');
      const boundsValue = this.children(shape).find((entry) => this.localName(entry.qualifiedName) === 'Bounds')?.value;
      const bounds = this.record(boundsValue);
      if (!elementId || !bounds) continue;
      const x = Number(this.attribute(bounds, 'x'));
      const y = Number(this.attribute(bounds, 'y'));
      if (Number.isFinite(x) && Number.isFinite(y)) positions.set(elementId, { x, y });
    }
    return positions;
  }

  private validateDefinitionsPalette(definitions: XmlRecord, namespaces: NamespaceContext, errors: BpmnWorkflowValidationError[]): void {
    for (const child of this.children(definitions)) {
      if (!this.isBpmnName(child.qualifiedName, namespaces)) continue;
      if (this.localName(child.qualifiedName) !== 'process') {
        this.add(errors, 'BPMN_ELEMENT_UNSUPPORTED', 'bpmnXml', this.elementId(child.value), `BPMN element ${this.localName(child.qualifiedName)} chưa được hỗ trợ.`);
      }
    }
  }

  private namespaceContext(definitions: XmlRecord): NamespaceContext {
    const bpmnPrefixes = new Set<string>();
    const bpmnDiPrefixes = new Set<string>();
    const workflowPrefixes = new Set<string>();
    let defaultBpmnNamespace = false;
    for (const [key, value] of Object.entries(definitions)) {
      if (typeof value !== 'string') continue;
      if (key === '@_xmlns' && value === BPMN_MODEL_NAMESPACE) defaultBpmnNamespace = true;
      if (!key.startsWith('@_xmlns:')) continue;
      const prefix = key.slice('@_xmlns:'.length);
      if (value === BPMN_MODEL_NAMESPACE) bpmnPrefixes.add(prefix);
      if (value === BPMN_DI_NAMESPACE) bpmnDiPrefixes.add(prefix);
      if (value === WORKFLOW_BPMN_EXTENSION_NAMESPACE) workflowPrefixes.add(prefix);
    }
    return { bpmnPrefixes, bpmnDiPrefixes, workflowPrefixes, defaultBpmnNamespace };
  }

  private elementChildren(record: XmlRecord, localName: string, prefixes: ReadonlySet<string>, allowUnprefixed: boolean): unknown[] {
    return this.children(record)
      .filter((child) => this.localName(child.qualifiedName) === localName && this.isNameInPrefixes(child.qualifiedName, prefixes, allowUnprefixed))
      .map((child) => child.value);
  }

  private descendants(value: unknown, localName: string): QualifiedChild[] {
    const result: QualifiedChild[] = [];
    const visit = (current: unknown): void => {
      if (Array.isArray(current)) {
        current.forEach(visit);
        return;
      }
      const record = this.record(current);
      if (!record) return;
      for (const child of this.children(record)) {
        if (this.localName(child.qualifiedName) === localName) result.push(child);
        visit(child.value);
      }
    };
    visit(value);
    return result;
  }

  private children(record: XmlRecord): QualifiedChild[] {
    const result: QualifiedChild[] = [];
    for (const [qualifiedName, value] of Object.entries(record)) {
      if (qualifiedName.startsWith('@_') || qualifiedName === '#text' || qualifiedName === '?xml') continue;
      if (Array.isArray(value)) value.forEach((entry) => result.push({ qualifiedName, value: entry }));
      else result.push({ qualifiedName, value });
    }
    return result;
  }

  private attribute(record: XmlRecord, name: string): string | undefined {
    const value = record[`@_${name}`];
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return undefined;
  }

  private elementId(value: unknown): string | undefined {
    const record = this.record(value);
    return record ? this.attribute(record, 'id') : undefined;
  }

  private nodeType(localName: string): SupportedNodeType | undefined {
    if (localName === 'startEvent') return 'START';
    if (localName === 'userTask') return 'APPROVAL';
    if (localName === 'exclusiveGateway') return 'CONDITION';
    if (localName === 'endEvent') return 'END';
    return undefined;
  }

  private isBpmnName(qualifiedName: string, namespaces: NamespaceContext): boolean {
    return this.isNameInPrefixes(qualifiedName, namespaces.bpmnPrefixes, namespaces.defaultBpmnNamespace);
  }

  private isWorkflowName(qualifiedName: string, namespaces: NamespaceContext): boolean {
    return this.isNameInPrefixes(qualifiedName, namespaces.workflowPrefixes, false);
  }

  private isNameInPrefixes(qualifiedName: string, prefixes: ReadonlySet<string>, allowUnprefixed: boolean): boolean {
    const separator = qualifiedName.indexOf(':');
    if (separator < 0) return allowUnprefixed;
    return prefixes.has(qualifiedName.slice(0, separator));
  }

  private localName(qualifiedName: string): string {
    const separator = qualifiedName.lastIndexOf(':');
    return separator < 0 ? qualifiedName : qualifiedName.slice(separator + 1);
  }

  private record(value: unknown): XmlRecord | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as XmlRecord : undefined;
  }

  private add(errors: BpmnWorkflowValidationError[], code: string, path: string, elementId: string | undefined, message: string): void {
    errors.push({ code, path, ...(elementId ? { elementId } : {}), message });
  }
}
