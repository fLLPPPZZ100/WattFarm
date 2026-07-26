import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const email = 'redediary@gmail.com';
const amount = 32299;

const user = await prisma.user.findFirst({ where: { email } });

if (!user) {
  console.log('User not found:', email);
  console.log('Login first via the app to create the user record.');
  process.exit(1);
}

const updated = await prisma.user.update({
  where: { id: user.id },
  data: { vltBalance: amount },
});

console.log(`Balance set to ${updated.vltBalance} VLT for ${updated.email}`);

await prisma.$disconnect();