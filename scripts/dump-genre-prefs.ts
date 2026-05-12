import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const names = ["Derek Geslison", "Jeremy Geslison"];
  for (const name of names) {
    const u = await prisma.user.findFirst({ where: { name }, include: { profile: true } });
    if (!u?.profile) { console.log(name, "no profile"); continue; }
    const p = u.profile as Record<string, number | null>;
    const genreKeys = ["genreAction","genreHorror","genreDrama","genreHistorical","genreScifi","genreThriller","genreComedy","genreBookAdapt","genreFantasy","genreRomance","genreDocumentary","genreFamily","genreFilmNoir","genreMusical","genreBiopic","genreCrime","genreWestern","genreMystery"];
    console.log(`\n=== ${name} ===`);
    let nz = 0;
    for (const k of genreKeys) {
      const v = p[k];
      if (v != null && v > 0) { console.log(`  ${k}: ${v.toFixed(2)}`); nz++; }
    }
    console.log(`  (${nz}/${genreKeys.length} > 0)`);
  }
}
void main().finally(() => prisma.$disconnect());
