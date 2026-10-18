import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeEach(() => {
    service = new AppService();
  });

  it('returns the greeting', () => {
    expect(service.getHello()).toBe('Hello World!');
  });

  it('returns a fresh app instance the same way on every call', () => {
    // Guards against someone caching the string on the prototype by accident.
    const a = new AppService();
    const b = new AppService();
    expect(a.getHello()).toBe(b.getHello());
  });
});