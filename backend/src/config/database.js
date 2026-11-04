// Database access point for modules: re-exports the single Prisma client and
// a readiness probe. Do not construct PrismaClient anywhere else.
import prisma from '../prisma/client.js';

export async function checkDatabase() {
  await prisma.$queryRaw`SELECT 1`;
  return true;
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}

export { prisma };
export default prisma;
