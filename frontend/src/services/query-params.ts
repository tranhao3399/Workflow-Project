export type QueryParamValue = string | number | boolean | null | undefined

export function withQuery<T extends object>(path: string, params: T): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params) as Array<[string, QueryParamValue]>) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `${path}?${query}` : path
}
