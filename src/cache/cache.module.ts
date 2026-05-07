import { Module } from "@nestjs/common";
import { CacheService } from "./cache.service";
import { RefreshQueueService } from "./refresh-queue.service";

@Module({
  providers: [CacheService, RefreshQueueService],
  exports: [CacheService, RefreshQueueService],
})
export class CacheModule {}
