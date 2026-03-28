import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const categories = [
    { name: "General Discussion", slug: "general", description: "Anything and everything movies", sortOrder: 1 },
    { name: "Reviews & Ratings", slug: "reviews", description: "Share your full reviews and ratings", sortOrder: 2 },
    { name: "Director Talk", slug: "directors", description: "Deep dives into directors and their filmographies", sortOrder: 3 },
    { name: "Hidden Gems", slug: "hidden-gems", description: "Underrated films that deserve more attention", sortOrder: 4 },
    { name: "Recommendations", slug: "recommendations", description: "Ask for and give movie recommendations", sortOrder: 5 },
    { name: "Awards & News", slug: "awards-news", description: "Oscars, film festivals, industry news", sortOrder: 6 },
  ];

  for (const cat of categories) {
    await prisma.forumCategory.upsert({
      where: { slug: cat.slug },
      create: cat,
      update: {},
    });
    console.log("Seeded:", cat.name);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
