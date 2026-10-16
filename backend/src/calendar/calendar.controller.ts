import { Controller, Get } from '@nestjs/common';
import { GoogleCalendarService } from './google-calendar.service';

/** Host: is the Google Calendar connection working? Shown as a banner on the dashboard. */
@Controller('host/calendar')
export class CalendarController {
  constructor(private readonly calendar: GoogleCalendarService) {}

  @Get()
  async status() {
    await this.calendar.busyIntervals(); // refreshes the status if the cache is stale
    return this.calendar.getStatus();
  }
}
