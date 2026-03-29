import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ListingsService } from './providers/listings.service';
import { ListingsController } from './listings.controller';
import { BookmarksService } from './providers/bookmarks.service';
import { BookmarksController } from './bookmarks.controller';
import { Listing } from './entities/listing.entity';
import { Bookmark } from './entities/bookmark.entity';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Listing, Bookmark]),
    AuthModule,
    AuditModule,
  ],
  controllers: [ListingsController, BookmarksController],
  providers: [ListingsService, BookmarksService],
  exports: [ListingsService, BookmarksService],
})
export class ListingsModule {}
