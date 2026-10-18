import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { DepartmentsModule } from '../departments/departments.module.js';
import { PositionsModule } from '../positions/positions.module.js';
import { RolesModule } from '../roles/roles.module.js';
import { ReferenceDataController } from './reference-data.controller.js';
@Module({ imports: [DepartmentsModule, PositionsModule, RolesModule, PassportModule.register({ defaultStrategy: 'jwt' })], controllers: [ReferenceDataController] }) export class ReferenceDataModule {}
