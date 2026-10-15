import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): { name: string; status: string; env: string } {
    return {
      name: process.env.APP_NAME ?? 'SkillSync',
      status: 'ok',
      env: process.env.NODE_ENV ?? 'development',
    };
  }
}
