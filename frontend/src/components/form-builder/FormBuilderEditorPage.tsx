import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from 'react';
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Banknote,
  Calendar,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Columns2,
  Columns3,
  Copy,
  CopyPlus,
  Eye,
  GripVertical,
  Hash,
  Heading2,
  LayoutGrid,
  ListChecks,
  ListFilter,
  Lock,
  Mail,
  Paperclip,
  Phone,
  RectangleHorizontal,
  Save,
  SlidersHorizontal,
  SquareCheck,
  Table2,
  ToggleLeft,
  Trash2,
  Type,
  UserCheck,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { ApiError } from '../../services/api-client';
import {
  cloneFormDefinition,
  createFormDefinition,
  deleteFormDefinition,
  duplicateFormDefinition,
  getFormDefinition,
  listFormGroups,
  updateFormDefinition,
} from '../../services/form-definitions.service';
import {
  formFieldTypes,
  type FormCategory,
  type FormDefinition,
  type FormField,
  type FormGroup,
  type FormFieldType,
  type FormSettings,
} from '../../types/workflow';
import {
  applyCanvasDrop,
  canDropAtCanvasPlacement,
  cloneField,
  computeFieldRows,
  createField,
  createPresetField,
  defaultFieldPlaceholder,
  ensureSystemRequestFields,
  insertFieldAtIndex,
  isSystemRequestField,
  readFieldColumnSpan,
  readFieldNewRow,
  reindexFields,
  removeFieldAndRebalanceRows,
  requesterFieldPresets,
  updateFieldLabelAndGeneratedKey,
  validateFormBuilderDefinition,
  type CanvasDropPlacement,
  type CanvasDropTarget,
  type FieldColumnSpan,
  type FieldGridRow,
  type FormBuilderIssue,
} from '../../utils/form-builder';
import {
  replaceFieldKeyInFormula,
  replaceTableColumnKeyInFormula,
} from '../../utils/form-calculation';
import { DefinitionStatusBadge } from '../StatusBadge';
import { ErrorState, LoadingState } from '../DataStates';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { FilterSelect } from '../ui/FilterSelect';
import { SurfaceCard } from '../ui/SurfaceCard';
import { FormFieldProperties } from './FormFieldProperties';
import { FormBuilderRequestPreview } from './FormBuilderRequestPreview';

interface FormBuilderEditorPageProps {
  formDefinitionId?: string;
  initialGroupId?: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDeleteDraft: boolean;
  onBack: () => void;
  onNavigateCatalog: (groupId?: string) => void;
  onOpen: (id: string) => void;
  onConfigureWorkflow: (formDefinitionId: string) => void;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
}

interface FormDraft {
  code: string;
  name: string;
  groupId: string;
  category: FormCategory | '';
  description: string;
  fields: FormField[];
  settings: FormSettings;
}

type EditorTab = 'DESIGN' | 'PREVIEW';
type SaveMode = 'SAVE_ONLY' | 'SAVE_AND_CONFIGURE';
type Confirmation = 'DELETE' | 'CLONE' | null;

interface DuplicateDraft {
  code: string;
  name: string;
}

type DragSource =
  | { kind: 'CANVAS_FIELD'; index: number }
  | { kind: 'PALETTE_TYPE'; fieldType: FormFieldType }
  | { kind: 'PALETTE_PRESET'; presetKey: string };

type DropIndicator =
  | {
      kind: 'FIELD';
      index: number;
      rowIndex: number;
      placement: CanvasDropPlacement;
      label: string;
    }
  | { kind: 'SHEET_END'; label: string };

const fieldLabels: Record<FormFieldType, string> = {
  TEXT: 'Văn bản',
  TEXTAREA: 'Văn bản (nhiều dòng)',
  NUMBER: 'Số',
  CURRENCY: 'Tiền tệ',
  EMAIL: 'Email',
  PHONE: 'Điện thoại',
  DATE: 'Ngày',
  DATETIME: 'Ngày và giờ',
  SELECT: 'Danh sách chọn',
  MULTI_SELECT: 'Danh sách chọn',
  RADIO: 'Ô đánh dấu',
  CHECKBOX: 'Ô đánh dấu',
  BOOLEAN: 'Có / Không',
  FILE: 'Tệp đính kèm',
  TABLE: 'Bảng dữ liệu',
  SECTION: 'Tiêu đề phân đoạn',
};

const paletteFieldTypes = formFieldTypes.filter(
  (type) => type !== 'MULTI_SELECT' && type !== 'CHECKBOX' && type !== 'TEXTAREA',
);

const fieldTypeIcons: Record<FormFieldType, LucideIcon> = {
  TEXT: Type,
  TEXTAREA: AlignLeft,
  NUMBER: Hash,
  CURRENCY: Banknote,
  EMAIL: Mail,
  PHONE: Phone,
  DATE: Calendar,
  DATETIME: CalendarClock,
  SELECT: ListFilter,
  MULTI_SELECT: ListChecks,
  RADIO: CircleDot,
  CHECKBOX: SquareCheck,
  BOOLEAN: ToggleLeft,
  FILE: Paperclip,
  TABLE: Table2,
  SECTION: Heading2,
};

const spanShortLabels: Record<FieldColumnSpan, string> = {
  12: '1 cột',
  6: '2 cột',
  4: '3 cột',
  3: '4 cột',
};

const spanIcons: Record<FieldColumnSpan, LucideIcon> = {
  12: RectangleHorizontal,
  6: Columns2,
  4: Columns3,
  3: LayoutGrid,
};

