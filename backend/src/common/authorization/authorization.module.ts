import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Role, RoleSchema } from '../../roles/schemas/role.schema.js';
import { User, UserSchema } from '../../users/schemas/user.schema.js';
import { PermissionGuard } from './permission.guard.js';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }, { name: Role.name, schema: RoleSchema }])],
  providers: [PermissionGuard],
  exports: [PermissionGuard],
})
export class AuthorizationModule {}
