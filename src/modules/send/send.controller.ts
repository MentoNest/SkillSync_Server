import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/auth.interface';
import { SendService } from './providers/send.service';
import { PreviewSendDto, ConfirmSendDto } from './dto/send.dto';
import { ConfirmRateLimitGuard } from './confirm-rate-limit.guard';

@UseGuards(JwtAuthGuard)
@Controller('send')
export class SendController {
  constructor(private readonly sendService: SendService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@CurrentUser() user: JwtPayload, @Body() dto: PreviewSendDto) {
    return this.sendService.preview(user.sub, dto.toUsername, dto.amountUsdc);
  }

  @Post('confirm')
  @UseGuards(ConfirmRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  confirm(@CurrentUser() user: JwtPayload, @Body() dto: ConfirmSendDto) {
    return this.sendService.confirm(user.sub, dto.toUsername, dto.amountUsdc, dto.pin, dto.note);
  }

  @Get('recipient/:username')
  getRecipient(@Param('username') username: string) {
    return this.sendService.getRecipient(username);
  }

  @Get('limits')
  getLimits(@CurrentUser() user: JwtPayload) {
    return this.sendService.getLimits(user.sub);
  }
}
