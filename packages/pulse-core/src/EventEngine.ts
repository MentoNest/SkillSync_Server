export type TopicPattern = (string | null)[]; // null = wildcard

export interface ContractFilter {
  contractIds: string[];
  topicPattern: TopicPattern;
}

export interface ContractSubscription {
  filters: ContractFilter[];
  handler: (event: NormalizedEvent) => void;
}

export interface NormalizedEvent {
  type: string;
  contractId?: string;
  topics?: string[];
  [key: string]: unknown;
}

export class EventEngine {
  private contractSubs: ContractSubscription[] = [];
  private classicWatchers = new Map<string, (event: NormalizedEvent) => void>();

  subscribeContract(sub: ContractSubscription): void {
    this.contractSubs.push(sub);
  }

  watchAddress(address: string, handler: (event: NormalizedEvent) => void): void {
    this.classicWatchers.set(address, handler);
  }

  route(event: NormalizedEvent): void {
    if (event.type === 'contract.invoked' || event.type === 'contract.emitted') {
      this.routeContract(event);
    } else {
      const handler = this.classicWatchers.get(event.type);
      handler?.(event);
    }
  }

  private routeContract(event: NormalizedEvent): void {
    for (const sub of this.contractSubs) {
      for (const filter of sub.filters) {
        if (this.matchesFilter(event, filter)) {
          sub.handler(event);
          break; // one match per subscription is enough
        }
      }
    }
  }

  private matchesFilter(event: NormalizedEvent, filter: ContractFilter): boolean {
    if (!event.contractId || !filter.contractIds.includes(event.contractId)) {
      return false;
    }
    const topics = event.topics ?? [];
    return filter.topicPattern.every(
      (pat, i) => pat === null || pat === topics[i],
    );
  }
}
