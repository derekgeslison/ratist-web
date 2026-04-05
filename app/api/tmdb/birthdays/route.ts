import { NextResponse } from "next/server";

const API_KEY = process.env.TMDB_API_KEY;

interface TMDBPerson {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string;
  birthday: string | null;
  popularity: number;
}

export async function GET() {
  try {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    // Fetch multiple pages of popular people and filter by birthday
    const pages = [1, 2, 3, 4, 5];
    const results: TMDBPerson[] = [];

    for (const page of pages) {
      const res = await fetch(
        `https://api.themoviedb.org/3/person/popular?api_key=${API_KEY}&page=${page}`,
        { next: { revalidate: 3600 } }
      );
      if (!res.ok) continue;
      const data = await res.json();

      // For each person, fetch their details to get birthday
      const personIds: number[] = (data.results ?? []).map((p: { id: number }) => p.id);

      const details = await Promise.all(
        personIds.map((id) =>
          fetch(`https://api.themoviedb.org/3/person/${id}?api_key=${API_KEY}`, { next: { revalidate: 86400 } })
            .then((r) => r.ok ? r.json() : null)
            .catch(() => null)
        )
      );

      for (const person of details) {
        if (!person?.birthday) continue;
        const bday = person.birthday; // "YYYY-MM-DD"
        if (bday.slice(5) === `${month}-${day}`) {
          const birthYear = parseInt(bday.slice(0, 4));
          const age = today.getFullYear() - birthYear;
          results.push({
            id: person.id,
            name: person.name,
            profile_path: person.profile_path,
            known_for_department: person.known_for_department ?? "Acting",
            birthday: person.birthday,
            popularity: person.popularity ?? 0,
          });
        }
      }

      // Stop early if we have enough
      if (results.length >= 10) break;
    }

    // Sort by popularity and add age
    const birthdays = results
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 12)
      .map((p) => ({
        id: p.id,
        name: p.name,
        profilePath: p.profile_path,
        department: p.known_for_department,
        birthday: p.birthday,
        age: p.birthday ? today.getFullYear() - parseInt(p.birthday.slice(0, 4)) : null,
      }));

    return NextResponse.json({ birthdays });
  } catch (err) {
    console.error("Birthdays error:", err);
    return NextResponse.json({ birthdays: [] });
  }
}
