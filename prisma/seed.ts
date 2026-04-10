import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Forum categories have been removed — forum now uses thread types instead.
  console.log("No seed data needed.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
