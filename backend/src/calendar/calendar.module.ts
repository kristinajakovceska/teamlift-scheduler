import { Global, Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { GoogleCalendarService } from './google-calendar.service';

@Global()
@Module({
  controllers: [CalendarController],
  providers: [GoogleCalendarService],
  exports: [GoogleCalendarService],
})
export class CalendarModule {}
