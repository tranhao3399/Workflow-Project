import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import Modeler from 'bpmn-js/lib/Modeler'
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer'
import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'
import type { WorkflowAssigneeRule } from '../../types/workflow'
import {
  workflowModdleDescriptor,
  type BpmnFlowOption,
  type BpmnNodePatch,
  type BpmnNodeSelection,
} from './bpmn-workflow'

interface BpmnBusinessObject {
  $type: string
  id: string
  name?: string
  extensionElements?: { values?: BpmnMetadata[] }
}

interface BpmnMetadata extends Record<string, unknown> {
  $type: string
}

interface DiagramElement {
  id: string
  type: string
  businessObject: BpmnBusinessObject
  outgoing?: DiagramElement[]
  source?: DiagramElement
  target?: DiagramElement
  labelTarget?: DiagramElement
}

interface CanvasService {
  zoom(value: 'fit-viewport' | number): void
  addMarker(element: string | DiagramElement, marker: string): void
  removeMarker(element: string | DiagramElement, marker: string): void
  scrollToElement(element: DiagramElement, padding?: number | Record<string, number>): void
}

interface ElementRegistryService {
  get(id: string): DiagramElement | undefined
  getAll(): DiagramElement[]
}

interface SelectionService {
  select(element: DiagramElement | DiagramElement[]): void
}

interface ModelingService {
  updateProperties(element: DiagramElement, properties: Record<string, unknown>): void
  updateModdleProperties(element: DiagramElement, moddleElement: BpmnMetadata, properties: Record<string, unknown>): void
  removeElements(elements: DiagramElement[]): void
}

interface ModdleService {
  create<T>(type: string, properties?: Record<string, unknown>): T
}

interface ElementFactoryService {
  createShape(properties: Record<string, unknown>): DiagramElement
}

interface CreateService {
  start(event: Event, shape: DiagramElement): void
}

interface ConnectService {
  start(event: Event, element: DiagramElement): void
}

interface PaletteEntry {
  group?: string
  className?: string
  title?: string
  separator?: boolean
  action?: { click: (event: Event) => void; dragstart?: (event: Event) => void }
}

interface PaletteService {
  registerProvider(provider: { getPaletteEntries: () => Record<string, PaletteEntry> }): void
}

interface ContextPadService {
  registerProvider(provider: { getContextPadEntries: (element: DiagramElement) => Record<string, PaletteEntry> }): void
}

interface EventWithElements {
  newSelection?: DiagramElement[]
  element?: DiagramElement
}

type BpmnEditor = Modeler | NavigatedViewer

const supportedTypes = new Set([
  'bpmn:Process',
  'bpmn:StartEvent',
  'bpmn:UserTask',
  'bpmn:ExclusiveGateway',
  'bpmn:EndEvent',
  'bpmn:SequenceFlow',
])

const errorMarker = 'workflow-bpmn-error'

export interface WorkflowGraphCanvasHandle {
  exportXml: () => Promise<string>
  focusElement: (elementId: string) => void
  updateSelected: (patch: BpmnNodePatch) => void
  deleteSelected: () => void
}

interface WorkflowGraphCanvasProps {
  xml: string
  editable: boolean
  errorElementIds: readonly string[]
  onSelectionChange: (selection: BpmnNodeSelection | null) => void
  onChanged: () => void
  onError: (message: string) => void
}

