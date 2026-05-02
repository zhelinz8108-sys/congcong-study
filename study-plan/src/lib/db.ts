import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

type DbError = { message: string };
type DbResult<T = any> = {
  data: T | T[] | null;
  error: DbError | null;
  count?: number | null;
};

type SelectOptions = {
  count?: "exact";
  head?: boolean;
};

type Filter =
  | { type: "eq"; column: string; value: unknown }
  | { type: "lte"; column: string; value: unknown }
  | { type: "gte"; column: string; value: unknown }
  | { type: "in"; column: string; value: unknown[] };

type Order = {
  column: string;
  ascending: boolean;
};

const globalForPg = globalThis as unknown as { studyPlanPgPool?: Pool };

export const pool =
  globalForPg.studyPlanPgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST ?? "127.0.0.1",
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? "study_plan",
    user: process.env.PGUSER ?? "study_plan",
    password: process.env.PGPASSWORD,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.studyPlanPgPool = pool;
}

function quoteIdentifier(identifier: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function parseColumns(columns?: string) {
  if (!columns || columns.trim() === "*") return "*";
  return columns
    .split(",")
    .map((column) => quoteIdentifier(column.trim()))
    .join(", ");
}

function buildWhere(filters: Filter[], values: unknown[]) {
  if (filters.length === 0) return "";

  const clauses = filters.map((filter) => {
    const column = quoteIdentifier(filter.column);

    if (filter.type === "eq") {
      if (filter.value === null) return `${column} IS NULL`;
      values.push(filter.value);
      return `${column} = $${values.length}`;
    }

    if (filter.type === "lte") {
      values.push(filter.value);
      return `${column} <= $${values.length}`;
    }

    if (filter.type === "gte") {
      values.push(filter.value);
      return `${column} >= $${values.length}`;
    }

    values.push(filter.value);
    return `${column} = ANY($${values.length}::text[])`;
  });

  return ` WHERE ${clauses.join(" AND ")}`;
}

class PgQueryBuilder {
  private action: "select" | "insert" | "update" | "delete" = "select";
  private selectedColumns = "*";
  private selectOptions: SelectOptions = {};
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private rowLimit: number | null = null;
  private rowOffset: number | null = null;
  private singleRow = false;
  private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private returningColumns: string | null = null;

  constructor(private readonly table: string) {}

  select(columns = "*", options: SelectOptions = {}) {
    if (this.action === "insert" || this.action === "update") {
      this.returningColumns = columns;
    } else {
      this.action = "select";
      this.selectedColumns = columns;
      this.selectOptions = options;
    }
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ type: "eq", column, value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ type: "lte", column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ type: "gte", column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ type: "in", column, value });
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.orders.push({ column, ascending: options.ascending !== false });
    return this;
  }

  limit(limit: number) {
    this.rowLimit = limit;
    return this;
  }

  range(from: number, to: number) {
    this.rowOffset = from;
    this.rowLimit = Math.max(0, to - from + 1);
    return this;
  }

  single() {
    this.singleRow = true;
    return this;
  }

  then<TResult1 = DbResult, TResult2 = never>(
    onfulfilled?: ((value: DbResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<DbResult> {
    try {
      if (this.action === "insert") return await this.executeInsert();
      if (this.action === "update") return await this.executeUpdate();
      if (this.action === "delete") return await this.executeDelete();
      return await this.executeSelect();
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Database query failed",
        },
      };
    }
  }

  private async executeSelect(): Promise<DbResult> {
    const values: unknown[] = [];
    const wantsHeadCount = this.selectOptions.count === "exact" && this.selectOptions.head;
    const columns = wantsHeadCount ? "COUNT(*)::int AS count" : parseColumns(this.selectedColumns);
    let sql = `SELECT ${columns} FROM ${quoteIdentifier(this.table)}`;
    sql += buildWhere(this.filters, values);

    if (!wantsHeadCount && this.orders.length > 0) {
      const orderSql = this.orders
        .map(
          (order) =>
            `${quoteIdentifier(order.column)} ${order.ascending ? "ASC" : "DESC"}`
        )
        .join(", ");
      sql += ` ORDER BY ${orderSql}`;
    }

    if (!wantsHeadCount && this.rowLimit !== null) {
      values.push(this.rowLimit);
      sql += ` LIMIT $${values.length}`;
    }

    if (!wantsHeadCount && this.rowOffset !== null) {
      values.push(this.rowOffset);
      sql += ` OFFSET $${values.length}`;
    }

    const result = await pool.query(sql, values);

    if (wantsHeadCount) {
      return { data: null, count: result.rows[0]?.count ?? 0, error: null };
    }

    if (this.singleRow) {
      return { data: result.rows[0] ?? null, error: null };
    }

    return {
      data: result.rows,
      count: this.selectOptions.count === "exact" ? result.rowCount : null,
      error: null,
    };
  }

  private async executeInsert(): Promise<DbResult> {
    const rows = Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : [];
    if (rows.length === 0) return { data: this.singleRow ? null : [], error: null };

    const columns = Object.keys(rows[0]);
    const values: unknown[] = [];
    const valueGroups = rows.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(row[column]);
        return `$${values.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });

    let sql = `INSERT INTO ${quoteIdentifier(this.table)} (${columns
      .map(quoteIdentifier)
      .join(", ")}) VALUES ${valueGroups.join(", ")}`;

    if (this.returningColumns !== null) {
      sql += ` RETURNING ${parseColumns(this.returningColumns)}`;
    }

    const result = await pool.query(sql, values);

    if (this.returningColumns === null) {
      return { data: null, error: null };
    }

    return {
      data: this.singleRow ? result.rows[0] ?? null : result.rows,
      error: null,
    };
  }

  private async executeUpdate(): Promise<DbResult> {
    const payload = this.payload && !Array.isArray(this.payload) ? this.payload : {};
    const columns = Object.keys(payload);
    if (columns.length === 0) return { data: this.singleRow ? null : [], error: null };

    const values: unknown[] = [];
    const setSql = columns
      .map((column) => {
        values.push(payload[column]);
        return `${quoteIdentifier(column)} = $${values.length}`;
      })
      .join(", ");

    let sql = `UPDATE ${quoteIdentifier(this.table)} SET ${setSql}`;
    sql += buildWhere(this.filters, values);

    if (this.returningColumns !== null) {
      sql += ` RETURNING ${parseColumns(this.returningColumns)}`;
    }

    const result = await pool.query(sql, values);

    if (this.returningColumns === null) {
      return { data: null, error: null };
    }

    return {
      data: this.singleRow ? result.rows[0] ?? null : result.rows,
      error: null,
    };
  }

  private async executeDelete(): Promise<DbResult> {
    const values: unknown[] = [];
    let sql = `DELETE FROM ${quoteIdentifier(this.table)}`;
    sql += buildWhere(this.filters, values);
    await pool.query(sql, values);
    return { data: null, error: null };
  }
}

class LocalStorageBucket {
  constructor(private readonly bucket: string) {}

  async upload(
    filename: string,
    buffer: Buffer,
    options: { contentType?: string; upsert?: boolean } = {}
  ): Promise<{ data: { path: string } | null; error: DbError | null }> {
    try {
      const safeFilename = filename.replace(/[\\/]/g, "_");
      const uploadDir = path.join(process.cwd(), "public", "uploads", this.bucket);
      const fullPath = path.join(uploadDir, safeFilename);

      if (!options.upsert) {
        try {
          await stat(fullPath);
          return { data: null, error: { message: "File already exists" } };
        } catch {
          // File does not exist yet, so it is safe to create it.
        }
      }

      await mkdir(uploadDir, { recursive: true });
      await writeFile(fullPath, buffer);
      return { data: { path: safeFilename }, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: error instanceof Error ? error.message : "Upload failed" },
      };
    }
  }

  getPublicUrl(filename: string) {
    const safeFilename = filename.replace(/[\\/]/g, "_");
    return {
      data: {
        publicUrl: `/uploads/${this.bucket}/${encodeURIComponent(safeFilename)}`,
      },
    };
  }
}

export const supabase = {
  from(table: string) {
    return new PgQueryBuilder(table);
  },
  storage: {
    from(bucket: string) {
      return new LocalStorageBucket(bucket);
    },
  },
};
