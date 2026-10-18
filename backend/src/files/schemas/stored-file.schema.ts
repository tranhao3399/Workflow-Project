import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export const storageProviders = ['LOCAL', 'MINIO', 'S3'] as const;
export type StorageProvider = (typeof storageProviders)[number];
export const fileOwnerTypes = ['REQUEST', 'APPROVAL_TASK'] as const;
export type FileOwnerType = (typeof fileOwnerTypes)[number];
export const fileStatuses = ['TEMPORARY', 'ATTACHED', 'DELETING', 'DELETED'] as const;
export type FileStatus = (typeof fileStatuses)[number];
export const fileScanStatuses = ['PENDING', 'CLEAN', 'INFECTED', 'FAILED', 'SKIPPED'] as const;
export type FileScanStatus = (typeof fileScanStatuses)[number];

export type StoredFileDocument = HydratedDocument<StoredFile>;

@Schema({ timestamps: true, collection: 'files' })
export class StoredFile {
  @Prop({ required: true, type: String, enum: storageProviders }) storageProvider: StorageProvider;
  @Prop({ required: false, trim: true, maxlength: 160 }) bucket?: string;
  @Prop({ required: true, trim: true, maxlength: 1000 }) storageKey: string;
  @Prop({ required: true, trim: true, maxlength: 255 }) originalName: string;
  @Prop({ required: true, trim: true, lowercase: true, maxlength: 160 }) detectedMimeType: string;
  @Prop({ required: true, trim: true, lowercase: true, maxlength: 30, match: /^\.[a-z0-9]+$/ }) extension: string;
  @Prop({ required: true, min: 1 }) sizeBytes: number;
  @Prop({ required: true, lowercase: true, match: /^[a-f0-9]{64}$/ }) sha256: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true }) uploadedByUserId: Types.ObjectId;
  @Prop({ required: false, type: String, enum: fileOwnerTypes }) ownerType?: FileOwnerType;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: false }) ownerId?: Types.ObjectId;
  @Prop({ required: false, trim: true, maxlength: 80 }) fieldKey?: string;
  @Prop({ required: true, type: String, enum: fileStatuses, default: 'TEMPORARY' }) status: FileStatus;
  @Prop({ required: false, type: String, enum: fileScanStatuses, default: 'PENDING' }) scanStatus?: FileScanStatus;
  @Prop({ required: false }) expiresAt?: Date;
  @Prop({ required: false }) attachedAt?: Date;
  @Prop({ required: false }) deletionClaimedAt?: Date;
  @Prop({ required: false }) deletedAt?: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false }) deletedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const StoredFileSchema = SchemaFactory.createForClass(StoredFile);
StoredFileSchema.pre('validate', function validateFileState() {
  if (this.storageProvider !== 'LOCAL' && !this.bucket) this.invalidate('bucket', 'bucket is required for MINIO and S3');
  if (this.status === 'TEMPORARY' && !this.expiresAt) this.invalidate('expiresAt', 'expiresAt is required for temporary files');
  if (this.status === 'ATTACHED') {
    if (!this.ownerType) this.invalidate('ownerType', 'ownerType is required for attached files');
    if (!this.ownerId) this.invalidate('ownerId', 'ownerId is required for attached files');
    if (!this.fieldKey) this.invalidate('fieldKey', 'fieldKey is required for attached files');
    if (!this.attachedAt) this.invalidate('attachedAt', 'attachedAt is required for attached files');
  }
  if (this.status === 'DELETED') {
    if (!this.deletedAt) this.invalidate('deletedAt', 'deletedAt is required for deleted files');
    if (!this.deletedBy) this.invalidate('deletedBy', 'deletedBy is required for deleted files');
  }
});
StoredFileSchema.index({ storageKey: 1 }, { unique: true });
StoredFileSchema.index({ ownerType: 1, ownerId: 1, fieldKey: 1, status: 1 });
StoredFileSchema.index({ uploadedByUserId: 1, status: 1, createdAt: -1 });
StoredFileSchema.index({ status: 1, expiresAt: 1 });
StoredFileSchema.index({ status: 1, deletionClaimedAt: 1 });
StoredFileSchema.index({ sha256: 1 });
