import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserRole } from '../../users/enums/user-role.enum.js';
import { WorkspaceModuleGroup } from '../enums/workspace-module-group.enum.js';

export type WorkspaceModuleDocument = HydratedDocument<WorkspaceModule>;

@Schema({ collection: 'workspace_modules', timestamps: true })
export class WorkspaceModule {
  @Prop({ required: true, unique: true, trim: true, uppercase: true, match: /^[A-Z][A-Z0-9_]*$/ })
  moduleKey: string;

  @Prop({ required: true, trim: true, maxlength: 80 })
  name: string;

  @Prop({ required: true, trim: true, match: /^\/[a-z0-9-]+$/ })
  path: string;

  @Prop({ required: true, trim: true, match: /^[a-z][a-z0-9-]*$/ })
  icon: string;

  @Prop({ required: true, type: String, enum: Object.values(WorkspaceModuleGroup), index: true })
  group: WorkspaceModuleGroup;

  @Prop({ required: true, min: 0, max: 10000, index: true })
  sortOrder: number;

  @Prop({ required: true, default: true, index: true })
  isEnabled: boolean;

  @Prop({ type: [String], required: true, enum: Object.values(UserRole), default: [] })
  visibleToRoles: UserRole[];

  @Prop({ required: true, default: false })
  isCore: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const WorkspaceModuleSchema = SchemaFactory.createForClass(WorkspaceModule);
WorkspaceModuleSchema.index({ isEnabled: 1, visibleToRoles: 1, sortOrder: 1 });
