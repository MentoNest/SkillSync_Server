import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Or, Repository } from 'typeorm';

import { AssetScope, SupportedAsset } from './entities/supported-asset.entity';
import {
  CreateSupportedAssetDto,
  ListAssetsQueryDto,
  UpdateSupportedAssetDto,
} from './dto/assets.dto';
import {
  AmbiguousAssetException,
  AssetAlreadyExistsException,
  AssetNotEnabledException,
  AssetNotFoundException,
  IssuerRequiredException,
} from './assets.exceptions';

/** Lightweight shape returned to callers that only need code + issuer */
export interface AssetIdentifier {
  code: string;
  issuer: string | null;
}

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    @InjectRepository(SupportedAsset)
    private readonly repo: Repository<SupportedAsset>,
  ) {}

  // ── Admin: CRUD ────────────────────────────────────────────────────────────

  async create(dto: CreateSupportedAssetDto): Promise<SupportedAsset> {
    const issuer = dto.issuer ?? null;

    // XLM must have no issuer; everything else must have one
    if (dto.code !== 'XLM' && issuer === null) {
      throw new IssuerRequiredException(dto.code);
    }

    const existing = await this.repo.findOne({
      where: { code: dto.code, issuer: issuer === null ? IsNull() : issuer },
    });
    if (existing) throw new AssetAlreadyExistsException(dto.code, issuer);

    const asset = this.repo.create({
      code: dto.code,
      issuer,
      name: dto.name,
      logoUrl: dto.logoUrl ?? null,
      decimals: dto.decimals ?? 7,
      scope: dto.scope ?? AssetScope.GLOBAL,
      artistId: dto.artistId ?? null,
      isEnabled: true,
    });

    const saved = await this.repo.save(asset);
    this.logger.log(`Created supported asset ${saved.catalogKey} (id=${saved.id})`);
    return saved;
  }

  async findAll(query: ListAssetsQueryDto = {}): Promise<SupportedAsset[]> {
    const where: FindOptionsWhere<SupportedAsset>[] = [];

    // Always include global assets
    const globalFilter: FindOptionsWhere<SupportedAsset> = {
      scope: AssetScope.GLOBAL,
    };
    if (query.enabledOnly) globalFilter.isEnabled = true;
    where.push(globalFilter);

    // Include artist-scoped assets if artistId is provided
    if (query.artistId) {
      const artistFilter: FindOptionsWhere<SupportedAsset> = {
        scope: AssetScope.ARTIST,
        artistId: query.artistId,
      };
      if (query.enabledOnly) artistFilter.isEnabled = true;
      where.push(artistFilter);
    }

    return this.repo.find({
      where,
      order: { scope: 'ASC', code: 'ASC' },
    });
  }

  async findOne(id: string): Promise<SupportedAsset> {
    const asset = await this.repo.findOne({ where: { id } });
    if (!asset) throw new AssetNotFoundException(id);
    return asset;
  }

  async update(id: string, dto: UpdateSupportedAssetDto): Promise<SupportedAsset> {
    const asset = await this.findOne(id);
    Object.assign(asset, dto);
    return this.repo.save(asset);
  }

  async enable(id: string): Promise<SupportedAsset> {
    const asset = await this.findOne(id);
    asset.isEnabled = true;
    const saved = await this.repo.save(asset);
    this.logger.log(`Enabled asset ${saved.catalogKey}`);
    return saved;
  }

  async disable(id: string): Promise<SupportedAsset> {
    const asset = await this.findOne(id);
    asset.isEnabled = false;
    const saved = await this.repo.save(asset);
    this.logger.log(`Disabled asset ${saved.catalogKey}`);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const asset = await this.findOne(id);
    await this.repo.remove(asset);
    this.logger.log(`Removed asset id=${id}`);
  }

  // ── Issuer-aware resolution ────────────────────────────────────────────────

  /**
   * Resolve a supported, **enabled** asset by code + optional issuer.
   *
   * Resolution rules:
   *  1. code="XLM", issuer omitted/null  → native asset lookup (issuer IS NULL)
   *  2. code≠"XLM", issuer provided      → exact match on (code, issuer)
   *  3. code≠"XLM", issuer omitted       → look for exactly 1 match; if >1
   *     throw AmbiguousAssetException; if 0 throw AssetNotFoundException
   *
   * Throws AssetNotEnabledException when the asset is found but disabled.
   *
   * @param code     Stellar asset code
   * @param issuer   Stellar issuing account (null/undefined for XLM)
   * @param artistId Optional – include artist-scoped assets for this artist
   */
  async resolve(
    code: string,
    issuer?: string | null,
    artistId?: string,
  ): Promise<SupportedAsset> {
    const upperCode = code.toUpperCase();

    // ── native asset ─────────────────────────────────────────────────────────
    if (upperCode === 'XLM') {
      const native = await this.repo.findOne({
        where: { code: 'XLM', issuer: IsNull() },
      });
      if (!native) throw new AssetNotFoundException('XLM');
      if (!native.isEnabled) throw new AssetNotEnabledException('XLM');
      return native;
    }

    // ── non-native with explicit issuer ──────────────────────────────────────
    if (issuer) {
      const asset = await this.repo.findOne({
        where: { code: upperCode, issuer },
      });
      if (!asset) throw new AssetNotFoundException(upperCode, issuer);
      if (!asset.isEnabled) throw new AssetNotEnabledException(upperCode, issuer);
      return asset;
    }

    // ── non-native without issuer – attempt unambiguous resolution ───────────
    // Build scope filter
    const scopeWhere: FindOptionsWhere<SupportedAsset>[] = [
      { code: upperCode, scope: AssetScope.GLOBAL },
    ];
    if (artistId) {
      scopeWhere.push({ code: upperCode, scope: AssetScope.ARTIST, artistId });
    }

    const candidates = await this.repo.find({ where: scopeWhere });

    if (candidates.length === 0) throw new AssetNotFoundException(upperCode);

    // Filter only enabled ones before checking ambiguity
    const enabled = candidates.filter((a) => a.isEnabled);

    if (candidates.length > 1 && enabled.length !== 1) {
      throw new AmbiguousAssetException(upperCode);
    }

    if (enabled.length === 0) throw new AssetNotEnabledException(upperCode);

    return enabled[0];
  }

  /**
   * Lightweight helper – returns true when the asset (code + issuer) is in the
   * supported catalog and enabled.  Does NOT throw; useful for guard checks.
   */
  async isSupported(
    code: string,
    issuer?: string | null,
    artistId?: string,
  ): Promise<boolean> {
    try {
      await this.resolve(code, issuer, artistId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Return the full catalog as a Map keyed by `catalogKey` for O(1) lookups.
   * Useful in bulk-processing contexts (e.g. Stellar payment ingestion).
   */
  async buildCatalogMap(artistId?: string): Promise<Map<string, SupportedAsset>> {
    const assets = await this.findAll({ artistId, enabledOnly: true });
    return new Map(assets.map((a) => [a.catalogKey, a]));
  }
}
