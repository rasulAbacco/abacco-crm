// Idempotent reference-data seed. Safe to run on every deploy: it only adds
// missing default country profiles for existing accounts and never overwrites
// edits. No demo/mock records are created.
process.env.TZ = 'UTC';
const { default: prisma } = await import('../src/prisma/client.js');
const { DEFAULT_COUNTRY_PROFILES } = await import('../src/modules/account/account.bootstrap.js');

try {
  const accounts = await prisma.account.findMany({ select: { id: true } });
  for (const { id } of accounts) {
    const r = await prisma.countryProfile.createMany({
      data: DEFAULT_COUNTRY_PROFILES.map((c) => ({ ...c, accountId: id })),
      skipDuplicates: true,
    });
    console.log(`account ${id}: ${r.count} country profile(s) added`);
  }
  if (accounts.length === 0) console.log('No account yet — run "npm run create-admin" first.');
} finally {
  await prisma.$disconnect();
}
