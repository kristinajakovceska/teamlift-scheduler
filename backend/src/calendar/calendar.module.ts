import { Global, Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleOAuthService } from './google-oauth.service';

@Global()
@Module({
  controllers: [CalendarController],
  providers: [GoogleCalendarService, GoogleOAuthService],
  exports: [GoogleCalendarService, GoogleOAuthService],
})
export class CalendarModule {}
