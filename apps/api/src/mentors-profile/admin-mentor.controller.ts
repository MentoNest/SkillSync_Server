import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { MentorsService } from './mentors-profile.service';
import { MentorProfileResponseDto } from './dto/mentor-profile-response';
// import { AdminGuard } from '../auth/guards/admin.guard';

class RejectProfileDto {
  reason?: string;
}

@ApiTags('Admin - Mentors')
@Controller('admin/mentors')
// @UseGuards(AdminGuard) // Uncomment when admin auth is set up
@ApiBearerAuth()
export class AdminMentorsController {
  constructor(private readonly mentorsService: MentorsService) {}

  @Get('submitted')
  @ApiOperation({
    summary: 'Get all submitted mentor profiles awaiting review',
  })
  @ApiResponse({
    status: 200,
    description: 'List of submitted profiles',
    type: [MentorProfileResponseDto],
  })
  async getSubmittedProfiles(): Promise<MentorProfileResponseDto[]> {
    return this.mentorsService.getAllSubmittedProfiles();
  }

  @Post(':profileId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve mentor profile (submitted → approved)' })
  @ApiParam({ name: 'profileId', description: 'Mentor profile UUID' })
  @ApiResponse({
    status: 200,
    description: 'Profile approved successfully',
    type: MentorProfileResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async approveProfile(
    @Param('profileId') profileId: string,
  ): Promise<MentorProfileResponseDto> {
    return this.mentorsService.approveProfile(profileId);
  }

  @Post(':profileId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject mentor profile (submitted → rejected)' })
  @ApiParam({ name: 'profileId', description: 'Mentor profile UUID' })
  @ApiBody({ type: RejectProfileDto, required: false })
  @ApiResponse({
    status: 200,
    description: 'Profile rejected successfully',
    type: MentorProfileResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async rejectProfile(
    @Param('profileId') profileId: string,
    @Body() body?: RejectProfileDto,
  ): Promise<MentorProfileResponseDto> {
    return this.mentorsService.rejectProfile(profileId, body?.reason);
  }
}
