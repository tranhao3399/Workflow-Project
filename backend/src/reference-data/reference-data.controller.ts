import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import { DepartmentsService } from '../departments/departments.service.js';
import { ListDepartmentsDto } from '../departments/dto/department.dto.js';
import { ListPositionsDto } from '../positions/dto/position.dto.js';
import { PositionsService } from '../positions/positions.service.js';
import { ListRolesDto } from '../roles/dto/role.dto.js';
import { RolesService } from '../roles/roles.service.js';

@Controller('reference-data') @UseGuards(JwtAuthGuard, PermissionGuard)
export class ReferenceDataController {
  constructor(private readonly departments: DepartmentsService, private readonly positions: PositionsService, private readonly roles: RolesService) {}
  @Get()
  @RequirePermissions({ all: ['DEPARTMENT.VIEW', 'JOB_TITLE.VIEW', 'ROLE.VIEW'] })
  async findAll(@Query() departmentsQuery: ListDepartmentsDto, @Query() positionsQuery: ListPositionsDto, @Query() rolesQuery: ListRolesDto) {
    const active = true;
    const [departments, positions, roles] = await Promise.all([
      this.departments.findCatalog({ active }), this.positions.findCatalog({ ...positionsQuery, active }), this.roles.findAll({ ...rolesQuery, active }),
    ]);
    return { departments, positions, roles };
  }
}
