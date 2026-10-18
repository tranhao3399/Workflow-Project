import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import { DepartmentsService } from '../departments/departments.service.js';
import { PositionsService } from '../positions/positions.service.js';
import { RolesService } from '../roles/roles.service.js';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuthenticationErrors, ApiValidationError } from '../common/http/swagger-response.dto.js';

@Controller('reference-data') @UseGuards(JwtAuthGuard, PermissionGuard)
@ApiTags('Dữ liệu tham chiếu')
@ApiBearerAuth('access-token')
@ApiAuthenticationErrors()
export class ReferenceDataController {
  constructor(private readonly departments: DepartmentsService, private readonly positions: PositionsService, private readonly roles: RolesService) {}
  @Get()
  @RequirePermissions({ all: ['DEPARTMENT.VIEW', 'JOB_TITLE.VIEW', 'ROLE.VIEW'] })
  @ApiOperation({ summary: 'Dữ liệu tham chiếu', description: 'Yêu cầu đồng thời các quyền: DEPARTMENT.VIEW, JOB_TITLE.VIEW và ROLE.VIEW.' })
  @ApiOkResponse({ description: 'Đối tượng gồm departments, positions và roles đang hoạt động.', type: Object })
  @ApiValidationError()
  async findAll() {
    const active = true;
    const [departments, positions, roles] = await Promise.all([
      this.departments.findCatalog({ active }), this.positions.findCatalog({ active }), this.roles.findAll({ active }),
    ]);
    return { departments, positions, roles };
  }
}
