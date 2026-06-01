import { validate } from 'class-validator';
import { CreatePortfolioLinkDto } from './create-portfolio-link.dto';
import { PortfolioPlatform } from '../entities/portfolio-link.entity';

describe('CreatePortfolioLinkDto', () => {
  it('should validate a correct portfolio link creation request', async () => {
    const dto = new CreatePortfolioLinkDto();
    dto.url = 'https://example.com/portfolio';
    dto.platform = PortfolioPlatform.GITHUB;
    dto.title = 'My Portfolio';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should validate with only required field (url)', async () => {
    const dto = new CreatePortfolioLinkDto();
    dto.url = 'https://example.com/portfolio';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject non-HTTPS URL', async () => {
    const dto = new CreatePortfolioLinkDto();
    dto.url = 'http://example.com/portfolio';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject URL without protocol', async () => {
    const dto = new CreatePortfolioLinkDto();
    dto.url = 'example.com/portfolio';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject title longer than 128 characters', async () => {
    const dto = new CreatePortfolioLinkDto();
    dto.url = 'https://example.com/portfolio';
    dto.title = 'a'.repeat(129);

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing URL', async () => {
    const dto = new CreatePortfolioLinkDto();
    dto.url = '';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
