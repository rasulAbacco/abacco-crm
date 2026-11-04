// Applies the real migrations to the test database before the suite runs
// (the same "prisma migrate deploy" used in production).
import { execSync } from "node:child_process";

export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgresql://abaccotechnology:root@localhost:5432/abacco_crm_test?schema=public";

  if (!/test/.test(url)) {
    throw new Error(
      'Refusing to run tests against a database whose name does not contain "test"',
    );
  }

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: url,
    },
  });
  if (!/test/.test(url))
    throw new Error(
      'Refusing to run tests against a database whose name does not contain "test".',
    );
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
