import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { UserService } from '../services/user.service';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { CreateProfileDto } from '../dto/create-profile.dto';
import { UpdateMentorProfileDto } from '../dto/mentor-profile.dto';
import { UpdateMenteeProfileDto } from '../dto/mentee-profile.dto';
import { User } from '../entities/user.entity';

@Controller('user')
@UseGuards(RolesGuard)
export class UserController {
  constructor(
    private readonly userService: UserService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // Task 4: POST /user/profile - Create either mentor or mentee profile
  @Post('profile')
  @HttpCode(HttpStatus.CREATED)
  async createProfile(
    @Body() createProfileDto: CreateProfileDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.userService.createProfile(user.id, createProfileDto);
  }

  // Task 2: Mentor Profile CRUD
  @Get('mentor-profile')
  @Roles('mentor')
  async getMyMentorProfile(@Req() req: Request) {
    const user = (req as any).user;
    return this.userService.getMentorProfile(user.id);
  }

  @Get('mentor-profile/:id')
  async getMentorProfileById(@Param('id') id: string) {
    return this.userService.getMentorProfileById(id);
  }

  @Put('mentor-profile')
  @Roles('mentor')
  async updateMentorProfile(
    @Body() updateDto: UpdateMentorProfileDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.userService.updateMentorProfile(user.id, updateDto);
  }

  @Delete('mentor-profile')
  @Roles('mentor')
  async deleteMentorProfile(@Req() req: Request) {
    const user = (req as any).user;
    return this.userService.deleteMentorProfile(user.id);
  }

  // Task 3: Mentee Profile CRUD
  @Get('mentee-profile')
  @Roles('mentee')
  async getMyMenteeProfile(@Req() req: Request) {
    const user = (req as any).user;
    return this.userService.getMenteeProfile(user.id);
  }

  @Get('mentee-profile/:id')
  async getMenteeProfileById(@Param('id') id: string) {
    return this.userService.getMenteeProfileById(id);
  }

  @Put('mentee-profile')
  @Roles('mentee')
  async updateMenteeProfile(
    @Body() updateDto: UpdateMenteeProfileDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.userService.updateMenteeProfile(user.id, updateDto);
  }

  @Delete('mentee-profile')
  @Roles('mentee')
  async deleteMenteeProfile(@Req() req: Request) {
    const user = (req as any).user;
    return this.userService.deleteMenteeProfile(user.id);
  }

  // Issue #1165: PATCH /user/profile/:type - partial update of own mentor/mentee profile
  @Patch('profile/:type')
  async updateProfileByType(
    @Param('type') type: string,
    @Body() updateDto: UpdateMentorProfileDto | UpdateMenteeProfileDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    if (type === 'mentor') {
      return this.userService.updateMentorProfile(user.id, updateDto as UpdateMentorProfileDto);
    }
    if (type === 'mentee') {
      return this.userService.updateMenteeProfile(user.id, updateDto as UpdateMenteeProfileDto);
    }
    throw new BadRequestException('type must be "mentor" or "mentee"');
  }

  // Issue #1167: POST /user/avatar - set avatar from an already-hosted image URL.
  // Minimal version: no multipart upload/resizing yet, just URL + format validation.
  @Post('avatar')
  @HttpCode(HttpStatus.OK)
  async updateAvatar(@Body('avatarUrl') avatarUrl: string, @Req() req: Request) {
    if (!avatarUrl || !/^https:\/\/.+\.(jpe?g|png|webp)$/i.test(avatarUrl)) {
      throw new BadRequestException('avatarUrl must be an https URL ending in .jpg, .png, or .webp');
    }
    const user = (req as any).user;
    await this.userRepository.update(user.id, { avatarUrl });
    return { avatarUrl };
  }

  // Issue #1168: portfolio links, stored in the existing User.settings jsonb column
  // (minimal: no platform auto-detection or ownership verification yet).
  @Post('portfolio-links')
  @HttpCode(HttpStatus.CREATED)
  async addPortfolioLink(
    @Body() body: { platform: string; url: string; title?: string },
    @Req() req: Request,
  ) {
    if (!body?.url?.startsWith('https://')) {
      throw new BadRequestException('url must start with https://');
    }
    const user = (req as any).user;
    const entity = await this.userRepository.findOneOrFail({ where: { id: user.id } });
    const links: any[] = entity.settings?.portfolioLinks ?? [];
    if (links.length >= 10) {
      throw new BadRequestException('Maximum 10 portfolio links allowed');
    }
    if (links.some((l) => l.url === body.url)) {
      throw new BadRequestException('This URL has already been added');
    }
    const link = { id: randomUUID(), platform: body.platform, url: body.url, title: body.title ?? '' };
    links.push(link);
    await this.userRepository.update(user.id, {
      settings: { ...entity.settings, portfolioLinks: links },
    });
    return link;
  }

  @Delete('portfolio-links/:id')
  @HttpCode(HttpStatus.OK)
  async removePortfolioLink(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user;
    const entity = await this.userRepository.findOneOrFail({ where: { id: user.id } });
    const links: any[] = (entity.settings?.portfolioLinks ?? []).filter((l: any) => l.id !== id);
    await this.userRepository.update(user.id, {
      settings: { ...entity.settings, portfolioLinks: links },
    });
    return { success: true };
  }
}
