// Creates the single primary account + user (first run).
//   npm run create-admin -- --account "Abacco Technology" --name "Admin" --email you@example.com
// The password is read from ADMIN_PASSWORD or typed at the prompt (never a CLI flag).
process.env.TZ = 'UTC';
const { default: prisma } = await import('../src/prisma/client.js');
const { hashPassword } = await import('../src/modules/auth/auth.service.js');
const { bootstrapAccount } = await import('../src/modules/account/account.bootstrap.js');
const { passwordRule } = await import('../src/modules/auth/auth.validator.js');
const { ask, askHidden, argValue } = await import('./prompt.js');

try {
  if ((await prisma.user.count()) > 0) {
    console.error('A primary account already exists. Use "npm run reset-password" to change its password.');
    process.exit(1);
  }
  const accountName = argValue('account') ?? (await ask('Company / account name: '));
  const name = argValue('name') ?? (await ask('Your name: '));
  const email = (argValue('email') ?? (await ask('Login email: '))).toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? (await askHidden('Password (min 10 chars, letters + a number): '));
  const check = passwordRule.safeParse(password);
  if (!check.success) {
    console.error(check.error.issues[0].message);
    process.exit(1);
  }
  const passwordHash = await hashPassword(password);
  const { account, user } = await prisma.$transaction((tx) => bootstrapAccount(tx, { accountName, name, email, passwordHash }));
  console.log(`Created account "${account.name}" and user ${user.email} with Sales ID SID-001.`);
} finally {
  await prisma.$disconnect();
}
