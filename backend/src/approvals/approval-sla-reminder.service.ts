import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotificationsService } from '../notifications/notifications.service.js';
import { Request } from '../requests/schemas/request.schema.js';
import { ApprovalTask } from './schemas/approval-task.schema.js';

const SLA_SCAN_INTERVAL_MS = 5 * 60 * 1000;
const SLA_SCAN_BATCH_SIZE = 100;

@Injectable()
export class ApprovalSlaReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApprovalSlaReminderService.name);
  private scanTimer?: NodeJS.Timeout;
  private scanRunning = false;

  constructor(
    @InjectModel(ApprovalTask.name) private readonly approvalTasks: Model<ApprovalTask>,
    @InjectModel(Request.name) private readonly requests: Model<Request>,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.startScan();
    this.scanTimer = setInterval(() => this.startScan(), SLA_SCAN_INTERVAL_MS);
    this.scanTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.scanTimer) clearInterval(this.scanTimer);
  }

  private startScan(): void {
    void this.notifyOverdueTasks().catch((error) => {
      const message = error instanceof Error ? error.message : 'Lỗi không xác định';
      this.logger.error(`Không thể quét công việc quá hạn: ${message}`);
    });
  }

  async notifyOverdueTasks(): Promise<number> {
    if (this.scanRunning) return 0;
    this.scanRunning = true;
    try {
      const now = new Date();
      const tasks = await this.approvalTasks.find({
        status: 'PENDING',
        dueAt: { $lte: now },
        slaReminderSentAt: { $exists: false },
      }).sort({ dueAt: 1, _id: 1 }).limit(SLA_SCAN_BATCH_SIZE).lean().exec();
      if (tasks.length === 0) return 0;

      const requestIds = [...new Set(tasks.map((task) => task.requestId.toString()))];
      const requests = await this.requests.find({ _id: { $in: requestIds } })
        .select({ requestNo: 1 })
        .lean()
        .exec();
      const requestNoById = new Map(
        requests.map((request) => [request._id.toString(), request.requestNo]),
      );

      let notifiedCount = 0;
      for (const task of tasks) {
        const taskId = task._id.toString();
        const requestId = task.requestId.toString();
        const requestNo = requestNoById.get(requestId);
        if (!requestNo) {
          this.logger.warn(`Không thể gửi nhắc SLA cho công việc ${taskId}: không tìm thấy phiếu.`);
          continue;
        }
        try {
          await this.notifications.createPersonal({
            recipientUserId: task.assigneeUserId,
            type: 'SLA',
            title: 'Công việc phê duyệt đã quá hạn',
            message: `Phiếu ${requestNo} đã quá hạn xử lý tại bước ${task.stepNameSnapshot}. Vui lòng xem và xử lý.`,
            link: `/requests/${requestId}?from=approval-inbox&taskId=${encodeURIComponent(taskId)}`,
            resource: { type: 'APPROVAL_TASK', id: task._id },
            data: {
              requestId,
              requestNo,
              stepKey: task.stepKey,
              stepRunNo: task.stepRunNo,
              dueAt: task.dueAt?.toISOString(),
            },
            dedupeKey: `APPROVAL_TASK:${taskId}:SLA_OVERDUE`,
          });
          const result = await this.approvalTasks.updateOne({
            _id: task._id,
            status: 'PENDING',
            slaReminderSentAt: { $exists: false },
          }, {
            $set: { slaReminderSentAt: now },
          }).exec();
          notifiedCount += result.modifiedCount;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Lỗi không xác định';
          this.logger.error(`Không thể gửi nhắc SLA cho công việc ${taskId}: ${message}`);
        }
      }
      return notifiedCount;
    } finally {
      this.scanRunning = false;
    }
  }
}
