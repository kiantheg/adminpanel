"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { AdminImage } from "@/components/admin/admin-image";
import { EmptyState, PageHeader, StatusBanner } from "@/components/admin/ui";
import { useCaptionStatistics } from "@/components/admin/use-caption-statistics";
import type { CaptionStatRow, RecentRatingActivity, VoteDistributionBucket } from "@/lib/caption-statistics";
import { formatDate, shortId } from "@/lib/admin-ui";

function formatAverage(value: number) {
  return value.toFixed(2);
}

function formatPercentage(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatVoteToken(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function formatCount(value: number) {
  return value.toLocaleString();
}

type SentimentRow = {
  count: number;
  description: string;
  isMostCommon: boolean;
  key: "negative" | "neutral" | "positive";
  label: string;
  percentage: number;
};

function buildDistributionSummary(distribution: VoteDistributionBucket[]) {
  const total = distribution.reduce((sum, bucket) => sum + bucket.count, 0);
  const negativeCount = distribution.filter((bucket) => bucket.value < 0).reduce((sum, bucket) => sum + bucket.count, 0);
  const neutralCount = distribution.filter((bucket) => bucket.value === 0).reduce((sum, bucket) => sum + bucket.count, 0);
  const positiveCount = distribution.filter((bucket) => bucket.value > 0).reduce((sum, bucket) => sum + bucket.count, 0);
  const extendedScale = distribution.filter((bucket) => Math.abs(bucket.value) > 1).sort((a, b) => a.value - b.value);
  const extendedCount = extendedScale.reduce((sum, bucket) => sum + bucket.count, 0);

  const rows: SentimentRow[] = [
    {
      key: "negative",
      label: "Negative",
      description: "Ratings below zero.",
      count: negativeCount,
      percentage: total > 0 ? (negativeCount / total) * 100 : 0,
      isMostCommon: false,
    },
    {
      key: "neutral",
      label: "Neutral",
      description: "Zero-value ratings.",
      count: neutralCount,
      percentage: total > 0 ? (neutralCount / total) * 100 : 0,
      isMostCommon: false,
    },
    {
      key: "positive",
      label: "Positive",
      description:
        extendedCount > 0
          ? "Positive ratings, including rare higher positive values."
          : "Ratings above zero.",
      count: positiveCount,
      percentage: total > 0 ? (positiveCount / total) * 100 : 0,
      isMostCommon: false,
    },
  ];

  const mostCommonKey = rows.reduce(
    (best, row) => (row.count > best.count ? row : best),
    rows[0],
  ).key;

  return {
    extendedCount,
    extendedPercentage: total > 0 ? (extendedCount / total) * 100 : 0,
    extendedScale,
    negativePercentage: total > 0 ? (negativeCount / total) * 100 : 0,
    neutralPercentage: total > 0 ? (neutralCount / total) * 100 : 0,
    positivePercentage: total > 0 ? (positiveCount / total) * 100 : 0,
    rows: rows.map((row) => ({ ...row, isMostCommon: row.key === mostCommonKey })),
  };
}

function SummaryCards({
  averageRating,
  captionsWithRatings,
  totalRatingsSubmitted,
  uniqueRaters,
}: {
  averageRating: number;
  captionsWithRatings: number;
  totalRatingsSubmitted: number;
  uniqueRaters: number;
}) {
  const items = [
    { label: "Ratings Submitted", value: totalRatingsSubmitted.toLocaleString() },
    { label: "Average Vote", value: formatAverage(averageRating) },
    { label: "Captions Rated", value: captionsWithRatings.toLocaleString() },
    { label: "Unique Raters", value: uniqueRaters.toLocaleString() },
  ];

  return (
    <div className="statsGrid analyticsStatsGrid">
      {items.map((item) => (
        <article key={item.label} className="statCard">
          <p className="statLabel">{item.label}</p>
          <p className="statValue">{item.value}</p>
        </article>
      ))}
    </div>
  );
}

function DistributionCard({
  distribution,
}: {
  distribution: VoteDistributionBucket[];
}) {
  const summary = buildDistributionSummary(distribution);
  const scaleDescription =
    summary.extendedScale.length > 0
      ? `Most ratings use the standard -1 / 0 / +1 scale. The remaining ${formatPercentage(summary.extendedPercentage)} use higher positive values, which are grouped into Positive here for readability.`
      : "Ratings use the standard -1 / 0 / +1 scale.";

  return (
    <article className="panelCard analyticsPanelCard">
      <div className="panelCardHeader analyticsPanelHeader">
        <div>
          <p className="eyebrow">Distribution</p>
          <h2>How users are rating captions</h2>
          <p className="supporting">{scaleDescription}</p>
        </div>
      </div>
      <div className="analyticsSummaryStrip">
        <article className="analyticsMiniCard">
          <p className="statLabel">Most common rating</p>
          <p className="analyticsMiniValue">{summary.rows.find((row) => row.isMostCommon)?.label ?? "-"}</p>
        </article>
        <article className="analyticsMiniCard">
          <p className="statLabel">Positive vs negative</p>
          <p className="analyticsMiniValue">
            {formatPercentage(summary.positivePercentage)} positive
          </p>
          <p className="supporting">{formatPercentage(summary.negativePercentage)} negative</p>
        </article>
        <article className="analyticsMiniCard">
          <p className="statLabel">{summary.extendedScale.length > 0 ? "Extended scale" : "Neutral share"}</p>
          <p className="analyticsMiniValue">
            {summary.extendedScale.length > 0
              ? `${summary.extendedCount.toLocaleString()} grouped votes`
              : formatPercentage(summary.neutralPercentage)}
          </p>
          <p className="supporting">
            {summary.extendedScale.length > 0
              ? `${formatPercentage(summary.extendedPercentage)} of ratings use values beyond +1.`
              : "Share of ratings at zero."}
          </p>
        </article>
      </div>
      <div className="analyticsBarList">
        {summary.rows.map((row) => (
          <div
            key={row.key}
            className={
              row.isMostCommon
                ? `analyticsBarRow analyticsBarRow${row.key[0].toUpperCase()}${row.key.slice(1)} analyticsBarRowFeatured`
                : `analyticsBarRow analyticsBarRow${row.key[0].toUpperCase()}${row.key.slice(1)}`
            }
          >
            <div className="analyticsBarLabelBlock">
              <div className="analyticsBarTitleRow">
                <span className={`analyticsToneDot analyticsToneDot${row.key[0].toUpperCase()}${row.key.slice(1)}`} />
                <span className="cellTitle">{row.label}</span>
                {row.isMostCommon ? <span className="analyticsMostCommonBadge">Most common</span> : null}
              </div>
              <p className="supporting analyticsBarDescription">{row.description}</p>
            </div>
            <div className="analyticsBarTrack">
              <span
                className={`analyticsBarFill analyticsBarFill${row.key[0].toUpperCase()}${row.key.slice(1)}`}
                style={{ width: `${row.count > 0 ? Math.max(row.percentage, 2) : 0}%` }}
              />
            </div>
            <div className="analyticsBarStats">
              <strong>{row.count.toLocaleString()}</strong>
              <span className="cellSubtle">{formatPercentage(row.percentage)}</span>
            </div>
          </div>
        ))}
      </div>
      {summary.extendedScale.length > 0 && (
        <div className="analyticsExtendedScaleNote">
          <p className="supporting">
            Rare extended values are present in the underlying data and are grouped into Positive above.
          </p>
          <div className="analyticsValueChipList">
            {summary.extendedScale.map((bucket) => (
              <span key={bucket.value} className="analyticsValueChip">
                {formatVoteToken(bucket.value)} <strong>{bucket.count.toLocaleString()}</strong>
              </span>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function TrendCard({
  trend,
}: {
  trend: Array<{ count: number; day: string; label: string }>;
}) {
  const maxCount = Math.max(...trend.map((point) => point.count), 1);
  const totalCount = trend.reduce((sum, point) => sum + point.count, 0);
  const averagePerDay = trend.length > 0 ? totalCount / trend.length : 0;
  const recentWindowTotal = trend.slice(-7).reduce((sum, point) => sum + point.count, 0);
  const peakPoint = trend.reduce((best, point) => (point.count > best.count ? point : best), trend[0] ?? null);
  const latestPoint = trend.at(-1) ?? null;

  return (
    <article className="panelCard analyticsPanelCard">
      <div className="panelCardHeader analyticsPanelHeader">
        <div>
          <p className="eyebrow">Recent activity</p>
          <h2>Ratings over time</h2>
          <p className="supporting">Daily rating volume across the last 14 days.</p>
        </div>
      </div>
      <div className="analyticsTrendSummary">
        <article className="analyticsMiniCard">
          <p className="statLabel">14-day total</p>
          <p className="analyticsMiniValue">{formatCount(totalCount)}</p>
          <p className="supporting">Ratings submitted across the visible window.</p>
        </article>
        <article className="analyticsMiniCard">
          <p className="statLabel">Daily average</p>
          <p className="analyticsMiniValue">{formatAverage(averagePerDay)}</p>
          <p className="supporting">Average ratings per day.</p>
        </article>
        <article className="analyticsMiniCard">
          <p className="statLabel">Peak day</p>
          <p className="analyticsMiniValue">
            {peakPoint ? `${peakPoint.label}` : "-"}
          </p>
          <p className="supporting">{peakPoint ? `${formatCount(peakPoint.count)} ratings` : "No trend data."}</p>
        </article>
      </div>
      <div className="trendChartCard">
        <div className="trendChartHeader">
          <p className="supporting">
            Last 7 days: <strong>{formatCount(recentWindowTotal)}</strong> ratings
          </p>
          <p className="supporting">
            Latest day: <strong>{latestPoint ? formatCount(latestPoint.count) : "0"}</strong>
          </p>
        </div>
        <div className="trendChart">
          {trend.map((point) => {
            const isPeak = peakPoint?.day === point.day;
            const isLatest = latestPoint?.day === point.day;

            return (
              <div key={point.day} className="trendBarGroup">
                <span
                  className={
                    isPeak
                      ? "trendBarCount trendBarCountPeak"
                      : isLatest
                        ? "trendBarCount trendBarCountLatest"
                        : "trendBarCount"
                  }
                >
                  {point.count}
                </span>
                <div
                  className={
                    isPeak ? "trendBarTrack trendBarTrackPeak" : isLatest ? "trendBarTrack trendBarTrackLatest" : "trendBarTrack"
                  }
                >
                  <span
                    className={isPeak ? "trendBarFill trendBarFillPeak" : isLatest ? "trendBarFill trendBarFillLatest" : "trendBarFill"}
                    style={{ height: `${(point.count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="trendBarLabel">{point.label}</span>
              </div>
            );
          })}
        </div>
        <p className="supporting">
          {peakPoint
            ? `Peak activity landed on ${peakPoint.label} with ${formatCount(peakPoint.count)} ratings.`
            : "No rating activity in the current window."}
        </p>
      </div>
    </article>
  );
}

function CoverageCard({
  highestRated,
  lowestRated,
  totalCaptions,
  totalRatedCaptions,
  unratedCaptions,
}: {
  highestRated: CaptionStatRow[];
  lowestRated: CaptionStatRow[];
  totalCaptions: number;
  totalRatedCaptions: number;
  unratedCaptions: number;
}) {
  const coveragePercentage = totalCaptions > 0 ? (totalRatedCaptions / totalCaptions) * 100 : 0;
  const gaugeStyle = {
    "--coverage-fill": `${coveragePercentage}%`,
  } as CSSProperties;

  return (
    <article className="panelCard analyticsPanelCard analyticsSummaryCard analyticsCoverageCard">
      <div>
        <p className="eyebrow">Coverage</p>
        <h2>Rating coverage snapshot</h2>
        <p className="supporting">How much of the caption catalog has actually been rated so far.</p>
      </div>

      <div className="analyticsCoverageHero">
        <div className="analyticsCoverageGauge" style={gaugeStyle}>
          <div className="analyticsCoverageGaugeInner">
            <strong>{formatPercentage(coveragePercentage)}</strong>
            <span>catalog rated</span>
          </div>
        </div>
        <div className="analyticsCoverageCopy">
          <p className="analyticsCoverageHeadline">{formatCount(totalRatedCaptions)} captions have at least one rating.</p>
          <p className="supporting">{formatCount(unratedCaptions)} captions are still unrated, so most of the catalog is untouched by user feedback.</p>
          <div className="analyticsCoverageMeter" aria-hidden="true">
            <span className="analyticsCoverageMeterRated" style={{ width: `${coveragePercentage}%` }} />
            <span className="analyticsCoverageMeterUnrated" style={{ width: `${Math.max(0, 100 - coveragePercentage)}%` }} />
          </div>
          <div className="analyticsCoverageLegend">
            <span>
              <i className="analyticsCoverageLegendSwatch analyticsCoverageLegendSwatchRated" />
              Rated {formatCount(totalRatedCaptions)}
            </span>
            <span>
              <i className="analyticsCoverageLegendSwatch analyticsCoverageLegendSwatchUnrated" />
              Unrated {formatCount(unratedCaptions)}
            </span>
          </div>
        </div>
      </div>

      <div className="analyticsCoverageStats">
        <article className="analyticsCoverageStatCard">
          <p className="statLabel">Catalog size</p>
          <p className="analyticsMiniValue">{formatCount(totalCaptions)}</p>
        </article>
        <article className="analyticsCoverageStatCard">
          <p className="statLabel">Best average</p>
          <p className="analyticsMiniValue">{highestRated[0] ? formatAverage(highestRated[0].averageVote) : "-"}</p>
          <p className="supporting">Best-performing rated caption.</p>
        </article>
        <article className="analyticsCoverageStatCard">
          <p className="statLabel">Worst average</p>
          <p className="analyticsMiniValue">{lowestRated[0] ? formatAverage(lowestRated[0].averageVote) : "-"}</p>
          <p className="supporting">Lowest-performing rated caption.</p>
        </article>
      </div>
    </article>
  );
}

function CaptionTable({
  rows,
  title,
  eyebrow,
  helperText,
}: {
  rows: CaptionStatRow[];
  title: string;
  eyebrow: string;
  helperText?: string;
}) {
  return (
    <article className="panelCard">
      <div className="panelCardHeader">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          {helperText && <p className="supporting">{helperText}</p>}
        </div>
      </div>
      <div className="tableCard">
        <table className="dataTable">
          <thead>
            <tr>
              <th>Caption</th>
              <th>Average</th>
              <th>Ratings</th>
              <th>Pos / Neg</th>
              <th>Variance</th>
              <th>Latest vote</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.captionId}>
                <td>
                  <div className="analyticsCaptionCell">
                    {row.imageUrl ? (
                      <AdminImage
                        src={row.imageUrl}
                        alt={`Image ${shortId(row.captionId)}`}
                        wrapperClassName="tableThumb"
                        compact
                      />
                    ) : null}
                    <div>
                      <p className="cellTitle">{row.content}</p>
                      <p className="cellSubtle">Caption {shortId(row.captionId)}</p>
                    </div>
                  </div>
                </td>
                <td>{formatAverage(row.averageVote)}</td>
                <td>{row.ratingCount}</td>
                <td>
                  {row.positiveVotes} / {row.negativeVotes}
                </td>
                <td>{row.variance.toFixed(3)}</td>
                <td>{formatDate(row.latestVoteAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function RecentActivityCard({ rows }: { rows: RecentRatingActivity[] }) {
  return (
    <article className="panelCard">
      <div className="panelCardHeader">
        <div>
          <p className="eyebrow">Live feed</p>
          <h2>Recent rating activity</h2>
        </div>
      </div>
      <div className="activityList">
        {rows.map((row) => (
          <div key={`${row.captionId}-${row.createdAt}-${row.profileId}`} className="activityRow">
            {row.imageUrl ? (
              <AdminImage
                src={row.imageUrl}
                alt={`Image ${shortId(row.captionId)}`}
                wrapperClassName="activityThumb"
                compact
              />
            ) : (
              <div className="thumbPlaceholder">No image</div>
            )}
            <div>
              <p className="activityTitle">{row.content}</p>
              <p className="supporting">
                Vote {row.voteValue > 0 ? "+1" : row.voteValue} by {shortId(row.profileId ?? "-")} ·{" "}
                {formatDate(row.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export function CaptionStatisticsDashboardSummary() {
  const { data, error, loading } = useCaptionStatistics();

  return (
    <section className="panelCard analyticsPanelCard analyticsDashboardSection">
      <div className="panelCardHeader analyticsPanelHeader">
        <div>
          <p className="eyebrow">Caption analytics</p>
          <h2>How ratings are trending</h2>
          <p className="supporting">A quick read on rating volume, vote quality, and recent rating flow.</p>
        </div>
        <Link href="/caption-statistics" className="secondaryLinkButton">
          Open full statistics
        </Link>
      </div>

      <StatusBanner kind="error" message={error} />

      {loading && <p className="supporting">Loading caption statistics…</p>}

      {data && (
        <div className="analyticsSectionStack">
          <SummaryCards
            averageRating={data.averageRating}
            captionsWithRatings={data.captionsWithRatings}
            totalRatingsSubmitted={data.totalRatingsSubmitted}
            uniqueRaters={data.uniqueRaters}
          />
          <div className="twoColumnGrid analyticsSectionGrid">
            <DistributionCard distribution={data.distribution} />
            <CoverageCard
              highestRated={data.highestRated}
              lowestRated={data.lowestRated}
              totalCaptions={data.totalCaptions}
              totalRatedCaptions={data.totalRatedCaptions}
              unratedCaptions={data.unratedCaptions}
            />
          </div>
        </div>
      )}
    </section>
  );
}

export function CaptionStatisticsPage() {
  const { data, error, loading } = useCaptionStatistics();

  return (
    <div className="pageContent analyticsPageContent">
      <PageHeader
        eyebrow="Analytics"
        title="Caption statistics"
        description="Operational insight into caption ratings, quality, coverage, and recent rating behavior."
      />

      <StatusBanner kind="error" message={error} onDismiss={() => {}} />

      {loading && (
        <section className="panelCard">
          <p className="supporting">Loading caption analytics…</p>
        </section>
      )}

      {data && data.totalRatingsSubmitted === 0 && (
        <EmptyState
          title="No caption ratings yet"
          description="Once users start rating captions, this page will show distribution, top captions, and recent activity."
        />
      )}

      {data && data.totalRatingsSubmitted > 0 && (
        <div className="analyticsSectionStack">
          <SummaryCards
            averageRating={data.averageRating}
            captionsWithRatings={data.captionsWithRatings}
            totalRatingsSubmitted={data.totalRatingsSubmitted}
            uniqueRaters={data.uniqueRaters}
          />

          <section className="statsGrid analyticsStatsGrid">
            <article className="statCard">
              <p className="statLabel">Total Captions</p>
              <p className="statValue">{data.totalCaptions.toLocaleString()}</p>
            </article>
            <article className="statCard">
              <p className="statLabel">Captions With Ratings</p>
              <p className="statValue">{data.totalRatedCaptions.toLocaleString()}</p>
            </article>
            <article className="statCard">
              <p className="statLabel">Unrated Captions</p>
              <p className="statValue">{data.unratedCaptions.toLocaleString()}</p>
            </article>
            <article className="statCard">
              <p className="statLabel">Ratings Per Rated Caption</p>
              <p className="statValue">
                {data.totalRatedCaptions > 0
                  ? formatAverage(data.totalRatingsSubmitted / data.totalRatedCaptions)
                  : "0.00"}
              </p>
            </article>
          </section>

          <section className="twoColumnGrid analyticsSectionGrid">
            <DistributionCard distribution={data.distribution} />
            <TrendCard trend={data.ratingTrend} />
          </section>

          <section className="twoColumnGrid analyticsSectionGrid">
            <CaptionTable
              rows={data.highestRated}
              eyebrow="Quality"
              title="Highest-rated captions"
              helperText="Sorted by best average vote, using captions with at least 3 ratings."
            />
            <CaptionTable
              rows={data.lowestRated}
              eyebrow="Quality"
              title="Lowest-rated captions"
              helperText="Sorted by worst average vote, using captions with at least 3 ratings."
            />
          </section>

          <section className="twoColumnGrid analyticsSectionGrid">
            <CaptionTable
              rows={data.mostRated}
              eyebrow="Volume"
              title="Most-rated captions"
              helperText="Captions attracting the most user feedback."
            />
            <CaptionTable
              rows={data.lowestVolumeMeaningful}
              eyebrow="Coverage"
              title="Lightest rating coverage"
              helperText="Captions with the fewest ratings among those with at least 2 votes."
            />
          </section>

          <section className="twoColumnGrid analyticsSectionGrid">
            <CaptionTable
              rows={data.highestDisagreement}
              eyebrow="Disagreement"
              title="Highest variance captions"
              helperText="Captions with the widest spread of vote outcomes, using at least 4 ratings."
            />
            <RecentActivityCard rows={data.recentActivity} />
          </section>
        </div>
      )}
    </div>
  );
}
