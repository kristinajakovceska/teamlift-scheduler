import { Body, Controller, Param, ParseIntPipe, ParseUUIDPipe, Post } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  /** Book a slot. Returns 409 Conflict if it has already been taken. */
  @Post('slots/:slotId/bookings')
  book(@Param('slotId', ParseIntPipe) slotId: number, @Body() dto: CreateBookingDto) {
    return this.bookings.book(slotId, dto);
  }

  /** The LLM endpoint: a short, friendly, personalised confirmation for a booking. */
  @Post('bookings/:id/confirmation-message')
  confirmationMessage(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.confirmationMessage(id);
  }
}
