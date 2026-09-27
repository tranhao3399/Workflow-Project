import type { Request } from 'express';
import type { SafeUser } from '../../users/users.service.js';

export type RequestWithContext = Request & {
  requestId?: string;
  user?: SafeUser;
  effectivePermissionKeys?: string[];
};
