"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CaptionRow,
  ImageRow,
  Profile,
  countCaptionVotes,
  deleteCaption,
  deleteImage,
  getMyProfile,
  listCaptions,
  listImages,
  listProfiles,
  updateCaptionPublic,
  updateImagePublic,
  updateProfileFlags,
} from "@/lib/supabase-rest";
import { missingSupabaseMessage, supabase } from "@/lib/supabase-browser";

type DataTab = "profiles" | "images" | "captions";
type TabKey = "overview" | DataTab;
type PageState = Record<DataTab, number>;

const PAGE_SIZE: Record<DataTab, number> = {
  profiles: 20,
  images: 12,
  captions: 12,
};

const INITIAL_PAGES: PageState = {
  profiles: 1,
  images: 1,
  captions: 1,
};

type AdminData = {
  profiles: Profile[];
  images: ImageRow[];
  captions: CaptionRow[];
  voteCount: number;
  totals: {
    profiles: number;
    images: number;
    captions: number;
  };
};

function shortId(id: string) {
  if (!id) return "";
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function buildPageWindow(current: number, total: number) {
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  return [...pages].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
}

export default function HomePage() {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState("Checking session...");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [me, setMe] = useState<Profile | null>(null);
  const [data, setData] = useState<AdminData | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [pages, setPages] = useState<PageState>(INITIAL_PAGES);
  const [profileQuery, setProfileQuery] = useState("");
  const [imageQuery, setImageQuery] = useState("");
  const [captionQuery, setCaptionQuery] = useState("");

  const stats = useMemo(() => {
    if (!data) {
      return {
        profiles: 0,
        images: 0,
        captions: 0,
        voteCount: 0,
        visiblePublicImages: 0,
        visiblePublicCaptions: 0,
      };
    }

    return {
      profiles: data.totals.profiles,
      images: data.totals.images,
      captions: data.totals.captions,
      voteCount: data.voteCount,
      visiblePublicImages: data.images.filter((img) => img.is_public).length,
      visiblePublicCaptions: data.captions.filter((c) => c.is_public).length,
    };
  }, [data]);

  const totalPages = useMemo(() => {
    if (!data) {
      return { profiles: 1, images: 1, captions: 1 };
    }
    return {
      profiles: Math.max(1, Math.ceil(data.totals.profiles / PAGE_SIZE.profiles)),
      images: Math.max(1, Math.ceil(data.totals.images / PAGE_SIZE.images)),
      captions: Math.max(1, Math.ceil(data.totals.captions / PAGE_SIZE.captions)),
    };
  }, [data]);

  const imageMap = useMemo(() => {
    const map = new Map<string, ImageRow>();
    if (!data) return map;
    for (const image of data.images) {
      map.set(image.id, image);
    }
    return map;
  }, [data]);

  const filteredProfiles = useMemo(() => {
    if (!data) return [];
    const q = profileQuery.trim().toLowerCase();
    if (!q) return data.profiles;
    return data.profiles.filter((profile) => {
      const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim().toLowerCase();
      return (
        fullName.includes(q) ||
        (profile.email ?? "").toLowerCase().includes(q) ||
        profile.id.toLowerCase().includes(q)
      );
    });
  }, [data, profileQuery]);

  const filteredImages = useMemo(() => {
    if (!data) return [];
    const q = imageQuery.trim().toLowerCase();
    if (!q) return data.images;
    return data.images.filter((image) => {
      return (
        image.id.toLowerCase().includes(q) ||
        image.profile_id.toLowerCase().includes(q) ||
        image.url.toLowerCase().includes(q)
      );
    });
  }, [data, imageQuery]);

  const filteredCaptions = useMemo(() => {
    if (!data) return [];
    const q = captionQuery.trim().toLowerCase();
    if (!q) return data.captions;
    return data.captions.filter((caption) => {
      return (
        caption.id.toLowerCase().includes(q) ||
        caption.image_id.toLowerCase().includes(q) ||
        caption.profile_id.toLowerCase().includes(q) ||
        caption.content.toLowerCase().includes(q)
      );
    });
  }, [data, captionQuery]);

  const overviewInsights = useMemo(() => {
    if (!data) {
      return {
        imagePublicPct: 0,
        captionPublicPct: 0,
        topCreators: [] as Array<{ id: string; images: number; captions: number; total: number }>,
        recentCaptions: [] as CaptionRow[],
      };
    }

    const imagePublicPct = data.images.length
      ? Math.round((stats.visiblePublicImages / data.images.length) * 100)
      : 0;
    const captionPublicPct = data.captions.length
      ? Math.round((stats.visiblePublicCaptions / data.captions.length) * 100)
      : 0;

    const creatorMap = new Map<string, { images: number; captions: number }>();
    for (const image of data.images) {
      const entry = creatorMap.get(image.profile_id) ?? { images: 0, captions: 0 };
      entry.images += 1;
      creatorMap.set(image.profile_id, entry);
    }
    for (const caption of data.captions) {
      const entry = creatorMap.get(caption.profile_id) ?? { images: 0, captions: 0 };
      entry.captions += 1;
      creatorMap.set(caption.profile_id, entry);
    }

    const topCreators = [...creatorMap.entries()]
      .map(([id, value]) => ({
        id,
        images: value.images,
        captions: value.captions,
        total: value.images + value.captions,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const recentCaptions = [...data.captions]
      .sort((a, b) => {
        const da = a.created_datetime_utc ? new Date(a.created_datetime_utc).getTime() : 0;
        const db = b.created_datetime_utc ? new Date(b.created_datetime_utc).getTime() : 0;
        return db - da;
      })
      .slice(0, 5);

    return { imagePublicPct, captionPublicPct, topCreators, recentCaptions };
  }, [data, stats.visiblePublicCaptions, stats.visiblePublicImages]);

  const activityScore = useMemo(() => {
    const score =
      stats.images * 2 + stats.captions * 2 + stats.voteCount * 0.15 + stats.visiblePublicCaptions;
    return Math.round(score);
  }, [stats.captions, stats.images, stats.visiblePublicCaptions, stats.voteCount]);

  const loadAdminData = useCallback(async (authToken: string, pageState: PageState) => {
    const [profilesPage, imagesPage, captionsPage, voteCount] = await Promise.all([
      listProfiles(authToken, pageState.profiles, PAGE_SIZE.profiles),
      listImages(authToken, pageState.images, PAGE_SIZE.images),
      listCaptions(authToken, pageState.captions, PAGE_SIZE.captions),
      countCaptionVotes(authToken),
    ]);

    setData({
      profiles: profilesPage.rows,
      images: imagesPage.rows,
      captions: captionsPage.rows,
      voteCount,
      totals: {
        profiles: profilesPage.total,
        images: imagesPage.total,
        captions: captionsPage.total,
      },
    });
  }, []);

  const restoreSession = useCallback(async () => {
    try {
      if (!supabase) {
        setError(missingSupabaseMessage);
        setStatus("Missing Supabase config.");
        return;
      }

      setError(null);
      setIsLoading(true);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session) {
        window.location.replace("/login");
        return;
      }

      const authToken = session.access_token;
      const profile = await getMyProfile(authToken, session.user.id);
      if (!profile) throw new Error("No profile found for this user.");

      setToken(authToken);
      setMe(profile);
      setIsLoggedIn(true);
      setIsSuperAdmin(Boolean(profile.is_superadmin));

      if (!profile.is_superadmin) {
        setStatus("Logged in, but this account is not a super admin.");
        return;
      }

      setPages(INITIAL_PAGES);
      setStatus("Loading admin data...");
      await loadAdminData(authToken, INITIAL_PAGES);
      setStatus("Admin panel ready.");
    } catch (sessionErr) {
      setIsLoggedIn(false);
      setIsSuperAdmin(false);
      setMe(null);
      setData(null);
      setStatus("Please sign in again.");
      setError(sessionErr instanceof Error ? sessionErr.message : "Session check failed.");
    } finally {
      setIsLoading(false);
    }
  }, [loadAdminData]);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        setToken(session.access_token);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const logout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    window.location.replace("/login");
  };

  const guardedAction = async (action: () => Promise<void>) => {
    if (!token) {
      setError("No session token found. Sign in again.");
      return;
    }

    try {
      setError(null);
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed.");
    }
  };

  const goToPage = (tab: DataTab, nextPage: number) => {
    if (!token) return;
    const maxPage = totalPages[tab];
    const bounded = Math.max(1, Math.min(nextPage, maxPage));
    const nextState: PageState = { ...pages, [tab]: bounded };
    setPages(nextState);
    void guardedAction(async () => {
      await loadAdminData(token, nextState);
    });
  };

  const toggleProfileFlag = async (profileId: string, value: boolean) => {
    await guardedAction(async () => {
      await updateProfileFlags(token!, profileId, { is_superadmin: value });
      await loadAdminData(token!, pages);
    });
  };

  const toggleImagePublic = async (imageId: string, value: boolean) => {
    await guardedAction(async () => {
      await updateImagePublic(token!, imageId, value);
      await loadAdminData(token!, pages);
    });
  };

  const toggleCaptionPublic = async (captionId: string, value: boolean) => {
    await guardedAction(async () => {
      await updateCaptionPublic(token!, captionId, value);
      await loadAdminData(token!, pages);
    });
  };

  const removeImage = async (imageId: string) => {
    await guardedAction(async () => {
      await deleteImage(token!, imageId);
      await loadAdminData(token!, pages);
    });
  };

  const removeCaption = async (captionId: string) => {
    await guardedAction(async () => {
      await deleteCaption(token!, captionId);
      await loadAdminData(token!, pages);
    });
  };

  const renderPager = (tab: DataTab) => {
    const current = pages[tab];
    const total = totalPages[tab];
    const windowPages = buildPageWindow(current, total);
    const totalRows = data?.totals[tab] ?? 0;
    const startRow = totalRows === 0 ? 0 : (current - 1) * PAGE_SIZE[tab] + 1;
    const endRow = Math.min(current * PAGE_SIZE[tab], totalRows);

    return (
      <div className="pager" role="navigation" aria-label={`${tab} pagination`}>
        <p className="muted pagerLabel">
          Page {current} of {total} | Showing {startRow}-{endRow} of {totalRows}
        </p>
        <div className="pagerButtons">
          <button type="button" className="pageBtn" onClick={() => goToPage(tab, current - 1)} disabled={current <= 1}>
            Prev
          </button>
          {windowPages.map((n) => (
            <button
              key={`${tab}-page-${n}`}
              type="button"
              className={n === current ? "pageBtn pageBtnActive" : "pageBtn"}
              onClick={() => goToPage(tab, n)}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            className="pageBtn"
            onClick={() => goToPage(tab, current + 1)}
            disabled={current >= total}
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  if (!isLoggedIn) {
    return (
      <main className="page">
        <section className="authCard">
          <h1>Admin Panel</h1>
          <p className="muted">{isLoading ? "Checking login..." : status}</p>
          <button type="button" onClick={() => window.location.replace("/login")}>
            Go to Login
          </button>
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  if (!isSuperAdmin) {
    return (
      <main className="page">
        <section className="authCard">
          <h1>Access Denied</h1>
          <p className="muted">You are signed in as {me?.email ?? shortId(me?.id ?? "")}</p>
          <p className="error">This account does not have `is_superadmin = true` in `profiles`.</p>
          <button type="button" onClick={() => void logout()}>
            Sign Out
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="ambient ambientA" />
      <div className="ambient ambientB" />
      <div className="ambient ambientC" />

      <header className="topBar reveal reveal-1">
        <div>
          <h1>Super Admin Dashboard</h1>
          <p className="muted">Signed in as {me?.email ?? me?.id}</p>
        </div>
        <div className="topActions">
          <button type="button" onClick={() => token && void guardedAction(() => loadAdminData(token, pages))}>
            Refresh
          </button>
          <button type="button" onClick={() => void logout()}>
            Sign Out
          </button>
        </div>
      </header>

      <section className="heroStrip reveal reveal-2">
        <article className="heroStat">
          <p className="heroLabel">Live Activity Score</p>
          <p className="heroValue">{activityScore}</p>
          <p className="heroExplain">
            Formula: (images x 2) + (captions x 2) + (votes x 0.15) + visible public captions.
          </p>
        </article>
        <article className="heroStat">
          <p className="heroLabel">Current Page Coverage</p>
          <p className="heroValue">
            {overviewInsights.imagePublicPct}% <span className="heroSub">images</span>
          </p>
        </article>
        <article className="heroStat">
          <p className="heroLabel">Current Page Reach</p>
          <p className="heroValue">
            {overviewInsights.captionPublicPct}% <span className="heroSub">captions</span>
          </p>
        </article>
      </section>

      <nav className="tabBar reveal reveal-3" aria-label="Admin sections">
        <button
          type="button"
          className={activeTab === "overview" ? "tabButton tabButtonActive" : "tabButton"}
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          className={activeTab === "profiles" ? "tabButton tabButtonActive" : "tabButton"}
          onClick={() => setActiveTab("profiles")}
        >
          Profiles
        </button>
        <button
          type="button"
          className={activeTab === "images" ? "tabButton tabButtonActive" : "tabButton"}
          onClick={() => setActiveTab("images")}
        >
          Images
        </button>
        <button
          type="button"
          className={activeTab === "captions" ? "tabButton tabButtonActive" : "tabButton"}
          onClick={() => setActiveTab("captions")}
        >
          Captions
        </button>
      </nav>

      {error && <p className="error">{error}</p>}

      {activeTab === "overview" && (
        <section className="panel reveal reveal-4">
          <h2>Overview</h2>
          <p className="muted">Quick pulse of platform health and moderation activity.</p>
          <section className="statsGrid">
            <article className="statCard">
              <h2>Total Profiles</h2>
              <p>{stats.profiles}</p>
            </article>
            <article className="statCard">
              <h2>Images</h2>
              <p>
                {stats.images} total / {stats.visiblePublicImages} public on page
              </p>
              <div className="meter">
                <span style={{ width: `${overviewInsights.imagePublicPct}%` }} />
              </div>
            </article>
            <article className="statCard">
              <h2>Captions</h2>
              <p>
                {stats.captions} total / {stats.visiblePublicCaptions} public on page
              </p>
              <div className="meter">
                <span style={{ width: `${overviewInsights.captionPublicPct}%` }} />
              </div>
            </article>
            <article className="statCard">
              <h2>Total Votes</h2>
              <p>{stats.voteCount}</p>
            </article>
          </section>

          <section className="insightGrid">
            <article className="insightCard">
              <h3>Pagination Snapshot</h3>
              <p className="muted">Current loaded pages and sizes.</p>
              <div className="healthRows">
                <div className="healthRow">
                  <span>Profiles</span>
                  <strong>
                    p{pages.profiles} / {totalPages.profiles}
                  </strong>
                </div>
                <div className="healthRow">
                  <span>Images</span>
                  <strong>
                    p{pages.images} / {totalPages.images}
                  </strong>
                </div>
                <div className="healthRow">
                  <span>Captions</span>
                  <strong>
                    p{pages.captions} / {totalPages.captions}
                  </strong>
                </div>
              </div>
            </article>

            <article className="insightCard">
              <h3>Top Creators (Current Pages)</h3>
              {overviewInsights.topCreators.length === 0 && <p className="muted">No activity yet.</p>}
              {overviewInsights.topCreators.map((creator) => (
                <div key={creator.id} className="creatorRow">
                  <span>{shortId(creator.id)}</span>
                  <span className="muted">
                    {creator.images} imgs / {creator.captions} caps
                  </span>
                </div>
              ))}
            </article>

            <article className="insightCard">
              <h3>Recent Caption Activity</h3>
              {overviewInsights.recentCaptions.length === 0 && <p className="muted">No captions yet.</p>}
              {overviewInsights.recentCaptions.map((caption) => (
                <div key={caption.id} className="timelineRow">
                  <div className="dot" />
                  <div>
                    <p className="timelineText">{caption.content}</p>
                    <p className="muted">
                      {formatDate(caption.created_datetime_utc)} by {shortId(caption.profile_id)}
                    </p>
                  </div>
                </div>
              ))}
            </article>
          </section>
        </section>
      )}

      {activeTab === "profiles" && (
        <section className="panel reveal reveal-4">
          <h2>Manage Profiles</h2>
          <div className="sectionToolbar">
            <input
              className="searchInput"
              type="text"
              placeholder="Search by name, email, or profile id"
              value={profileQuery}
              onChange={(e) => setProfileQuery(e.target.value)}
            />
            <span className="muted">{filteredProfiles.length} results on this page</span>
          </div>
          {renderPager("profiles")}
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Profile</th>
                  <th>Email</th>
                  <th>Super Admin</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map((profile) => (
                  <tr key={profile.id}>
                    <td>
                      <div>{`${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "-"}</div>
                      <div className="muted">{shortId(profile.id)}</div>
                    </td>
                    <td>{profile.email ?? "-"}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={Boolean(profile.is_superadmin)}
                        onChange={(e) => void toggleProfileFlag(profile.id, e.target.checked)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredProfiles.length === 0 && <p className="muted emptyState">No matching profiles.</p>}
          {renderPager("profiles")}
        </section>
      )}

      {activeTab === "images" && (
        <section className="panel reveal reveal-4">
          <h2>Manage Images</h2>
          <div className="sectionToolbar">
            <input
              className="searchInput"
              type="text"
              placeholder="Search by image id, owner id, or URL"
              value={imageQuery}
              onChange={(e) => setImageQuery(e.target.value)}
            />
            <span className="muted">{filteredImages.length} results on this page</span>
          </div>
          {renderPager("images")}
          <div className="cardGrid">
            {filteredImages.map((image) => (
              <article key={image.id} className="contentCard">
                <a href={image.url} target="_blank" rel="noreferrer" className="thumbWrap">
                  <img src={image.url} alt="Uploaded content" className="thumb" />
                </a>
                <div className="metaRow">
                  <span className="badge">{shortId(image.id)}</span>
                  <span className="badge">owner {shortId(image.profile_id)}</span>
                </div>
                <p className="muted">Created: {formatDate(image.created_datetime_utc)}</p>
                <div className="actionRow">
                  <label className="toggleLabel">
                    <input
                      type="checkbox"
                      checked={Boolean(image.is_public)}
                      onChange={(e) => void toggleImagePublic(image.id, e.target.checked)}
                    />
                    Public
                  </label>
                  <button type="button" onClick={() => void removeImage(image.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
          {filteredImages.length === 0 && <p className="muted emptyState">No matching images.</p>}
          {renderPager("images")}
        </section>
      )}

      {activeTab === "captions" && (
        <section className="panel reveal reveal-4">
          <h2>Manage Captions</h2>
          <div className="sectionToolbar">
            <input
              className="searchInput"
              type="text"
              placeholder="Search by caption text, caption id, image id, or owner id"
              value={captionQuery}
              onChange={(e) => setCaptionQuery(e.target.value)}
            />
            <span className="muted">{filteredCaptions.length} results on this page</span>
          </div>
          {renderPager("captions")}
          <div className="cardGrid">
            {filteredCaptions.map((caption) => {
              const linkedImage = imageMap.get(caption.image_id);
              return (
                <article key={caption.id} className="contentCard">
                  {linkedImage?.url ? (
                    <a href={linkedImage.url} target="_blank" rel="noreferrer" className="thumbWrap">
                      <img src={linkedImage.url} alt="Caption source" className="thumb" />
                    </a>
                  ) : (
                    <div className="thumbWrap thumbPlaceholder">No image preview</div>
                  )}
                  <div className="metaRow">
                    <span className="badge">caption {shortId(caption.id)}</span>
                    <span className="badge">image {shortId(caption.image_id)}</span>
                  </div>
                  <p className="captionText">{caption.content}</p>
                  <p className="muted">Likes: {caption.like_count ?? 0}</p>
                  <div className="actionRow">
                    <label className="toggleLabel">
                      <input
                        type="checkbox"
                        checked={Boolean(caption.is_public)}
                        onChange={(e) => void toggleCaptionPublic(caption.id, e.target.checked)}
                      />
                      Public
                    </label>
                    <button type="button" onClick={() => void removeCaption(caption.id)}>
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {filteredCaptions.length === 0 && <p className="muted emptyState">No matching captions.</p>}
          {renderPager("captions")}
        </section>
      )}
    </main>
  );
}
