// In-process domain events. Modules publish ("lead.created"); other modules
// (automations) subscribe without the publisher importing them.
import { EventEmitter } from 'node:events';
import logger from '../../config/logger.js';

const bus = new EventEmitter();
bus.setMaxListeners(50);

export function publish(event, payload) {
  for (const handler of bus.listeners(event)) {
    Promise.resolve()
      .then(() => handler(payload))
      .catch((err) => logger.error({ err, event }, 'event handler failed'));
  }
}

export function subscribe(event, handler) {
  bus.on(event, handler);
  return () => bus.off(event, handler);
}
