export interface ApiDataResponse<T> {
  data: T;
}

export function dataResponse<T>(data: T): ApiDataResponse<T> {
  return { data };
}
