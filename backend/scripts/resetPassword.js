// Sets a new password for a user and signs out all of their sessions.
//   npm run reset-password -- --email you@example.com
process.env.TZ = 'UTC';
const { default: prisma } = await import('../src/prisma/client.js');
const { hashPassword } = await import('../src/modules/auth/auth.service.js');
const { passwordRule } = await import('../src/modules/auth/auth.validator.js');
const { ask, askHidden, argValue } = await import('./prompt.js');

try {
  const email = (argValue('email') ?? (await ask('Login email: '))).toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error('No user with that email.');
    process.exit(1);
  }
  const password = process.env.NEW_PASSWORD ?? (await askHidden('New password: '));
  const check = passwordRule.safeParse(password);
  if (!check.success) {
    console.error(check.error.issues[0].message);
    process.exit(1);
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null } }),
    prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'password_changed' } }),
    prisma.auditLog.create({ data: { accountId: user.accountId, userId: user.id, action: 'auth.password_reset_cli', entityType: 'User', entityId: user.id } }),
  ]);
  console.log(`Password updated for ${email}. All sessions were signed out.`);
} finally {
  await prisma.$disconnect();
}