export const WorkflowGraphCanvas = forwardRef<WorkflowGraphCanvasHandle, WorkflowGraphCanvasProps>(function WorkflowGraphCanvas(
  { xml, editable, errorElementIds, onSelectionChange, onChanged, onError },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<BpmnEditor | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const errorIdsRef = useRef<string[]>([])
  const callbacksRef = useRef({ onSelectionChange, onChanged, onError })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    callbacksRef.current = { onSelectionChange, onChanged, onError }
  }, [onChanged, onError, onSelectionChange])

  useImperativeHandle(ref, () => ({
    exportXml: async () => {
      const editor = editorRef.current
      if (!editor) throw new Error('Trình thiết kế BPMN chưa sẵn sàng.')
      const unsupported = unsupportedElements(editor)
      if (unsupported.length) throw new Error(`Sơ đồ có phần tử chưa được hỗ trợ: ${unsupported.join(', ')}.`)
      const result = await editor.saveXML({ format: true })
      if (!result.xml) throw new Error('Không thể xuất BPMN XML từ sơ đồ hiện tại.')
      return result.xml
    },
    focusElement: (elementId) => focusElement(editorRef.current, elementId),
    updateSelected: (patch) => updateSelectedElement(editorRef.current, selectedIdRef.current, patch, callbacksRef.current.onSelectionChange),
    deleteSelected: () => {
      const editor = editorRef.current
      const element = selectedIdRef.current ? editor?.get<ElementRegistryService>('elementRegistry').get(selectedIdRef.current) : undefined
      if (!editor || !element || element.type === 'bpmn:Process') return
      editor.get<ModelingService>('modeling').removeElements([element])
      selectedIdRef.current = null
      callbacksRef.current.onSelectionChange(null)
    },
  }), [])

  useEffect(() => {
    if (!containerRef.current) return
    let disposed = false
    let importing = true
    const editor: BpmnEditor = editable
      ? new Modeler({
          container: containerRef.current,
          additionalModules: [restrictedModelingModule],
          moddleExtensions: { wf: workflowModdleDescriptor },
          keyboard: { bindTo: document },
        })
      : new NavigatedViewer({ container: containerRef.current, moddleExtensions: { wf: workflowModdleDescriptor } })
    editorRef.current = editor
    selectedIdRef.current = null
    setIsLoading(true)

    const select = (element?: DiagramElement) => {
      const target = element?.labelTarget ?? element
      if (!target || target.type === 'bpmn:Process') {
        selectedIdRef.current = null
        callbacksRef.current.onSelectionChange(null)
        return
      }
      selectedIdRef.current = target.id
      callbacksRef.current.onSelectionChange(readSelection(target))
    }

    if (editable) {
      editor.on<EventWithElements>('selection.changed', (event) => select(event.newSelection?.[0]))
      editor.on('commandStack.changed', () => {
        if (!importing) callbacksRef.current.onChanged()
        const selected = selectedIdRef.current
          ? editor.get<ElementRegistryService>('elementRegistry').get(selectedIdRef.current)
          : undefined
        if (selected) callbacksRef.current.onSelectionChange(readSelection(selected))
      })
    } else {
      editor.on<EventWithElements>('element.click', (event) => select(event.element))
    }

    void editor.importXML(xml).then(() => {
      if (disposed) return
      const unsupported = unsupportedElements(editor)
      if (unsupported.length) callbacksRef.current.onError(`Sơ đồ chứa phần tử backend không hỗ trợ: ${unsupported.join(', ')}.`)
      editor.get<CanvasService>('canvas').zoom('fit-viewport')
      importing = false
      setIsLoading(false)
    }).catch((error: unknown) => {
      if (disposed) return
      importing = false
      setIsLoading(false)
      callbacksRef.current.onError(error instanceof Error ? error.message : 'Không thể mở BPMN XML.')
    })

    return () => {
      disposed = true
      editor.destroy()
      if (editorRef.current === editor) editorRef.current = null
    }
  }, [editable, xml])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const canvas = editor.get<CanvasService>('canvas')
    for (const id of errorIdsRef.current) {
      if (editor.get<ElementRegistryService>('elementRegistry').get(id)) canvas.removeMarker(id, errorMarker)
    }
    for (const id of errorElementIds) {
      if (editor.get<ElementRegistryService>('elementRegistry').get(id)) canvas.addMarker(id, errorMarker)
    }
    errorIdsRef.current = [...errorElementIds]
  }, [errorElementIds])

  return <div className="workflow-bpmn-shell">
    {isLoading && <div className="workflow-bpmn-loading">Đang mở sơ đồ BPMN...</div>}
    <div ref={containerRef} className={`workflow-bpmn-canvas${editable ? '' : ' is-readonly'}`} aria-label={editable ? 'Trình thiết kế quy trình BPMN' : 'Sơ đồ quy trình BPMN'} />
    <div className="workflow-bpmn-legend" aria-hidden="true"><span><i className="legend-start" />Bắt đầu</span><span><i className="legend-task" />Phê duyệt</span><span><i className="legend-condition" />Điều kiện</span><span><i className="legend-end" />Kết thúc</span></div>
  </div>
})

class RestrictedPaletteProvider {
  static $inject = ['palette', 'create', 'elementFactory', 'moddle', 'elementRegistry']
  private readonly create: CreateService
  private readonly elementFactory: ElementFactoryService
  private readonly moddle: ModdleService
  private readonly registry: ElementRegistryService

