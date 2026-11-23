import { Body, Controller, Delete, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../auth/auth.types';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ErrorResponseDto, UnauthorizedResponseDto } from '../common/dto/error-response.dto';
import { CreatePortfolioLinkDto, PortfolioLinkResponseDto } from './dto/portfolio-link.dto';
import { PortfolioLinksService } from './portfolio-links.service';

@ApiTags('Users')
@Controller()
export class PortfolioLinksController {
  constructor(private readonly portfolioLinks: PortfolioLinksService) {}

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard)
  @Post('user/portfolio-links')
  @ApiOperation({ summary: 'Add a portfolio link to my profile', operationId: 'createPortfolioLink' })
  @ApiResponse({ status: HttpStatus.CREATED, type: PortfolioLinkResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: UnauthorizedResponseDto })
  create(@Body() dto: CreatePortfolioLinkDto, @CurrentUser() user: AuthUser): Promise<PortfolioLinkResponseDto> {
    return this.portfolioLinks.create(user.address, dto);
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard)
  @Delete('user/portfolio-links/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete my portfolio link', operationId: 'deletePortfolioLink' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    await this.portfolioLinks.remove(user.address, id, user.roles?.includes(Role.ADMIN));
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete('admin/portfolio-links/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin remove inappropriate portfolio link', operationId: 'adminDeletePortfolioLink' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  async adminRemove(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    await this.portfolioLinks.remove(user.address, id, true);
  }
}
