import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import { dataResponse } from '../common/http/api-response.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import {
  ApiAuthenticationErrors,
  ApiDataResponseDto,
  ApiResourceNotFound,
  ApiValidationError,
} from '../common/http/swagger-response.dto.js';
import type { SafeUser } from '../users/users.service.js';
import {
  RequestFileParamDto,
  StoredFileIdParamDto,
  StoredFileResponseDto,
  UploadRequestFileDto,
} from './dto/file.dto.js';
import { ABSOLUTE_MAX_FILE_SIZE_BYTES, FilesService } from './files.service.js';

const FILE_READ_PERMISSION = {
  any: ['REQUESTS.VIEW_OWN', 'REQUESTS.VIEW_ALL', 'APPROVALS.VIEW_ASSIGNED'],
} as const;
const FILE_EDIT_PERMISSION = {
  any: ['REQUESTS.CREATE', 'REQUESTS.UPDATE_OWN_DRAFT', 'REQUESTS.DELETE_OWN_DRAFT'],
} as const;

@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiTags('Tệp đính kèm')
@ApiBearerAuth('access-token')
@ApiAuthenticationErrors()
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('requests/:requestId/files')
  @RequirePermissions(FILE_EDIT_PERMISSION)
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { files: 1, fields: 1, fileSize: ABSOLUTE_MAX_FILE_SIZE_BYTES },
  }))
  @ApiOperation({
    summary: 'Tải tệp lên phiếu yêu cầu',
    description: 'Yêu cầu quyền thao tác phiếu của mình. Phiếu phải thuộc người gọi và đang ở trạng thái cho phép chỉnh sửa.',
  })
  @ApiParam({ name: 'requestId', description: 'MongoDB ObjectId của phiếu yêu cầu.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'fieldKey'],
      properties: {
        file: { type: 'string', format: 'binary' },
        fieldKey: { type: 'string', example: 'supportingDocument' },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Metadata tệp tạm thời; tệp được gắn khi lưu formData.', type: StoredFileResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async upload(
    @Req() request: RequestWithContext,
    @Param() params: RequestFileParamDto,
    @Body() input: UploadRequestFileDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const user = this.requireUser(request);
    return dataResponse(await this.filesService.uploadToRequest(
      request,
      params.requestId,
      input.fieldKey,
      file,
      user,
    ));
  }

  @Get('files/:id')
  @RequirePermissions(FILE_READ_PERMISSION)
  @ApiOperation({ summary: 'Lấy metadata tệp', description: 'Quyền truy cập kế thừa từ phiếu yêu cầu.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của tệp.' })
  @ApiOkResponse({ description: 'Metadata tệp, không chứa storageKey hoặc đường dẫn nội bộ.', type: StoredFileResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async metadata(@Req() request: RequestWithContext, @Param() params: StoredFileIdParamDto) {
    return dataResponse(await this.filesService.getMetadata(params.id, this.requireUser(request), this.permissions(request)));
  }

  @Get('files/:id/preview')
  @RequirePermissions(FILE_READ_PERMISSION)
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Xem trước tệp', description: 'Chỉ hỗ trợ PDF và định dạng ảnh raster hợp lệ.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của tệp.' })
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp')
  @ApiOkResponse({ description: 'Nội dung tệp xem trước.', schema: { type: 'string', format: 'binary' } })
  @ApiResourceNotFound()
  @ApiValidationError()
  async preview(
    @Req() request: RequestWithContext,
    @Param() params: StoredFileIdParamDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.filesService.open(params.id, this.requireUser(request), this.permissions(request), true);
    response.setHeader('Content-Disposition', this.filesService.contentDisposition('inline', file.originalName));
    return new StreamableFile(file.stream, { type: file.detectedMimeType, length: file.sizeBytes });
  }

  @Get('files/:id/download')
  @RequirePermissions(FILE_READ_PERMISSION)
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Tải tệp', description: 'Quyền truy cập kế thừa từ phiếu yêu cầu.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của tệp.' })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'Nội dung tệp tải xuống.', schema: { type: 'string', format: 'binary' } })
  @ApiResourceNotFound()
  @ApiValidationError()
  async download(
    @Req() request: RequestWithContext,
    @Param() params: StoredFileIdParamDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.filesService.open(params.id, this.requireUser(request), this.permissions(request), false);
    response.setHeader('Content-Disposition', this.filesService.contentDisposition('attachment', file.originalName));
    return new StreamableFile(file.stream, { type: file.detectedMimeType, length: file.sizeBytes });
  }

  @Delete('files/:id')
  @RequirePermissions(FILE_EDIT_PERMISSION)
  @ApiOperation({ summary: 'Xóa tệp đính kèm', description: 'Chỉ người tạo phiếu được xóa khi phiếu còn cho phép chỉnh sửa.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của tệp.' })
  @ApiOkResponse({ description: 'Id của tệp đã xóa.', type: ApiDataResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async remove(@Req() request: RequestWithContext, @Param() params: StoredFileIdParamDto) {
    return dataResponse(await this.filesService.remove(request, params.id, this.requireUser(request)));
  }

  private requireUser(request: RequestWithContext): SafeUser {
    if (!request.user) throw new UnauthorizedException('Không thể xác định người dùng hiện tại.');
    return request.user;
  }

  private permissions(request: RequestWithContext): readonly string[] {
    return request.effectivePermissionKeys ?? request.user?.permissionKeys ?? [];
  }
}
