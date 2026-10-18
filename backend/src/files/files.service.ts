import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';
import type { Readable } from 'node:stream';
import { fileTypeFromBuffer } from 'file-type';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { FormDefinition } from '../form-definitions/schemas/form-definition.schema.js';
import { Request } from '../requests/schemas/request.schema.js';
import type { SafeUser } from '../users/users.service.js';
import { StoredFileResponseDto } from './dto/file.dto.js';
import { FileAccessService } from './file-access.service.js';
import {
  fileScanStatuses,
  fileStatuses,
  StoredFile,
  type FileScanStatus,
  type FileStatus,
  type StoredFileDocument,
} from './schemas/stored-file.schema.js';
import { FILE_STORAGE, type StorageAdapter } from './storage/storage-adapter.js';

const DEFAULT_ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;
const TEMPORARY_FILE_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const ABSOLUTE_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

const MIME_ALIASES: Readonly<Record<string, string>> = {
  'application/x-pdf': 'application/pdf',
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
};

const EXTENSION_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'image/jpeg': ['jpg', 'jpeg', 'jpe'],
};

const PREVIEW_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']);

interface UploadPolicy {
  allowedMimeTypes: string[];
  maxFileSizeBytes: number;
  maxFiles: number;
}

interface StoredFileRecord extends StoredFile {
  _id: Types.ObjectId;
}

interface ValidatedFileField {
  fieldKey: string;
  files: StoredFileDocument[];
}

export interface ClaimedFileDeletion {
  id: Types.ObjectId;
  storageProvider: StoredFile['storageProvider'];
  storageKey: string;
}

export interface FileBinaryResult {
  stream: Readable;
  originalName: string;
  detectedMimeType: string;
  sizeBytes: number;
}

export interface RequestFileValidationSource {
  fields: readonly unknown[];
}

