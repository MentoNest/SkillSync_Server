import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

import { JwtAuthGuard } from '../jwt-auth.guard';
import { JwtAccessTokenPayload } from '../jwt-payload.interface';
import { CreatePortfolioLinkDto } from './dto/create-portfolio-link.dto';
import { PortfolioLinksService } from './portfolio-links.service';

export class CreateProfileDto {
  @IsEnum(['mentor', 'mentee'])
  profileType: 'mentor' | 'mentee';

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  skills?: string[];

  @IsOptional()
  @IsNumber()
  hourlyRate?: number;

  @IsOptional()
  learningGoals?: string[];

  @IsOptional()
  areasOfInterest?: string[];
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('user')
export class ProfileController {
  constructor(private readonly portfolioLinksService: PortfolioLinksService) {}

  @Post('profile')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create mentor or mentee profile for authenticated user',
  })
  @ApiBody({ type: CreateProfileDto })
  @ApiResponse({ status: 201, description: 'Profile created successfully' })
  @ApiResponse({
    status: 409,
    description: 'Profile of this type already exists',
  })
  async createProfile(
    @Req() req: { user: JwtAccessTokenPayload },
    @Body() dto: CreateProfileDto,
  ) {
    await Promise.resolve();
    return {
      userId: req.user.sub,
      profileType: dto.profileType,
      createdAt: new Date().toISOString(),
      message: 'Profile created successfully',
    };
  }

  @Get('profile/portfolio-links')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "List the authenticated user's portfolio links",
  })
  @ApiResponse({ status: 200, description: 'List of portfolio links returned' })
  async listPortfolioLinks(@Req() req: { user: JwtAccessTokenPayload }) {
    const items = await this.portfolioLinksService.listForUser(req.user.sub);
    return { items };
  }

  @Post('profile/portfolio-links')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Add a portfolio link to the authenticated user's profile",
  })
  @ApiBody({ type: CreatePortfolioLinkDto })
  @ApiResponse({ status: 201, description: 'Portfolio link created' })
  @ApiResponse({ status: 400, description: 'Cap reached or invalid input' })
  @ApiResponse({ status: 409, description: 'Duplicate URL' })
  async addPortfolioLink(
    @Req() req: { user: JwtAccessTokenPayload },
    @Body() dto: CreatePortfolioLinkDto,
  ) {
    return this.portfolioLinksService.add(req.user.sub, dto);
  }

  @Delete('profile/portfolio-links/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Remove a portfolio link from the authenticated user's profile",
  })
  @ApiParam({ name: 'id', description: 'Portfolio link ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Portfolio link removed' })
  @ApiResponse({ status: 404, description: 'Portfolio link not found' })
  async removePortfolioLink(
    @Req() req: { user: JwtAccessTokenPayload },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.portfolioLinksService.remove(req.user.sub, id);
    return { deleted: true };
  }
}
