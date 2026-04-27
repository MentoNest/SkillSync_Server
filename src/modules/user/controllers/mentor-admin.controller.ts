import {
  Controller,
  Post,
  Delete,
  UseGuards,
  Param,
  ParseUUIDPipe,
  Body,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { MentorAdminService } from '../services/mentor-admin.service';
import {
  FeatureMentorDto,
  UpdateFeaturedOrderDto,
  FeaturedMentorResponseDto,
} from '../dto/featured-mentor.dto';

@ApiTags('Admin - Mentors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/mentors')
export class MentorAdminController {
  constructor(private readonly mentorAdminService: MentorAdminService) {}

  @Post(':mentorId/feature')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Feature a mentor (Admin only)' })
  @ApiParam({ name: 'mentorId', type: String, description: 'Mentor profile ID' })
  @ApiResponse({
    status: 200,
    description: 'Mentor featured successfully',
    type: FeaturedMentorResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - limit reached or invalid' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  @ApiResponse({ status: 404, description: 'Mentor not found' })
  async featureMentor(
    @Param('mentorId', ParseUUIDPipe) mentorId: string,
    @Body() dto: FeatureMentorDto,
    @CurrentUser() adminUser: any,
  ): Promise<FeaturedMentorResponseDto> {
    // Note: In a real application, get these from request context
    const ipAddress = '127.0.0.1'; // This should come from request headers
    return this.mentorAdminService.featureMentor(mentorId, dto, adminUser.userId, ipAddress);
  }

  @Delete(':mentorId/unfeature')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unfeature a mentor (Admin only)' })
  @ApiParam({ name: 'mentorId', type: String, description: 'Mentor profile ID' })
  @ApiResponse({
    status: 200,
    description: 'Mentor unfeatured successfully',
    type: FeaturedMentorResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Mentor is not currently featured' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  @ApiResponse({ status: 404, description: 'Mentor not found' })
  async unfeatureMentor(
    @Param('mentorId', ParseUUIDPipe) mentorId: string,
    @CurrentUser() adminUser: any,
  ): Promise<FeaturedMentorResponseDto> {
    const ipAddress = '127.0.0.1'; // This should come from request headers
    return this.mentorAdminService.unfeatureMentor(mentorId, adminUser.userId, ipAddress);
  }

  @Patch(':mentorId/featured-order')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update featured mentor display order (Admin only)' })
  @ApiParam({ name: 'mentorId', type: String, description: 'Mentor profile ID' })
  @ApiResponse({
    status: 200,
    description: 'Featured order updated successfully',
    type: FeaturedMentorResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Mentor is not featured' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  @ApiResponse({ status: 404, description: 'Mentor not found' })
  async updateFeaturedOrder(
    @Param('mentorId', ParseUUIDPipe) mentorId: string,
    @Body() dto: UpdateFeaturedOrderDto,
    @CurrentUser() adminUser: any,
  ): Promise<FeaturedMentorResponseDto> {
    const ipAddress = '127.0.0.1'; // This should come from request headers
    return this.mentorAdminService.updateFeaturedOrder(
      mentorId,
      dto.featuredOrder,
      adminUser.userId,
      ipAddress,
    );
  }
}
