import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModuleOptions } from '@nestjs/jwt';
import { Algorithm } from 'jsonwebtoken';

export const jwtModuleConfig = {
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService): JwtModuleOptions => {
    const algorithm = config.get<Algorithm>('JWT_ALGORITHM', 'HS256');

    if (algorithm === 'RS256') {
      return {
        privateKey: config.get<string>('JWT_PRIVATE_KEY'),
        publicKey: config.get<string>('JWT_PUBLIC_KEY'),
        signOptions: { algorithm },
        verifyOptions: { algorithms: [algorithm] },
      };
    }

    return {
      secret: config.get<string>('JWT_SECRET', 'dev-secret'),
      signOptions: { algorithm },
      verifyOptions: { algorithms: [algorithm] },
    };
  },
};
