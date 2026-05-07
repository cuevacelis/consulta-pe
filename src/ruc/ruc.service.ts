import { Injectable, Logger } from "@nestjs/common";
import { SunatScraperService, RucData } from "../sunat/sunat-scraper.service";
import { CacheService } from "../cache/cache.service";
import { RefreshQueueService } from "../cache/refresh-queue.service";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24h

@Injectable()
export class RucService {
  private readonly logger = new Logger(RucService.name);

  constructor(
    private readonly sunat: SunatScraperService,
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
      return cached.data;
    }

    const fresh = await this.sunat.consultarRuc(ruc);
    await this.cache.put<RucData>("RUC", ruc, fresh);
    return fresh;
  }
}
