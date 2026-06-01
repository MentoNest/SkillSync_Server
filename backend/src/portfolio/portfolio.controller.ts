import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PortfolioService } from './portfolio.service';
import { CreatePortfolioLinkDto } from './dto/create-portfolio-link.dto';
import { UUIDParamDto } from '../common/dto/uuid-param.dto';

@Controller('user/portfolio-links')
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get()
  findAll(@Req() req: Request & { user?: JwtPayload }) {
    return this.portfolioService.findAll(req.user!.sub);
  }

  @Post()
  create(
    @Req() req: Request & { user?: JwtPayload },
    @Body() dto: CreatePortfolioLinkDto,
  ) {
    return this.portfolioService.create(req.user!.sub, dto);
  }

  @Delete(':id')
  remove(@Req() req: Request & { user?: JwtPayload }, @Param() params: UUIDParamDto) {
    return this.portfolioService.remove(req.user!.sub, params.id);
  }
}
