import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/guards/current-user.decorator';
import { UpdateTimezoneDto } from './dto/timezone.dto';
import { TimezoneService } from './timezone.service';

@ApiTags('Timezone')
@ApiBearerAuth()
@Controller('me/timezone')
export class TimezoneController {
  constructor(private readonly timezones: TimezoneService) {}

  @Get()
  async get(@CurrentUser('sub') userId: string): Promise<{ timezone: string }> {
    return { timezone: await this.timezones.getUserTimezone(userId) };
  }

  @Put()
  async set(@CurrentUser('sub') userId: string, @Body() dto: UpdateTimezoneDto): Promise<{ timezone: string }> {
    return { timezone: await this.timezones.setUserTimezone(userId, dto.timezone) };
  }
}
