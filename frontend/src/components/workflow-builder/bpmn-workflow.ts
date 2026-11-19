import type {
  ApprovalMode,
  AssigneeRuleType,
  ConditionOperator,
  WorkflowActionType,
  WorkflowAssigneeRule,
  WorkflowConditionSource,
  WorkflowEndResult,
} from '../../types/workflow'

export const workflowBpmnNamespace = 'https://workflow-erp.local/schema/bpmn/1.0'

export const workflowModdleDescriptor = {
  name: 'WorkflowERP',
  uri: workflowBpmnNamespace,
  prefix: 'wf',
  xml: { tagAlias: 'lowerCase' },
  types: [
    {
      name: 'Approval',
      superClass: ['Element'],
      meta: { allowedIn: ['bpmn:ExtensionElements'] },
      properties: [
        { name: 'stepKey', type: 'String', isAttr: true },
        { name: 'approvalMode', type: 'String', isAttr: true },
        { name: 'allowSelfApproval', type: 'Boolean', isAttr: true },
        { name: 'allowReassign', type: 'Boolean', isAttr: true },
        { name: 'assigneeRuleType', type: 'String', isAttr: true },
        { name: 'roleIds', type: 'String', isAttr: true },
        { name: 'positionIds', type: 'String', isAttr: true },
        { name: 'userIds', type: 'String', isAttr: true },
        { name: 'departmentId', type: 'String', isAttr: true },
        { name: 'includeInactive', type: 'Boolean', isAttr: true },
        { name: 'dueInHours', type: 'String', isAttr: true },
        { name: 'nextFlow', type: 'String', isAttr: true },
        { name: 'approveFlow', type: 'String', isAttr: true },
        { name: 'rejectFlow', type: 'String', isAttr: true },
        { name: 'revisionFlow', type: 'String', isAttr: true },
      ],
    },
    {
      name: 'Condition',
      superClass: ['Element'],
      meta: { allowedIn: ['bpmn:ExtensionElements'] },
      properties: [
        { name: 'stepKey', type: 'String', isAttr: true },
        { name: 'source', type: 'String', isAttr: true },
        { name: 'fieldKey', type: 'String', isAttr: true },
        { name: 'operator', type: 'String', isAttr: true },
        { name: 'valueJson', type: 'String', isAttr: true },
        { name: 'trueFlow', type: 'String', isAttr: true },
        { name: 'falseFlow', type: 'String', isAttr: true },
      ],
    },
    {
      name: 'Action',
      superClass: ['Element'],
      meta: { allowedIn: ['bpmn:ExtensionElements'] },
      properties: [
        { name: 'stepKey', type: 'String', isAttr: true },
        { name: 'actionType', type: 'String', isAttr: true },
        { name: 'fieldKey', type: 'String', isAttr: true },
        { name: 'allowNegative', type: 'Boolean', isAttr: true },
        { name: 'assigneeRuleType', type: 'String', isAttr: true },
        { name: 'roleIds', type: 'String', isAttr: true },
        { name: 'positionIds', type: 'String', isAttr: true },
        { name: 'userIds', type: 'String', isAttr: true },
        { name: 'departmentId', type: 'String', isAttr: true },
        { name: 'includeInactive', type: 'Boolean', isAttr: true },
        { name: 'notificationTitle', type: 'String', isAttr: true },
        { name: 'notificationMessage', type: 'String', isAttr: true },
        { name: 'nextFlow', type: 'String', isAttr: true },
      ],
    },
    {
      name: 'End',
      superClass: ['Element'],
      meta: { allowedIn: ['bpmn:ExtensionElements'] },
      properties: [
        { name: 'stepKey', type: 'String', isAttr: true },
        { name: 'endResult', type: 'String', isAttr: true },
      ],
    },
  ],
}

export interface BpmnFlowOption {
  id: string
  label: string
  targetId: string
}

export type BpmnSelectionKind = 'START' | 'APPROVAL' | 'CONDITION' | 'ACTION' | 'END' | 'SEQUENCE_FLOW'

export interface BpmnNodeSelection {
  elementId: string
  kind: BpmnSelectionKind
  name: string
  stepKey: string
  outgoingFlows: BpmnFlowOption[]
  approvalMode: ApprovalMode
  allowSelfApproval: boolean
  allowReassign: boolean
  assigneeRule: WorkflowAssigneeRule
  dueInHours?: number
  approveFlow: string
  rejectFlow: string
  revisionFlow: string
  conditionSource: WorkflowConditionSource
  conditionFieldKey: string
  conditionOperator: ConditionOperator
  conditionValue: unknown
  trueFlow: string
  falseFlow: string
  actionType: WorkflowActionType
  actionFieldKey: string
  actionAllowNegative: boolean
  actionAssigneeRule: WorkflowAssigneeRule
  actionNotificationTitle: string
  actionNotificationMessage: string
  nextFlow: string
  endResult: WorkflowEndResult
}

export interface BpmnNodePatch {
  name?: string
  stepKey?: string
  approvalMode?: ApprovalMode
  allowSelfApproval?: boolean
  allowReassign?: boolean
  assigneeRule?: WorkflowAssigneeRule
  dueInHours?: number
  approveFlow?: string
  rejectFlow?: string
  revisionFlow?: string
  conditionSource?: WorkflowConditionSource
  conditionFieldKey?: string
  conditionOperator?: ConditionOperator
  conditionValue?: unknown
  trueFlow?: string
  falseFlow?: string
  actionType?: WorkflowActionType
  actionFieldKey?: string
  actionAllowNegative?: boolean
  actionAssigneeRule?: WorkflowAssigneeRule
  actionNotificationTitle?: string
  actionNotificationMessage?: string
  nextFlow?: string
  endResult?: WorkflowEndResult
}

export const defaultWorkflowBpmnXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:wf="${workflowBpmnNamespace}" id="Definitions_Workflow" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_Workflow" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Bắt đầu">
      <bpmn:outgoing>Flow_Start</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="UserTask_Approval" name="Phê duyệt">
      <bpmn:extensionElements>
        <wf:approval stepKey="APPROVAL_1" approvalMode="ANY" allowSelfApproval="false" allowReassign="true" assigneeRuleType="REQUESTER_DIRECT_MANAGER" includeInactive="false" nextFlow="Flow_ToGateway" />
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_Start</bpmn:incoming>
      <bpmn:outgoing>Flow_ToGateway</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:exclusiveGateway id="Gateway_Decision" name="Kết quả duyệt?">
      <bpmn:extensionElements>
        <wf:condition stepKey="CONDITION_1" source="APPROVAL_OUTCOME" fieldKey="decision" operator="EQUALS" valueJson="&quot;APPROVED&quot;" trueFlow="Flow_Approved" falseFlow="Flow_Rejected" />
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_ToGateway</bpmn:incoming>
      <bpmn:outgoing>Flow_Approved</bpmn:outgoing>
      <bpmn:outgoing>Flow_Rejected</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:endEvent id="EndEvent_Approved" name="Đã phê duyệt">
      <bpmn:extensionElements><wf:end stepKey="END_APPROVED" endResult="APPROVED" /></bpmn:extensionElements>
      <bpmn:incoming>Flow_Approved</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="EndEvent_Rejected" name="Đã từ chối">
      <bpmn:extensionElements><wf:end stepKey="END_REJECTED" endResult="REJECTED" /></bpmn:extensionElements>
      <bpmn:incoming>Flow_Rejected</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_Start" sourceRef="StartEvent_1" targetRef="UserTask_Approval" />
    <bpmn:sequenceFlow id="Flow_ToGateway" sourceRef="UserTask_Approval" targetRef="Gateway_Decision" />
    <bpmn:sequenceFlow id="Flow_Approved" name="Duyệt" sourceRef="Gateway_Decision" targetRef="EndEvent_Approved" />
    <bpmn:sequenceFlow id="Flow_Rejected" name="Từ chối" sourceRef="Gateway_Decision" targetRef="EndEvent_Rejected" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_Workflow">
    <bpmndi:BPMNPlane id="BPMNPlane_Workflow" bpmnElement="Process_Workflow">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="100" y="242" width="36" height="36" />
        <bpmndi:BPMNLabel><dc:Bounds x="97" y="285" width="42" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UserTask_Approval_di" bpmnElement="UserTask_Approval"><dc:Bounds x="210" y="220" width="120" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_Decision_di" bpmnElement="Gateway_Decision" isMarkerVisible="true">
        <dc:Bounds x="415" y="235" width="50" height="50" />
        <bpmndi:BPMNLabel><dc:Bounds x="475" y="253" width="84" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_Approved_di" bpmnElement="EndEvent_Approved">
        <dc:Bounds x="590" y="142" width="36" height="36" />
        <bpmndi:BPMNLabel><dc:Bounds x="572" y="185" width="72" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_Rejected_di" bpmnElement="EndEvent_Rejected">
        <dc:Bounds x="590" y="342" width="36" height="36" />
        <bpmndi:BPMNLabel><dc:Bounds x="580" y="385" width="56" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_Start_di" bpmnElement="Flow_Start"><di:waypoint x="136" y="260" /><di:waypoint x="210" y="260" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_ToGateway_di" bpmnElement="Flow_ToGateway"><di:waypoint x="330" y="260" /><di:waypoint x="415" y="260" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Approved_di" bpmnElement="Flow_Approved">
        <di:waypoint x="440" y="235" /><di:waypoint x="440" y="160" /><di:waypoint x="590" y="160" />
        <bpmndi:BPMNLabel><dc:Bounds x="495" y="138" width="34" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Rejected_di" bpmnElement="Flow_Rejected">
        <di:waypoint x="440" y="285" /><di:waypoint x="440" y="360" /><di:waypoint x="590" y="360" />
        <bpmndi:BPMNLabel><dc:Bounds x="490" y="368" width="44" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

export const assigneeRuleLabels: Record<AssigneeRuleType, string> = {
  REQUESTER_DIRECT_MANAGER: 'Quản lý trực tiếp của người gửi',
  REQUESTER_WORK_UNIT_MANAGER: 'Quản lý đơn vị làm việc',
  REQUESTER_FUNCTIONAL_DEPARTMENT_MANAGER: 'Trưởng phòng chuyên môn',
  REQUESTER_PARENT_WORK_UNIT_MANAGER: 'Quản lý đơn vị cấp trên',
  REQUESTER_DEPARTMENT_MANAGER: 'Quản lý đơn vị làm việc (quy tắc cũ)',
  REQUESTER_PARENT_DEPARTMENT_MANAGER: 'Quản lý đơn vị cấp trên (quy tắc cũ)',
  COMPANY_MANAGER: 'Giám đốc / người quản lý cấp công ty',
  ROLE: 'Theo vai trò',
  ROLE_IN_REQUESTER_DEPARTMENT: 'Vai trò trong phòng ban người gửi',
  POSITION_IN_REQUESTER_DEPARTMENT: 'Chức danh trong phòng ban người gửi',
  SPECIFIC_USER: 'Người dùng cụ thể',
}

export const workflowActionTypeLabels: Record<WorkflowActionType, string> = {
  BALANCE_DEDUCT: 'Quản lý quỹ: Trừ quỹ ngày phép năm',
  BALANCE_ADD: 'Quản lý quỹ: Cộng quỹ ngày phép năm',
  SEND_NOTIFICATION: 'Thông báo: Gửi thông báo tự động',
}
