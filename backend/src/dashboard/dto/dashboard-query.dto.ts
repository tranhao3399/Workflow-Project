import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const dashboardViews = ['MY_WORK', 'HR', 'SYSTEM'] as const;
export type DashboardView = (typeof dashboardViews)[number];

export class DashboardQueryDto {
  @ApiPropertyOptional({
    enum: dashboardViews,
    description: 'Góc nhìn dashboard cần tải. Backend chỉ cho phép các góc nhìn phù hợp với quyền hiệu lực.',
  })
  @IsOptional()
  @IsIn(dashboardViews)
  view?: DashboardView;
}
