import { Injectable, Logger } from "@nestjs/common";
import { SunatScraperService, DniData } from "../sunat/sunat-scraper.service";
import { CacheService } from "../cache/cache.service";
import { RefreshQueueService } from "../cache/refresh-queue.service";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24h

@Injectable()
export class DniService {
  private readonly logger = new Logger(DniService.name);

  constructor(
    private readonly sunat: SunatScraperService,
    private readonly cache: CacheService,
    private readonly refreshQueue: RefreshQueueService,
  ) {}

  async consultar(dni: string): Promise<DniData> {
    const cached = await this.cache.get<DniData>("DNI", dni);

    if (cached) {
      const ageMs = Date.now() - new Date(cached.updatedAt).getTime();
      if (ageMs > STALE_AFTER_MS) {
        // Stale: enqueue async refresh but still serve cached.
        this.refreshQueue.enqueue({ kind: "DNI", id: dni }).catch(() => {});
      }
      return cached.data;
    }

    const fresh = await this.sunat.consultarDni(dni);
    await this.cache.put<DniData>("DNI", dni, fresh);
    return fresh;
  }
}
