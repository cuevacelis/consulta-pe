import { Module } from "@nestjs/common";
import { CacheModule } from "../cache/cache.module";
import { DniController } from "./dni.controller";
import { DniService } from "./dni.service";

@Module({
  imports: [CacheModule],
  controllers: [DniController],
  providers: [DniService],
})
export class DniModule {}
