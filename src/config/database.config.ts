import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export default (): TypeOrmModuleOptions => ({
  type: 'postgres', // Ensure type is strictly 'postgres'
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
  username: process.env.DATABASE_USER ,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'], // Ensure entities are loaded
  autoLoadEntities: true,
  synchronize: true, // Set to false in production
  // logging: true, // Enable query logging for debugging
});
