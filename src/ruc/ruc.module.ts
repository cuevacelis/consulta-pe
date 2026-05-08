import { Module } from "@nestjs/common";
import { CacheModule } from "../cache/cache.module";
import { RucController } from "./ruc.controller";
import { RucService } from "./ruc.service";

@Module({
  imports: [CacheModule],
  controllers: [RucController],
  providers: [RucService],
})
export class RucModule {}