@Injectable()
export class FilesService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(StoredFile.name) private readonly files: Model<StoredFile>,
    @InjectModel(Request.name) private readonly requests: Model<Request>,
    @InjectModel(FormDefinition.name) private readonly formDefinitions: Model<FormDefinition>,
    @Inject(FILE_STORAGE) private readonly storage: StorageAdapter,
    private readonly access: FileAccessService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async uploadToRequest(
    context: RequestWithContext,
    requestId: string,
    fieldKey: string,
    upload: Express.Multer.File | undefined,
    user: SafeUser,
  ): Promise<StoredFileResponseDto> {
    if (!upload) throw new BadRequestException('Vui lòng chọn tệp cần tải lên.');
    const request = await this.access.requireEditableRequest(requestId, user.id);
    const fullRequest = await this.requests.findById(request._id)
      .select({ formDefinitionId: 1, formVersion: 1, formSnapshot: 1, formData: 1 })
      .lean().exec();
    if (!fullRequest) throw new NotFoundException('Không tìm thấy phiếu yêu cầu.');

    const policy = await this.resolveUploadPolicy(fullRequest, fieldKey);
    if (upload.buffer.length < 1) throw new BadRequestException('Tệp tải lên không được để trống.');
    if (upload.buffer.length > policy.maxFileSizeBytes) {
      throw new BadRequestException(`Tệp vượt quá dung lượng tối đa ${policy.maxFileSizeBytes} byte.`);
    }

    const originalName = this.validateOriginalName(upload.originalname);
    const detectedType = await fileTypeFromBuffer(upload.buffer);
    if (!detectedType) throw new BadRequestException('Không thể xác định định dạng tệp từ nội dung.');
    const detectedMimeType = this.normalizeMimeType(detectedType.mime);
    const suppliedMimeType = this.normalizeMimeType(upload.mimetype);
    if (suppliedMimeType !== detectedMimeType) {
      throw new BadRequestException('Content-Type của tệp không khớp với nội dung thực tế.');
    }
    if (!policy.allowedMimeTypes.includes(detectedMimeType)) {
      throw new BadRequestException(`Định dạng ${detectedMimeType} không được phép cho trường ${fieldKey}.`);
    }

    const originalExtension = extname(originalName).slice(1).toLowerCase();
    const acceptedExtensions = EXTENSION_ALIASES[detectedMimeType] ?? [detectedType.ext];
    if (!originalExtension || !acceptedExtensions.includes(originalExtension)) {
      throw new BadRequestException('Phần mở rộng của tệp không khớp với nội dung thực tế.');
    }

    const pendingFiles = await this.files.find({
      ownerType: 'REQUEST',
      ownerId: request._id,
      fieldKey,
      status: 'TEMPORARY',
      expiresAt: { $gt: new Date() },
    }).select({ _id: 1 }).lean().exec();
    const currentFileIds = new Set([
      ...this.fileIdsFromValue(fullRequest.formData?.[fieldKey]),
      ...pendingFiles.map((file) => file._id.toString()),
    ]);
    const currentFileCount = currentFileIds.size;
    if (currentFileCount >= policy.maxFiles) {
      throw new BadRequestException(`Trường ${fieldKey} chỉ cho phép tối đa ${policy.maxFiles} tệp.`);
    }

    const stored = await this.storage.store({ buffer: upload.buffer, extension: detectedType.ext });
    let metadataCreated = false;
    try {
      const item = await this.files.create({
        storageProvider: stored.storageProvider,
        storageKey: stored.storageKey,
        originalName,
        detectedMimeType,
        extension: `.${detectedType.ext}`,
        sizeBytes: stored.sizeBytes,
        sha256: createHash('sha256').update(upload.buffer).digest('hex'),
        uploadedByUserId: new Types.ObjectId(user.id),
        ownerType: 'REQUEST',
        ownerId: request._id,
        fieldKey,
        status: 'TEMPORARY',
        scanStatus: 'SKIPPED',
        expiresAt: new Date(Date.now() + TEMPORARY_FILE_LIFETIME_MS),
      });
      metadataCreated = true;
      await this.auditLogs.record(context, {
        action: 'FILE.UPLOADED',
        description: 'Đã tải tệp đính kèm lên phiếu yêu cầu.',
        outcome: AuditOutcome.SUCCESS,
        resource: {
          type: 'FILE',
          id: item._id.toString(),
          code: item.originalName,
          name: item.originalName,
        },
        changes: {
          after: {
            fileName: item.originalName,
            mimeType: item.detectedMimeType,
            sizeBytes: item.sizeBytes,
            status: item.status,
          },
        },
        metadata: {
          requestId: request._id.toString(),
          fieldKey,
        },
      });
      return this.toResponse(item);
    } catch (error) {
      if (!metadataCreated) await this.storage.remove(stored.storageKey);
      throw error;
    }
  }

  async getMetadata(id: string, user: SafeUser, permissionKeys: readonly string[]): Promise<StoredFileResponseDto> {
    const file = await this.findReadableFile(id, user, permissionKeys);
    return this.toResponse(file);
  }

  async open(id: string, user: SafeUser, permissionKeys: readonly string[], preview: boolean): Promise<FileBinaryResult> {
    const file = await this.findReadableFile(id, user, permissionKeys);
    if (file.scanStatus !== 'CLEAN' && file.scanStatus !== 'SKIPPED') {
      throw new ForbiddenException('Tệp chưa vượt qua kiểm tra an toàn và không thể tải xuống.');
    }
    if (preview && !PREVIEW_MIME_TYPES.has(file.detectedMimeType)) {
      throw new BadRequestException('Định dạng tệp này không hỗ trợ xem trước.');
    }
    if (file.storageProvider !== this.storage.provider) {
      throw new ServiceUnavailableException('Storage provider của tệp hiện chưa khả dụng.');
    }

    try {
      return {
        stream: await this.storage.open(file.storageKey),
        originalName: file.originalName,
        detectedMimeType: file.detectedMimeType,
        sizeBytes: file.sizeBytes,
      };
    } catch {
      throw new NotFoundException('Nội dung tệp không còn tồn tại trong kho lưu trữ.');
    }
  }

  async remove(
    context: RequestWithContext,
    id: string,
    user: SafeUser,
  ): Promise<{ id: string }> {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('File id không hợp lệ.');
    const userId = new Types.ObjectId(user.id);
    const result = await this.inTransaction(async (session) => {
      const file = await this.files.findOne({
        _id: id,
        status: { $in: ['TEMPORARY', 'ATTACHED'] },
      }).session(session).exec();
      if (!file || file.ownerType !== 'REQUEST' || !file.ownerId || !file.fieldKey) {
        throw new NotFoundException('Không tìm thấy tệp đính kèm.');
      }

      const request = await this.requests.findById(file.ownerId).session(session).exec();
      if (!request) throw new NotFoundException('Không tìm thấy phiếu yêu cầu của tệp.');
      if (!request.requesterUserId.equals(userId)) {
        throw new ForbiddenException('Bạn không được chỉnh sửa tệp của phiếu yêu cầu này.');
      }
      if (request.status !== 'DRAFT' && request.status !== 'REVISION_REQUESTED') {
        throw new ForbiddenException('Phiếu yêu cầu hiện không cho phép thay đổi tệp đính kèm.');
      }

      const previousStatus = file.status;
      const reference = this.removeFileReference(request.formData, file.fieldKey, file._id.toString());
      if (reference.changed) {
        request.formData = reference.formData;
        request.updatedBy = userId;
        request.markModified('formData');
        await request.save({ session });
      }

      const preserveHistoricalFile = previousStatus === 'ATTACHED' && Boolean(request.submittedAt);
      let claimed: ClaimedFileDeletion | undefined;
      if (!preserveHistoricalFile) {
        const claimedAt = new Date();
        const claim = await this.files.updateOne({
          _id: file._id,
          status: previousStatus,
        }, {
          $set: {
            status: 'DELETING',
            deletionClaimedAt: claimedAt,
            deletedAt: claimedAt,
            deletedBy: userId,
          },
        }, { session }).exec();
        if (claim.modifiedCount !== 1) throw this.fileLifecycleConflict();
        claimed = {
          id: file._id,
          storageProvider: file.storageProvider,
          storageKey: file.storageKey,
        };
      }

      await this.auditLogs.record(context, {
        action: 'FILE.DELETED',
        description: preserveHistoricalFile
          ? 'Đã gỡ tệp khỏi dữ liệu hiện tại và giữ lại chứng từ lịch sử.'
          : 'Đã xóa tệp đính kèm khỏi phiếu yêu cầu.',
        outcome: AuditOutcome.SUCCESS,
        resource: {
          type: 'FILE',
          id: file._id.toString(),
          code: file.originalName,
          name: file.originalName,
        },
        changes: {
          before: {
            fileName: file.originalName,
            mimeType: file.detectedMimeType,
            sizeBytes: file.sizeBytes,
            status: previousStatus,
          },
          after: { status: preserveHistoricalFile ? 'ATTACHED' : 'DELETING' },
        },
        metadata: {
          requestId: file.ownerId.toString(),
          fieldKey: file.fieldKey,
          historicalFilePreserved: preserveHistoricalFile,
        },
      }, session);
      return { claimed };
    });

    if (result.claimed) await this.finalizeClaimedDeletions([result.claimed]);
    return { id };
  }

  async attachRequestFileReferences(
    requestId: string | Types.ObjectId,
    formData: Record<string, unknown>,
    source: RequestFileValidationSource,
    session: ClientSession,
  ): Promise<void> {
    const ownerId = requestId instanceof Types.ObjectId ? requestId : new Types.ObjectId(requestId);
    const references = await this.validateRequestFileReferences(
      ownerId,
      formData,
      source,
      'ATTACH',
      session,
    );
    const attachedAt = new Date();
    for (const reference of references) {
      const temporaryIds = reference.files
        .filter((file) => file.status === 'TEMPORARY')
        .map((file) => file._id);
      if (!temporaryIds.length) continue;
      const result = await this.files.updateMany({
        _id: { $in: temporaryIds },
        ownerType: 'REQUEST',
        ownerId,
        fieldKey: reference.fieldKey,
        status: 'TEMPORARY',
        scanStatus: { $in: ['CLEAN', 'SKIPPED'] },
        expiresAt: { $gt: attachedAt },
      }, {
        $set: { status: 'ATTACHED', attachedAt },
        $unset: { expiresAt: 1, deletionClaimedAt: 1 },
      }, { session }).exec();
      if (result.modifiedCount !== temporaryIds.length) throw this.fileLifecycleConflict();
    }
  }

  async assertRequestFileReferencesValid(
    requestId: string | Types.ObjectId,
    formData: Record<string, unknown>,
    source: RequestFileValidationSource,
    session: ClientSession,
  ): Promise<void> {
    const ownerId = requestId instanceof Types.ObjectId ? requestId : new Types.ObjectId(requestId);
    await this.validateRequestFileReferences(ownerId, formData, source, 'SUBMIT', session);
  }

  async claimDraftRequestFilesForDeletion(
    requestId: Types.ObjectId,
    deletedBy: Types.ObjectId,
    session: ClientSession,
  ): Promise<ClaimedFileDeletion[]> {
    const files = await this.files.find({
      ownerType: 'REQUEST',
      ownerId: requestId,
      status: { $in: ['TEMPORARY', 'ATTACHED'] },
    }).session(session).exec();
    if (!files.length) return [];

    const claimedAt = new Date();
    const ids = files.map((file) => file._id);
    const result = await this.files.updateMany({
      _id: { $in: ids },
      status: { $in: ['TEMPORARY', 'ATTACHED'] },
    }, {
      $set: {
        status: 'DELETING',
        deletionClaimedAt: claimedAt,
        deletedAt: claimedAt,
        deletedBy,
      },
    }, { session }).exec();
    if (result.modifiedCount !== files.length) throw this.fileLifecycleConflict();
    return files.map((file) => ({
      id: file._id,
      storageProvider: file.storageProvider,
      storageKey: file.storageKey,
    }));
  }

  async finalizeClaimedDeletions(files: readonly ClaimedFileDeletion[]): Promise<void> {
    await Promise.allSettled(files.map((file) => this.finalizeClaimedDeletion(file)));
  }

  contentDisposition(disposition: 'inline' | 'attachment', originalName: string): string {
    const withoutControls = [...originalName]
      .filter((character) => !this.isControlCharacter(character))
      .join('');
    const fallback = withoutControls
      .normalize('NFKD')
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/["\\]/g, '_')
      .slice(0, 180) || 'download';
    const encoded = encodeURIComponent(withoutControls).replace(/['()*]/g, (character) => (
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    ));
    return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
  }

  private async resolveUploadPolicy(
    request: Pick<Request, 'formDefinitionId' | 'formVersion' | 'formSnapshot'>,
    fieldKey: string,
  ): Promise<UploadPolicy> {
    let fields: unknown[];
    if (request.formSnapshot) {
      fields = this.readSnapshotFields(request.formSnapshot);
    } else {
      const form = await this.formDefinitions.findOne({ _id: request.formDefinitionId, version: request.formVersion })
        .select({ fields: 1 }).lean().exec();
      if (!form) throw new NotFoundException('Không tìm thấy định nghĩa biểu mẫu của phiếu yêu cầu.');
      fields = form.fields;
    }

    const field = fields.find((candidate) => this.isRecord(candidate) && candidate.key === fieldKey);
    if (!this.isRecord(field)) throw new BadRequestException(`fieldKey ${fieldKey} không tồn tại trong biểu mẫu.`);
    if (field.type !== 'FILE') throw new BadRequestException(`Trường ${fieldKey} không phải trường tệp đính kèm.`);

    return this.policyFromField(field);
  }

  private policyFromField(field: Record<string, unknown>): UploadPolicy {
    const config = this.isRecord(field.fileConfig) ? field.fileConfig : undefined;
    const configuredMimeTypes = Array.isArray(config?.allowedMimeTypes)
      ? config.allowedMimeTypes.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const configuredMaxSize = typeof config?.maxFileSizeBytes === 'number' && Number.isInteger(config.maxFileSizeBytes)
      ? config.maxFileSizeBytes
      : DEFAULT_MAX_FILE_SIZE_BYTES;
    const configuredMaxFiles = typeof config?.maxFiles === 'number' && Number.isInteger(config.maxFiles)
      ? config.maxFiles
      : DEFAULT_MAX_FILES;
    const maxFiles = config?.multiple === false ? 1 : configuredMaxFiles;

    return {
      allowedMimeTypes: (configuredMimeTypes.length ? configuredMimeTypes : [...DEFAULT_ALLOWED_MIME_TYPES])
        .map((mimeType) => this.normalizeMimeType(mimeType)),
      maxFileSizeBytes: Math.min(Math.max(1, configuredMaxSize), ABSOLUTE_MAX_FILE_SIZE_BYTES),
      maxFiles: Math.max(1, maxFiles),
    };
  }

  private readSnapshotFields(snapshot: Record<string, unknown>): unknown[] {
    if (!Array.isArray(snapshot.fields)) {
      throw new BadRequestException('Form Snapshot của phiếu không chứa danh sách trường hợp lệ.');
    }
    return snapshot.fields;
  }

  private async validateRequestFileReferences(
    ownerId: Types.ObjectId,
    formData: Record<string, unknown>,
    source: RequestFileValidationSource,
    mode: 'ATTACH' | 'SUBMIT',
    session: ClientSession,
  ): Promise<ValidatedFileField[]> {
    const fileFields = source.fields.filter((field): field is Record<string, unknown> => (
      this.isRecord(field) && field.type === 'FILE' && typeof field.key === 'string'
    ));
    const references: ValidatedFileField[] = [];

    for (const field of fileFields) {
      const fieldKey = String(field.key);
      const rawValue = formData[fieldKey];
      if (rawValue === undefined || rawValue === null || rawValue === '') continue;
      const fileIds = Array.isArray(rawValue) ? rawValue : [rawValue];
      if (!fileIds.every((fileId) => typeof fileId === 'string' && Types.ObjectId.isValid(fileId))) {
        throw new BadRequestException({
          code: 'INVALID_FILE_REFERENCE',
          message: `Trường ${fieldKey} chứa fileId không hợp lệ.`,
          field: fieldKey,
        });
      }
      const uniqueIds = [...new Set(fileIds as string[])];
      if (uniqueIds.length !== fileIds.length) {
        throw new BadRequestException({
          code: 'DUPLICATE_FILE_REFERENCE',
          message: `Trường ${fieldKey} chứa fileId bị trùng.`,
          field: fieldKey,
        });
      }

      const policy = this.policyFromField(field);
      if (uniqueIds.length > policy.maxFiles) {
        throw new BadRequestException({
          code: 'FILE_COUNT_EXCEEDED',
          message: `Trường ${fieldKey} chỉ cho phép tối đa ${policy.maxFiles} tệp.`,
          field: fieldKey,
        });
      }

      const availability = mode === 'SUBMIT'
        ? { status: 'ATTACHED' as const }
        : {
            $or: [
              { status: 'ATTACHED' as const },
              { status: 'TEMPORARY' as const, expiresAt: { $gt: new Date() } },
            ],
          };
      const files = await this.files.find({
        _id: { $in: uniqueIds },
        ownerType: 'REQUEST',
        ownerId,
        fieldKey,
        scanStatus: { $in: ['CLEAN', 'SKIPPED'] },
        ...availability,
      }).session(session).exec();
      if (files.length !== uniqueIds.length) {
        throw new BadRequestException({
          code: 'FILE_REFERENCE_NOT_AVAILABLE',
          message: mode === 'SUBMIT'
            ? `Có tệp của trường ${fieldKey} chưa được lưu, không thuộc phiếu hoặc chưa an toàn.`
            : `Có tệp của trường ${fieldKey} đã hết hạn, không thuộc phiếu hoặc chưa an toàn.`,
          field: fieldKey,
        });
      }
      if (files.some((file) => (
        !policy.allowedMimeTypes.includes(this.normalizeMimeType(file.detectedMimeType))
        || file.sizeBytes > policy.maxFileSizeBytes
      ))) {
        throw new BadRequestException({
          code: 'FILE_POLICY_VIOLATION',
          message: `Có tệp của trường ${fieldKey} không còn phù hợp với cấu hình biểu mẫu.`,
          field: fieldKey,
        });
      }
      references.push({ fieldKey, files });
    }
    return references;
  }

  private async findReadableFile(
    id: string,
    user: SafeUser,
    permissionKeys: readonly string[],
  ): Promise<StoredFileRecord> {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('File id không hợp lệ.');
    const file = await this.files.findOne({
      _id: id,
      status: { $in: ['TEMPORARY', 'ATTACHED'] },
    }).lean().exec();
    if (!file) throw new NotFoundException('Không tìm thấy tệp đính kèm.');
    const storedFile = file as StoredFileRecord;
    if (storedFile.status === 'TEMPORARY') {
      if (!storedFile.expiresAt || storedFile.expiresAt.getTime() <= Date.now()) {
        throw new NotFoundException('Tệp tạm thời đã hết hạn.');
      }
      if (storedFile.uploadedByUserId.toString() !== user.id) {
        throw new ForbiddenException('Bạn không có quyền truy cập tệp tạm thời này.');
      }
      return storedFile;
    }
    await this.access.requireFileReadAccess(storedFile, user.id, permissionKeys);
    return storedFile;
  }

  private fileIdsFromValue(value: unknown): string[] {
    const values = Array.isArray(value) ? value : [value];
    return values.filter((candidate): candidate is string => (
      typeof candidate === 'string' && Types.ObjectId.isValid(candidate)
    ));
  }

  private removeFileReference(
    formData: Record<string, unknown>,
    fieldKey: string,
    fileId: string,
  ): { formData: Record<string, unknown>; changed: boolean } {
    const current = formData[fieldKey];
    if (Array.isArray(current)) {
      const next = current.filter((value) => value !== fileId);
      if (next.length === current.length) return { formData, changed: false };
      return { formData: { ...formData, [fieldKey]: next }, changed: true };
    }
    if (current !== fileId) return { formData, changed: false };
    const next = { ...formData };
    delete next[fieldKey];
    return { formData: next, changed: true };
  }

  private async finalizeClaimedDeletion(file: ClaimedFileDeletion): Promise<void> {
    if (file.storageProvider !== this.storage.provider) {
      throw new ServiceUnavailableException('Storage provider của tệp hiện chưa khả dụng.');
    }
    await this.storage.remove(file.storageKey);
    await this.files.updateOne({ _id: file.id, status: 'DELETING' }, {
      $set: { status: 'DELETED' },
      $unset: { expiresAt: 1, deletionClaimedAt: 1 },
    }).exec();
  }

  private async inTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      if (result === undefined) throw new Error('File transaction did not complete.');
      return result;
    } finally {
      await session.endSession();
    }
  }

  private fileLifecycleConflict(): ConflictException {
    return new ConflictException({
      code: 'FILE_LIFECYCLE_CONFLICT',
      message: 'Tệp đã được thay đổi bởi thao tác khác. Vui lòng tải lại dữ liệu.',
    });
  }

  private validateOriginalName(originalName: string): string {
    const normalized = originalName.normalize('NFC').trim();
    const forwardSlashName = normalized.replace(/\\/g, '/');
    if (
      !normalized
      || basename(forwardSlashName) !== forwardSlashName
      || [...normalized].some((character) => this.isControlCharacter(character))
    ) {
      throw new BadRequestException('Tên tệp không hợp lệ.');
    }
    if (normalized.length > 255) throw new BadRequestException('Tên tệp không được vượt quá 255 ký tự.');
    return normalized;
  }

  private normalizeMimeType(value: string): string {
    const normalized = value.split(';', 1)[0].trim().toLowerCase();
    return MIME_ALIASES[normalized] ?? normalized;
  }

  private toResponse(file: StoredFileRecord | StoredFileDocument): StoredFileResponseDto {
    const status: FileStatus = file.status;
    const scanStatus: FileScanStatus = file.scanStatus ?? 'PENDING';
    if (!fileStatuses.includes(status) || !fileScanStatuses.includes(scanStatus)) {
      throw new ServiceUnavailableException('Metadata tệp không hợp lệ.');
    }
    return {
      id: file._id.toString(),
      originalName: file.originalName,
      detectedMimeType: file.detectedMimeType,
      extension: file.extension,
      sizeBytes: file.sizeBytes,
      fieldKey: file.fieldKey ?? '',
      status,
      scanStatus,
      createdAt: file.createdAt,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private isControlCharacter(character: string): boolean {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint < 32 || codePoint === 127);
  }
}
