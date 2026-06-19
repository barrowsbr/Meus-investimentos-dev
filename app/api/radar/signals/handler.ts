import { NextResponse } from "next/server";
import { fetchPolymarket } from "@/lib/polymarket";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Country signals — filtra eventos do Polymarket relevantes para um país.
// ─────────────────────────────────────────────────────────────────────────────

interface Signal {
  title: string;
  url: string;
  odds: { outcome: string; percent: number }[];
  volume: number;
  daysLeft: number | null;
  category: string;
}

const COUNTRY_KW: Record<string, string[]> = {
  "EUA": ["united states", "america", "trump", "harris", "biden", "congress", "us ", "u.s.", "american", "federal reserve", "fed "],
  "Brasil": ["brazil", "brasil", "lula", "bolsonaro", "brazilian"],
  "China": ["china", "chinese", "xi jinping", "beijing", "prc"],
  "Rússia": ["russia", "russian", "putin", "moscow", "kremlin"],
  "Ucrânia": ["ukraine", "ukrainian", "kyiv", "zelensky"],
  "Israel": ["israel", "israeli", "gaza", "hamas", "netanyahu", "west bank"],
  "Taiwan": ["taiwan", "taiwanese"],
  "Turquia": ["turkey", "turkish", "erdogan", "ankara"],
  "Argentina": ["argentina", "argentine", "milei", "buenos aires"],
  "México": ["mexico", "mexican"],
  "Índia": ["india", "indian", "modi", "delhi"],
  "Reino Unido": ["united kingdom", "uk ", "britain", "british", "london", "starmer"],
  "França": ["france", "french", "macron", "paris"],
  "Alemanha": ["germany", "german", "berlin", "scholz"],
  "Japão": ["japan", "japanese", "tokyo", "boj"],
  "Coreia do Sul": ["south korea", "korean", "seoul"],
  "Canadá": ["canada", "canadian", "ottawa", "trudeau"],
  "Austrália": ["australia", "australian", "sydney"],
  "África do Sul": ["south africa", "south african"],
  "Egito": ["egypt", "egyptian", "cairo"],
  "Nigéria": ["nigeria", "nigerian", "lagos"],
  "Venezuela": ["venezuela", "venezuelan", "maduro", "caracas"],
  "Colômbia": ["colombia", "colombian", "bogota"],
  "Chile": ["chile", "chilean", "santiago"],
  "Peru": ["peru", "peruvian", "lima"],
  "Indonésia": ["indonesia", "indonesian", "jakarta"],
  "Malásia": ["malaysia", "malaysian"],
  "Tailândia": ["thailand", "thai", "bangkok"],
  "Filipinas": ["philippines", "filipino", "manila"],
  "Paquistão": ["pakistan", "pakistani"],
  "Arábia Saudita": ["saudi", "riyadh"],
  "Emirados": ["uae", "emirates", "dubai", "abu dhabi"],
  "Polônia": ["poland", "polish", "warsaw"],
  "Hungria": ["hungary", "hungarian", "orban"],
  "Grécia": ["greece", "greek", "athens"],
  "Marrocos": ["morocco", "moroccan"],
  "Singapura": ["singapore"],
  "Hong Kong": ["hong kong"],
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") ?? "";

  if (!country) {
    return NextResponse.json({ error: "country param required" }, { status: 400 });
  }

  const keywords = COUNTRY_KW[country];
  if (!keywords || keywords.length === 0) {
    return NextResponse.json({ country, signals: [], count: 0 });
  }

  try {
    const data = await fetchPolymarket();
    const allEvents: (Signal & { _title: string })[] = [];

    for (const [cat, events] of Object.entries(data.categories ?? {})) {
      for (const ev of events) {
        allEvents.push({
          _title: ev.title.toLowerCase(),
          title: ev.title,
          url: ev.url,
          odds: ev.odds.map(o => ({ outcome: o.outcome, percent: o.percent })),
          volume: ev.volume,
          daysLeft: ev.days_left,
          category: cat,
        });
      }
    }

    const matched: Signal[] = [];
    for (const ev of allEvents) {
      if (keywords.some(kw => ev._title.includes(kw))) {
        const { _title: _, ...signal } = ev;
        matched.push(signal);
      }
    }

    matched.sort((a, b) => b.volume - a.volume);

    return NextResponse.json({
      country,
      signals: matched.slice(0, 10),
      count: matched.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg, signals: [] }, { status: 500 });
  }
}
