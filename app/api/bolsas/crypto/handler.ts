export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

interface CryptoAsset {
  id: string;
  symbol: string;
  name: string;
  image: string;
  price: number;
  marketCap: number;
  rank: number;
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  volume24h: number;
  sparkline: number[];
  ath: number;
  athChangePct: number;
}

interface CoinGeckoMarket {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  price_change_percentage_1h_in_currency: number | null;
  price_change_percentage_24h: number | null;
  price_change_percentage_7d_in_currency: number | null;
  total_volume: number;
  sparkline_in_7d: { price: number[] } | null;
  ath: number;
  ath_change_percentage: number;
}

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=12&page=1&sparkline=true&price_change_percentage=1h,24h,7d";

export async function GET() {
  try {
    const res = await fetch(COINGECKO_URL, {
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 120 },
      headers: {
        "User-Agent": "MeusInvestimentos/1.0",
      },
    });

    if (!res.ok) {
      throw new Error(`CoinGecko responded with status ${res.status}`);
    }

    const data: CoinGeckoMarket[] = await res.json();

    const assets: CryptoAsset[] = data.map((coin) => ({
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      image: coin.image,
      price: coin.current_price,
      marketCap: coin.market_cap,
      rank: coin.market_cap_rank,
      change1h: coin.price_change_percentage_1h_in_currency,
      change24h: coin.price_change_percentage_24h,
      change7d: coin.price_change_percentage_7d_in_currency,
      volume24h: coin.total_volume,
      sparkline: coin.sparkline_in_7d?.price ?? [],
      ath: coin.ath,
      athChangePct: coin.ath_change_percentage,
    }));

    const totalMarketCap = assets.reduce((sum, a) => sum + a.marketCap, 0);
    const btcMarketCap =
      assets.find((a) => a.id === "bitcoin")?.marketCap ?? 0;
    const btcDominance = totalMarketCap > 0 ? btcMarketCap / totalMarketCap : 0;

    return NextResponse.json({ assets, totalMarketCap, btcDominance });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch crypto data";
    return NextResponse.json(
      { assets: [], error: message },
      { status: 500 },
    );
  }
}
