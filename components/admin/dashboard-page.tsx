"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import { CaptionStatisticsDashboardSummary } from "@/components/admin/caption-statistics-view";
import { PageHeader, StatusBanner } from "@/components/admin/ui";
import { ImageUploadModal } from "@/components/admin/image-upload-modal";
import { formatDate, shortId } from "@/lib/admin-ui";
import {
  countCaptionVotes,
  listCaptions,
  listImages,
  listProfiles,
  type CaptionRow,
  type ImageRow,
} from "@/lib/supabase-rest";

type DashboardData = {
  profiles: number;
  images: number;
  captions: number;
  votes: number;
  recentImages: ImageRow[];
  recentCaptions: CaptionRow[];
};

export function DashboardPage() {
  const { me, token } = useAdmin();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);

      const [profiles, images, captions, votes] = await Promise.all([
        listProfiles(token, 1, 1),
        listImages(token, 1, 5),
        listCaptions(token, 1, 5),
        countCaptionVotes(token),
      ]);

      setData({
        profiles: profiles.total,
        images: images.total,
        captions: captions.total,
        votes,
        recentImages: images.rows,
        recentCaptions: captions.rows,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = useMemo(
    () => [
      { label: "Profiles", value: data?.profiles ?? 0, href: "/profiles" },
      { label: "Images", value: data?.images ?? 0, href: "/images" },
      { label: "Captions", value: data?.captions ?? 0, href: "/captions" },
      { label: "Caption Votes", value: data?.votes ?? 0, href: "/caption-statistics" },
    ],
    [data],
  );

  return (
    <div className="pageContent">
      <PageHeader
        eyebrow="Overview"
        title="Admin dashboard"
        description="A cleaner operational home for the admin panel with direct links into each managed dataset."
        actions={
          <div className="headerActions">
            <button type="button" className="primaryButton" onClick={() => setShowUploadModal(true)}>
              Upload image
            </button>
            <Link href="/captions" className="secondaryLinkButton">
              Review captions
            </Link>
          </div>
        }
      />

      <StatusBanner kind="error" message={error} onDismiss={() => setError(null)} />
      <StatusBanner kind="success" message={success} onDismiss={() => setSuccess(null)} />

      <section className="statsGrid">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="statCard statLinkCard">
            <p className="statLabel">{card.label}</p>
            <p className="statValue">{loading ? "..." : card.value}</p>
            <p className="supporting">Open {card.label.toLowerCase()}</p>
          </Link>
        ))}
      </section>

      <section className="twoColumnGrid">
        <article className="panelCard">
          <div className="panelCardHeader">
            <div>
              <p className="eyebrow">Recent uploads</p>
              <h2>Images</h2>
            </div>
            <Link href="/images" className="inlineLink">
              Open image management
            </Link>
          </div>
          {loading && <p className="supporting">Loading recent images…</p>}
          {!loading && data?.recentImages.length === 0 && (
            <p className="supporting">No image rows found in the current dataset.</p>
          )}
          <div className="activityList">
            {data?.recentImages.map((image) => (
              <div key={image.id} className="activityRow">
                <div className="activityThumb">
                  <img src={image.url} alt="" />
                </div>
                <div>
                  <p className="activityTitle">{shortId(image.id)}</p>
                  <p className="supporting">
                    Owner {shortId(image.profile_id)} · {formatDate(image.created_datetime_utc)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panelCard">
          <div className="panelCardHeader">
            <div>
              <p className="eyebrow">Recent moderation</p>
              <h2>Captions</h2>
            </div>
            <Link href="/captions" className="inlineLink">
              Open captions
            </Link>
          </div>
          {loading && <p className="supporting">Loading recent captions…</p>}
          {!loading && data?.recentCaptions.length === 0 && (
            <p className="supporting">No caption rows found in the current dataset.</p>
          )}
          <div className="activityList">
            {data?.recentCaptions.map((caption) => (
              <div key={caption.id} className="activityRow activityRowText">
                <div>
                  <p className="activityTitle">{caption.content}</p>
                  <p className="supporting">
                    Image {shortId(caption.image_id)} · {formatDate(caption.created_datetime_utc)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panelCard">
        <div className="panelCardHeader">
          <div>
            <p className="eyebrow">Quick actions</p>
            <h2>Where to work next</h2>
          </div>
        </div>
        <div className="shortcutGrid">
          <Link href="/profiles" className="shortcutCard">
            <h3>Profiles</h3>
            <p className="supporting">Toggle superadmin access and inspect account rows.</p>
          </Link>
          <Link href="/images" className="shortcutCard">
            <h3>Image management</h3>
            <p className="supporting">Upload, preview, edit, and delete image records with linked captions.</p>
          </Link>
          <Link href="/captions" className="shortcutCard">
            <h3>Captions</h3>
            <p className="supporting">See caption text with the actual image thumbnail instead of raw IDs.</p>
          </Link>
          <Link href="/caption-statistics" className="shortcutCard">
            <h3>Caption statistics</h3>
            <p className="supporting">Track rating averages, top captions, disagreement, and recent voting activity.</p>
          </Link>
          <Link href="/tables/captionExamples" className="shortcutCard">
            <h3>Reference tables</h3>
            <p className="supporting">Work through additional entities from the sidebar without the old hub.</p>
          </Link>
        </div>
      </section>

      <CaptionStatisticsDashboardSummary />

      {showUploadModal && (
        <ImageUploadModal
          initialProfileId={me?.id}
          title="Quick image upload"
          subtitle="Add a new image without leaving the dashboard."
          onClose={() => setShowUploadModal(false)}
          onUploaded={async (message) => {
            setSuccess(message);
            await load();
          }}
        />
      )}
    </div>
  );
}
