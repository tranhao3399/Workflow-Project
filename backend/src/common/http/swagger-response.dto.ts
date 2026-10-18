import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

export class ApiErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Dữ liệu không hợp lệ.' })
  message: string;

  @ApiPropertyOptional({ example: 'DEFINITION_PACKAGE_CONCURRENT_PUBLISH' })
  code?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  details?: Record<string, unknown>;

  @ApiProperty({ example: 'c5c79e52-0c96-4a1e-9d4d-70a9c1d5a431' })
  requestId: string;

  @ApiProperty({ example: '2026-09-28T12:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: '/api/roles' })
  path: string;
}

export class ApiDataResponseDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  data: Record<string, unknown>;
}

export function ApiAuthenticationErrors() {
  return applyDecorators(
    ApiUnauthorizedResponse({ description: 'Chưa đăng nhập, access token không hợp lệ hoặc phiên đã hết hạn.', type: ApiErrorResponseDto }),
    ApiForbiddenResponse({ description: 'Tài khoản đã đăng nhập nhưng không có quyền cần thiết.', type: ApiErrorResponseDto }),
  );
}

export function ApiValidationError() {
  return ApiBadRequestResponse({ description: 'Dữ liệu DTO, ObjectId hoặc query không hợp lệ.', type: ApiErrorResponseDto });
}

export function ApiResourceNotFound() {
  return ApiNotFoundResponse({ description: 'Không tìm thấy bản ghi.', type: ApiErrorResponseDto });
}

export function ApiResourceConflict(description = 'Dữ liệu trùng lặp hoặc đang được tham chiếu.') {
  return ApiConflictResponse({ description, type: ApiErrorResponseDto });
}
