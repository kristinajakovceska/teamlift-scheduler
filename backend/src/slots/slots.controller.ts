import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CreateSlotDto } from './dto/create-slot.dto';
import { SlotsService } from './slots.service';

/** Public: what a guest sees on the booking page. */
@Controller('slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get()
  list() {
    return this.slots.listUpcoming();
  }
}

/**
 * Host: publish and manage slots. The brief assumes a single host and no login,
 * so these routes are open — see README "What I'd improve" for adding auth.
 */
@Controller('host/slots')
export class HostSlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get()
  list() {
    return this.slots.listForHost();
  }

  @Post()
  create(@Body() dto: CreateSlotDto) {
    return this.slots.create(dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.slots.remove(id);
  }
}
