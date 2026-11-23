import { AppService } from './app.service';

describe('AppService', () => {
  it('returns the legacy greeting used by the root endpoint', () => {
    expect(new AppService().getHello()).toBe('Hello World!');
  });
});
