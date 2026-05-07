import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from "aws-lambda";
import { AppModule } from "./app.module";
import { SunatScraperService } from "./sunat/sunat-scraper.service";
import { CacheService } from "./cache/cache.service";
import { RefreshMessage } from "./cache/refresh-queue.service";

const logger = new Logger("RefreshWorker");

let cache: CacheService | null = null;
let sunat: SunatScraperService | null = null;

async function bootstrap() {
  if (cache && sunat) return;
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  cache = app.get(CacheService);
  sunat = app.get(SunatScraperService);
}

async function refreshOne(msg: RefreshMessage): Promise<void> {
  if (!cache || !sunat) throw new Error("worker not bootstrapped");
  if (msg.kind === "DNI") {
    const data = await sunat.consultarDni(msg.id);
    await cache.put("DNI", msg.id, data);
  } else if (msg.kind === "RUC") {
    const data = await sunat.consultarRuc(msg.id);
    await cache.put("RUC", msg.id, data);
  } else {
    throw new Error(`unknown kind: ${(msg as any).kind}`);
  }
}

export const handler = async (
  event: SQSEvent,
): Promise<SQSBatchResponse> => {
  await bootstrap();
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const msg = JSON.parse(record.body) as RefreshMessage;
      await refreshOne(msg);
    } catch (err) {
      logger.error(
        `refresh failed for messageId=${record.messageId}: ${err}`,
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
