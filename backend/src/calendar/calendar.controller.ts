import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleOAuthService } from './google-oauth.service';

@Controller('host')
export class CalendarController {
  constructor(
    private readonly calendar: GoogleCalendarService,
    private readonly oauth: GoogleOAuthService,
  ) {}

  /** Is the Google Calendar connection working? Shown as a banner on the dashboard. */
  @Get('calendar')
  async status() {
    await this.calendar.busyIntervals(); // refreshes the status if the cache is stale
    return {
      ...this.calendar.getStatus(),
      invites: { available: this.oauth.available, connectedAs: await this.oauth.connectedEmail() },
    };
  }

  /** Starts the one-time "Connect Google" flow that enables guest invites. */
  @Get('google/connect')
  connect(@Res() res: Response) {
    res.redirect(this.oauth.authorizationUrl());
  }

  /** Google redirects back here; we send the host back to the dashboard with the outcome. */
  @Get('google/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const back = (params: Record<string, string>) => res.redirect(`/?${new URLSearchParams(params)}#/host`);
    if (error || !code || !state) return back({ google: 'error', message: 'Google sign-in was cancelled.' });
    try {
      await this.oauth.handleCallback(code, state);
      back({ google: 'connected' });
    } catch (err) {
      back({ google: 'error', message: (err as Error).message });
    }
  }
}
