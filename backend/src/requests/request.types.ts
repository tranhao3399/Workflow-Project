import type { Types } from 'mongoose';
import type { Request } from './schemas/request.schema.js';

export type StoredRequest = Request & { _id: Types.ObjectId; __v?: number };

export interface AvailableActions {
  canEdit: boolean;
  canSubmit: boolean;
  canResubmit: boolean;
  canCancel: boolean;
  canApprove: boolean;
  canReject: boolean;
  canRequestRevision: boolean;
  canVoid: boolean;
  canDelete: boolean;
  canRecreate: boolean;
}

export interface RequestFormSummary {
  id: string;
  code: string;
  name: string;
  version: number;
}

export interface DefinitionSummary {
  id: string;
  code: string;
  name: string;
  version: number;
}

export interface RequestDefinitionVersion {
  status: 'CURRENT' | 'OUTDATED' | 'SNAPSHOT_LOCKED';
  currentForm?: DefinitionSummary;
  currentWorkflow?: DefinitionSummary;
}

export interface DraftMigrationReviewItem {
  fieldKey: string;
  label: string;
  reason: 'FILE_REUPLOAD_REQUIRED' | 'FIELD_REMOVED' | 'TYPE_CHANGED' | 'VALUE_INVALID' | 'REQUIRED_VALUE_MISSING';
  message: string;
}
