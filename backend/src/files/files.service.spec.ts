import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import type { SafeUser } from '../users/users.service.js';
import { FilesService } from './files.service.js';

const megabyte = 1024 * 1024;

function query<T>(value: T) {
  const chain = {
    select: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn().mockResolvedValue(value),
  };
  chain.select.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}

function createService(maxFileSizeBytes: number) {
  const requestId = new Types.ObjectId();
  const requests = {
    findById: vi.fn().mockReturnValue(query({
      formSnapshot: {
        fields: [{
          key: 'attachment',
          type: 'FILE',
          fileConfig: {
            multiple: false,
            allowedMimeTypes: ['application/pdf'],
            maxFileSizeBytes,
            maxFiles: 1,
          },
        }],
      },
      formData: {},
    })),
  };
  const access = {
    requireEditableRequest: vi.fn().mockResolvedValue({ _id: requestId }),
  };
  return new FilesService(
    undefined as never,
    undefined as never,
    requests as never,
    undefined as never,
    undefined as never,
    access as never,
    undefined as never,
  );
}

function uploadWithSize(size: number): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'attachment.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size,
    buffer: Buffer.alloc(size),
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
  };
}

const user = { id: new Types.ObjectId().toString() } as SafeUser;
const context = {} as RequestWithContext;

describe('FilesService upload size policy', () => {
  it.each([5, 10, 20])(
    'từ chối tệp vượt giới hạn %i MB được lưu trong cấu hình biểu mẫu',
    async (limitMb) => {
      const service = createService(limitMb * megabyte);
      const upload = uploadWithSize(limitMb * megabyte + 1);

      await expect(service.uploadToRequest(
        context,
        new Types.ObjectId().toString(),
        'attachment',
        upload,
        user,
      )).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
