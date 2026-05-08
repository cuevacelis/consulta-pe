import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { RucData } from "../sunat/sunat-scraper.types";
import { CacheService } from "../cache/cache.service";
import { RefreshQueueService } from "../cache/refresh-queue.service";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24h
const MISS_WAIT_TIMEOUT_MS = 25_000;

@Injectable()
export class RucService {
  private readonly logger = new Logger(RucService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly refreshQueue: RefreshQueueService,
  ) {}

  async consultar(ruc: string): Promise<RucData> {
    const cached = await this.cache.get<RucData>("RUC", ruc);

    if (cached) {
      const ageMs = Date.now() - new Date(cached.updatedAt).getTime();
      if (ageMs > STALE_AFTER_MS) {
        this.refreshQueue.enqueue({ kind: "RUC", id: ruc }).catch(() => {});
      }
      if (cached.status === "not_found") {
        throw new HttpException(
          `RUC ${ruc} no registrado en SUNAT`,
          HttpStatus.NOT_FOUND,
        );
      }
      return cached.data!;
    }

    await this.refreshQueue.enqueue({ kind: "RUC", id: ruc });
    const filled = await this.cache.waitFor<RucData>(
      "RUC",
      ruc,
      MISS_WAIT_TIMEOUT_MS,
    );
    if (filled) {
      if (filled.status === "not_found") {
        throw new HttpException(
          `RUC ${ruc} no registrado en SUNAT`,
          HttpStatus.NOT_FOUND,
        );
      }
      return filled.data!;
    }

    this.logger.warn(`RUC ${ruc}: scrape did not complete within timeout`);
    throw new HttpException(
      `Tiempo de espera agotado consultando RUC ${ruc}, reintenta en unos segundos.`,
      HttpStatus.GATEWAY_TIMEOUT,
    );
  }
}
