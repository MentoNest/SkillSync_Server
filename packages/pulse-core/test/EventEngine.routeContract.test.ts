import { EventEngine, NormalizedEvent } from '../src/EventEngine';

const makeEvent = (contractId: string, topics: string[], type = 'contract.emitted'): NormalizedEvent => ({
  type,
  contractId,
  topics,
});

describe('EventEngine.routeContract', () => {
  let engine: EventEngine;

  beforeEach(() => {
    engine = new EventEngine();
  });

  it('drops an emitted event when no subscription matches', () => {
    const handler = jest.fn();
    engine.subscribeContract({
      filters: [{ contractIds: ['CONTRACT_A'], topicPattern: ['transfer'] }],
      handler,
    });

    engine.route(makeEvent('CONTRACT_B', ['transfer']));

    expect(handler).not.toHaveBeenCalled();
  });

  it('delivers an emitted event matching a topic-pattern filter', () => {
    const handler = jest.fn();
    engine.subscribeContract({
      filters: [{ contractIds: ['CONTRACT_A'], topicPattern: ['transfer', null] }],
      handler,
    });

    const event = makeEvent('CONTRACT_A', ['transfer', 'alice']);
    engine.route(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('delivers to two subscriptions on overlapping filters each exactly once', () => {
    const h1 = jest.fn();
    const h2 = jest.fn();

    const filter = { contractIds: ['CONTRACT_A'], topicPattern: ['transfer'] };
    engine.subscribeContract({ filters: [filter], handler: h1 });
    engine.subscribeContract({ filters: [filter], handler: h2 });

    const event = makeEvent('CONTRACT_A', ['transfer']);
    engine.route(event);

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('also routes contract.invoked events', () => {
    const handler = jest.fn();
    engine.subscribeContract({
      filters: [{ contractIds: ['CONTRACT_A'], topicPattern: [null] }],
      handler,
    });

    const event = makeEvent('CONTRACT_A', ['invoke'], 'contract.invoked');
    engine.route(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('does not route contract events to classic address watchers', () => {
    const watcher = jest.fn();
    engine.watchAddress('contract.emitted', watcher);

    engine.route(makeEvent('CONTRACT_A', ['transfer']));

    expect(watcher).not.toHaveBeenCalled();
  });
});
