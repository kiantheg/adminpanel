import { NextResponse } from "next/server";
import {
  type CaptionStatRow,
  type CaptionStatisticsData,
  formatVoteValueLabel,
  type RatingTrendPoint,
  type RecentRatingActivity,
  type VoteDistributionBucket,
} from "@/lib/caption-statistics";

type CaptionVoteRow = {
  caption_id: string;
  created_datetime_utc: string | null;
  profile_id: string | null;
  vote_value: number;
};

type CaptionDetailRow = {
  content: string | null;
  id: string;
  image_id: string | null;
};

type ImageDetailRow = {
  id: string;
  url: string | null;
};

type Aggregate = {
  count: number;
  latestVoteAt: string | null;
  negativeVotes: number;
  positiveVotes: number;
  sum: number;
  sumSquares: number;
};

type CacheEntry = {
  data: CaptionStatisticsData;
  timestamp: number;
};

const PAGE_SIZE = 1000;
const CACHE_TTL_MS = 60_000;
let analyticsCache: CacheEntry | null = null;

function requirePublicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return { anonKey, url };
}

async function supabaseRead<T>(path: string, preferCount = false) {
  const { anonKey, url } = requirePublicSupabaseConfig();

  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      ...(preferCount ? { Prefer: "count=exact" } : {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Supabase read failed for ${path}: ${response.status} ${response.statusText}`);
  }

  const rows = (await response.json()) as T;
  const contentRange = response.headers.get("content-range");
  const total = contentRange?.includes("/") ? Number(contentRange.split("/")[1]) : null;

  return { rows, total };
}

function encodeInFilter(values: string[]) {
  return values.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(",");
}

async function fetchAllCaptionVotes() {
  const firstPage = await supabaseRead<CaptionVoteRow[]>(
    `caption_votes?select=caption_id,profile_id,vote_value,created_datetime_utc&order=created_datetime_utc.desc.nullslast&limit=${PAGE_SIZE}&offset=0`,
    true,
  );

  const total = firstPage.total ?? firstPage.rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (pageCount === 1) {
    return firstPage.rows;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: pageCount - 1 }, async (_value, index) => {
      const pageIndex = index + 1;
      const offset = pageIndex * PAGE_SIZE;
      const result = await supabaseRead<CaptionVoteRow[]>(
        `caption_votes?select=caption_id,profile_id,vote_value,created_datetime_utc&order=created_datetime_utc.desc.nullslast&limit=${PAGE_SIZE}&offset=${offset}`,
      );
      return result.rows;
    }),
  );

  return [firstPage.rows, ...remainingPages].flat();
}

async function fetchCaptionCount() {
  const result = await supabaseRead<Array<{ id: string }>>("captions?select=id&limit=1", true);
  return result.total ?? 0;
}

async function fetchCaptionDetails(captionIds: string[]) {
  if (captionIds.length === 0) {
    return new Map<string, CaptionDetailRow>();
  }

  const result = await supabaseRead<CaptionDetailRow[]>(
    `captions?select=id,content,image_id&id=in.(${encodeURIComponent(encodeInFilter(captionIds))})`,
  );

  return new Map(result.rows.map((row) => [row.id, row]));
}

async function fetchImageDetails(imageIds: string[]) {
  if (imageIds.length === 0) {
    return new Map<string, ImageDetailRow>();
  }

  const result = await supabaseRead<ImageDetailRow[]>(
    `images?select=id,url&id=in.(${encodeURIComponent(encodeInFilter(imageIds))})`,
  );

  return new Map(result.rows.map((row) => [row.id, row]));
}

function buildTrend(votes: CaptionVoteRow[]): RatingTrendPoint[] {
  const today = new Date();
  const counts = new Map<string, number>();

  for (const vote of votes) {
    if (!vote.created_datetime_utc) continue;
    const day = vote.created_datetime_utc.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  return Array.from({ length: 14 }, (_value, index) => {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (13 - index)));
    const day = date.toISOString().slice(0, 10);
    return {
      count: counts.get(day) ?? 0,
      day,
      label: day.slice(5),
    };
  });
}

function buildDistribution(votes: CaptionVoteRow[], totalRatings: number): VoteDistributionBucket[] {
  const counts = new Map<number, number>();

  for (const vote of votes) {
    counts.set(vote.vote_value, (counts.get(vote.vote_value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([value, count]) => ({
      count,
      label: formatVoteValueLabel(value),
      percentage: totalRatings > 0 ? (count / totalRatings) * 100 : 0,
      value,
    }));
}

function finalizeRows(
  captionIds: string[],
  aggregates: Map<string, Aggregate>,
  captionDetails: Map<string, CaptionDetailRow>,
  imageDetails: Map<string, ImageDetailRow>,
) {
  return captionIds
    .map((captionId) => {
      const aggregate = aggregates.get(captionId);
      if (!aggregate) return null;

      const detail = captionDetails.get(captionId);
      const image = detail?.image_id ? imageDetails.get(detail.image_id) : null;
      const averageVote = aggregate.sum / aggregate.count;
      const meanSquares = aggregate.sumSquares / aggregate.count;
      const variance = Math.max(0, meanSquares - averageVote ** 2);

      return {
        averageVote,
        captionId,
        content: detail?.content ?? "(caption content unavailable)",
        imageId: detail?.image_id ?? null,
        imageUrl: image?.url ?? null,
        latestVoteAt: aggregate.latestVoteAt,
        negativeVotes: aggregate.negativeVotes,
        positiveVotes: aggregate.positiveVotes,
        ratingCount: aggregate.count,
        variance,
      } satisfies CaptionStatRow;
    })
    .filter((row): row is CaptionStatRow => row !== null);
}

async function computeCaptionStatistics(): Promise<CaptionStatisticsData> {
  if (analyticsCache && Date.now() - analyticsCache.timestamp < CACHE_TTL_MS) {
    return analyticsCache.data;
  }

  const [votes, totalCaptions] = await Promise.all([fetchAllCaptionVotes(), fetchCaptionCount()]);

  const totalRatingsSubmitted = votes.length;
  const uniqueRaters = new Set<string>();
  const aggregates = new Map<string, Aggregate>();

  for (const vote of votes) {
    if (vote.profile_id) {
      uniqueRaters.add(vote.profile_id);
    }

    const aggregate = aggregates.get(vote.caption_id) ?? {
      count: 0,
      latestVoteAt: null,
      negativeVotes: 0,
      positiveVotes: 0,
      sum: 0,
      sumSquares: 0,
    };

    aggregate.count += 1;
    aggregate.sum += vote.vote_value;
    aggregate.sumSquares += vote.vote_value ** 2;
    if (vote.vote_value > 0) aggregate.positiveVotes += 1;
    if (vote.vote_value < 0) aggregate.negativeVotes += 1;
    if (!aggregate.latestVoteAt || (vote.created_datetime_utc && vote.created_datetime_utc > aggregate.latestVoteAt)) {
      aggregate.latestVoteAt = vote.created_datetime_utc;
    }

    aggregates.set(vote.caption_id, aggregate);
  }

  const captionsWithRatings = aggregates.size;
  const unratedCaptions = Math.max(0, totalCaptions - captionsWithRatings);
  const averageRating =
    totalRatingsSubmitted > 0 ? votes.reduce((sum, vote) => sum + vote.vote_value, 0) / totalRatingsSubmitted : 0;

  const aggregateEntries = [...aggregates.entries()].map(([captionId, aggregate]) => ({
    aggregate,
    averageVote: aggregate.sum / aggregate.count,
    captionId,
    variance: Math.max(0, aggregate.sumSquares / aggregate.count - (aggregate.sum / aggregate.count) ** 2),
  }));

  const minMeaningfulVotes = 3;
  const minDisagreementVotes = 4;
  const meaningfulEntries = aggregateEntries.filter((entry) => entry.aggregate.count >= minMeaningfulVotes);
  const disagreementEntries = aggregateEntries.filter((entry) => entry.aggregate.count >= minDisagreementVotes);
  const coverageEntries = aggregateEntries.filter((entry) => entry.aggregate.count >= 2);

  const highestRatedIds = [...meaningfulEntries]
    .sort((a, b) => b.averageVote - a.averageVote || b.aggregate.count - a.aggregate.count)
    .slice(0, 8)
    .map((entry) => entry.captionId);
  const lowestRatedIds = [...meaningfulEntries]
    .sort((a, b) => a.averageVote - b.averageVote || b.aggregate.count - a.aggregate.count)
    .slice(0, 8)
    .map((entry) => entry.captionId);
  const mostRatedIds = [...aggregateEntries]
    .sort((a, b) => b.aggregate.count - a.aggregate.count || b.averageVote - a.averageVote)
    .slice(0, 8)
    .map((entry) => entry.captionId);
  const lowestVolumeMeaningfulIds = [...coverageEntries]
    .sort((a, b) => a.aggregate.count - b.aggregate.count || b.averageVote - a.averageVote)
    .slice(0, 8)
    .map((entry) => entry.captionId);
  const highestDisagreementIds = [...disagreementEntries]
    .sort((a, b) => b.variance - a.variance || b.aggregate.count - a.aggregate.count)
    .slice(0, 8)
    .map((entry) => entry.captionId);

  const recentVotes = [...votes]
    .filter((vote) => vote.created_datetime_utc)
    .sort((a, b) => (b.created_datetime_utc ?? "").localeCompare(a.created_datetime_utc ?? ""))
    .slice(0, 10);

  const captionIdsToFetch = [
    ...new Set([
      ...highestRatedIds,
      ...lowestRatedIds,
      ...mostRatedIds,
      ...lowestVolumeMeaningfulIds,
      ...highestDisagreementIds,
      ...recentVotes.map((vote) => vote.caption_id),
    ]),
  ];

  const captionDetails = await fetchCaptionDetails(captionIdsToFetch);
  const imageIds = [
    ...new Set(
      [...captionDetails.values()]
        .map((detail) => detail.image_id)
        .filter((imageId): imageId is string => Boolean(imageId)),
    ),
  ];
  const imageDetails = await fetchImageDetails(imageIds);

  const recentActivity: RecentRatingActivity[] = recentVotes.map((vote) => {
    const detail = captionDetails.get(vote.caption_id);
    const image = detail?.image_id ? imageDetails.get(detail.image_id) : null;

    return {
      captionId: vote.caption_id,
      content: detail?.content ?? "(caption content unavailable)",
      createdAt: vote.created_datetime_utc,
      imageId: detail?.image_id ?? null,
      imageUrl: image?.url ?? null,
      profileId: vote.profile_id,
      voteValue: vote.vote_value,
    };
  });

  const data: CaptionStatisticsData = {
    averageRating,
    captionsWithRatings,
    distribution: buildDistribution(votes, totalRatingsSubmitted),
    highestDisagreement: finalizeRows(highestDisagreementIds, aggregates, captionDetails, imageDetails),
    highestRated: finalizeRows(highestRatedIds, aggregates, captionDetails, imageDetails),
    lowestRated: finalizeRows(lowestRatedIds, aggregates, captionDetails, imageDetails),
    lowestVolumeMeaningful: finalizeRows(lowestVolumeMeaningfulIds, aggregates, captionDetails, imageDetails),
    mostRated: finalizeRows(mostRatedIds, aggregates, captionDetails, imageDetails),
    ratingTrend: buildTrend(votes),
    recentActivity,
    totalCaptions,
    totalRatedCaptions: captionsWithRatings,
    totalRatingsSubmitted,
    uniqueRaters: uniqueRaters.size,
    unratedCaptions,
  };

  analyticsCache = {
    data,
    timestamp: Date.now(),
  };

  return data;
}

export async function GET() {
  try {
    const data = await computeCaptionStatistics();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to compute caption statistics.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
