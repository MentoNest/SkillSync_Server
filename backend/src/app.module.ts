import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { User } from './user/entities/user.entity';
import { Role } from './entities/role.entity';
import { RolesGuard } from './guards/roles.guard';
import { RolesService } from './services/roles.service';
import { RolesController } from './controllers/roles.controller';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_DATABASE || 'skillsync',
      entities: [User, Role],
      synchronize: process.env.NODE_ENV !== 'production', // Disable in production, use migrations
    }),
    TypeOrmModule.forFeature([User, Role]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production', // Use environment variables in production
      signOptions: { expiresIn: '1d' },
    }),
    UserModule,
  ],
  controllers: [AppController, RolesController],
  providers: [AppService, RolesService, RolesGuard],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly rolesService: RolesService) {}

  async onModuleInit() {
    // Initialize default roles when the app starts
    await this.rolesService.initializeDefaultRoles();
  }
}