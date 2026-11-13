import { describe, expect, it } from 'vitest';
import type { RequestActorAutoFillProfile } from './request-actor-context.service.js';
import {
  applyAutoFillToMigratedFormData,
  buildInitialRequestFormData,
  enforceLockedAutoFillFormData,
  hasLockedAutoFillFields,
} from './request-data.helpers.js';

const sampleProfile: RequestActorAutoFillProfile = {
  employeeCode: 'NV0128',
  fullName: 'Nguyễn Minh Anh',
  email: 'minhanh@company.vn',
  phone: '0901234567',
  departmentName: 'Khối Vận hành',
  workUnitName: 'Cửa hàng Quận 1',
  positionName: 'Cửa hàng trưởng',
};

const sampleFields = [
  {
    key: 'employee_code',
    label: 'Mã nhân viên',
    type: 'TEXT',
    required: true,
    order: 10,
    autoFill: { source: 'REQUESTER_EMPLOYEE_CODE', readOnly: true },
  },
  {
    key: 'full_name',
    label: 'Họ và tên',
    type: 'TEXT',
    required: true,
    order: 20,
    autoFill: { source: 'REQUESTER_FULL_NAME', readOnly: true },
  },
  {
    key: 'contact_phone',
    label: 'Số điện thoại liên hệ',
    type: 'PHONE',
    required: false,
    order: 30,
    autoFill: { source: 'REQUESTER_PHONE', readOnly: false },
  },
  {
    key: 'request_date',
    label: 'Ngày tạo phiếu',
    type: 'DATE',
    required: true,
    order: 40,
    autoFill: { source: 'CURRENT_DATE', readOnly: true },
  },
  {
    key: 'reason',
    label: 'Lý do',
    type: 'TEXTAREA',
    required: true,
    order: 50,
  },
];

describe('request-data autoFill helpers', () => {
  it('given virtual request code and status fields, when form data is initialized or updated, then their values are never persisted in formData', () => {
    const fields = [
      ...sampleFields,
      {
        key: 'request_code',
        label: 'Mã phiếu',
        type: 'TEXT',
        required: false,
        order: 60,
        autoFill: { source: 'REQUEST_CODE', readOnly: true },
      },
      {
        key: 'request_status',
        label: 'Trạng thái',
        type: 'TEXT',
        required: false,
        order: 70,
        autoFill: { source: 'REQUEST_STATUS', readOnly: true },
      },
    ];
    const initial = buildInitialRequestFormData(fields, sampleProfile);
    const enforced = enforceLockedAutoFillFormData(
      fields,
      { request_code: 'GIẢ-MẠO', request_status: 'Đã duyệt', reason: 'Công việc cá nhân' },
      { request_code: 'REQ-OLD', request_status: 'Bản nháp' },
      sampleProfile,
    );

    expect(initial).not.toHaveProperty('request_code');
    expect(initial).not.toHaveProperty('request_status');
    expect(enforced).not.toHaveProperty('request_code');
    expect(enforced).not.toHaveProperty('request_status');
    expect(enforced.reason).toBe('Công việc cá nhân');
  });

  it('given form fields with requester autoFill sources, when creating a draft request, then initial formData is pre-populated from actor profile', () => {
    const fixedNow = new Date('2026-11-03T08:30:00.000Z');
    const initialData = buildInitialRequestFormData(sampleFields, sampleProfile, fixedNow);

    expect(hasLockedAutoFillFields(sampleFields)).toBe(true);
    expect(initialData).toEqual({
      employee_code: 'NV0128',
      full_name: 'Nguyễn Minh Anh',
      contact_phone: '0901234567',
      request_date: '2026-11-03',
    });
  });

  it('given locked readOnly autoFill fields and unlocked autoFill fields, when updating formData, then locked fields cannot be spoofed while unlocked fields accept user edits', () => {
    const existingData = {
      employee_code: 'NV0128',
      full_name: 'Nguyễn Minh Anh',
      contact_phone: '0901234567',
      request_date: '2026-11-01',
    };
    const incomingPayload = {
      employee_code: 'NV9999',
      full_name: 'Người Khác',
      contact_phone: '0988888888',
      request_date: '2026-12-31',
      reason: 'Nghỉ phép cá nhân',
    };

    const enforced = enforceLockedAutoFillFormData(
      sampleFields,
      incomingPayload,
      existingData,
      sampleProfile,
      new Date('2026-11-03T08:30:00.000Z'),
    );

    expect(enforced).toEqual({
      employee_code: 'NV0128',
      full_name: 'Nguyễn Minh Anh',
      contact_phone: '0988888888',
      request_date: '2026-11-01',
      reason: 'Nghỉ phép cá nhân',
    });
  });

  it('given an outdated draft migrated to a newer form version with autoFill fields, when applying autoFill, then missing and locked fields are populated', () => {
    const migrated = applyAutoFillToMigratedFormData(
      sampleFields,
      { reason: 'Nghỉ phép năm', contact_phone: '0911222333' },
      sampleProfile,
      new Date('2026-11-03T08:30:00.000Z'),
    );

    expect(migrated).toEqual({
      employee_code: 'NV0128',
      full_name: 'Nguyễn Minh Anh',
      contact_phone: '0911222333',
      request_date: '2026-11-03',
      reason: 'Nghỉ phép năm',
    });
  });

  it('given annual leave and direct manager autoFill fields including zero balance, when initializing and enforcing form data, then numeric balance and manager name are preserved and cannot be spoofed', () => {
    const leaveFields = [
      {
        key: 'annual_leave_days',
        label: 'Số ngày phép còn lại',
        type: 'NUMBER',
        required: false,
        order: 10,
        autoFill: { source: 'REQUESTER_ANNUAL_LEAVE_DAYS', readOnly: true },
      },
      {
        key: 'direct_manager_name',
        label: 'Quản lý trực tiếp',
        type: 'TEXT',
        required: false,
        order: 20,
        autoFill: { source: 'REQUESTER_DIRECT_MANAGER_NAME', readOnly: true },
      },
    ];
    const zeroProfile: RequestActorAutoFillProfile = {
      ...sampleProfile,
      availableAnnualLeaveDays: 0,
      directManagerName: 'Trần Quốc Bảo',
    };

    const initial = buildInitialRequestFormData(leaveFields, zeroProfile);
    expect(initial).toEqual({
      annual_leave_days: 0,
      direct_manager_name: 'Trần Quốc Bảo',
    });

    const enforced = enforceLockedAutoFillFormData(
      leaveFields,
      { annual_leave_days: 99, direct_manager_name: 'Giả Mạo' },
      initial,
      { ...sampleProfile, availableAnnualLeaveDays: 7.5, directManagerName: 'Trần Quốc Bảo' },
    );
    expect(enforced).toEqual({
      annual_leave_days: 7.5,
      direct_manager_name: 'Trần Quốc Bảo',
    });
  });
});
