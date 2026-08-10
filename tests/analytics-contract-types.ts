import type { AnalyticsCollector } from "../lib/analytics/facade.ts";

const synchronousCollector: AnalyticsCollector = {
  collect() {
    return true;
  },
};
void synchronousCollector;

const asynchronousCollector: AnalyticsCollector = {
  // @ts-expect-error Analytics collection must acknowledge synchronously.
  async collect() {
    return true as const;
  },
};
void asynchronousCollector;
