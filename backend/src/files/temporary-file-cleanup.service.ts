import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StoredFile } from './schemas/stored-file.schema.js';
import { FILE_STORAGE, type StorageAdapter } from './storage/storage-adapter.js';

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 100;
const DELETION_CLAIM_RETRY_MS = 5 * 60 * 1000;

@Injectable()
export class TemporaryFileCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TemporaryFileCleanupService.name);
  private cleanupTimer?: NodeJS.Timeout;
  private cleanupRunning = false;

  constructor(
    @InjectModel(StoredFile.name) private readonly files: Model<StoredFile>,
    @Inject(FILE_STORAGE) private readonly storage: StorageAdapter,
  ) {}

  onModuleInit(): void {
    void this.cleanupExpiredFiles();
    this.cleanupTimer = setInterval(() => void this.cleanupExpiredFiles(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async cleanupExpiredFiles(): Promise<number> {
    if (this.cleanupRunning) return 0;
    this.cleanupRunning = true;
    let deletedCount = 0;
    try {
      for (let index = 0; index < CLEANUP_BATCH_SIZE; index += 1) {
        const now = new Date();
        const retryBefore = new Date(now.getTime() - DELETION_CLAIM_RETRY_MS);
        const file = await this.files.findOneAndUpdate({
          $or: [
            { status: 'TEMPORARY', expiresAt: { $lte: now } },
            {
              status: 'DELETING',
              $or: [
                { deletionClaimedAt: { $exists: false } },
                { deletionClaimedAt: { $lte: retryBefore } },
              ],
            },
          ],
        }, {
          $set: { status: 'DELETING', deletionClaimedAt: now },
        }, {
          returnDocument: 'after',
          sort: { expiresAt: 1, _id: 1 },
        }).exec();
        if (!file) break;

        if (file.storageProvider !== this.storage.provider) {
          this.logger.warn(`Skipped claimed file ${file._id.toString()}: storage provider is unavailable.`);
          continue;
        }
        try {
          await this.storage.remove(file.storageKey);
          if (file.deletedBy && file.deletedAt) {
            const result = await this.files.updateOne(
              { _id: file._id, status: 'DELETING', deletionClaimedAt: now },
              {
                $set: { status: 'DELETED' },
                $unset: { expiresAt: 1, deletionClaimedAt: 1 },
              },
            ).exec();
            deletedCount += result.modifiedCount;
          } else {
            const result = await this.files.deleteOne({
              _id: file._id,
              status: 'DELETING',
              deletionClaimedAt: now,
            }).exec();
            deletedCount += result.deletedCount;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown cleanup error';
          this.logger.error(`Failed to clean claimed file ${file._id.toString()}: ${message}`);
        }
      }
      return deletedCount;
    } finally {
      this.cleanupRunning = false;
    }
  }
}
