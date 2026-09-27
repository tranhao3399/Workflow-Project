import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequireBodyPermissions, RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { EmployeeIdParamDto } from './dto/employee-id-param.dto.js';
import { ListEmployeesDto } from './dto/list-employees.dto.js';
import { UpdateEmployeeDto, UpdateEmployeeStatusDto } from './dto/update-employee.dto.js';
import { EmployeesService } from './employees.service.js';
import { dataResponse } from '../common/http/api-response.js';

@Controller('employees')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermissions('EMPLOYEE.VIEW')
  findAll(@Query() query: ListEmployeesDto) {
    return this.employeesService.findAll(query);
  }

  @Post()
  @RequirePermissions('EMPLOYEE.CREATE')
  async create(@Req() request: RequestWithContext, @Body() input: CreateEmployeeDto) {
    return dataResponse(await this.employeesService.create(request, input));
  }

  @Get(':id')
  @RequirePermissions('EMPLOYEE.VIEW')
  async findOne(@Param() params: EmployeeIdParamDto) {
    return dataResponse(await this.employeesService.findOne(params.id));
  }

  @Patch(':id')
  @RequirePermissions('EMPLOYEE.UPDATE')
  @RequireBodyPermissions({ isActive: 'EMPLOYEE.CHANGE_STATUS' })
  async update(@Req() request: RequestWithContext, @Param() params: EmployeeIdParamDto, @Body() input: UpdateEmployeeDto) {
    return dataResponse(await this.employeesService.update(request, params.id, input));
  }

  @Patch(':id/status')
  @RequirePermissions('EMPLOYEE.CHANGE_STATUS')
  async updateStatus(@Req() request: RequestWithContext, @Param() params: EmployeeIdParamDto, @Body() input: UpdateEmployeeStatusDto) {
    return dataResponse(await this.employeesService.update(request, params.id, { isActive: input.isActive }));
  }

  @Post(':id/avatar')
  @RequirePermissions('EMPLOYEE.UPLOAD_AVATAR')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { files: 1, fileSize: 2 * 1024 * 1024 },
  }))
  uploadAvatar(
    @Req() request: RequestWithContext,
    @Param() params: EmployeeIdParamDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.employeesService.uploadAvatar(request, params.id, file).then(dataResponse);
  }

  @Delete(':id/avatar')
  @RequirePermissions('EMPLOYEE.UPLOAD_AVATAR')
  async removeAvatar(@Req() request: RequestWithContext, @Param() params: EmployeeIdParamDto) {
    return dataResponse(await this.employeesService.removeAvatar(request, params.id));
  }
}
