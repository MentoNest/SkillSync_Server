import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { AvailabilityService } from './providers/availability.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('availability')
@ApiBearerAuth()
@Controller('availability')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Post()
  @Roles(UserRole.MENTOR)
  @ApiOperation({ summary: 'Add an availability slot (mentor only)' })
  @ApiResponse({ status: 201, description: 'Slot created' })
  @ApiResponse({ status: 400, description: 'Invalid time range' })
  @ApiResponse({ status: 409, description: 'Overlaps an existing slot' })
  create(
    @Body() dto: CreateAvailabilityDto,
    @CurrentUserId() userId: string,
  ) {
    return this.availabilityService.create(dto, userId);
  }

  @Get('my-slots')
  @Roles(UserRole.MENTOR)
  @ApiOperation({ summary: "Get the authenticated mentor's availability slots" })
  @ApiResponse({ status: 200, description: 'List of slots sorted Mon–Sun' })
  findMySlots(@CurrentUserId() userId: string) {
    return this.availabilityService.findMySlots(userId);
  }

  @Get('mentor/:mentorId')
  @ApiOperation({ summary: "Get a mentor's active availability slots by mentor profile ID" })
  @ApiParam({ name: 'mentorId', description: 'Mentor profile UUID' })
  @ApiResponse({ status: 200, description: 'List of active slots sorted Mon–Sun' })
  findByMentor(@Param('mentorId') mentorId: string) {
    return this.availabilityService.findByMentorId(mentorId);
  }

  @Patch(':id')
  @Roles(UserRole.MENTOR)
  @ApiOperation({ summary: 'Update an availability slot (owner only)' })
  @ApiParam({ name: 'id', description: 'Slot UUID' })
  @ApiResponse({ status: 200, description: 'Slot updated' })
  @ApiResponse({ status: 400, description: 'Invalid time range' })
  @ApiResponse({ status: 403, description: 'Not the slot owner' })
  @ApiResponse({ status: 404, description: 'Slot not found' })
  @ApiResponse({ status: 409, description: 'Overlaps an existing slot' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAvailabilityDto,
    @CurrentUserId() userId: string,
  ) {
    return this.availabilityService.update(id, dto, userId);
  }

  @Delete(':id')
  @Roles(UserRole.MENTOR)
  @ApiOperation({ summary: 'Delete an availability slot (owner only)' })
  @ApiParam({ name: 'id', description: 'Slot UUID' })
  @ApiResponse({ status: 200, description: 'Slot deleted' })
  @ApiResponse({ status: 403, description: 'Not the slot owner' })
  @ApiResponse({ status: 404, description: 'Slot not found' })
  remove(@Param('id') id: string, @CurrentUserId() userId: string) {
    return this.availabilityService.remove(id, userId);
  }
}
