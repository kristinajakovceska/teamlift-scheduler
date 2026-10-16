import { Controller, Get } from '@nestjs/common';
import { config } from './config';
import { DatabaseService } from './database/database.service';

@Controller()
export class AppController {
  constructor(private readonly db: DatabaseService) {}

  @Get('health')
  async health() {
    await this.db.query('SELECT 1');
    return { ok: true, database: this.db.driver };
  }

  // Public settings the frontend needs to render correctly.
  @Get('config')
  getConfig() {
    return {
      hostName: config.hostName,
      timezone: config.timezone,
      aiEnabled: Boolean(config.geminiApiKey),
    };
  }
}
