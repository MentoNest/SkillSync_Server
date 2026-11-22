import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AvailabilityModule } from './availability/availability.module';
import { DatabaseModule } from './database/database.module';
import { ProfileHistoryModule } from './profile-history/profile-history.module';
import { ProfileModule } from './profile/profile.module';
import { ShutdownModule } from './shutdown/shutdown.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    ShutdownModule,
    AuthModule,
    UserModule,
    ProfileHistoryModule,
    ProfileModule,
    AvailabilityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
