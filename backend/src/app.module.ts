import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { AppController } from './app.controller';
import { BookingsModule } from './bookings/bookings.module';
import { CalendarModule } from './calendar/calendar.module';
import { DatabaseModule } from './database/database.module';
import { SlotsModule } from './slots/slots.module';

@Module({
  imports: [DatabaseModule, AiModule, CalendarModule, SlotsModule, BookingsModule],
  controllers: [AppController],
})
export class AppModule {}
