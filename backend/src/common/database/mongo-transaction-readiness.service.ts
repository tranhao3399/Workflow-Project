import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

interface MongoHelloResponse {
  setName?: unknown;
  msg?: unknown;
  logicalSessionTimeoutMinutes?: unknown;
}

@Injectable()
export class MongoTransactionReadinessService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MongoTransactionReadinessService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onApplicationBootstrap(): Promise<void> {
    const database = this.connection.db;
    if (!database) {
      throw new Error('MongoDB chưa sẵn sàng. Không thể kiểm tra khả năng chạy transaction.');
    }

    let hello: MongoHelloResponse;
    try {
      hello = await database.admin().command({ hello: 1 }) as MongoHelloResponse;
    } catch (error) {
      const cause = error instanceof Error ? error.message : 'Không xác định';
      throw new Error(`Không thể kiểm tra MongoDB transaction readiness: ${cause}`);
    }

    const isReplicaSet = typeof hello.setName === 'string' && hello.setName.length > 0;
    const isShardedCluster = hello.msg === 'isdbgrid';
    const supportsSessions = typeof hello.logicalSessionTimeoutMinutes === 'number';
    if ((!isReplicaSet && !isShardedCluster) || !supportsSessions) {
      throw new Error(
        'Cấu hình MongoDB không hỗ trợ transaction. Hãy dùng MongoDB Atlas hoặc replica set '
        + 'và cấu hình MONGODB_URI với tham số replicaSet phù hợp trước khi khởi động backend.',
      );
    }

    this.logger.log(`MongoDB transaction readiness: ${isShardedCluster ? 'sharded cluster' : 'replica set'} sẵn sàng.`);
  }
}
