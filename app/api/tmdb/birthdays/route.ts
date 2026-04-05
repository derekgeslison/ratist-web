import { NextResponse } from "next/server";

const API_KEY = process.env.TMDB_API_KEY;

export const revalidate = 3600; // cache for 1 hour

export async function GET() {
  try {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const todayStr = `${month}-${day}`;

    const results: { id: number; name: string; profilePath: string | null; department: string; birthday: string; age: number; popularity: number }[] = [];

    // Fetch up to 30 pages of popular people (600 people, ~1.6 expected birthday matches)
    // Batch detail requests in groups of 20 to avoid overwhelming TMDB
    for (let page = 1; page <= 30 && results.length < 12; page++) {
      const listRes = await fetch(
        `https://api.themoviedb.org/3/person/popular?api_key=${API_KEY}&page=${page}`,
        { next: { revalidate: 86400 } }
      );
      if (!listRes.ok) continue;
      const listData = await listRes.json();
      const people = listData.results ?? [];

      const details = await Promise.all(
        people.map((p: { id: number }) =>
          fetch(`https://api.themoviedb.org/3/person/${p.id}?api_key=${API_KEY}`, { next: { revalidate: 86400 } })
            .then((r) => r.ok ? r.json() : null)
            .catch(() => null)
        )
      );

      for (const person of details) {
        if (!person?.birthday) continue;
        if (person.birthday.slice(5) === todayStr && !person.deathday) {
          results.push({
            id: person.id,
            name: person.name,
            profilePath: person.profile_path,
            department: person.known_for_department ?? "Acting",
            birthday: person.birthday,
            age: today.getFullYear() - parseInt(person.birthday.slice(0, 4)),
            popularity: person.popularity ?? 0,
          });
        }
      }
    }

    const birthdays = results
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 12);

    return NextResponse.json({ birthdays });
  } catch (err) {
    console.error("Birthdays error:", err);
    return NextResponse.json({ birthdays: [] });
  }
}
