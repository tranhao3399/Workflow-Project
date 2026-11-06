import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Department, DepartmentSchema } from '../../departments/schemas/department.schema.js';
import { Employee, EmployeeSchema } from '../../employees/schemas/employee.schema.js';
import { Role, RoleSchema } from '../../roles/schemas/role.schema.js';
import { User, UserSchema } from '../../users/schemas/user.schema.js';
import { OrganizationScopeService } from './organization-scope.service.js';

@Module({
  imports: [MongooseModule.forFeature([
    { name: User.name, schema: UserSchema },
    { name: Role.name, schema: RoleSchema },
    { name: Employee.name, schema: EmployeeSchema },
    { name: Department.name, schema: DepartmentSchema },
  ])],
  providers: [OrganizationScopeService],
  exports: [OrganizationScopeService],
})
export class OrganizationScopeModule {}
