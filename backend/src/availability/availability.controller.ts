import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AvailabilityService } from './availability.service';
import { CreateSlotDto, UpdateSlotDto, CreateExceptionDto } from './dto/availability.dto';

@Controller('user/availability')
@UseGuards(JwtAuthGuard)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  // ── Slots ──────────────────────────────────────────────────────────────────

  @Get('slots')
  getSlots(@Req() req: Request & { user?: JwtPayload }) {
    return this.availabilityService.getSlots(req.user!.sub);
  }

  @Post('slots')
  createSlot(
    @Req() req: Request & { user?: JwtPayload },
    @Body(ValidationPipe) dto: CreateSlotDto,
  ) {
    return this.availabilityService.createSlot(req.user!.sub, dto);
  }

  @Put('slots/:id')
  updateSlot(
    @Req() req: Request & { user?: JwtPayload },
    @Param('id') id: string,
    @Body(ValidationPipe) dto: UpdateSlotDto,
  ) {
    return this.availabilityService.updateSlot(req.user!.sub, id, dto);
  }

  @Delete('slots/:id')
  deleteSlot(@Req() req: Request & { user?: JwtPayload }, @Param('id') id: string) {
    return this.availabilityService.deleteSlot(req.user!.sub, id);
  }

  // ── Exceptions ─────────────────────────────────────────────────────────────

  @Get('exceptions')
  getExceptions(@Req() req: Request & { user?: JwtPayload }) {
    return this.availabilityService.getExceptions(req.user!.sub);
  }

  @Post('exceptions')
  createException(
    @Req() req: Request & { user?: JwtPayload },
    @Body(ValidationPipe) dto: CreateExceptionDto,
  ) {
    return this.availabilityService.createException(req.user!.sub, dto);
  }

  @Delete('exceptions/:id')
  deleteException(@Req() req: Request & { user?: JwtPayload }, @Param('id') id: string) {
    return this.availabilityService.deleteException(req.user!.sub, id);
  }

  // ── Check / next 30 days ───────────────────────────────────────────────────

  @Get(':mentorId/check')
  isAvailable(@Param('mentorId') mentorId: string, @Query('dateTime') dateTime: string) {
    return this.availabilityService.isAvailable(mentorId, new Date(dateTime));
  }

  @Get(':mentorId/next30days')
  next30Days(@Param('mentorId') mentorId: string) {
    return this.availabilityService.getAvailableSlotsDays(mentorId);
  }
}
