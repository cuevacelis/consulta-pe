import { Module } from "@nestjs/common";
import { SunatModule } from "../sunat/sunat.module";
import { CacheModule } from "../cache/cache.module";
import { RucController } from "./ruc.controller";
import { RucService } from "./ruc.service";

@Module({
  imports: [SunatModule, CacheModule],
  controllers: [RucController],
  providers: [RucService],
})
export class RucModule {}
