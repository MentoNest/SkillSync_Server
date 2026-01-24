import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { VerifyService } from './verify.service';
import { WebhookKycDto } from './dto/webhook-kyc.dto';

@Controller('verify/webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly verifyService: VerifyService) {}

  @Post('kyc')
  @HttpCode(HttpStatus.OK)
  async handleKycWebhook(@Body(ValidationPipe) webhookKycDto: WebhookKycDto) {
    this.logger.log(`Received KYC webhook for user ${webhookKycDto.userId}`);
    return await this.verifyService.handleWebhook(webhookKycDto);
  }
}
