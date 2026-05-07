import { Module } from '@nestjs/common';
import { DniModule } from './dni/dni.module';
import { RucModule } from './ruc/ruc.module';

@Module({
  imports: [DniModule, RucModule],
})
export class AppModule {}
