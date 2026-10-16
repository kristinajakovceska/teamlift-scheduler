import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class CreateSlotDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:MM (24h)' })
  startTime: string;

  @IsInt()
  @Min(10)
  @Max(240)
  durationMinutes: number;

  /** Create several back-to-back slots in one go (e.g. a 2-hour block of 30-min chats). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  count?: number;
}
