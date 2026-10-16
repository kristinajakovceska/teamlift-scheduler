import { Module } from '@nestjs/common';
import { HostSlotsController, SlotsController } from './slots.controller';
import { SlotsService } from './slots.service';

@Module({
  controllers: [SlotsController, HostSlotsController],
  providers: [SlotsService],
})
export class SlotsModule {}