  constructor(
    palette: PaletteService,
    create: CreateService,
    elementFactory: ElementFactoryService,
    moddle: ModdleService,
    registry: ElementRegistryService,
  ) {
    this.create = create
    this.elementFactory = elementFactory
    this.moddle = moddle
    this.registry = registry
    palette.registerProvider(this)
  }

  getPaletteEntries(): Record<string, PaletteEntry> {
    const createEntry = (type: string, className: string, title: string) => {
      const start = (event: Event) => {
        const shape = this.elementFactory.createShape({ type })
        initializeBusinessObject(shape.businessObject, type, this.moddle, this.registry)
        this.create.start(event, shape)
      }
      return { group: 'workflow', className, title, action: { click: start, dragstart: start } }
    }
    return {
      'create.start-event': createEntry('bpmn:StartEvent', 'bpmn-icon-start-event-none', 'Tạo điểm bắt đầu'),
      'create.user-task': createEntry('bpmn:UserTask', 'bpmn-icon-user-task', 'Tạo bước phê duyệt'),
      'create.exclusive-gateway': createEntry('bpmn:ExclusiveGateway', 'bpmn-icon-gateway-xor', 'Tạo điều kiện'),
      'create.end-event': createEntry('bpmn:EndEvent', 'bpmn-icon-end-event-none', 'Tạo điểm kết thúc'),
    }
  }
}

class RestrictedContextPadProvider {
  static $inject = ['contextPad', 'connect', 'modeling']
  private readonly connect: ConnectService
  private readonly modeling: ModelingService

  constructor(
    contextPad: ContextPadService,
    connect: ConnectService,
    modeling: ModelingService,
  ) {
    this.connect = connect
    this.modeling = modeling
    contextPad.registerProvider(this)
  }

  getContextPadEntries(element: DiagramElement): Record<string, PaletteEntry> {
    if (element.type === 'label') return {}
    const entries: Record<string, PaletteEntry> = {
      delete: {
        group: 'edit',
        className: 'bpmn-icon-trash',
        title: 'Xóa phần tử',
        action: { click: () => this.modeling.removeElements([element]) },
      },
    }
    if (element.type !== 'bpmn:EndEvent' && element.type !== 'bpmn:SequenceFlow') {
      entries.connect = {
        group: 'connect',
        className: 'bpmn-icon-connection-multi',
        title: 'Tạo đường nối',
        action: { click: (event) => this.connect.start(event, element), dragstart: (event) => this.connect.start(event, element) },
      }
    }
    return entries
  }
}

const restrictedModelingModule = {
  paletteProvider: ['type', RestrictedPaletteProvider],
  contextPadProvider: ['type', RestrictedContextPadProvider],
}

function initializeBusinessObject(businessObject: BpmnBusinessObject, type: string, moddle: ModdleService, registry: ElementRegistryService) {
  if (type === 'bpmn:StartEvent') {
    businessObject.name = 'Bắt đầu'
    return
  }
  const prefix = type === 'bpmn:UserTask' ? 'APPROVAL' : type === 'bpmn:ExclusiveGateway' ? 'CONDITION' : 'END'
  const stepKey = nextStepKey(prefix, registry)
  businessObject.name = type === 'bpmn:UserTask' ? 'Bước phê duyệt' : type === 'bpmn:ExclusiveGateway' ? 'Điều kiện' : 'Kết thúc'
  const metadata = type === 'bpmn:UserTask'
    ? moddle.create<BpmnMetadata>('wf:Approval', {
        stepKey,
        approvalMode: 'ANY',
        allowSelfApproval: false,
        assigneeRuleType: 'REQUESTER_DIRECT_MANAGER',
        includeInactive: false,
        approveFlow: '',
        rejectFlow: '',
      })
    : type === 'bpmn:ExclusiveGateway'
      ? moddle.create<BpmnMetadata>('wf:Condition', {
          stepKey,
          source: 'FORM_FIELD',
          fieldKey: '',
          operator: 'EQUALS',
          valueJson: '""',
          trueFlow: '',
          falseFlow: '',
        })
      : moddle.create<BpmnMetadata>('wf:End', { stepKey, endResult: 'APPROVED' })
  businessObject.extensionElements = moddle.create('bpmn:ExtensionElements', { values: [metadata] })
}

