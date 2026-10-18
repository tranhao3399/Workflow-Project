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
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiAuthenticationErrors, ApiDataResponseDto, ApiResourceConflict, ApiResourceNotFound, ApiValidationError } from '../common/http/swagger-response.dto.js';

@Controller('employees')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiTags('Nhân viên')
@ApiBearerAuth('access-token')
@ApiAuthenticationErrors()
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermissions('EMPLOYEE.VIEW')
  @ApiOperation({ summary: 'Danh sách nhân viên', description: 'Yêu cầu quyền: EMPLOYEE.VIEW.' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'department', required: false })
  @ApiQuery({ name: 'departmentId', required: false, description: 'MongoDB ObjectId phòng ban.' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiOkResponse({ description: 'Danh sách phân trang theo response runtime { data, pagination }.', type: Object })
  @ApiValidationError()
  findAll(@Query() query: ListEmployeesDto) {
    return this.employeesService.findAll(query);
  }

  @Get('next-code')
  @RequirePermissions('EMPLOYEE.CREATE')
  @ApiOperation({ summary: 'Mã nhân viên tiếp theo', description: 'Yêu cầu quyền: EMPLOYEE.CREATE.' })
  @ApiOkResponse({ description: 'Mã nhân viên do hệ thống đề xuất.', type: ApiDataResponseDto })
  async nextCode() {
    return dataResponse(await this.employeesService.getNextEmployeeCode());
  }

  @Post()
  @RequirePermissions('EMPLOYEE.CREATE')
  @ApiOperation({ summary: 'Tạo nhân viên', description: 'Yêu cầu quyền: EMPLOYEE.CREATE.' })
  @ApiBody({ type: CreateEmployeeDto })
  @ApiCreatedResponse({ description: 'Tạo nhân viên thành công.', type: ApiDataResponseDto })
  @ApiResourceConflict('Mã nhân viên, email công việc hoặc liên kết user đã tồn tại.')
  @ApiValidationError()
  async create(@Req() request: RequestWithContext, @Body() input: CreateEmployeeDto) {
    return dataResponse(await this.employeesService.create(request, input));
  }

  @Get(':id')
  @RequirePermissions('EMPLOYEE.VIEW')
  @ApiOperation({ summary: 'Chi tiết nhân viên', description: 'Yêu cầu quyền: EMPLOYEE.VIEW.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của nhân viên.', example: '66d0f0b74d5b5d4e65e75123' })
  @ApiOkResponse({ description: 'Chi tiết nhân viên.', type: ApiDataResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async findOne(@Param() params: EmployeeIdParamDto) {
    return dataResponse(await this.employeesService.findOne(params.id));
  }

  @Patch(':id')
  @RequirePermissions('EMPLOYEE.UPDATE')
  @RequireBodyPermissions({ isActive: 'EMPLOYEE.CHANGE_STATUS' })
  @ApiOperation({ summary: 'Cập nhật nhân viên', description: 'Yêu cầu quyền: EMPLOYEE.UPDATE. Sửa isActive cần EMPLOYEE.CHANGE_STATUS.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của nhân viên.', example: '66d0f0b74d5b5d4e65e75123' })
  @ApiBody({ type: UpdateEmployeeDto })
  @ApiOkResponse({ description: 'Nhân viên sau cập nhật.', type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async update(@Req() request: RequestWithContext, @Param() params: EmployeeIdParamDto, @Body() input: UpdateEmployeeDto) {
    return dataResponse(await this.employeesService.update(request, params.id, input));
  }

  @Patch(':id/status')
  @RequirePermissions('EMPLOYEE.CHANGE_STATUS')
  @ApiOperation({ summary: 'Đổi trạng thái nhân viên', description: 'Yêu cầu quyền: EMPLOYEE.CHANGE_STATUS.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của nhân viên.', example: '66d0f0b74d5b5d4e65e75123' })
  @ApiBody({ type: UpdateEmployeeStatusDto })
  @ApiOkResponse({ description: 'Nhân viên sau đổi trạng thái.', type: ApiDataResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async updateStatus(@Req() request: RequestWithContext, @Param() params: EmployeeIdParamDto, @Body() input: UpdateEmployeeStatusDto) {
    return dataResponse(await this.employeesService.update(request, params.id, { isActive: input.isActive }));
  }

  @Post(':id/avatar')
  @RequirePermissions('EMPLOYEE.UPLOAD_AVATAR')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { files: 1, fileSize: 2 * 1024 * 1024 },
  }))
  @ApiOperation({ summary: 'Tải ảnh đại diện', description: 'Yêu cầu quyền: EMPLOYEE.UPLOAD_AVATAR. Chỉ nhận JPG hoặc PNG, tối đa 2 MB.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của nhân viên.', example: '66d0f0b74d5b5d4e65e75123' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'Ảnh JPG hoặc PNG, tối đa 2 MB.' } } } })
  @ApiOkResponse({ description: 'Nhân viên sau khi cập nhật avatar.', type: ApiDataResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  uploadAvatar(
    @Req() request: RequestWithContext,
    @Param() params: EmployeeIdParamDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.employeesService.uploadAvatar(request, params.id, file).then(dataResponse);
  }

  @Delete(':id/avatar')
  @RequirePermissions('EMPLOYEE.UPLOAD_AVATAR')
  @ApiOperation({ summary: 'Xóa ảnh đại diện', description: 'Yêu cầu quyền: EMPLOYEE.UPLOAD_AVATAR.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của nhân viên.', example: '66d0f0b74d5b5d4e65e75123' })
  @ApiOkResponse({ description: 'Nhân viên sau khi xóa avatar.', type: ApiDataResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async removeAvatar(@Req() request: RequestWithContext, @Param() params: EmployeeIdParamDto) {
    return dataResponse(await this.employeesService.removeAvatar(request, params.id));
  }
}
