import { describe, expect, it } from 'vitest';
import type { FormField } from '../form-definitions/schemas/form-definition.schema.js';
import { BpmnWorkflowCompilerService } from './bpmn-workflow-compiler.service.js';
import { WORKFLOW_BPMN_EXTENSION_NAMESPACE } from './schemas/workflow-definition.schema.js';
import { WorkflowGraphValidatorService } from './workflow-graph-validator.service.js';

function makeFormField(overrides: Partial<FormField> & Pick<FormField, 'key' | 'type'>): FormField {
  return {
    key: overrides.key,
    label: overrides.label ?? overrides.key,
    type: overrides.type,
    required: overrides.required ?? false,
    order: overrides.order ?? 1,
    ...(overrides.options ? { options: overrides.options } : {}),
  } as FormField;
}

describe('WorkflowGraphValidatorService', () => {
  const validator = new WorkflowGraphValidatorService();

  it('allows onRevisionStepKey to loop back to an earlier approval step or self', () => {
    const result = validator.validate(
      'APPROVAL_1',
      [
        {
          stepKey: 'APPROVAL_1',
          name: 'Quản lý trực tiếp',
          type: 'APPROVAL',
          approvalMode: 'ANY',
          assigneeRule: { type: 'REQUESTER_DIRECT_MANAGER', includeInactive: false },
          onApproveStepKey: 'APPROVAL_2',
          onRejectStepKey: 'END_REJECTED',
          onRevisionStepKey: 'APPROVAL_1',
        },
        {
          stepKey: 'APPROVAL_2',
          name: 'Giám đốc duyệt',
          type: 'APPROVAL',
          approvalMode: 'ANY',
          assigneeRule: { type: 'COMPANY_MANAGER', includeInactive: false },
          onApproveStepKey: 'END_APPROVED',
          onRejectStepKey: 'END_REJECTED',
          onRevisionStepKey: 'APPROVAL_1',
        },
        {
          stepKey: 'END_APPROVED',
          name: 'Đã duyệt',
          type: 'END',
          endResult: 'APPROVED',
        },
        {
          stepKey: 'END_REJECTED',
          name: 'Từ chối',
          type: 'END',
          endResult: 'REJECTED',
        },
      ],
      [],
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects forward transition cycles via approve or condition branches', () => {
    const result = validator.validate(
      'APPROVAL_1',
      [
        {
          stepKey: 'APPROVAL_1',
          name: 'Bước 1',
          type: 'APPROVAL',
          approvalMode: 'ANY',
          assigneeRule: { type: 'REQUESTER_DIRECT_MANAGER', includeInactive: false },
          onApproveStepKey: 'APPROVAL_2',
          onRejectStepKey: 'END_REJECTED',
        },
        {
          stepKey: 'APPROVAL_2',
          name: 'Bước 2',
          type: 'APPROVAL',
          approvalMode: 'ANY',
          assigneeRule: { type: 'COMPANY_MANAGER', includeInactive: false },
          onApproveStepKey: 'APPROVAL_1',
          onRejectStepKey: 'END_REJECTED',
        },
        {
          stepKey: 'END_REJECTED',
          name: 'Từ chối',
          type: 'END',
          endResult: 'REJECTED',
        },
      ],
      [],
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === 'WORKFLOW_CYCLE')).toBe(true);
  });

  it('accepts workUnitId requester attribute condition and rejects SECTION form field condition', () => {
    const validResult = validator.validate(
      'CHECK_UNIT',
      [
        {
          stepKey: 'CHECK_UNIT',
          name: 'Kiểm tra đơn vị làm việc',
          type: 'CONDITION',
          condition: {
            source: 'REQUESTER_ATTRIBUTE',
            fieldKey: 'workUnitId',
            operator: 'IN',
            value: ['65f000000000000000000001'],
          },
          onTrueStepKey: 'END_APPROVED',
          onFalseStepKey: 'END_REJECTED',
        },
        { stepKey: 'END_APPROVED', name: 'Duyệt', type: 'END', endResult: 'APPROVED' },
        { stepKey: 'END_REJECTED', name: 'Từ chối', type: 'END', endResult: 'REJECTED' },
      ],
      [],
    );

    expect(validResult.valid).toBe(true);

    const sectionResult = validator.validate(
      'CHECK_SECTION',
      [
        {
          stepKey: 'CHECK_SECTION',
          name: 'Kiểm tra section',
          type: 'CONDITION',
          condition: {
            source: 'FORM_FIELD',
            fieldKey: 'sec_info',
            operator: 'EQUALS',
            value: 'x',
          },
          onTrueStepKey: 'END_APPROVED',
          onFalseStepKey: 'END_REJECTED',
        },
        { stepKey: 'END_APPROVED', name: 'Duyệt', type: 'END', endResult: 'APPROVED' },
        { stepKey: 'END_REJECTED', name: 'Từ chối', type: 'END', endResult: 'REJECTED' },
      ],
      [makeFormField({ key: 'sec_info', type: 'SECTION' })],
    );

    expect(sectionResult.valid).toBe(false);
    expect(sectionResult.errors.some((error) => error.code === 'CONDITION_FIELD_TYPE_UNSUPPORTED')).toBe(true);
  });

  it('compiles and validates bpmn:serviceTask ACTION steps for balance deduction and notification', () => {
    const compiler = new BpmnWorkflowCompilerService(validator);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:wf="${WORKFLOW_BPMN_EXTENSION_NAMESPACE}" id="Defs_1">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="Start_1" name="Bắt đầu">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:serviceTask id="ServiceTask_Deduct" name="Trừ phép năm">
      <bpmn:extensionElements>
        <wf:action stepKey="ACTION_DEDUCT" actionType="BALANCE_DEDUCT" fieldKey="so_ngay_nghi" allowNegative="false" nextFlow="Flow_2" />
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:serviceTask id="ServiceTask_Notify" name="Báo phòng nhân sự">
      <bpmn:extensionElements>
        <wf:action stepKey="ACTION_NOTIFY" actionType="SEND_NOTIFICATION" assigneeRuleType="REQUESTER_DIRECT_MANAGER" includeInactive="false" notificationTitle="Đơn nghỉ phép mới" nextFlow="Flow_3" />
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="End_1" name="Hoàn tất">
      <bpmn:extensionElements>
        <wf:end stepKey="END_APPROVED" endResult="APPROVED" />
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="ServiceTask_Deduct" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="ServiceTask_Deduct" targetRef="ServiceTask_Notify" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="ServiceTask_Notify" targetRef="End_1" />
  </bpmn:process>
</bpmn:definitions>`;

    const compiledResult = compiler.compile(xml, [
      makeFormField({ key: 'so_ngay_nghi', type: 'NUMBER' }),
    ]);

    expect(compiledResult.valid).toBe(true);
    expect(compiledResult.compiled?.steps).toHaveLength(3);
    expect(compiledResult.compiled?.steps[0]).toEqual(
      expect.objectContaining({
        stepKey: 'ACTION_DEDUCT',
        type: 'ACTION',
        actionConfig: {
          actionType: 'BALANCE_DEDUCT',
          fieldKey: 'so_ngay_nghi',
          allowNegative: false,
        },
        onNextStepKey: 'ACTION_NOTIFY',
      }),
    );
  });

  it('given a BPMN 2.0 UserTask connected through an ExclusiveGateway checking APPROVAL_OUTCOME, when compiled, then single outgoing approval transition and decision gateway succeed', () => {
    const compiler = new BpmnWorkflowCompilerService(new WorkflowGraphValidatorService());
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:wf="https://workflow-erp.local/schema/bpmn/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="Start_1" name="Bắt đầu">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_1" name="Phê duyệt">
      <bpmn:extensionElements>
        <wf:approval stepKey="APPROVAL_1" approvalMode="ANY" allowSelfApproval="false" allowReassign="true" assigneeRuleType="REQUESTER_DIRECT_MANAGER" includeInactive="false" nextFlow="Flow_2" />
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:exclusiveGateway id="Gateway_1" name="Kết quả duyệt?" default="Flow_4">
      <bpmn:extensionElements>
        <wf:condition stepKey="CONDITION_1" source="APPROVAL_OUTCOME" fieldKey="decision" operator="EQUALS" valueJson="&quot;APPROVED&quot;" trueFlow="Flow_3" falseFlow="Flow_4" />
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:endEvent id="End_Approved" name="Đã phê duyệt">
      <bpmn:extensionElements><wf:end stepKey="END_APPROVED" endResult="APPROVED" /></bpmn:extensionElements>
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="End_Rejected" name="Đã từ chối">
      <bpmn:extensionElements><wf:end stepKey="END_REJECTED" endResult="REJECTED" /></bpmn:extensionElements>
      <bpmn:incoming>Flow_4</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_3" name="Duyệt" sourceRef="Gateway_1" targetRef="End_Approved" />
    <bpmn:sequenceFlow id="Flow_4" name="Từ chối" sourceRef="Gateway_1" targetRef="End_Rejected" />
  </bpmn:process>
</bpmn:definitions>`;

    const result = compiler.compile(xml, []);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.compiled?.steps[0]).toEqual(
      expect.objectContaining({
        stepKey: 'APPROVAL_1',
        type: 'APPROVAL',
        onNextStepKey: 'CONDITION_1',
      }),
    );
    expect(result.compiled?.steps[1]).toEqual(
      expect.objectContaining({
        stepKey: 'CONDITION_1',
        type: 'CONDITION',
        condition: { source: 'APPROVAL_OUTCOME', fieldKey: 'decision', operator: 'EQUALS', value: 'APPROVED' },
        onTrueStepKey: 'END_APPROVED',
        onFalseStepKey: 'END_REJECTED',
      }),
    );
  });
});
