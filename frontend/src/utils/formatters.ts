import type { RequestStatus } from '../types/erp'
import { workflowStatusLabel } from './workflow-status'

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatStatus(status: RequestStatus): string {
  return workflowStatusLabel(status)
}

export function formatRole(role: string): string {
  const labels: Record<string, string> = {
    EMPLOYEE: 'Nhân viên',
    MANAGER: 'Quản lý',
    ACCOUNTANT: 'Kế toán',
    DIRECTOR: 'Giám đốc',
    ADMIN: 'Quản trị viên',
  }

  return labels[role] ?? role
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi-VN')
}
