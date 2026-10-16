import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateBookingDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Please tell us your name.' })
  @MaxLength(80)
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @MaxLength(254)
  email: string;

  /** Optional: what the guest wants to cover. Also used to personalise the AI message. */
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  topic?: string;
}
