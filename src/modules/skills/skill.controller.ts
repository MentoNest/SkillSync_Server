import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { SkillService } from './providers/skill.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { RejectSkillDto } from './dto/reject-skill.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { SkillStatus } from '../../common/enums/skill-status.enum';

@ApiTags('skills')
@Controller('skills')
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new skill (admin only)' })
  @ApiResponse({ status: 201, description: 'Skill created' })
  @ApiResponse({ status: 400, description: 'Invalid category ID' })
  @ApiResponse({ status: 409, description: 'Name or slug already exists' })
  create(@Body() dto: CreateSkillDto) {
    return this.skillService.create(dto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'List all skills, optionally filtered by category' })
  @ApiQuery({ name: 'categoryId', required: false, description: 'Filter by category UUID' })
  @ApiResponse({ status: 200, description: 'List of skills' })
  findAll(@Query('categoryId') categoryId?: string) {
    return this.skillService.findAll(categoryId);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a skill by ID' })
  @ApiParam({ name: 'id', description: 'Skill UUID' })
  @ApiResponse({ status: 200, description: 'Skill found' })
  @ApiResponse({ status: 404, description: 'Skill not found' })
  findOne(@Param('id') id: string) {
    return this.skillService.findOnePublic(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a skill (admin only)' })
  @ApiParam({ name: 'id', description: 'Skill UUID' })
  @ApiResponse({ status: 200, description: 'Skill updated' })
  @ApiResponse({ status: 404, description: 'Skill not found' })
  @ApiResponse({ status: 409, description: 'Name or slug already exists' })
  update(@Param('id') id: string, @Body() dto: UpdateSkillDto) {
    return this.skillService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a skill (admin only)' })
  @ApiParam({ name: 'id', description: 'Skill UUID' })
  @ApiResponse({ status: 200, description: 'Skill deleted' })
  @ApiResponse({ status: 404, description: 'Skill not found' })
  remove(@Param('id') id: string) {
    return this.skillService.remove(id);
  }

  // ---------------------------------------------------------------------------
  // Moderation endpoints (admin only)
  // ---------------------------------------------------------------------------

  @Get('pending')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List all pending skills awaiting moderation (admin only)' })
  @ApiResponse({ status: 200, description: 'List of pending skills' })
  findPending() {
    return this.skillService.findPending();
  }

  @Patch(':id/approve')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Approve a skill (admin only)' })
  @ApiParam({ name: 'id', description: 'Skill UUID' })
  @ApiResponse({ status: 200, description: 'Skill approved' })
  @ApiResponse({ status: 400, description: 'Skill is already approved' })
  @ApiResponse({ status: 404, description: 'Skill not found' })
  approve(
    @Param('id') id: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.skillService.approve(id, req.user.sub);
  }

  @Patch(':id/reject')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reject a skill (admin only)' })
  @ApiParam({ name: 'id', description: 'Skill UUID' })
  @ApiResponse({ status: 200, description: 'Skill rejected' })
  @ApiResponse({ status: 400, description: 'Skill is already rejected' })
  @ApiResponse({ status: 404, description: 'Skill not found' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectSkillDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.skillService.reject(id, req.user.sub, dto);
  }
}
