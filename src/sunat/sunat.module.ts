import { Module } from '@nestjs/common';
import { SunatScraperService } from './sunat-scraper.service';

@Module({
  providers: [SunatScraperService],
  exports: [SunatScraperService],
})
export class SunatModule {}
