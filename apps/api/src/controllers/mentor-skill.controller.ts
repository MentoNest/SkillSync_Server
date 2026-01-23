import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { MentorSkillService } from '../services/mentor-skill.service';
import { AttachSkillDto, UpdateSkillDto } from '../dtos/mentor-skill.dto';
import { MentorSkill } from '../users/entities/mentor-skill.entity';
import { MentorProfile } from '../users/entities/mentor-profile.entity';
import { UseGuards } from '@nestjs/common';
import { RbacGuard } from '../auth/decorators/rbac.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('mentor-skills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('mentor-skills')
export class MentorSkillController {
  constructor(private readonly mentorSkillService: MentorSkillService) {}

  @Post('attach')
  @Roles('mentor')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Attach a skill to mentor profile' })
  @ApiBody({ type: AttachSkillDto })
  @ApiResponse({ status: 201, description: 'Skill attached successfully' })
  @ApiResponse({
    status: 404,
    description: 'Mentor profile or skill not found',
  })
  @ApiResponse({ status: 409, description: 'Skill already attached' })
  async attachSkill(
    @Request() req: any,
    @Body() attachSkillDto: AttachSkillDto,
  ): Promise<MentorSkill> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const userId = req.user.sub;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return await this.mentorSkillService.attachSkill(userId, attachSkillDto);
  }

  @Put(':skillId')
  @ApiOperation({ summary: 'Update mentor skill proficiency' })
  @ApiParam({ name: 'skillId', description: 'Skill ID' })
  @ApiBody({ type: UpdateSkillDto })
  @ApiResponse({ status: 200, description: 'Skill updated successfully' })
  @ApiResponse({ status: 404, description: 'Mentor skill not found' })
  @Roles('mentor')
  async updateSkill(
    @Request() req: any,
    @Param('skillId') skillId: string,
    @Body() updateSkillDto: UpdateSkillDto,
  ): Promise<MentorSkill> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const userId = req.user?.sub || 'mock-user-id';
    return await this.mentorSkillService.updateSkill(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      userId,
      skillId,
      updateSkillDto,
    );
  }

  @Delete(':skillId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Detach a skill from mentor profile' })
  @ApiParam({ name: 'skillId', description: 'Skill ID' })
  @ApiResponse({ status: 204, description: 'Skill detached successfully' })
  @ApiResponse({ status: 404, description: 'Mentor skill not found' })
  async detachSkill(
    @Request() req: any,
    @Param('skillId') skillId: string,
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const userId = req.user?.sub || 'mock-user-id';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return await this.mentorSkillService.detachSkill(userId, skillId);
  }

  @Get('my-skills')
  @ApiOperation({ summary: 'Get all skills for current mentor' })
  @ApiResponse({ status: 200, description: 'List of mentor skills' })
  @ApiResponse({ status: 404, description: 'Mentor profile not found' })
  @Roles('mentor')
  async getMentorSkills(@Request() req: any): Promise<MentorSkill[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const userId = req.user?.sub || 'mock-user-id';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return await this.mentorSkillService.getMentorSkills(userId);
  }
}

@ApiTags('mentors')
@Controller('mentors')
export class MentorController {
  constructor(private readonly mentorSkillService: MentorSkillService) {}

  @Get()
  @ApiOperation({ summary: 'Find mentors by required skills' })
  @ApiQuery({
    name: 'skills',
    description: 'Comma-separated skill IDs',
    required: false,
    example:
      'c5f5e3d5-8b7a-4f2d-9c1e-3f4a5b6c7d8e,d6g6f4e6-9c8b-5g3e-0d2f-4g5b6c7d8e9f',
  })
  @ApiResponse({
    status: 200,
    description: 'List of mentors with required skills',
  })
  async findMentorsBySkills(
    @Query('skills') skills?: string,
  ): Promise<MentorProfile[]> {
    if (!skills) {
      return [];
    }

    const skillIds = skills.split(',').filter((id) => id.trim().length > 0);
    return await this.mentorSkillService.findMentorsBySkills(skillIds);
  }
}
