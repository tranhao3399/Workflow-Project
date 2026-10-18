import { Transform } from 'class-transformer';
import { IsMongoId, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { FileScanStatus, FileStatus } from '../schemas/stored-file.schema.js';

export class RequestFileParamDto {
  @ApiProperty({ example: '66d0f0b74d5b5d4e65e75123' })
  @IsMongoId()
  requestId: string;
}

export class StoredFileIdParamDto {
  @ApiProperty({ example: '66d0f0b74d5b5d4e65e75123' })
  @IsMongoId()
  id: string;
}

export class UploadRequestFileDto {
  @ApiProperty({ example: 'supportingDocument', maxLength: 80, pattern: '^[A-Za-z][A-Za-z0-9_]*$' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_]*$/)
  @MaxLength(80)
  fieldKey: string;
}

export class StoredFileResponseDto {
  @ApiProperty({ example: '66d0f0b74d5b5d4e65e75123' })
  id: string;

  @ApiProperty({ example: 'chung-tu.pdf' })
  originalName: string;

  @ApiProperty({ example: 'application/pdf' })
  detectedMimeType: string;

  @ApiProperty({ example: '.pdf' })
  extension: string;

  @ApiProperty({ example: 245760 })
  sizeBytes: number;

  @ApiProperty({ example: 'supportingDocument' })
  fieldKey: string;

  @ApiProperty({ enum: ['TEMPORARY', 'ATTACHED', 'DELETING', 'DELETED'], example: 'TEMPORARY' })
  status: FileStatus;

  @ApiProperty({ enum: ['PENDING', 'CLEAN', 'INFECTED', 'FAILED', 'SKIPPED'], example: 'SKIPPED' })
  scanStatus: FileScanStatus;

  @ApiProperty({ example: '2026-10-08T10:00:00.000Z' })
  createdAt: Date;
}
