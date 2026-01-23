import { Controller, Get, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { AvailabilityWindowService } from './services/availability-window.service';

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly service: AvailabilityWindowService) {}

  @ApiTags('Availability')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get next 30 days of bookable slots' })
  @ApiResponse({ status: 200, description: 'Generated availability windows' })
  @Roles('mentor')
  @Get('windows')
  getWindows(@Req() req: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const mentorProfileId = req.user.mentorProfileId;
    return this.service.generateWindows({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      mentorId: mentorProfileId,
      now: new Date(),
    });
  }
}
