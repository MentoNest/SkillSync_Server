import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppDataSource } from '../config/data-source';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...AppDataSource.options,
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
