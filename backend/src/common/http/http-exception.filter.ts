import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

type ErrorResponse = {
  message?: string | string[];
  field?: string;
  error?: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request & { requestId?: string }>();
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : this.statusFor(exception);
    const body = isHttpException ? exception.getResponse() : undefined;
    const details = this.toDetails(body, exception);

    response.status(status).json({
      statusCode: status,
      message: details.message,
      ...(details.field ? { field: details.field } : {}),
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }

  private statusFor(exception: unknown): HttpStatus {
    if (this.errorName(exception) === 'CastError' || this.errorName(exception) === 'ValidationError') {
      return HttpStatus.BAD_REQUEST;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private toDetails(body: string | object | undefined, exception: unknown): Required<Pick<ErrorResponse, 'message'>> & Pick<ErrorResponse, 'field'> {
    if (typeof body === 'string') return { message: body };
    if (this.isErrorResponse(body)) {
      return {
        message: Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Yêu cầu không hợp lệ.',
        ...(body.field ? { field: body.field } : {}),
      };
    }
    if (this.errorName(exception) === 'CastError') return { message: 'Định danh bản ghi không hợp lệ.' };
    if (this.errorName(exception) === 'ValidationError') return { message: 'Dữ liệu không hợp lệ.' };
    return { message: 'Đã xảy ra lỗi hệ thống.' };
  }

  private isErrorResponse(value: unknown): value is ErrorResponse {
    return typeof value === 'object' && value !== null;
  }

  private errorName(value: unknown): string | undefined {
    return value instanceof Error ? value.name : undefined;
  }
}
