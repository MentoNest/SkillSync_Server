import { Body, Controller, Delete, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/guards/current-user.decorator';
import { RoleName } from '../../rbac/roles';
import { Roles } from '../../rbac/roles.decorator';
import { RolesGuard } from '../../rbac/roles.guard';
import { ReorderFeaturedMentorsDto } from './dto/featured-mentor.dto';
import { FeaturedMentorService } from './featured-mentor.service';

/** Admin controls for the featured-mentor spotlight (#1459). */
@ApiTags('admin/mentors')
@ApiBearerAuth()
@Controller('admin/mentors')
@UseGuards(RolesGuard)
@Roles(RoleName.ADMIN)
export class AdminFeaturedMentorController {
  constructor(private readonly featured: FeaturedMentorService) {}

  @Post(':mentorId/feature')
  @HttpCode(200)
  @ApiOperation({ summary: 'Feature a mentor on the homepage and discovery sections' })
  feature(@Param('mentorId', ParseUUIDPipe) mentorId: string, @CurrentUser('sub') adminId: string) {
    return this.featured.feature(mentorId, adminId);
  }

  @Delete(':mentorId/unfeature')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove a mentor from the featured spotlight' })
  unfeature(@Param('mentorId', ParseUUIDPipe) mentorId: string, @CurrentUser('sub') adminId: string) {
    return this.featured.unfeature(mentorId, adminId);
  }

  @Post('reorder')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rewrite the featured display order from the admin drag-and-drop UI' })
  reorder(@Body() dto: ReorderFeaturedMentorsDto, @CurrentUser('sub') adminId: string) {
    return this.featured.reorder(dto, adminId);
  }
}