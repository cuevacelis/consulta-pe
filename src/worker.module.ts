import { Module } from "@nestjs/common";
import { SunatModule } from "./sunat/sunat.module";
import { CacheModule } from "./cache/cache.module";

@Module({
  imports: [SunatModule, CacheModule],
})
export class WorkerModule {}
