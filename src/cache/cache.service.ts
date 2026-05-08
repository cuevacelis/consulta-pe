import { Injectable, Logger } from "@nestjs/common";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

export type CacheKind = "DNI" | "RUC";
export type CacheStatus = "found" | "not_found";

export interface CacheItem<T> {
  pk: string;
  kind: CacheKind;
  id: string;
  status: CacheStatus;
  data?: T;
  updatedAt: string;
  ttl: number;
}

const REGION = process.env.AWS_REGION ?? "us-east-1";
const TABLE = process.env.CACHE_TABLE_NAME ?? "consulta-pe-cache";
const TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly doc = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: REGION }),
    { marshallOptions: { removeUndefinedValues: true } },
  );

  private buildPk(kind: CacheKind, id: string) {
    return `${kind}#${id}`;
  }

  async get<T>(kind: CacheKind, id: string): Promise<CacheItem<T> | null> {
    try {
      const out = await this.doc.send(
        new GetCommand({
          TableName: TABLE,
          Key: { pk: this.buildPk(kind, id) },
        }),
      );
      if (!out.Item) return null;
      const item = out.Item as CacheItem<T>;
      // Back-compat: legacy items written before status existed are "found".
      if (!item.status) item.status = "found";
      return item;
    } catch (err) {
      this.logger.warn(`cache.get failed for ${kind}#${id}: ${err}`);
      return null;
    }
  }

  async put<T>(kind: CacheKind, id: string, data: T): Promise<void> {
    const item: CacheItem<T> = {
      pk: this.buildPk(kind, id),
      kind,
      id,
      status: "found",
      data,
      updatedAt: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    };
    await this.write(item);
  }

  async putNotFound(kind: CacheKind, id: string): Promise<void> {
    const item: CacheItem<never> = {
      pk: this.buildPk(kind, id),
      kind,
      id,
      status: "not_found",
      updatedAt: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    };
    await this.write(item);
  }

  private async write(item: CacheItem<unknown>): Promise<void> {
    try {
      await this.doc.send(new PutCommand({ TableName: TABLE, Item: item }));
    } catch (err) {
      this.logger.warn(`cache.put failed for ${item.pk}: ${err}`);
    }
  }

  async waitFor<T>(
    kind: CacheKind,
    id: string,
    timeoutMs: number,
    intervalMs = 500,
    initialDelayMs = 1000,
  ): Promise<CacheItem<T> | null> {
    const deadline = Date.now() + timeoutMs;
    if (initialDelayMs > 0) {
      await new Promise((r) => setTimeout(r, initialDelayMs));
    }
    while (Date.now() < deadline) {
      const cached = await this.get<T>(kind, id);
      if (cached) return cached;
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise((r) => setTimeout(r, Math.min(intervalMs, remaining)));
    }
    return null;
  }
}
