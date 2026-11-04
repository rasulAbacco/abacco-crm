// The one and only Prisma client for the API and the workers.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import config from '../config/environment.js';

// Money is BigInt minor units; JSON has no BigInt, so it serialises as a string
// ("1250000") and the frontend formats it with Intl.NumberFormat.
if (!BigInt.prototype.toJSON) {
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value() {
      return this.toString();
    },
    writable: true,
    configurable: true,
  });
}

const adapter = new PrismaPg({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX,
});

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__abaccoPrisma ??
  new PrismaClient({
    adapter,
    log: config.isProduction ? ['error'] : ['error', 'warn'],
  });

if (!config.isProduction) globalForPrisma.__abaccoPrisma = prisma;

export default prisma;