function nextStepKey(prefix: string, registry: ElementRegistryService): string {
  const used = new Set(registry.getAll().map((element) => metadataFor(element.businessObject)?.stepKey).filter((value): value is string => typeof value === 'string'))
  let index = 1
  while (used.has(`${prefix}_${index}`)) index += 1
  return `${prefix}_${index}`
}

function unsupportedElements(editor: BpmnEditor): string[] {
  return editor.get<ElementRegistryService>('elementRegistry').getAll()
    .filter((element) => element.type !== 'label' && !supportedTypes.has(element.type))
    .map((element) => `${element.type} (${element.id})`)
}

function focusElement(editor: BpmnEditor | null, elementId: string) {
  if (!editor) return
  const registry = editor.get<ElementRegistryService>('elementRegistry')
  const element = registry.get(elementId)
  if (!element) return
  const canvas = editor.get<CanvasService>('canvas')
  canvas.scrollToElement(element, 140)
  canvas.addMarker(element, errorMarker)
  editor.get<SelectionService>('selection', false)?.select(element)
}

function updateSelectedElement(editor: BpmnEditor | null, selectedId: string | null, patch: BpmnNodePatch, onSelectionChange: (selection: BpmnNodeSelection | null) => void) {
  if (!editor || !selectedId || !(editor instanceof Modeler)) return
  const registry = editor.get<ElementRegistryService>('elementRegistry')
  const element = registry.get(selectedId)
  if (!element) return
  const modeling = editor.get<ModelingService>('modeling')
  if (patch.name !== undefined) modeling.updateProperties(element, { name: patch.name })
  const metadata = metadataFor(element.businessObject)
  if (metadata) {
    const attributes: Record<string, unknown> = {}
    if (patch.stepKey !== undefined) attributes.stepKey = patch.stepKey.toUpperCase()
    if (patch.approvalMode !== undefined) attributes.approvalMode = patch.approvalMode
    if (patch.allowSelfApproval !== undefined) attributes.allowSelfApproval = patch.allowSelfApproval
    if ('dueInHours' in patch) attributes.dueInHours = patch.dueInHours ? String(patch.dueInHours) : undefined
    if (patch.approveFlow !== undefined) attributes.approveFlow = patch.approveFlow
    if (patch.rejectFlow !== undefined) attributes.rejectFlow = patch.rejectFlow
    if (patch.revisionFlow !== undefined) attributes.revisionFlow = patch.revisionFlow || undefined
    if (patch.conditionSource !== undefined) attributes.source = patch.conditionSource
    if (patch.conditionFieldKey !== undefined) attributes.fieldKey = patch.conditionFieldKey
    if (patch.conditionOperator !== undefined) attributes.operator = patch.conditionOperator
    if (patch.conditionValue !== undefined) attributes.valueJson = JSON.stringify(patch.conditionValue)
    if (patch.trueFlow !== undefined) attributes.trueFlow = patch.trueFlow
    if (patch.falseFlow !== undefined) attributes.falseFlow = patch.falseFlow
    if (patch.endResult !== undefined) attributes.endResult = patch.endResult
    if (patch.assigneeRule !== undefined) Object.assign(attributes, assigneeAttributes(patch.assigneeRule))
    if (Object.keys(attributes).length) modeling.updateModdleProperties(element, metadata, attributes)
  }
  window.requestAnimationFrame(() => onSelectionChange(readSelection(element)))
}

function assigneeAttributes(rule: WorkflowAssigneeRule): Record<string, unknown> {
  return {
    assigneeRuleType: rule.type,
    roleIds: rule.roleIds?.length ? rule.roleIds.join(',') : undefined,
    positionIds: rule.positionIds?.length ? rule.positionIds.join(',') : undefined,
    userIds: rule.userIds?.length ? rule.userIds.join(',') : undefined,
    departmentId: rule.departmentId || undefined,
    includeInactive: false,
  }
}

