import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema.js';
import { MailModule } from '../mail/mail.module.js';
import { Request, RequestSchema } from '../requests/schemas/request.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { Notification, NotificationSchema } from './schemas/notification.schema.js';
import { NotificationRead, NotificationReadSchema } from './schemas/notification-read.schema.js';

@Module({
  imports: [
    AuditLogModule,
    MailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: NotificationRead.name, schema: NotificationReadSchema },
      { name: User.name, schema: UserSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Request.name, schema: RequestSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
