import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/guards/current-user.decorator';
import { RoleName } from '../../rbac/roles';
import { Roles } from '../../rbac/roles.decorator';
import { RolesGuard } from '../../rbac/roles.guard';
import { CreatePortfolioLinkDto } from './dto/portfolio-link.dto';
import { PortfolioLink } from './entities/portfolio-link.entity';
import { PortfolioLinksService } from './portfolio-links.service';

@ApiTags('user')
@ApiBearerAuth()
@Controller('user/portfolio-links')
export class PortfolioLinksController {
  constructor(private readonly links: PortfolioLinksService) {}

  @Post()
  @ApiOperation({ summary: 'Attach an external portfolio link' })
  @ApiCreatedResponse({ type: PortfolioLink })
  add(@CurrentUser('sub') userId: string, @Body() dto: CreatePortfolioLinkDto): Promise<PortfolioLink> {
    return this.links.add(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List the authenticated user portfolio links' })
  @ApiOkResponse({ type: [PortfolioLink] })
  list(@CurrentUser('sub') userId: string): Promise<PortfolioLink[]> {
    return this.links.list(userId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove one of the authenticated user portfolio links' })
  async remove(@CurrentUser('sub') userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.links.remove(userId, id);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(RoleName.ADMIN)
@Controller('admin/portfolio-links')
export class AdminPortfolioLinksController {
  constructor(private readonly links: PortfolioLinksService) {}

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove an inappropriate portfolio link (admin)' })
  async remove(@CurrentUser('sub') userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.links.remove(userId, id, true);
  }
}
