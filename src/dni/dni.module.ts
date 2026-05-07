import { Module } from "@nestjs/common";
import { SunatModule } from "../sunat/sunat.module";
import { CacheModule } from "../cache/cache.module";
import { DniController } from "./dni.controller";
import { DniService } from "./dni.service";

@Module({
  imports: [SunatModule, CacheModule],
  controllers: [DniController],
  providers: [DniService],
})
export class DniModule {}
