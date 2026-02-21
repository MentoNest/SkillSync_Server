import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  create() {
    return 'This action adds a new audit';
  }

  recordTokenReuseAttempt(params: { userId: string; sessionId: string; tokenId: string }) {
    this.logger.warn(
      `Refresh token reuse detected user=${params.userId} session=${params.sessionId} token=${params.tokenId}`,
    );

    return {
      event: 'refresh_token_reuse',
      timestamp: new Date().toISOString(),
      ...params,
    };
  }

  findAll() {
    return `This action returns all audit`;
  }

  findOne(id: number) {
    return `This action returns a #${id} audit`;
  }

  update(id: number) {
    return `This action updates a #${id} audit`;
  }

  remove(id: number) {
    return `This action removes a #${id} audit`;
  }
}