export function FormBuilderEditorPage({
  formDefinitionId,
  initialGroupId,
  canCreate,
  canUpdate,
  canDeleteDraft,
  onBack,
  onNavigateCatalog,
  onOpen,
  onConfigureWorkflow,
  onNotify,
}: FormBuilderEditorPageProps) {
  const [previewCreatedAt] = useState(() => new Date().toISOString());
  const [definition, setDefinition] = useState<FormDefinition | null>(null);
  const [draft, setDraft] = useState<FormDraft>(() =>
    emptyDraft(initialGroupId),
  );
  const [originalFingerprint, setOriginalFingerprint] = useState(() =>
    fingerprint(emptyDraft(initialGroupId)),
  );
  const [formGroups, setFormGroups] = useState<FormGroup[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0);
  const [inlineEditingIndex, setInlineEditingIndex] = useState<number | null>(
    null,
  );
  const [tab, setTab] = useState<EditorTab>('DESIGN');
  const [isInfoCollapsed, setIsInfoCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(formDefinitionId));
  const [loadError, setLoadError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [savingMode, setSavingMode] = useState<SaveMode | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [duplicateDraft, setDuplicateDraft] = useState<DuplicateDraft>({ code: '', name: '' });
  const [duplicateErrors, setDuplicateErrors] = useState<Partial<DuplicateDraft>>({});
  const [showValidation, setShowValidation] = useState(false);
  const [serverIssues, setServerIssues] = useState<FormBuilderIssue[]>([]);
  const [generalError, setGeneralError] = useState('');
  const [dragSource, setDragSource] = useState<DragSource | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(
    null,
  );
  const dragSourceRef = useRef<DragSource | null>(null);
  const dragFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let current = true;
    void listFormGroups()
      .then((groups) => {
        if (current) setFormGroups(groups);
      })
      .catch(() => {
        if (current) setFormGroups([]);
      });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!formDefinitionId) return;
    let current = true;
    void getFormDefinition(formDefinitionId)
      .then((item) => {
        if (!current) return;
        const next = toDraft(item);
        setDefinition(item);
        setDraft(next);
        setOriginalFingerprint(fingerprint(next));
        setSelectedIndex(item.fields.length ? 0 : null);
        setLoadError(false);
      })
      .catch(() => {
        if (current) setLoadError(true);
      })
      .finally(() => {
        if (current) setIsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [formDefinitionId, reloadVersion]);

  const isNew = !formDefinitionId && !definition;
  const isDraft = isNew || definition?.status === 'DRAFT';
  const isEditable = isDraft && (isNew ? canCreate : canUpdate);
  const isSaving = savingMode !== null;
  const isDirty = fingerprint(draft) !== originalFingerprint;
  const emptyFormulaIssues = useMemo(
    () => findEmptyFormulaIssues(draft.fields),
    [draft.fields],
  );
  const clientIssues = useMemo(
    () =>
      validateFormBuilderDefinition(
        draft.code,
        draft.name,
        draft.fields,
        draft.settings,
      ),
    [draft],
  );
  const submitIssues = useMemo(
    () => [...clientIssues, ...emptyFormulaIssues],
    [clientIssues, emptyFormulaIssues],
  );
  const displayedIssues = useMemo(
    () => (showValidation ? [...submitIssues, ...serverIssues] : serverIssues),
    [showValidation, submitIssues, serverIssues],
  );
  const propertyIssues = useMemo(() => {
    if (selectedIndex === null) return displayedIssues;
    const currentFieldPrefix = `fields.${selectedIndex}`;
    const fieldClientIssues = clientIssues.filter((issue) =>
      issue.path.startsWith(currentFieldPrefix),
    );
    const combined = [...displayedIssues];
    for (const issue of fieldClientIssues) {
      if (!combined.some((item) => item.path === issue.path && item.message === issue.message)) {
        combined.push(issue);
      }
    }
    return combined;
  }, [displayedIssues, selectedIndex, clientIssues]);
  const selectedField =
    selectedIndex === null ? null : (draft.fields[selectedIndex] ?? null);
  const fieldRows = useMemo(
    () => computeFieldRows(draft.fields),
    [draft.fields],
  );

  const codeError = displayedIssues.find(
    (issue) => issue.path === 'code',
  )?.message;
  const nameError = displayedIssues.find(
    (issue) => issue.path === 'name',
  )?.message;
  const leaveFieldError = displayedIssues.find(
    (issue) => issue.path === 'settings.leaveDeduction.fieldKey',
  )?.message;
  const leaveNumberFields = useMemo(
    () =>
      draft.fields.filter(
        (field) => field.type === 'NUMBER' && !field.autoFill,
      ),
    [draft.fields],
  );

  const previewDefinition = useMemo<FormDefinition>(
    () => ({
      id: definition?.id ?? 'preview',
      code: draft.code || 'FORM_PREVIEW',
      version: definition?.version ?? 1,
      name: draft.name || 'Biểu mẫu chưa đặt tên',
      ...(draft.groupId
        ? { group: formGroups.find((group) => group.id === draft.groupId) }
        : {}),
      ...(draft.category ? { category: draft.category } : {}),
      description: draft.description || undefined,
      status: definition?.status ?? 'DRAFT',
      fields: reindexFields(draft.fields),
      settings: draft.settings,
      createdAt: definition?.createdAt ?? previewCreatedAt,
      updatedAt: definition?.updatedAt ?? previewCreatedAt,
    }),
    [definition, draft, formGroups, previewCreatedAt],
  );

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('workflow:unsaved-change', { detail: isDirty }),
    );
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.dispatchEvent(
        new CustomEvent('workflow:unsaved-change', { detail: false }),
      );
    };
  }, [isDirty]);

  function changeDraft(patch: Partial<FormDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setServerIssues([]);
    setGeneralError('');
  }

  function updateField(index: number, field: FormField) {
    const previousField = draft.fields[index];
    const previousKey = previousField?.key;
    const isGeneratedFieldKey = Boolean(
      previousKey && /^field_\d+$/.test(previousKey) && previousKey !== field.key,
    );
    const colKeyChanges: Array<{ oldKey: string; newKey: string }> = [];
    if (
      previousField?.type === 'TABLE' &&
      field.type === 'TABLE' &&
      previousField.tableConfig?.columns &&
      field.tableConfig?.columns &&
      previousField.tableConfig.columns.length === field.tableConfig.columns.length
    ) {
      field.tableConfig.columns.forEach((col, colIdx) => {
        const oldCol = previousField.tableConfig?.columns[colIdx];
        if (oldCol && /^column_\d+$/.test(oldCol.key) && oldCol.key !== col.key) {
          colKeyChanges.push({ oldKey: oldCol.key, newKey: col.key });
        }
      });
    }
    changeDraft({
      fields: draft.fields.map((item, itemIndex) => {
        if (itemIndex === index) return field;
        if (!isGeneratedFieldKey && colKeyChanges.length === 0) return item;
        let nextFormula = item.formula;
        if (nextFormula && isGeneratedFieldKey && previousKey) {
          nextFormula = replaceFieldKeyInFormula(nextFormula, previousKey, field.key);
        }
        if (nextFormula && colKeyChanges.length > 0) {
          for (const change of colKeyChanges) {
            nextFormula = replaceTableColumnKeyInFormula(
              nextFormula,
              field.key,
              change.oldKey,
              change.newKey,
            );
          }
        }
        return nextFormula !== item.formula
          ? { ...item, formula: nextFormula }
          : item;
      }),
    });
  }

  function toggleFieldWidth(index: number) {
    const field = draft.fields[index];
    if (!field || field.type === 'TABLE' || field.type === 'SECTION') return;
    const currentSpan = readFieldColumnSpan(field);
    const nextSpan: FieldColumnSpan = currentSpan === 12 ? 6 : 12;
    const { newRow: _newRow, ...restLayout } = field.layout ?? {};
    updateField(index, {
      ...field,
      layout:
        nextSpan === 12
          ? { ...restLayout, columnSpan: 12 }
          : { ...(field.layout ?? {}), columnSpan: nextSpan },
    });
  }

  function addField(type: FormFieldType, targetIndex?: number) {
    const inserted = insertFieldAtIndex(
      draft.fields,
      createField(type, draft.fields),
      targetIndex,
    );
    changeDraft({ fields: inserted.fields });
    setSelectedIndex(inserted.selectedIndex);
    setTab('DESIGN');
  }

  function addPresetField(presetKey: string, targetIndex?: number) {
    const inserted = insertFieldAtIndex(
      draft.fields,
      createPresetField(presetKey, draft.fields),
      targetIndex,
    );
    changeDraft({ fields: inserted.fields });
    setSelectedIndex(inserted.selectedIndex);
    setTab('DESIGN');
  }

  function duplicateField(index: number) {
    if (isSystemRequestField(draft.fields[index])) return;
    const copy = cloneField(draft.fields[index], draft.fields);
    const next = [
      ...draft.fields.slice(0, index + 1),
      copy,
      ...draft.fields.slice(index + 1),
    ];
    changeDraft({ fields: reindexFields(next) });
    setSelectedIndex(index + 1);
  }

  function deleteField(index: number) {
    if (isSystemRequestField(draft.fields[index])) return;
    const next = removeFieldAndRebalanceRows(draft.fields, index);
    changeDraft({ fields: next });
    if (!next.length) setSelectedIndex(null);
    else setSelectedIndex(Math.min(index, next.length - 1));
  }

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.fields.length) return;
    const next = [...draft.fields];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    changeDraft({ fields: reindexFields(next) });
    setSelectedIndex(target);
  }

  function beginDrag(event: DragEvent<HTMLElement>, source: DragSource) {
    if (!isEditable) return;
    dragSourceRef.current = source;
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
    }
    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      setDragSource(source);
    });
    event.dataTransfer.effectAllowed =
      source.kind === 'CANVAS_FIELD' ? 'move' : 'copyMove';
    const serialized = JSON.stringify(source);
    event.dataTransfer.setData(
      'application/x-workflow-form-builder',
      serialized,
    );
    event.dataTransfer.setData('text/plain', serialized);
  }

  function clearDragState() {
    dragSourceRef.current = null;
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    setDragSource(null);
    setDropIndicator(null);
  }

  function commitDrop(event: DragEvent<HTMLElement>, target: CanvasDropTarget) {
    if (!isEditable) return;
    event.preventDefault();
    event.stopPropagation();
    const resolved =
      dragSourceRef.current ??
      dragSource ??
      parseDragSource(
        event.dataTransfer.getData('application/x-workflow-form-builder') ||
          event.dataTransfer.getData('text/plain'),
      );
    clearDragState();
    if (!resolved) return;

    const payload = resolved.kind === 'CANVAS_FIELD'
      ? ({ kind: 'MOVE_FIELD', fromIndex: resolved.index } as const)
      : ({
          kind: 'NEW_FIELD',
          field: resolved.kind === 'PALETTE_PRESET'
            ? createPresetField(resolved.presetKey, draft.fields)
            : createField(resolved.fieldType, draft.fields),
        } as const);

    const applied = applyCanvasDrop(draft.fields, target, payload);
    if (applied.changed) {
      changeDraft({ fields: applied.fields });
    }
    setSelectedIndex(applied.selectedIndex);
    setTab('DESIGN');
  }

  async function persistDraft(mode: SaveMode) {
    if (!isEditable || isSaving) return;
    if (submitIssues.length) {
      setShowValidation(true);
      setTab('DESIGN');
      focusIssue(submitIssues[0], setSelectedIndex);
      return;
    }
    if (!isDirty && definition) {
      if (mode === 'SAVE_AND_CONFIGURE') {
        onConfigureWorkflow(definition.id);
      }
      return;
    }
    setSavingMode(mode);
    setGeneralError('');
    setServerIssues([]);
    try {
      const fields = reindexFields(draft.fields);
      const isCreating = !definition;
      const saved = definition
        ? await updateFormDefinition(definition.id, {
            code: draft.code.trim().toUpperCase(),
            name: draft.name.trim(),
            groupId: draft.groupId || null,
            category: draft.category || null,
            description: draft.description.trim(),
            fields,
            settings: draft.settings,
          })
        : await createFormDefinition({
            code: draft.code.trim().toUpperCase(),
            name: draft.name.trim(),
            ...(draft.groupId ? { groupId: draft.groupId } : {}),
            ...(draft.category ? { category: draft.category } : {}),
            description: draft.description.trim(),
            fields,
            settings: draft.settings,
          });
      const next = toDraft(saved);
      setDefinition(saved);
      setDraft(next);
      setOriginalFingerprint(fingerprint(next));
      setShowValidation(false);
      window.dispatchEvent(
        new CustomEvent('workflow:unsaved-change', { detail: false }),
      );

      if (mode === 'SAVE_AND_CONFIGURE') {
        onNotify(
          isCreating
            ? 'Tạo biểu mẫu nháp thành công.'
            : 'Lưu thay đổi biểu mẫu thành công.',
        );
        onConfigureWorkflow(saved.id);
        return;
      }

      onNotify(
        isCreating ? 'Đã tạo biểu mẫu nháp.' : 'Đã lưu thay đổi biểu mẫu.',
      );
      if (isCreating) {
        onOpen(saved.id);
      }
    } catch (error) {
      handleSaveError(error);
    } finally {
      setSavingMode(null);
    }
  }

  function handleSaveError(error: unknown) {
    if (error instanceof ApiError && error.field) {
      const issue = {
        path: normalizeServerPath(error.field),
        message: error.message,
      };
      setServerIssues([issue]);
      setShowValidation(true);
      setTab('DESIGN');
      focusIssue(issue, setSelectedIndex);
      return;
    }
    const message =
      error instanceof Error ? error.message : 'Không thể lưu biểu mẫu.';
    setGeneralError(message);
    onNotify(message, 'error');
  }

  async function cloneVersion() {
    if (!definition || isCloning) return;
    setIsCloning(true);
    try {
      const cloned = await cloneFormDefinition(definition.id);
      onNotify(`Đã tạo phiên bản ${cloned.version} để chỉnh sửa.`);
      setConfirmation(null);
      onOpen(cloned.id);
    } catch (error) {
      onNotify(
        error instanceof Error
          ? error.message
          : 'Không thể tạo phiên bản nháp.',
        'error',
      );
    } finally {
      setIsCloning(false);
    }
  }

  function openDuplicateDialog() {
    if (!definition) return;
    setDuplicateDraft({
      code: suggestDuplicateCode(definition.code),
      name: `${definition.name} - Bản sao`.slice(0, 160),
    });
    setDuplicateErrors({});
    setIsDuplicateDialogOpen(true);
  }

  async function duplicateDefinition() {
    if (!definition || isDuplicating) return;
    const code = duplicateDraft.code.trim().toUpperCase();
    const name = duplicateDraft.name.trim();
    const errors: Partial<DuplicateDraft> = {};
    if (!code) errors.code = 'Mã biểu mẫu không được để trống.';
    else if (!/^[A-Z][A-Z0-9_]*$/.test(code)) {
      errors.code = 'Mã chỉ gồm chữ in hoa, số và dấu gạch dưới.';
    }
    if (!name) errors.name = 'Tên biểu mẫu không được để trống.';
    if (Object.keys(errors).length) {
      setDuplicateErrors(errors);
      return;
    }

    setIsDuplicating(true);
    setDuplicateErrors({});
    try {
      const duplicated = await duplicateFormDefinition(definition.id, { code, name });
      setIsDuplicateDialogOpen(false);
      onNotify('Tạo bản sao biểu mẫu thành công.');
      onOpen(duplicated.id);
    } catch (error) {
      if (error instanceof ApiError && error.field === 'code') {
        setDuplicateErrors({ code: error.message });
      } else {
        onNotify(
          error instanceof Error ? error.message : 'Không thể tạo bản sao biểu mẫu.',
          'error',
        );
      }
    } finally {
      setIsDuplicating(false);
    }
  }

  async function removeDraft() {
    if (!definition || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteFormDefinition(definition.id);
      window.dispatchEvent(
        new CustomEvent('workflow:unsaved-change', { detail: false }),
      );
      onNotify('Xóa biểu mẫu nháp thành công.');
      onBack();
    } catch (error) {
      onNotify(
        error instanceof Error ? error.message : 'Không thể xóa biểu mẫu nháp.',
        'error',
      );
    } finally {
      setIsDeleting(false);
      setConfirmation(null);
    }
  }

  function navigate(target: () => void) {
    if (!isDirty) {
      target();
      return;
    }
    window.dispatchEvent(
      new CustomEvent('workflow:navigate-request', {
        detail: { onConfirm: target },
      }),
    );
  }

  function back() {
    navigate(onBack);
  }

  if (isLoading) return <LoadingState />;
  if (loadError) {
    return (
      <ErrorState
        onRetry={() => {
          setIsLoading(true);
          setLoadError(false);
          setReloadVersion((value) => value + 1);
        }}
      />
    );
  }

  const pageTitle = isNew
    ? 'Tạo biểu mẫu'
    : (definition?.name ?? 'Chi tiết biểu mẫu');
  const definitionGroup = definition?.group;
  const catalogGroupId = initialGroupId ?? definitionGroup?.id;
  const catalogGroupName = catalogGroupId === 'UNGROUPED'
    ? 'Chưa phân nhóm'
    : (
        formGroups.find((group) => group.id === catalogGroupId)?.name
        ?? (definitionGroup && definitionGroup.id === catalogGroupId
          ? definitionGroup.name
          : undefined)
      );

  return (
    <>
      <nav className="detail-breadcrumb" aria-label="Điều hướng biểu mẫu">
        <button
          className="breadcrumb-link"
          type="button"
          onClick={() => navigate(() => onNavigateCatalog())}
        >
          Quản lý biểu mẫu
        </button>
        <span aria-hidden="true">/</span>
        {catalogGroupId && catalogGroupName && (
          <>
            <button
              className="breadcrumb-link"
              type="button"
              onClick={() => navigate(() => onNavigateCatalog(catalogGroupId))}
            >
              Nhóm: {catalogGroupName}
            </button>
            <span aria-hidden="true">/</span>
          </>
        )}
        <strong>{pageTitle}</strong>
      </nav>

      <section className="department-detail-summary form-builder-detail-summary">
        <div className="department-detail-summary-main form-builder-summary-main">
          <h1>{pageTitle}</h1>
          {definition && (
            <div className="form-builder-summary-badges">
              <span className="form-builder-version-pill">
                Phiên bản {definition.version}
              </span>
            </div>
          )}
        </div>

        <div className="department-detail-actions">
          {isEditable ? (
            <>
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={back}
                disabled={isSaving}
              >
                {isNew ? 'Hủy' : '← Quay lại'}
              </button>
              {!isNew && definition && canCreate && (
                <button
                  className="secondary-button compact-button form-builder-header-btn"
                  type="button"
                  onClick={openDuplicateDialog}
                  disabled={isSaving || isDirty}
                  title={isDirty ? 'Hãy lưu thay đổi trước khi tạo bản sao.' : undefined}
                >
                  <CopyPlus size={14} strokeWidth={2} aria-hidden="true" />
                  <span>Tạo bản sao</span>
                </button>
              )}
              {!isNew && definition?.status === 'DRAFT' && canDeleteDraft && (
                <button
                  className="danger-outline-button compact-button form-builder-delete-draft-button"
                  type="button"
                  onClick={() => setConfirmation('DELETE')}
                  disabled={isSaving}
                >
                  Xóa bản nháp
                </button>
              )}
              <button
                className="secondary-button compact-button form-builder-header-btn"
                type="button"
                disabled={isSaving || (!isNew && !isDirty)}
                onClick={() => void persistDraft('SAVE_ONLY')}
              >
                <Save size={14} strokeWidth={2} aria-hidden="true" />
                <span>
                  {savingMode === 'SAVE_ONLY' ? 'Đang lưu...' : 'Lưu nháp'}
                </span>
              </button>
              <button
                className="primary-button compact-button form-builder-header-btn"
                type="button"
                disabled={isSaving}
                onClick={() => void persistDraft('SAVE_AND_CONFIGURE')}
              >
                <Workflow size={14} strokeWidth={2} aria-hidden="true" />
                <span>
                  {savingMode === 'SAVE_AND_CONFIGURE'
                    ? 'Đang lưu...'
                    : 'Lưu & cấu hình quy trình'}
                </span>
              </button>
            </>
          ) : (
            <>
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={back}
              >
                ← Quay lại
              </button>
              {definition && canCreate && (
                <button
                  className="secondary-button compact-button form-builder-header-btn"
                  type="button"
                  onClick={openDuplicateDialog}
                >
                  <CopyPlus size={14} strokeWidth={2} aria-hidden="true" />
                  <span>Tạo bản sao</span>
                </button>
              )}
              {!isDraft && canCreate && (
                <button
                  className="primary-button compact-button"
                  type="button"
                  onClick={() => setConfirmation('CLONE')}
                >
                  Tạo phiên bản chỉnh sửa
                </button>
              )}
            </>
          )}
        </div>
      </section>

      {!isEditable && isDraft && (
        <div className="form-builder-readonly-notice" role="status">
          Bạn có thể xem cấu hình nhưng chưa được cấp quyền chỉnh sửa biểu mẫu.
        </div>
      )}
      {!isDraft && (
        <div className="form-builder-readonly-notice" role="status">
          Phiên bản đã phát hành hoặc ngưng hoạt động chỉ được xem. Hãy tạo
          phiên bản chỉnh sửa để thay đổi.
        </div>
      )}
      {generalError && (
        <p className="form-builder-server-error" role="alert">
          {generalError}
        </p>
      )}

      <SurfaceCard className="form-builder-info-card">
        <div
          className={`form-builder-info-heading${isInfoCollapsed ? ' is-collapsed' : ''}`}
        >
          <div className="form-builder-info-title">
            <h2>Thông tin biểu mẫu</h2>
          </div>
          <button
            className="form-builder-info-toggle"
            type="button"
            aria-expanded={!isInfoCollapsed}
            aria-controls="form-builder-general-information"
            onClick={() => setIsInfoCollapsed((current) => !current)}
          >
            {isInfoCollapsed ? 'Mở rộng' : 'Thu gọn'}
            {isInfoCollapsed ? (
              <ChevronDown size={15} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <ChevronUp size={15} strokeWidth={1.8} aria-hidden="true" />
            )}
          </button>
        </div>

        {!isInfoCollapsed && (
          <div
            id="form-builder-general-information"
            className="form-builder-info-grid"
          >
            <label className="form-builder-top-field">
              <span className="required-field-label">Mã biểu mẫu</span>
              <input
                data-form-property="code"
                placeholder="VD: DON_NGHI_PHEP"
                value={draft.code}
                disabled={!isEditable}
                maxLength={80}
                aria-invalid={Boolean(codeError)}
                onChange={(event) =>
                  changeDraft({ code: event.target.value.toUpperCase() })
                }
              />
              {codeError && <small className="field-error">{codeError}</small>}
            </label>

            <label className="form-builder-top-field">
              <span className="required-field-label">Tên biểu mẫu</span>
              <input
                data-form-property="name"
                placeholder="VD: Đơn xin nghỉ phép"
                value={draft.name}
                disabled={!isEditable}
                maxLength={160}
                aria-invalid={Boolean(nameError)}
                onChange={(event) => changeDraft({ name: event.target.value })}
              />
              {nameError && <small className="field-error">{nameError}</small>}
            </label>

            <div className="form-builder-top-field">
              <span>Nhóm biểu mẫu</span>
              <FilterSelect
                ariaLabel="Nhóm biểu mẫu"
                disabled={!isEditable}
                value={draft.groupId}
                options={[
                  { value: '', label: 'Chưa phân nhóm' },
                  ...formGroups
                    .filter(
                      (group) => group.isActive || group.id === draft.groupId,
                    )
                    .map((group) => ({ value: group.id, label: group.name })),
                ]}
                onChange={(value) => changeDraft({ groupId: value })}
              />
            </div>

            <div className="form-builder-top-field">
              <span>Trạng thái</span>
              <div className="form-builder-status-field" aria-label="Trạng thái biểu mẫu">
                <DefinitionStatusBadge status={definition?.status ?? 'DRAFT'} />
              </div>
            </div>

            <label className="form-builder-top-field form-builder-top-field-description">
              <span>Mô tả</span>
              <textarea
                placeholder="Mục đích hoặc phạm vi áp dụng của biểu mẫu"
                value={draft.description}
                disabled={!isEditable}
                rows={1}
                maxLength={2000}
                onChange={(event) =>
                  changeDraft({ description: event.target.value })
                }
              />
            </label>

            <div className="form-builder-leave-settings">
              <div className="form-builder-leave-toggles">
                <label className="form-builder-inline-checkbox">
                  <input
                    type="checkbox"
                    disabled={!isEditable}
                    checked={Boolean(draft.settings.leaveDeduction?.enabled)}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      changeDraft({
                        settings: {
                          ...draft.settings,
                          leaveDeduction: {
                            enabled,
                            fieldKey: enabled
                              ? (draft.settings.leaveDeduction?.fieldKey ?? leaveNumberFields[0]?.key ?? undefined)
                              : undefined,
                            allowNegative: enabled
                              ? Boolean(draft.settings.leaveDeduction?.allowNegative)
                              : false,
                          },
                        },
                      });
                    }}
                  />
                  <span>Tự động trừ quỹ ngày phép năm khi phê duyệt</span>
                </label>
                {draft.settings.leaveDeduction?.enabled && (
                  <label className="form-builder-inline-checkbox">
                    <input
                      type="checkbox"
                      disabled={!isEditable}
                      checked={Boolean(draft.settings.leaveDeduction?.allowNegative)}
                      onChange={(event) =>
                        changeDraft({
                          settings: {
                            ...draft.settings,
                            leaveDeduction: {
                              enabled: true,
                              fieldKey: draft.settings.leaveDeduction?.fieldKey,
                              allowNegative: event.target.checked,
                            },
                          },
                        })
                      }
                    />
                    <span>Cho phép trừ âm quỹ phép</span>
                  </label>
                )}
              </div>
              {draft.settings.leaveDeduction?.enabled && (
                <div className="form-builder-leave-field-select">
                  <span className="required-field-label">Trường số ngày nghỉ cần trừ</span>
                  <div data-form-property="settings.leaveDeduction.fieldKey">
                    <FilterSelect
                      ariaLabel="Trường số ngày nghỉ cần trừ"
                      disabled={!isEditable}
                      value={draft.settings.leaveDeduction?.fieldKey ?? ''}
                      options={[
                        {
                          value: '',
                          label: leaveNumberFields.length
                            ? 'Chọn trường kiểu Số trên biểu mẫu'
                            : 'Chưa có trường kiểu Số phù hợp',
                        },
                        ...leaveNumberFields.map((field) => ({
                          value: field.key,
                          label: `${field.label} (${field.key})`,
                        })),
                      ]}
                      onChange={(value) =>
                        changeDraft({
                          settings: {
                            ...draft.settings,
                            leaveDeduction: {
                              enabled: true,
                              fieldKey: value || undefined,
                              allowNegative: Boolean(draft.settings.leaveDeduction?.allowNegative),
                            },
                          },
                        })
                      }
                    />
                  </div>
                  {leaveFieldError && <small className="field-error">{leaveFieldError}</small>}
                </div>
              )}
            </div>
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard className="form-builder-editor-card">
        <div className="form-builder-editor-toolbar">
          <div
            className="form-builder-view-switch"
            role="tablist"
            aria-label="Chế độ thiết kế biểu mẫu"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'DESIGN'}
              className={tab === 'DESIGN' ? 'is-active' : ''}
              onClick={() => setTab('DESIGN')}
            >
              <SlidersHorizontal size={13} strokeWidth={2} aria-hidden="true" />
              <span>Thiết kế bố cục</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'PREVIEW'}
              className={tab === 'PREVIEW' ? 'is-active' : ''}
              onClick={() => setTab('PREVIEW')}
            >
              <Eye size={13} strokeWidth={2} aria-hidden="true" />
              <span>Xem trước phiếu</span>
            </button>
          </div>
        </div>

        {tab === 'PREVIEW' ? (
          <FormBuilderRequestPreview
            formDefinition={previewDefinition}
            createdAt={previewCreatedAt}
          />
        ) : (
          <div className="form-builder-editor-layout">
            <aside
              className="form-builder-palette"
              aria-label="Thư viện loại trường"
            >
              <div className="form-builder-sticky-pane">
                <div className="form-builder-pane-heading is-compact">
                  <div>
                    <h2>Loại trường</h2>
                  </div>
                </div>
                <div className="form-builder-palette-body">
                  <div className="form-builder-palette-group is-standard-fields">
                    <span className="form-builder-palette-group-title">
                      Trường dữ liệu chuẩn
                    </span>
                    <div className="form-builder-field-types">
                      {paletteFieldTypes.map((type) => {
                        const FieldIcon = fieldTypeIcons[type];
                        return (
                          <button
                            type="button"
                            key={type}
                            disabled={!isEditable}
                            draggable={isEditable}
                            title="Bấm để thêm hoặc kéo thả vào vị trí trên phiếu"
                            onDragStart={(event) =>
                              beginDrag(event, {
                                kind: 'PALETTE_TYPE',
                                fieldType: type,
                              })
                            }
                            onDragEnd={clearDragState}
                            onClick={() => addField(type)}
                          >
                            <span
                              className="form-builder-type-icon"
                              aria-hidden="true"
                            >
                              <FieldIcon size={15} strokeWidth={1.9} />
                            </span>
                            <strong>{fieldLabels[type]}</strong>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="form-builder-palette-group is-autofill-fields">
                    <span className="form-builder-palette-group-title">
                      Thông tin tự động điền
                    </span>
                    <div className="form-builder-field-types form-builder-autofill-types">
                      {requesterFieldPresets.map((preset) => (
                        <button
                          type="button"
                          key={preset.presetKey}
                          disabled={!isEditable}
                          draggable={isEditable}
                          title="Bấm để thêm hoặc kéo thả trường tự động điền vào phiếu"
                          onDragStart={(event) =>
                            beginDrag(event, {
                              kind: 'PALETTE_PRESET',
                              presetKey: preset.presetKey,
                            })
                          }
                          onDragEnd={clearDragState}
                          onClick={() => addPresetField(preset.presetKey)}
                        >
                          <span className="form-builder-type-icon" aria-hidden="true">
                            <UserCheck size={15} strokeWidth={1.9} />
                          </span>
                          <strong>{preset.label}</strong>
                          <small>Tự động điền</small>
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            </aside>

            <main className="form-builder-canvas">
              <div className="form-builder-pane-heading is-compact">
                <h2>Bố cục biểu mẫu</h2>
                <span className="form-builder-canvas-grid-meta">
                  Kéo thả để sắp xếp · Thả cạnh trường để chia cột
                </span>
              </div>

              <div className="form-builder-canvas-content">
                <div
                  className={`form-builder-sheet${
                    dropIndicator?.kind === 'SHEET_END' &&
                    draft.fields.length > 0
                      ? ' is-drop-sheet-end'
                      : ''
                  }`}
                  onDragOver={(event) => {
                    if (!isEditable) return;
                    event.preventDefault();
                    const activeSource = dragSourceRef.current ?? dragSource;
                    event.dataTransfer.dropEffect =
                      activeSource?.kind === 'CANVAS_FIELD' ? 'move' : 'copy';
                    if (activeSource?.kind === 'CANVAS_FIELD') {
                      const lastRow = fieldRows[fieldRows.length - 1];
                      if (
                        lastRow &&
                        lastRow.indices.length === 1 &&
                        lastRow.indices[0] === activeSource.index &&
                        readFieldColumnSpan(
                          draft.fields[activeSource.index],
                        ) === 12
                      ) {
                        if (dropIndicator !== null) setDropIndicator(null);
                        return;
                      }
                    }
                    if (dropIndicator?.kind !== 'SHEET_END') {
                      setDropIndicator({
                        kind: 'SHEET_END',
                        label: 'Hàng mới · 1 cột',
                      });
                    }
                  }}
                  onDragLeave={(event) => {
                    if (
                      event.currentTarget === event.target ||
                      !event.currentTarget.contains(
                        event.relatedTarget as Node | null,
                      )
                    ) {
                      setDropIndicator(null);
                    }
                  }}
                  onDrop={(event) => commitDrop(event, { kind: 'SHEET_END' })}
                >
                  <header className="form-builder-sheet-title">
                    <h3>{draft.name.trim() || 'Biểu mẫu chưa đặt tên'}</h3>
                  </header>
                  {!draft.fields.length ? (
                    <button
                      className={`form-builder-empty-canvas${
                        dropIndicator?.kind === 'SHEET_END'
                          ? ' is-drag-over'
                          : ''
                      }`}
                      type="button"
                      disabled={!isEditable}
                      onClick={() => addField('TEXT')}
                    >
                      {dropIndicator?.kind === 'SHEET_END'
                        ? 'Thả vào đây để thêm trường vào biểu mẫu.'
                        : 'Biểu mẫu chưa có trường dữ liệu. Kéo trường từ cột bên trái thả vào đây hoặc bấm để thêm.'}
                    </button>
                  ) : (
                    <div
                      className={`form-builder-canvas-list${
                        dragSource ? ' is-dragging-active' : ''
                      }`}
                    >
                      {draft.fields.map((field, index) => {
                        const fieldIssues = displayedIssues.filter((issue) =>
                          issue.path.startsWith(`fields.${index}.`),
                        );
                        const fieldHasIssue = fieldIssues.length > 0;
                        const span = readFieldColumnSpan(field);
                        const startsNewRow = readFieldNewRow(field);
                        const SpanIcon = spanIcons[span];
                        const isSelected = selectedIndex === index;
                        const isDraggingThis =
                          dragSource?.kind === 'CANVAS_FIELD' &&
                          dragSource.index === index;
                        const cardRow = fieldRows.find((row) =>
                          row.indices.includes(index),
                        );
                        const isRowLevelDrop =
                          dropIndicator?.kind === 'FIELD' &&
                          (dropIndicator.placement === 'ROW_BEFORE' ||
                            dropIndicator.placement === 'ROW_AFTER') &&
                          cardRow?.rowIndex === dropIndicator.rowIndex;
                        const isSideLevelDrop =
                          dropIndicator?.kind === 'FIELD' &&
                          (dropIndicator.placement === 'COL_LEFT' ||
                            dropIndicator.placement === 'COL_RIGHT') &&
                          dropIndicator.index === index;
                        const dropClass = isRowLevelDrop
                          ? dropIndicator.placement === 'ROW_BEFORE'
                            ? 'is-drop-before-row'
                            : 'is-drop-after-row'
                          : isSideLevelDrop
                            ? dropIndicator.placement === 'COL_LEFT'
                              ? 'is-drop-before-col'
                              : 'is-drop-after-col'
                            : '';
                        const bridgeRightClass =
                          isRowLevelDrop &&
                          cardRow &&
                          index !== cardRow.endIndex
                            ? 'is-row-bridge-right'
                            : '';
                        const dropPillPlacement =
                          isRowLevelDrop && cardRow?.startIndex === index
                            ? dropIndicator.placement === 'ROW_BEFORE'
                              ? 'is-row-before'
                              : 'is-row-after'
                            : isSideLevelDrop
                              ? dropIndicator.placement === 'COL_LEFT'
                                ? 'is-col-left'
                                : 'is-col-right'
                              : null;
                        const style = {
                          gridColumn: startsNewRow
                            ? `1 / span ${span}`
                            : `span ${span}`,
                        } satisfies CSSProperties;
                        const cardClasses = [
                          'form-builder-canvas-field',
                          isSelected ? 'is-selected' : '',
                          fieldHasIssue ? 'has-error' : '',
                          isDraggingThis ? 'is-dragging' : '',
                          dropClass,
                          bridgeRightClass,
                        ]
                          .filter(Boolean)
                          .join(' ');

                        return (
                          <article
                            className={cardClasses}
                            key={`${index}-${field.key}`}
                            data-field-index={index}
                            style={style}
                            draggable={isEditable}
                            onDragStart={(event) =>
                              beginDrag(event, {
                                kind: 'CANVAS_FIELD',
                                index,
                              })
                            }
                            onDragOver={(event) => {
                              if (!isEditable) return;
                              event.preventDefault();
                              event.stopPropagation();
                              const activeSource =
                                dragSourceRef.current ?? dragSource;
                              event.dataTransfer.dropEffect =
                                activeSource?.kind === 'CANVAS_FIELD'
                                  ? 'move'
                                  : 'copy';
                              const rect =
                                event.currentTarget.getBoundingClientRect();
                              const nextIndicator = resolveFieldHoverIndicator(
                                event.clientX,
                                event.clientY,
                                rect,
                                fieldRows,
                                draft.fields,
                                index,
                                activeSource,
                              );
                              if (!nextIndicator) {
                                if (dropIndicator !== null)
                                  setDropIndicator(null);
                                return;
                              }
                              if (
                                dropIndicator?.kind !== 'FIELD' ||
                                dropIndicator.index !== nextIndicator.index ||
                                dropIndicator.rowIndex !==
                                  nextIndicator.rowIndex ||
                                dropIndicator.placement !==
                                  nextIndicator.placement
                              ) {
                                setDropIndicator(nextIndicator);
                              }
                            }}
                            onDrop={(event) => {
                              const activeSource =
                                dragSourceRef.current ??
                                dragSource ??
                                parseDragSource(
                                  event.dataTransfer.getData(
                                    'application/x-workflow-form-builder',
                                  ) || event.dataTransfer.getData('text/plain'),
                                );
                              const rect =
                                event.currentTarget.getBoundingClientRect();
                              const resolvedIndicator =
                                resolveFieldHoverIndicator(
                                  event.clientX,
                                  event.clientY,
                                  rect,
                                  fieldRows,
                                  draft.fields,
                                  index,
                                  activeSource,
                                );
                              if (!resolvedIndicator) {
                                event.preventDefault();
                                event.stopPropagation();
                                clearDragState();
                                return;
                              }
                              commitDrop(event, {
                                kind: 'FIELD',
                                index: resolvedIndicator.index,
                                placement: resolvedIndicator.placement,
                              });
                            }}
                            onDragEnd={clearDragState}
                            onClick={() => setSelectedIndex(index)}
                          >
                            {dropPillPlacement &&
                              dropIndicator?.kind === 'FIELD' && (
                                <span
                                  className={`form-builder-drop-pill ${dropPillPlacement}`}
                                  aria-hidden="true"
                                >
                                  {dropIndicator.label}
                                </span>
                              )}
                            <div className="form-builder-field-floating-actions">
                              {isEditable && (
                                <span
                                  className="form-builder-drag-handle"
                                  title="Kéo để di chuyển vị trí trường"
                                  aria-hidden="true"
                                >
                                  <GripVertical size={13} strokeWidth={2} />
                                </span>
                              )}
                              {isEditable &&
                              field.type !== 'TABLE' &&
                              field.type !== 'SECTION' ? (
                                <button
                                  className={`form-builder-span-toggle${span < 12 ? ' is-compact' : ''}`}
                                  type="button"
                                  draggable={false}
                                  title={
                                    span === 12
                                      ? 'Chuyển sang 1/2 hàng (2 cột)'
                                      : 'Chuyển sang toàn hàng (1 cột)'
                                  }
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleFieldWidth(index);
                                  }}
                                >
                                  <SpanIcon
                                    size={12}
                                    strokeWidth={2}
                                    aria-hidden="true"
                                  />
                                  <span>{spanShortLabels[span]}</span>
                                </button>
                              ) : (
                                <span className="form-builder-span-badge">
                                  <SpanIcon
                                    size={12}
                                    strokeWidth={2}
                                    aria-hidden="true"
                                  />
                                  <span>{spanShortLabels[span]}</span>
                                </span>
                              )}
                              {isEditable && (
                                <>
                                  <button
                                    className="icon-action"
                                    type="button"
                                    draggable={false}
                                    title="Di chuyển lên"
                                    aria-label="Di chuyển trường lên"
                                    disabled={index === 0}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      moveField(index, -1);
                                    }}
                                  >
                                    <ArrowUp
                                      size={13}
                                      strokeWidth={2}
                                      aria-hidden="true"
                                    />
                                  </button>
                                  <button
                                    className="icon-action"
                                    type="button"
                                    draggable={false}
                                    title="Di chuyển xuống"
                                    aria-label="Di chuyển trường xuống"
                                    disabled={index === draft.fields.length - 1}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      moveField(index, 1);
                                    }}
                                  >
                                    <ArrowDown
                                      size={13}
                                      strokeWidth={2}
                                      aria-hidden="true"
                                    />
                                  </button>
                                  {!isSystemRequestField(field) && (
                                    <>
                                      <button
                                        className="icon-action"
                                        type="button"
                                        draggable={false}
                                        title="Sao chép trường"
                                        aria-label="Sao chép trường"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          duplicateField(index);
                                        }}
                                      >
                                        <Copy size={13} strokeWidth={2} aria-hidden="true" />
                                      </button>
                                      <button
                                        className="icon-action danger-icon-action"
                                        type="button"
                                        draggable={false}
                                        title="Xóa trường"
                                        aria-label="Xóa trường"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          deleteField(index);
                                        }}
                                      >
                                        <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>

                            <div
                              className="form-builder-field-preview-trigger"
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedIndex(index)}
                              onKeyDown={(event) => {
                                if (
                                  event.key === 'Enter' ||
                                  event.key === ' '
                                ) {
                                  event.preventDefault();
                                  setSelectedIndex(index);
                                }
                              }}
                            >
                              <span className="form-builder-mock-label-row">
                                <span
                                  className="form-builder-mock-label"
                                  title={
                                    isEditable && !isSystemRequestField(field)
                                      ? 'Nhấp đúp để sửa nhanh tiêu đề'
                                      : undefined
                                  }
                                  onDoubleClick={(event) => {
                                    if (!isEditable || isSystemRequestField(field)) return;
                                    event.stopPropagation();
                                    setSelectedIndex(index);
                                    setInlineEditingIndex(index);
                                  }}
                                >
                                  {inlineEditingIndex === index ? (
                                    <input
                                      className="form-builder-inline-label-input"
                                      autoFocus
                                      value={field.label}
                                      maxLength={160}
                                      aria-label="Sửa nhanh nhãn hiển thị"
                                      draggable={false}
                                      onClick={(event) =>
                                        event.stopPropagation()
                                      }
                                      onChange={(event) =>
                                        updateField(index, {
                                          ...field,
                                          label: event.target.value,
                                        })
                                      }
                                      onBlur={(event) => {
                                        updateField(
                                          index,
                                          updateFieldLabelAndGeneratedKey(
                                            field,
                                            event.currentTarget.value,
                                            draft.fields,
                                            index,
                                          ),
                                        );
                                        setInlineEditingIndex(null);
                                      }}
                                      onKeyDown={(event) => {
                                        if (
                                          event.key === 'Enter' ||
                                          event.key === 'Escape'
                                        ) {
                                          event.preventDefault();
                                          event.currentTarget.blur();
                                        }
                                      }}
                                    />
                                  ) : (
                                    <>
                                      {field.label || 'Chưa đặt nhãn'}
                                      {field.required && !field.autoFill?.readOnly && !field.formula?.trim() && (
                                        <b aria-label="Bắt buộc"> *</b>
                                      )}
                                    </>
                                  )}
                                </span>
                              </span>

                              <CanvasFieldPreview field={field} />
                            </div>

                            {fieldHasIssue && (
                              <p className="field-error">
                                {fieldIssues[0]?.message}
                              </p>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>

                {displayedIssues.find((issue) => issue.path === 'fields') && (
                  <p className="field-error form-builder-fields-error">
                    {
                      displayedIssues.find((issue) => issue.path === 'fields')
                        ?.message
                    }
                  </p>
                )}
              </div>
            </main>

            <aside
              className="form-builder-properties"
              aria-label="Thuộc tính trường"
            >
              <div className="form-builder-sticky-pane">
                <div className="form-builder-pane-heading is-compact">
                  <div className="form-builder-inspector-heading-title">
                    <h2>Thuộc tính trường</h2>
                    {selectedIndex !== null && selectedField && (
                      <span className="form-builder-tab-index">
                        #{selectedIndex + 1}
                      </span>
                    )}
                  </div>
                </div>

                {selectedField && selectedIndex !== null ? (
                  <FormFieldProperties
                    field={selectedField}
                    fieldIndex={selectedIndex}
                    allFields={draft.fields}
                    issues={propertyIssues}
                    disabled={!isEditable}
                    systemField={isSystemRequestField(selectedField)}
                    onChange={(field) => updateField(selectedIndex, field)}
                  />
                ) : (
                  <div className="form-builder-no-field-selected">
                    Chọn một trường trên bố cục hoặc thêm trường mới từ cột bên
                    trái để cấu hình thuộc tính.
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </SurfaceCard>

      {confirmation === 'DELETE' && (
        <ConfirmDialog
          title="Xóa biểu mẫu nháp"
          description="Bạn có chắc chắn muốn xóa biểu mẫu nháp này?"
          confirmLabel="Xóa"
          tone="danger"
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void removeDraft()}
          isConfirming={isDeleting}
          confirmingLabel="Đang xóa..."
          compact
        />
      )}
      {confirmation === 'CLONE' && (
        <ConfirmDialog
          title="Tạo phiên bản chỉnh sửa?"
          description={`Hệ thống sẽ giữ nguyên phiên bản ${definition?.version} và tạo một bản nháp mới để chỉnh sửa.`}
          confirmLabel="Tạo phiên bản mới"
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void cloneVersion()}
          isConfirming={isCloning}
          confirmingLabel="Đang tạo..."
        />
      )}
      {isDuplicateDialogOpen && (
        <ConfirmDialog
          title="Tạo bản sao biểu mẫu"
          description="Bản sao sẽ giữ nguyên bố cục và cấu hình trường, đồng thời được tạo thành một biểu mẫu nháp độc lập."
          confirmLabel="Tạo bản sao"
          onCancel={() => {
            if (!isDuplicating) setIsDuplicateDialogOpen(false);
          }}
          onConfirm={() => void duplicateDefinition()}
          isConfirming={isDuplicating}
          confirmingLabel="Đang tạo..."
        >
          <div className="form-builder-duplicate-fields">
            <label className="form-builder-top-field">
              <span className="required-field-label">Mã biểu mẫu mới</span>
              <input
                value={duplicateDraft.code}
                maxLength={80}
                aria-invalid={Boolean(duplicateErrors.code)}
                onChange={(event) => {
                  setDuplicateDraft((current) => ({
                    ...current,
                    code: event.target.value.toUpperCase(),
                  }));
                  setDuplicateErrors((current) => ({ ...current, code: undefined }));
                }}
              />
              {duplicateErrors.code && <small className="field-error">{duplicateErrors.code}</small>}
            </label>
            <label className="form-builder-top-field">
              <span className="required-field-label">Tên biểu mẫu mới</span>
              <input
                value={duplicateDraft.name}
                maxLength={160}
                aria-invalid={Boolean(duplicateErrors.name)}
                onChange={(event) => {
                  setDuplicateDraft((current) => ({ ...current, name: event.target.value }));
                  setDuplicateErrors((current) => ({ ...current, name: undefined }));
                }}
              />
              {duplicateErrors.name && <small className="field-error">{duplicateErrors.name}</small>}
            </label>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}

function suggestDuplicateCode(code: string): string {
  return `${code.slice(0, 75)}_COPY`;
}

function CanvasFieldPreview({ field }: { field: FormField }) {
  const isFormulaLocked = Boolean(field.formula?.trim());
  const isReadonlyLocked = Boolean(field.autoFill?.readOnly || isFormulaLocked);
  const placeholder = isFormulaLocked
    ? 'Tự động tính theo công thức'
    : defaultFieldPlaceholder(field.type);
  const mockInputClass = `form-builder-mock-input${
    isReadonlyLocked ? ' is-readonly' : ''
  }`;
  const mockTextareaClass = `form-builder-mock-textarea${
    field.autoFill?.readOnly ? ' is-readonly' : ''
  }`;

  switch (field.type) {
    case 'SECTION':
      return <span className="form-builder-mock-section" aria-hidden="true" />;
    case 'TEXT':
      return (
        <span className={mockInputClass} aria-hidden="true">
          <span>{placeholder}</span>
          {field.autoFill?.readOnly && <Lock size={13} strokeWidth={1.8} />}
        </span>
      );
    case 'EMAIL':
      return (
        <span className={mockInputClass} aria-hidden="true">
          <span>{placeholder}</span>
          {field.autoFill?.readOnly ? (
            <Lock size={13} strokeWidth={1.8} />
          ) : (
            <Mail size={14} strokeWidth={1.8} />
          )}
        </span>
      );
    case 'PHONE':
      return (
        <span className={mockInputClass} aria-hidden="true">
          <span>{placeholder}</span>
          {field.autoFill?.readOnly ? (
            <Lock size={13} strokeWidth={1.8} />
          ) : (
            <Phone size={14} strokeWidth={1.8} />
          )}
        </span>
      );
    case 'NUMBER':
      return (
        <span className={mockInputClass} aria-hidden="true">
          <span>{placeholder}</span>
          {isReadonlyLocked && <Lock size={13} strokeWidth={1.8} />}
        </span>
      );
    case 'CURRENCY':
      return (
        <span className={mockInputClass} aria-hidden="true">
          <span>{placeholder}</span>
          <em className="form-builder-mock-suffix">
            {isReadonlyLocked ? 'VNĐ · Khóa' : 'VNĐ'}
          </em>
        </span>
      );
    case 'TEXTAREA':
      return (
        <span className={mockTextareaClass} aria-hidden="true">
          <span>{placeholder}</span>
        </span>
      );
    case 'DATE':
      return (
        <span className={mockInputClass} aria-hidden="true">
          <span>{placeholder}</span>
          <Calendar size={14} strokeWidth={1.8} />
        </span>
      );
    case 'DATETIME':
      return (
        <span className={mockInputClass} aria-hidden="true">
          <span>{placeholder}</span>
          <CalendarClock size={14} strokeWidth={1.8} />
        </span>
      );
    case 'SELECT':
      return (
        <span className="form-builder-mock-input" aria-hidden="true">
          <span>{placeholder}</span>
          <ChevronDown size={15} strokeWidth={1.8} />
        </span>
      );
    case 'MULTI_SELECT':
      return (
        <span className="form-builder-mock-input" aria-hidden="true">
          <span>{placeholder}</span>
          <ChevronDown size={15} strokeWidth={1.8} />
        </span>
      );
    case 'RADIO':
    case 'CHECKBOX': {
      const activeOptions = (field.options ?? []).filter(
        (option) => option.isActive !== false,
      );
      const previewOptions = activeOptions.length
        ? activeOptions
        : [{ value: 'OPTION_1', label: 'Lựa chọn 1' }];
      return (
        <span className="form-builder-mock-option-group" aria-hidden="true">
          {previewOptions.map((option, optionIndex) => (
            <span
              className="form-builder-mock-option"
              key={`${option.value}-${optionIndex}`}
            >
              <span
                className={
                  field.type === 'RADIO'
                    ? 'form-builder-mock-radio-dot'
                    : 'form-builder-mock-check-box'
                }
              />
              <span>
                {option.label || option.value || `Lựa chọn ${optionIndex + 1}`}
              </span>
            </span>
          ))}
        </span>
      );
    }
    case 'BOOLEAN':
      return (
        <span className="form-builder-mock-boolean" aria-hidden="true">
          <span className="form-builder-mock-switch" />
          <span>Không</span>
        </span>
      );
    case 'FILE':
      return (
        <span className="form-builder-mock-file" aria-hidden="true">
          <Paperclip size={15} strokeWidth={1.8} />
          <span>{placeholder}</span>
          {field.fileConfig && (
            <small>
              {field.fileConfig.multiple
                ? `Tối đa ${field.fileConfig.maxFiles} tệp`
                : '1 tệp'}
            </small>
          )}
        </span>
      );
    case 'TABLE': {
      const columns = field.tableConfig?.columns ?? [];
      return (
        <span className="form-builder-mock-table-wrap" aria-hidden="true">
          <span className="form-builder-mock-table-grid">
            <span className="form-builder-mock-table-head">
              {columns.map((column, columnIndex) => (
                <span key={`${column.key}-${columnIndex}`}>
                  {column.label || `Cột ${columnIndex + 1}`}
                  {column.required ? <b> *</b> : null}
                </span>
              ))}
            </span>
            <span className="form-builder-mock-table-row">
              {columns.map((column, columnIndex) => (
                <span key={`${column.key}-${columnIndex}`}>
                  <span className="form-builder-mock-table-cell" />
                </span>
              ))}
            </span>
          </span>
        </span>
      );
    }
  }
}

function resolveDraggedFieldType(
  source: DragSource | null,
  fields: readonly FormField[],
): FormFieldType {
  if (!source) return 'TEXT';
  if (source.kind === 'PALETTE_TYPE') return source.fieldType;
  if (source.kind === 'PALETTE_PRESET') {
    return requesterFieldPresets.find((preset) => preset.presetKey === source.presetKey)?.type ?? 'TEXT';
  }
  return fields[source.index]?.type ?? 'TEXT';
}

function describeDropPlacement(
  placement: CanvasDropPlacement,
  targetRow: FieldGridRow,
  draggedCanvasIndex: number | undefined,
): string {
  if (placement === 'ROW_BEFORE' || placement === 'ROW_AFTER') {
    return 'Hàng 1 cột';
  }
  if (
    draggedCanvasIndex !== undefined &&
    targetRow.indices.includes(draggedCanvasIndex)
  ) {
    return placement === 'COL_LEFT' ? 'Đổi sang trái' : 'Đổi sang phải';
  }
  const nextCols = targetRow.indices.length + 1;
  if (nextCols === 2) {
    return placement === 'COL_LEFT' ? 'Tách 2 cột · Trái' : 'Tách 2 cột · Phải';
  }
  return `Chia ${nextCols} cột`;
}

function resolveFieldHoverIndicator(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  rows: readonly FieldGridRow[],
  fields: readonly FormField[],
  targetIndex: number,
  activeSource: DragSource | null,
): Extract<DropIndicator, { kind: 'FIELD' }> | null {
  const targetRow = rows.find((row) => row.indices.includes(targetIndex));
  if (!targetRow) return null;

  const draggedType = resolveDraggedFieldType(activeSource, fields);
  const draggedCanvasIndex =
    activeSource?.kind === 'CANVAS_FIELD' ? activeSource.index : undefined;
  const relX = (clientX - rect.left) / Math.max(rect.width, 1);
  const relY = (clientY - rect.top) / Math.max(rect.height, 1);

  let placement: CanvasDropPlacement;

  if (draggedCanvasIndex === targetIndex) {
    if (targetRow.indices.length < 2) return null;
    if (relY <= 0.22) placement = 'ROW_BEFORE';
    else if (relY >= 0.78) placement = 'ROW_AFTER';
    else return null;
  } else if (targetRow.indices.length === 1) {
    if (
      relX <= 0.28 &&
      canDropAtCanvasPlacement(
        fields,
        targetIndex,
        'COL_LEFT',
        draggedType,
        draggedCanvasIndex,
      )
    ) {
      placement = 'COL_LEFT';
    } else if (
      relX >= 0.72 &&
      canDropAtCanvasPlacement(
        fields,
        targetIndex,
        'COL_RIGHT',
        draggedType,
        draggedCanvasIndex,
      )
    ) {
      placement = 'COL_RIGHT';
    } else {
      placement = relY < 0.5 ? 'ROW_BEFORE' : 'ROW_AFTER';
    }
  } else if (
    relY <= 0.25 &&
    canDropAtCanvasPlacement(
      fields,
      targetIndex,
      'ROW_BEFORE',
      draggedType,
      draggedCanvasIndex,
    )
  ) {
    placement = 'ROW_BEFORE';
  } else if (
    relY >= 0.75 &&
    canDropAtCanvasPlacement(
      fields,
      targetIndex,
      'ROW_AFTER',
      draggedType,
      draggedCanvasIndex,
    )
  ) {
    placement = 'ROW_AFTER';
  } else {
    const sideCandidate: CanvasDropPlacement =
      relX < 0.5 ? 'COL_LEFT' : 'COL_RIGHT';
    placement = canDropAtCanvasPlacement(
      fields,
      targetIndex,
      sideCandidate,
      draggedType,
      draggedCanvasIndex,
    )
      ? sideCandidate
      : relY < 0.5
        ? 'ROW_BEFORE'
        : 'ROW_AFTER';
  }

  if (
    !canDropAtCanvasPlacement(
      fields,
      targetIndex,
      placement,
      draggedType,
      draggedCanvasIndex,
    )
  ) {
    return null;
  }

  return {
    kind: 'FIELD',
    index: targetIndex,
    rowIndex: targetRow.rowIndex,
    placement,
    label: describeDropPlacement(placement, targetRow, draggedCanvasIndex),
  };
}

function parseDragSource(raw: string): DragSource | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || !('kind' in parsed)) {
      return null;
    }
    const candidate = parsed as Record<string, unknown>;
    if (
      candidate.kind === 'CANVAS_FIELD' &&
      typeof candidate.index === 'number'
    ) {
      return { kind: 'CANVAS_FIELD', index: candidate.index };
    }
    if (
      candidate.kind === 'PALETTE_TYPE' &&
      typeof candidate.fieldType === 'string' &&
      formFieldTypes.includes(candidate.fieldType as FormFieldType)
    ) {
      return {
        kind: 'PALETTE_TYPE',
        fieldType: candidate.fieldType as FormFieldType,
      };
    }
    if (
      candidate.kind === 'PALETTE_PRESET' &&
      typeof candidate.presetKey === 'string' &&
      requesterFieldPresets.some((preset) => preset.presetKey === candidate.presetKey)
    ) {
      return {
        kind: 'PALETTE_PRESET',
        presetKey: candidate.presetKey,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function emptyDraft(initialGroupId = ''): FormDraft {
  const fields = ['EMPLOYEE_CODE', 'REQUEST_DATE', 'FULL_NAME', 'DEPARTMENT_NAME'].reduce<FormField[]>(
    (currentFields, presetKey) => [
      ...currentFields,
      {
        ...createPresetField(presetKey, currentFields),
        layout: { columnSpan: 6 },
      },
    ],
    ensureSystemRequestFields([]),
  );
  return {
    code: '',
    name: '',
    groupId: initialGroupId,
    category: '',
    description: '',
    fields,
    settings: { allowSaveDraft: true, allowCancelAfterSubmit: false },
  };
}

function toDraft(definition: FormDefinition): FormDraft {
  return {
    code: definition.code,
    name: definition.name,
    groupId: definition.group?.id ?? '',
    category: definition.category ?? '',
    description: definition.description ?? '',
    fields: ensureSystemRequestFields(definition.fields),
    settings: structuredClone(definition.settings),
  };
}

function fingerprint(value: FormDraft): string {
  return JSON.stringify(value);
}

function normalizeServerPath(path: string): string {
  return path.replace(/^definition\./, '').replace(/^body\./, '');
}

function focusIssue(
  issue: FormBuilderIssue,
  selectField: (index: number | null) => void,
) {
  const match = /^fields\.(\d+)/.exec(issue.path);
  if (match) {
    const index = Number(match[1]);
    selectField(index);
    window.requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-field-index="${index}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
    return;
  }
  window.requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(
      `[data-form-property="${issue.path}"]`,
    );
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.focus();
  });
}

function findEmptyFormulaIssues(fields: readonly FormField[]): FormBuilderIssue[] {
  const issues: FormBuilderIssue[] = [];
  fields.forEach((field, fieldIndex) => {
    if (field.formula !== undefined && field.formula.trim() === '') {
      issues.push({
        path: `fields.${fieldIndex}.formula`,
        message: 'Vui lòng nhập biểu thức công thức hoặc tắt chế độ tự động tính.',
      });
    }
    if (field.type === 'TABLE' && field.tableConfig?.columns) {
      field.tableConfig.columns.forEach((column, colIndex) => {
        if (column.formula !== undefined && column.formula.trim() === '') {
          issues.push({
            path: `fields.${fieldIndex}.tableConfig.columns.${colIndex}.formula`,
            message: 'Vui lòng nhập biểu thức công thức cột hoặc tắt chế độ tự động tính.',
          });
        }
      });
    }
  });
  return issues;
}
