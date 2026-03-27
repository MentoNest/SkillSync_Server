import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bookmark } from '../entities/bookmark.entity';
import { Listing } from '../entities/listing.entity';
import { CreateBookmarkDto } from '../dto/create-bookmark.dto';
import { UpdateBookmarkDto } from '../dto/update-bookmark.dto';

@Injectable()
export class BookmarksService {
  constructor(
    @InjectRepository(Bookmark)
    private bookmarksRepository: Repository<Bookmark>,
    @InjectRepository(Listing)
    private listingsRepository: Repository<Listing>,
  ) {}

  /**
   * Create a new bookmark
   */
  async create(createBookmarkDto: CreateBookmarkDto, userId: string, listingId: string): Promise<Bookmark> {
    // Check if listing exists
    const listing = await this.listingsRepository.findOne({
      where: { id: listingId },
      relations: ['user'],
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    // Check if bookmark already exists
    const existingBookmark = await this.bookmarksRepository.findOne({
      where: {
        user: { id: userId },
        listing: { id: listingId },
      },
    });

    if (existingBookmark) {
      throw new ConflictException('Listing already bookmarked');
    }

    // Create bookmark
    const bookmark = this.bookmarksRepository.create({
      ...createBookmarkDto,
      user: { id: userId },
      listing: { id: listingId },
    });

    return this.bookmarksRepository.save(bookmark);
  }

  /**
   * Get all bookmarks for a user with listing details
   */
  async findAllByUserId(userId: string): Promise<Bookmark[]> {
    return this.bookmarksRepository.find({
      where: { user: { id: userId } },
      relations: ['listing', 'listing.user'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get a specific bookmark by ID
   */
  async findOne(id: string, userId: string): Promise<Bookmark> {
    const bookmark = await this.bookmarksRepository.findOne({
      where: { id, user: { id: userId } },
      relations: ['listing', 'listing.user'],
    });

    if (!bookmark) {
      throw new NotFoundException('Bookmark not found');
    }

    return bookmark;
  }

  /**
   * Check if a listing is bookmarked by user
   */
  async isBookmarked(userId: string, listingId: string): Promise<boolean> {
    const bookmark = await this.bookmarksRepository.findOne({
      where: {
        user: { id: userId },
        listing: { id: listingId },
      },
    });

    return !!bookmark;
  }

  /**
   * Update bookmark notes
   */
  async update(id: string, updateBookmarkDto: UpdateBookmarkDto, userId: string): Promise<Bookmark> {
    const bookmark = await this.findOne(id, userId);

    Object.assign(bookmark, updateBookmarkDto);
    return this.bookmarksRepository.save(bookmark);
  }

  /**
   * Remove a bookmark
   */
  async remove(id: string, userId: string): Promise<void> {
    const bookmark = await this.findOne(id, userId);
    await this.bookmarksRepository.remove(bookmark);
  }

  /**
   * Remove bookmark by listing ID
   */
  async removeByListingId(userId: string, listingId: string): Promise<void> {
    const bookmark = await this.bookmarksRepository.findOne({
      where: {
        user: { id: userId },
        listing: { id: listingId },
      },
    });

    if (bookmark) {
      await this.bookmarksRepository.remove(bookmark);
    }
  }

  /**
   * Get bookmark count for a user
   */
  async getCount(userId: string): Promise<number> {
    return this.bookmarksRepository.count({
      where: { user: { id: userId } },
    });
  }
}
