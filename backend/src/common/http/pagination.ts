export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function createPaginationMetadata(page: number, limit: number, total: number): PaginationMetadata {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
