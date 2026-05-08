import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { DniData } from "../sunat/sunat-scraper.types";
import { CacheService } from "../cache/cache.service";
import { RefreshQueueService } from "../cache/refresh-queue.service";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24h
const MISS_WAIT_TIMEOUT_MS = 25_000;

@Injectable()
export class DniService {
  private readonly logger = new Logger(DniService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly refreshQueue: RefreshQueueService,
  ) {}

  async consultar(dni: string): Promise<DniData> {
    const cached = await this.cache.get<DniData>("DNI", dni);

    if (cached) {
      const ageMs = Date.now() - new Date(cached.updatedAt).getTime();
      if (ageMs > STALE_AFTER_MS) {
        this.refreshQueue.enqueue({ kind: "DNI", id: dni }).catch(() => {});
      }
      return cached.data;
    }

    await this.refreshQueue.enqueue({ kind: "DNI", id: dni });
    const filled = await this.cache.waitFor<DniData>(
      "DNI",
      dni,
      MISS_WAIT_TIMEOUT_MS,
    );
    if (filled) return filled.data;

    this.logger.warn(`DNI ${dni}: scrape did not complete within timeout`);
    throw new HttpException(
      `Tiempo de espera agotado consultando DNI ${dni}, reintenta en unos segundos.`,
      HttpStatus.GATEWAY_TIMEOUT,
    );
  }
}
