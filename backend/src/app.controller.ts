import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@Controller()
@ApiTags('Hệ thống')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Kiểm tra dịch vụ', description: 'Endpoint kiểm tra backend đang hoạt động.' })
  @ApiOkResponse({ description: 'Thông điệp trạng thái dịch vụ.' })
  getHello(): string {
    return this.appService.getHello();
  }
}
