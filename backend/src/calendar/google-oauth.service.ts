import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config';
import { DatabaseService } from '../database/database.service';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];
const STATE_TTL_MS = 10 * 60_000;

export const OAUTH_CALLBACK_PATH = '/api/host/google/callback';

/**
 * Lets the host connect their own Google account (one-time consent) so events are created
 * *as the host*. That's what allows Google to email guests a real calendar invite: a
 * service account can't invite attendees on a personal Gmail calendar.
 *
 * Only the account that owns GOOGLE_CALENDAR_ID can connect. Host routes have no login,
 * so without that check anyone could link their own Google account to the app.
 */
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  private token?: { value: string; expiresAt: number };

  constructor(private readonly db: DatabaseService) {}

  get available(): boolean {
    return Boolean(config.googleOauthClientId && config.googleOauthClientSecret && config.googleCalendarId);
  }

  private get redirectUri(): string {
    return config.publicUrl + OAUTH_CALLBACK_PATH;
  }

  async connectedEmail(): Promise<string | null> {
    if (!this.available) return null;
    const [row] = await this.db.query<{ email: string }>('SELECT email FROM google_oauth WHERE id = 1');
    return row?.email ?? null;
  }

  /** URL of Google's consent screen. `state` is HMAC-signed, so the callback can't be forged. */
  authorizationUrl(): string {
    if (!this.available) throw new BadRequestException('Google sign-in is not configured on the server.');
    const params = new URLSearchParams({
      client_id: config.googleOauthClientId!,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline', // we need a refresh token to act later, without the host present
      prompt: 'consent', // always return a refresh token, even on reconnect
      login_hint: config.googleCalendarId!,
      state: this.signState(),
    });
    return `${AUTH_URL}?${params}`;
  }

  /** Exchanges the code from Google's redirect and stores the host's refresh token. */
  async handleCallback(code: string, state: string): Promise<string> {
    if (!this.available) throw new BadRequestException('Google sign-in is not configured on the server.');
    if (!this.verifyState(state)) throw new BadRequestException('This sign-in link has expired. Please try again.');

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.googleOauthClientId!,
        client_secret: config.googleOauthClientSecret!,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new BadRequestException(`Google sign-in failed (HTTP ${res.status}).`);
    const tokens = (await res.json()) as { refresh_token?: string; id_token?: string; scope?: string };

    // The id_token came straight from Google's token endpoint over TLS, so reading its
    // claims without verifying the signature is safe here.
    const claims = decodeJwt(tokens.id_token);
    const email = String(claims.email ?? '').toLowerCase();
    if (!claims.email_verified || email !== config.googleCalendarId!.toLowerCase()) {
      throw new ForbiddenException(`Please sign in as ${config.googleCalendarId}, the calendar owner.`);
    }
    if (!tokens.scope?.includes('calendar.events')) {
      throw new BadRequestException('Calendar access was not granted. Please tick the calendar permission.');
    }
    if (!tokens.refresh_token) throw new BadRequestException('Google did not return a refresh token. Please try again.');

    await this.db.query(
      `INSERT INTO google_oauth (id, email, refresh_token, updated_at) VALUES (1, $1, $2, now())
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, refresh_token = EXCLUDED.refresh_token, updated_at = now()`,
      [email, tokens.refresh_token],
    );
    this.token = undefined;
    this.logger.log(`Google account connected for guest invites: ${email}`);
    return email;
  }

  /** Access token acting as the host, or null if not connected (callers then skip invites). */
  async accessToken(): Promise<string | null> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    if (!this.available) return null;
    const [row] = await this.db.query<{ refreshToken: string }>(
      'SELECT refresh_token AS "refreshToken" FROM google_oauth WHERE id = 1',
    );
    if (!row) return null;

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.googleOauthClientId!,
        client_secret: config.googleOauthClientSecret!,
        refresh_token: row.refreshToken,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const body = await res.text();
      if (body.includes('invalid_grant')) {
        // Access was revoked or expired: forget it so the dashboard asks the host to reconnect.
        await this.db.query('DELETE FROM google_oauth WHERE id = 1');
        this.logger.warn('Google access was revoked; guest invites are off until the host reconnects.');
        return null;
      }
      throw new Error(`Google token refresh failed (HTTP ${res.status})`);
    }
    const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: access_token, expiresAt: Date.now() + (expires_in - 60) * 1000 };
    return access_token;
  }

  private signState(): string {
    const payload = `${Date.now()}.${randomBytes(12).toString('base64url')}`;
    return `${payload}.${this.hmac(payload)}`;
  }

  private verifyState(state: string): boolean {
    const i = state.lastIndexOf('.');
    if (i < 0) return false;
    const payload = state.slice(0, i);
    const expected = Buffer.from(this.hmac(payload));
    const actual = Buffer.from(state.slice(i + 1));
    const issuedAt = Number(payload.split('.')[0]);
    return (
      expected.length === actual.length &&
      timingSafeEqual(expected, actual) &&
      Date.now() - issuedAt < STATE_TTL_MS
    );
  }

  private hmac(payload: string): string {
    return createHmac('sha256', config.googleOauthClientSecret!).update(payload).digest('base64url');
  }
}

function decodeJwt(jwt: string | undefined): Record<string, unknown> {
  if (!jwt) return {};
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}
