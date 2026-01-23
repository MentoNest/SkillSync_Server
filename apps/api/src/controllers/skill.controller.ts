import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { SkillService } from '../services/skill.service';
import { CreateSkillDto } from '../dtos/skill.dto';
import { Skill } from '../entities/skill.entity';
import { UseGuards } from '@nestjs/common';
import { RbacGuard } from '../auth/decorators/rbac.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
@ApiTags('skills')
@Controller('skills')
@UseGuards(JwtAuthGuard, RbacGuard)
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new skill' })
  @ApiBody({ type: CreateSkillDto })
  @ApiResponse({ status: 201, description: 'Skill created successfully' })
  @ApiResponse({ status: 409, description: 'Skill already exists' })
  async create(@Body() createSkillDto: CreateSkillDto): Promise<Skill> {
    return await this.skillService.create(createSkillDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all skills' })
  @ApiResponse({ status: 200, description: 'List of all skills' })
  async findAll(): Promise<Skill[]> {
    return await this.skillService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get skill by ID' })
  @ApiParam({ name: 'id', description: 'Skill ID' })
  @ApiResponse({ status: 200, description: 'Skill found' })
  @ApiResponse({ status: 404, description: 'Skill not found' })
  async findOne(@Param('id') id: string): Promise<Skill> {
    return await this.skillService.findOne(id);
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get skill by slug' })
  @ApiParam({ name: 'slug', description: 'Skill slug' })
  @ApiResponse({ status: 200, description: 'Skill found' })
  @ApiResponse({ status: 404, description: 'Skill not found' })
  async findBySlug(@Param('slug') slug: string): Promise<Skill> {
    return await this.skillService.findBySlug(slug);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a skill' })
  @ApiParam({ name: 'id', description: 'Skill ID' })
  @ApiResponse({ status: 204, description: 'Skill deleted successfully' })
  @ApiResponse({ status: 404, description: 'Skill not found' })
  async delete(@Param('id') id: string): Promise<void> {
    return await this.skillService.delete(id);
  }
}
