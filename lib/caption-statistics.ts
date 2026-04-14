export type VoteDistributionBucket = {
  count: number;
  label: string;
  percentage: number;
  value: number;
};

export type RatingTrendPoint = {
  count: number;
  day: string;
  label: string;
};

export type CaptionStatRow = {
  averageVote: number;
  captionId: string;
  content: string;
  imageId: string | null;
  imageUrl: string | null;
  latestVoteAt: string | null;
  negativeVotes: number;
  positiveVotes: number;
  ratingCount: number;
  variance: number;
};

export type RecentRatingActivity = {
  captionId: string;
  content: string;
  createdAt: string | null;
  imageId: string | null;
  imageUrl: string | null;
  profileId: string | null;
  voteValue: number;
};

export type CaptionStatisticsData = {
  averageRating: number;
  captionsWithRatings: number;
  distribution: VoteDistributionBucket[];
  highestDisagreement: CaptionStatRow[];
  highestRated: CaptionStatRow[];
  lowestRated: CaptionStatRow[];
  lowestVolumeMeaningful: CaptionStatRow[];
  mostRated: CaptionStatRow[];
  ratingTrend: RatingTrendPoint[];
  recentActivity: RecentRatingActivity[];
  totalCaptions: number;
  totalRatedCaptions: number;
  totalRatingsSubmitted: number;
  uniqueRaters: number;
  unratedCaptions: number;
};

export function formatVoteValueLabel(value: number) {
  if (value === 1) return "Positive (+1)";
  if (value === -1) return "Negative (-1)";
  if (value === 0) return "Neutral (0)";
  if (value > 1) return `Positive (+${value})`;
  if (value < -1) return `Negative (${value})`;
  return `Rating ${value}`;
}