function readSelection(element: DiagramElement): BpmnNodeSelection | null {
  const kind = selectionKind(element.type)
  if (!kind) return null
  const businessObject = element.businessObject
  const metadata = metadataFor(businessObject)
  const outgoingFlows: BpmnFlowOption[] = (element.outgoing ?? []).filter((flow) => flow.type === 'bpmn:SequenceFlow').map((flow) => ({
    id: flow.id,
    label: `${flow.businessObject.name?.trim() || flow.id} → ${flow.target?.businessObject.name?.trim() || flow.target?.id || 'Chưa có đích'}`,
    targetId: flow.target?.id ?? '',
  }))
  return {
    elementId: element.id,
    kind,
    name: businessObject.name ?? '',
    stepKey: textAttribute(metadata, 'stepKey'),
    outgoingFlows,
    approvalMode: oneOf(textAttribute(metadata, 'approvalMode'), ['ANY', 'ALL', 'MAJORITY'], 'ANY'),
    allowSelfApproval: booleanAttribute(metadata, 'allowSelfApproval'),
    assigneeRule: {
      type: oneOf(textAttribute(metadata, 'assigneeRuleType'), [
        'REQUESTER_DIRECT_MANAGER',
        'REQUESTER_DEPARTMENT_MANAGER',
        'ROLE',
        'ROLE_IN_REQUESTER_DEPARTMENT',
        'POSITION_IN_REQUESTER_DEPARTMENT',
        'SPECIFIC_USER',
      ], 'REQUESTER_DIRECT_MANAGER'),
      roleIds: listAttribute(metadata, 'roleIds'),
      positionIds: listAttribute(metadata, 'positionIds'),
      userIds: listAttribute(metadata, 'userIds'),
      departmentId: textAttribute(metadata, 'departmentId') || undefined,
      includeInactive: false,
    },
    dueInHours: positiveNumberAttribute(metadata, 'dueInHours'),
    approveFlow: textAttribute(metadata, 'approveFlow'),
    rejectFlow: textAttribute(metadata, 'rejectFlow'),
    revisionFlow: textAttribute(metadata, 'revisionFlow'),
    conditionSource: oneOf(textAttribute(metadata, 'source'), ['FORM_FIELD', 'REQUESTER_ATTRIBUTE'], 'FORM_FIELD'),
    conditionFieldKey: textAttribute(metadata, 'fieldKey'),
    conditionOperator: oneOf(textAttribute(metadata, 'operator'), ['EQUALS', 'NOT_EQUALS', 'IN', 'GREATER_THAN', 'LESS_THAN'], 'EQUALS'),
    conditionValue: jsonAttribute(metadata, 'valueJson'),
    trueFlow: textAttribute(metadata, 'trueFlow'),
    falseFlow: textAttribute(metadata, 'falseFlow'),
    endResult: oneOf(textAttribute(metadata, 'endResult'), ['APPROVED', 'REJECTED'], 'APPROVED'),
  }
}

function selectionKind(type: string): BpmnNodeSelection['kind'] | null {
  if (type === 'bpmn:StartEvent') return 'START'
  if (type === 'bpmn:UserTask') return 'APPROVAL'
  if (type === 'bpmn:ExclusiveGateway') return 'CONDITION'
  if (type === 'bpmn:EndEvent') return 'END'
  if (type === 'bpmn:SequenceFlow') return 'SEQUENCE_FLOW'
  return null
}

function metadataFor(businessObject: BpmnBusinessObject): BpmnMetadata | undefined {
  return businessObject.extensionElements?.values?.find((value) => ['wf:Approval', 'wf:Condition', 'wf:End'].includes(value.$type))
}

function textAttribute(metadata: BpmnMetadata | undefined, key: string): string {
  const value = metadata?.[key]
  return typeof value === 'string' ? value : ''
}

function booleanAttribute(metadata: BpmnMetadata | undefined, key: string): boolean {
  const value = metadata?.[key]
  return value === true || value === 'true'
}

function positiveNumberAttribute(metadata: BpmnMetadata | undefined, key: string): number | undefined {
  const value = Number(metadata?.[key])
  return Number.isInteger(value) && value > 0 ? value : undefined
}

function listAttribute(metadata: BpmnMetadata | undefined, key: string): string[] {
  return textAttribute(metadata, key).split(',').map((value) => value.trim()).filter(Boolean)
}

function jsonAttribute(metadata: BpmnMetadata | undefined, key: string): unknown {
  const value = textAttribute(metadata, key)
  if (!value) return ''
  try { return JSON.parse(value) as unknown } catch { return value }
}

function oneOf<const T extends string>(value: string, values: readonly T[], fallback: T): T {
  return values.includes(value as T) ? value as T : fallback
}
