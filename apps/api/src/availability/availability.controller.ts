import { Controller, Get, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AvailabilityWindowService } from "./services/availability-window.service";

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
    return this.service.generateWindows({
      mentorId: req.user.mentorProfileId,
      now: new Date(),
    });
  }
}
