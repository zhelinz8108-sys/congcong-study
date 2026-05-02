type PagedResult<T> = {
  data: T[] | null;
  error?: { message?: string } | null;
};

export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PagedResult<T>>,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await Promise.resolve(
      fetchPage(offset, offset + pageSize - 1)
    );

    if (error) {
      throw new Error(error.message || "Failed to fetch rows");
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);

    if (data.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return rows;
}
