"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CaptionRow,
  GenericRow,
  ImageRow,
  Profile,
  countCaptionVotes,
  deleteTableRowByField,
  deleteCaption,
  deleteImage,
  getMyProfile,
  insertTableRow,
  listCaptions,
  listImages,
  listProfiles,
  listTableRows,
  updateTableRowByField,
  updateCaptionPublic,
  updateImagePublic,
  updateProfileFlags,
} from "@/lib/supabase-rest";
import { missingSupabaseMessage, supabase } from "@/lib/supabase-browser";

type DataTab = "profiles" | "images" | "captions";
type TabKey = "overview" | DataTab;
type PageState = Record<DataTab, number>;

type DomainCapability = "read" | "update" | "crud";

type DomainResource = {
  key: string;
  label: string;
  table: string;
  capability: DomainCapability;
  pkField: string;
  order?: string | null;
  supportsUpload?: boolean;
  previewFields?: string[];
};

const DOMAIN_RESOURCES: DomainResource[] = [
  {
    key: "users",
    label: "Users",
    table: "profiles",
    capability: "read",
    pkField: "id",
    previewFields: ["id", "email", "first_name", "last_name", "is_superadmin"],
  },
  {
    key: "images",
    label: "Images",
    table: "images",
    capability: "crud",
    pkField: "id",
    supportsUpload: true,
    previewFields: ["id", "profile_id", "url", "is_public", "created_datetime_utc"],
  },
  {
    key: "humorFlavors",
    label: "Humor Flavors",
    table: "humor_flavors",
    capability: "read",
    pkField: "id",
    previewFields: ["id", "slug", "description", "created_datetime_utc"],
  },
  {
    key: "humorFlavorSteps",
    label: "Humor Flavor Steps",
    table: "humor_flavor_steps",
    capability: "read",
    pkField: "id",
    previewFields: ["id", "humor_flavor_id", "order_by", "description", "llm_model_id"],
  },
  {
    key: "humorMix",
    label: "Humor Mix",
    table: "humor_flavor_mix",
    capability: "update",
    pkField: "id",
    previewFields: ["id", "humor_flavor_id", "caption_count", "created_datetime_utc"],
  },
  {
    key: "exampleCaptions",
    label: "Example Captions",
    table: "caption_examples",
    capability: "crud",
    pkField: "id",
    previewFields: ["id", "image_id", "caption", "priority", "modified_datetime_utc"],
  },
  {
    key: "terms",
    label: "Terms",
    table: "terms",
    capability: "crud",
    pkField: "id",
    previewFields: ["id", "term", "term_type_id", "priority", "modified_datetime_utc"],
  },
  {
    key: "captionsRead",
    label: "Captions",
    table: "captions",
    capability: "read",
    pkField: "id",
    previewFields: ["id", "profile_id", "image_id", "content", "is_public", "like_count"],
  },
  {
    key: "captionRequests",
    label: "Caption Requests",
    table: "caption_requests",
    capability: "read",
    pkField: "id",
    previewFields: ["id", "profile_id", "image_id", "created_datetime_utc"],
  },
  {
    key: "captionExamples",
    label: "Caption Examples",
    table: "caption_examples",
    capability: "crud",
    pkField: "id",
    previewFields: ["id", "image_id", "caption", "priority", "modified_datetime_utc"],
  },
  {
    key: "llmModels",
    label: "LLM Models",
    table: "llm_models",
    capability: "crud",
    pkField: "id",
    previewFields: ["id", "name", "llm_provider_id", "provider_model_id", "is_temperature_supported"],
  },
  {
    key: "llmProviders",
    label: "LLM Providers",
    table: "llm_providers",
    capability: "crud",
    pkField: "id",
    previewFields: ["id", "name", "created_datetime_utc"],
  },
  {
    key: "llmPromptChains",
    label: "LLM Prompt Chains",
    table: "llm_prompt_chains",
    capability: "read",
    pkField: "id",
    previewFields: ["id", "caption_request_id", "created_datetime_utc"],
  },
  {
    key: "llmResponses",
    label: "LLM Responses",
    table: "llm_model_responses",
    capability: "read",
    pkField: "id",
    previewFields: [
      "id",
      "llm_model_id",
      "caption_request_id",
      "humor_flavor_id",
      "processing_time_seconds",
      "llm_model_response",
    ],
  },
  {
    key: "allowedDomains",
    label: "Allowed Signup Domains",
    table: "allowed_signup_domains",
    capability: "crud",
    pkField: "id",
    previewFields: ["id", "apex_domain", "created_datetime_utc"],
  },
  {
    key: "whitelistedEmails",
    label: "Whitelisted E-mail Addresses",
    table: "whitelist_email_addresses",
    capability: "crud",
    pkField: "id",
    previewFields: ["id", "email_address", "modified_datetime_utc", "created_datetime_utc"],
  },
];

const DOMAIN_PAGE_SIZE = 20;

const DOMAIN_RESOURCES_BY_TAB: Record<TabKey, string[]> = {
  overview: ["humorFlavors", "humorFlavorSteps", "humorMix", "llmPromptChains", "llmResponses"],
  profiles: ["users", "allowedDomains", "whitelistedEmails"],
  images: ["images"],
  captions: [
    "captionsRead",
    "captionRequests",
    "exampleCaptions",
    "captionExamples",
    "terms",
    "llmModels",
    "llmProviders",
    "llmPromptChains",
    "llmResponses",
  ],
};

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

type HubInputType = "text" | "number" | "boolean" | "json";

function displayValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function domainRecord<T>(initial: T): Record<string, T> {
  return Object.fromEntries(DOMAIN_RESOURCES.map((resource) => [resource.key, initial])) as Record<string, T>;
}

function toFormString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
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
  const [domainResourceKey, setDomainResourceKey] = useState(DOMAIN_RESOURCES[0].key);
  const [domainRows, setDomainRows] = useState<Record<string, GenericRow[]>>(() => domainRecord<GenericRow[]>([]));
  const [domainTotals, setDomainTotals] = useState<Record<string, number>>(() => domainRecord(0));
  const [domainPages, setDomainPages] = useState<Record<string, number>>(() => domainRecord(1));
  const [domainQuery, setDomainQuery] = useState<Record<string, string>>(() => domainRecord(""));
  const [domainLoading, setDomainLoading] = useState<Record<string, boolean>>(() => domainRecord(false));
  const [domainErrors, setDomainErrors] = useState<Record<string, string | null>>(() => domainRecord<string | null>(null));
  const [domainCreateForm, setDomainCreateForm] = useState<Record<string, string>>({});
  const [editingPk, setEditingPk] = useState<string | number | boolean | null>(null);
  const [domainEditForm, setDomainEditForm] = useState<Record<string, string>>({});
  const [domainMessage, setDomainMessage] = useState<string | null>(null);
  const [uploadProfileId, setUploadProfileId] = useState("");
  const [uploadPrefix, setUploadPrefix] = useState("admin");
  const [uploadPublic, setUploadPublic] = useState(true);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [detailRow, setDetailRow] = useState<GenericRow | null>(null);
  const effectiveUploadProfileId = uploadProfileId.trim() || me?.id?.trim() || "";

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

  const visibleDomainResources = useMemo(() => {
    const allowedKeys = new Set(DOMAIN_RESOURCES_BY_TAB[activeTab]);
    return DOMAIN_RESOURCES.filter((resource) => allowedKeys.has(resource.key));
  }, [activeTab]);

  const selectedDomainResource = useMemo(() => {
    const found = visibleDomainResources.find((resource) => resource.key === domainResourceKey);
    return found ?? visibleDomainResources[0] ?? DOMAIN_RESOURCES[0];
  }, [domainResourceKey, visibleDomainResources]);

  const selectedDomainPage = domainPages[selectedDomainResource.key] ?? 1;
  const selectedDomainTotal = domainTotals[selectedDomainResource.key] ?? 0;
  const selectedDomainTotalPages = Math.max(1, Math.ceil(selectedDomainTotal / DOMAIN_PAGE_SIZE));

  const selectedDomainRows = useMemo(() => {
    const rows = domainRows[selectedDomainResource.key] ?? [];
    const query = (domainQuery[selectedDomainResource.key] ?? "").trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query));
  }, [domainQuery, domainRows, selectedDomainResource.key]);

  const selectedDomainColumns = useMemo(() => {
    const keys = new Set<string>();
    for (const row of selectedDomainRows.slice(0, 25)) {
      Object.keys(row).forEach((key) => keys.add(key));
    }
    return Array.from(keys).slice(0, 12);
  }, [selectedDomainRows]);

  const previewColumns = useMemo(() => {
    const preferred = selectedDomainResource.previewFields ?? [];
    const existing = selectedDomainColumns;
    const ordered = preferred.filter((field) => existing.includes(field));
    const fallback = existing.filter((field) => !ordered.includes(field)).slice(0, Math.max(0, 6 - ordered.length));
    const result = [...ordered, ...fallback];
    return result.length > 0 ? result : existing.slice(0, 6);
  }, [selectedDomainColumns, selectedDomainResource.previewFields]);

  const editableDomainFields = useMemo(() => {
    const systemFields = new Set([
      selectedDomainResource.pkField,
      "created_by_user_id",
      "modified_by_user_id",
      "created_datetime_utc",
      "modified_datetime_utc",
      "created_at",
      "updated_at",
    ]);
    return selectedDomainColumns.filter((column) => !systemFields.has(column));
  }, [selectedDomainColumns, selectedDomainResource.pkField]);

  const domainFieldTypes = useMemo(() => {
    const fieldTypes: Record<string, HubInputType> = {};
    for (const field of editableDomainFields) {
      fieldTypes[field] = "text";
      for (const row of selectedDomainRows) {
        const value = row[field];
        if (value === null || value === undefined) continue;
        if (typeof value === "boolean") {
          fieldTypes[field] = "boolean";
        } else if (typeof value === "number") {
          fieldTypes[field] = "number";
        } else if (typeof value === "object") {
          fieldTypes[field] = "json";
        } else {
          fieldTypes[field] = "text";
        }
        break;
      }
    }
    return fieldTypes;
  }, [editableDomainFields, selectedDomainRows]);

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

  const loadDomainResource = useCallback(
    async (authToken: string, resourceKey: string, page = 1) => {
      const resource = DOMAIN_RESOURCES.find((item) => item.key === resourceKey);
      if (!resource) return;

      setDomainLoading((prev) => ({ ...prev, [resourceKey]: true }));
      setDomainErrors((prev) => ({ ...prev, [resourceKey]: null }));

      try {
        const result = await listTableRows(
          authToken,
          resource.table,
          page,
          DOMAIN_PAGE_SIZE,
          "*",
          resource.order ?? "created_datetime_utc.desc.nullslast",
        );

        setDomainRows((prev) => ({ ...prev, [resourceKey]: result.rows }));
        setDomainTotals((prev) => ({ ...prev, [resourceKey]: result.total }));
        setDomainPages((prev) => ({ ...prev, [resourceKey]: result.page }));
      } catch (loadError) {
        setDomainErrors((prev) => ({
          ...prev,
          [resourceKey]: loadError instanceof Error ? loadError.message : "Failed to load resource.",
        }));
      } finally {
        setDomainLoading((prev) => ({ ...prev, [resourceKey]: false }));
      }
    },
    [],
  );

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
      await Promise.all([
        loadDomainResource(authToken, "users", 1),
        loadDomainResource(authToken, "images", 1),
      ]);
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
  }, [loadAdminData, loadDomainResource]);

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

  useEffect(() => {
    const allowedKeys = new Set(DOMAIN_RESOURCES_BY_TAB[activeTab]);
    if (allowedKeys.has(domainResourceKey)) return;
    const first = DOMAIN_RESOURCES_BY_TAB[activeTab][0];
    if (first) setDomainResourceKey(first);
  }, [activeTab, domainResourceKey]);

  useEffect(() => {
    setDomainCreateForm((previous) => {
      const next: Record<string, string> = {};
      for (const field of editableDomainFields) {
        next[field] = previous[field] ?? "";
      }
      return next;
    });
  }, [selectedDomainResource.key, editableDomainFields]);

  useEffect(() => {
    setDetailRow(null);
  }, [selectedDomainResource.key, activeTab]);

  useEffect(() => {
    if (me?.id) {
      setUploadProfileId((previous) => previous.trim() || me.id);
      return;
    }
    setUploadProfileId("");
  }, [me?.id]);

  useEffect(() => {
    if (!token || !isSuperAdmin) return;
    const currentRows = domainRows[selectedDomainResource.key] ?? [];
    if (currentRows.length > 0) return;
    void loadDomainResource(token, selectedDomainResource.key, 1);
  }, [domainRows, isSuperAdmin, loadDomainResource, selectedDomainResource.key, token]);

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
      if (!me?.id) throw new Error("No signed-in profile found.");
      await updateProfileFlags(token!, me.id, profileId, { is_superadmin: value });
      await loadAdminData(token!, pages);
    });
  };

  const toggleImagePublic = async (imageId: string, value: boolean) => {
    await guardedAction(async () => {
      if (!me?.id) throw new Error("No signed-in profile found.");
      await updateImagePublic(token!, me.id, imageId, value);
      await loadAdminData(token!, pages);
    });
  };

  const toggleCaptionPublic = async (captionId: string, value: boolean) => {
    await guardedAction(async () => {
      if (!me?.id) throw new Error("No signed-in profile found.");
      await updateCaptionPublic(token!, me.id, captionId, value);
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

  const runDomainAction = async (action: () => Promise<void>, successMessage: string) => {
    if (!token) {
      setError("No session token found. Sign in again.");
      return;
    }

    try {
      setError(null);
      setDomainMessage(null);
      await action();
      setDomainMessage(successMessage);
      await loadDomainResource(token, selectedDomainResource.key, selectedDomainPage);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Domain action failed.");
    }
  };

  const canCreateDomain = selectedDomainResource.capability === "crud";
  const canUpdateDomain =
    selectedDomainResource.capability === "crud" || selectedDomainResource.capability === "update";
  const canDeleteDomain = selectedDomainResource.capability === "crud";

  const goDomainPage = (nextPage: number) => {
    if (!token) return;
    const bounded = Math.max(1, Math.min(nextPage, selectedDomainTotalPages));
    void loadDomainResource(token, selectedDomainResource.key, bounded);
  };

  const parseHubInputValue = (field: string, raw: string, allowNull: boolean) => {
    const inputType = domainFieldTypes[field] ?? "text";
    if (raw === "") {
      return allowNull ? null : undefined;
    }
    if (inputType === "boolean") {
      if (raw === "true") return true;
      if (raw === "false") return false;
      throw new Error(`Field "${field}" expects true/false.`);
    }
    if (inputType === "number") {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Field "${field}" expects a number.`);
      }
      return parsed;
    }
    if (inputType === "json") {
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error(`Field "${field}" must be valid JSON.`);
      }
    }
    return raw;
  };

  const buildPayloadFromForm = (values: Record<string, string>, allowNull: boolean) => {
    const payload: GenericRow = {};
    for (const field of editableDomainFields) {
      const raw = values[field] ?? "";
      const parsed = parseHubInputValue(field, raw, allowNull);
      if (parsed !== undefined) {
        payload[field] = parsed;
      }
    }
    return payload;
  };

  const createDomainRow = async () => {
    if (!canCreateDomain) return;
    await runDomainAction(async () => {
      if (!me?.id) throw new Error("No signed-in profile found.");
      const payload = buildPayloadFromForm(domainCreateForm, false);
      await insertTableRow(token!, me.id, selectedDomainResource.table, payload);
      setDomainCreateForm((previous) => {
        const next: Record<string, string> = {};
        for (const field of Object.keys(previous)) next[field] = "";
        return next;
      });
    }, `Created new row in ${selectedDomainResource.table}.`);
  };

  const startEditDomainRow = (row: GenericRow) => {
    const pkValue = row[selectedDomainResource.pkField];
    if (typeof pkValue !== "string" && typeof pkValue !== "number" && typeof pkValue !== "boolean") {
      setError(`Cannot edit row: missing primitive ${selectedDomainResource.pkField}.`);
      return;
    }
    setEditingPk(pkValue);
    const nextForm: Record<string, string> = {};
    for (const field of editableDomainFields) {
      nextForm[field] = toFormString(row[field]);
    }
    setDomainEditForm(nextForm);
  };

  const saveDomainEdit = async () => {
    if (!canUpdateDomain || editingPk === null) return;
    await runDomainAction(async () => {
      if (!me?.id) throw new Error("No signed-in profile found.");
      const payload = buildPayloadFromForm(domainEditForm, true);
      await updateTableRowByField(
        token!,
        me.id,
        selectedDomainResource.table,
        selectedDomainResource.pkField,
        editingPk,
        payload,
      );
      setEditingPk(null);
      setDomainEditForm({});
    }, `Updated row in ${selectedDomainResource.table}.`);
  };

  const deleteDomainRow = async (row: GenericRow) => {
    if (!canDeleteDomain) return;
    const pkValue = row[selectedDomainResource.pkField];
    if (typeof pkValue !== "string" && typeof pkValue !== "number" && typeof pkValue !== "boolean") {
      setError(`Cannot delete row: missing primitive ${selectedDomainResource.pkField}.`);
      return;
    }
    if (!window.confirm(`Delete ${selectedDomainResource.table}.${selectedDomainResource.pkField}=${pkValue}?`)) {
      return;
    }
    await runDomainAction(async () => {
      await deleteTableRowByField(
        token!,
        selectedDomainResource.table,
        selectedDomainResource.pkField,
        pkValue,
      );
    }, `Deleted row from ${selectedDomainResource.table}.`);
  };

  const uploadDomainImage = async () => {
    if (!token) {
      setError("No session token found. Sign in again.");
      return;
    }
    if (!supabase) {
      setError(missingSupabaseMessage);
      return;
    }
    if (!uploadFile) {
      setError("Choose an image file first.");
      return;
    }
    if (!effectiveUploadProfileId) {
      setError("No signed-in profile found for image upload.");
      return;
    }

    setIsUploading(true);
    setDomainMessage(null);
    setError(null);

    try {
      const bucket = process.env.NEXT_PUBLIC_IMAGE_BUCKET || "images";
      const safePrefix = uploadPrefix.trim().replace(/^\/+|\/+$/g, "");
      const safeName = uploadFile.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
      const objectPath = `${safePrefix ? `${safePrefix}/` : ""}${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(objectPath, uploadFile, { upsert: false, contentType: uploadFile.type || undefined });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
      if (!me?.id) throw new Error("No signed-in profile found.");
      await insertTableRow(token, me.id, "images", {
        profile_id: effectiveUploadProfileId,
        url: data.publicUrl,
        is_public: uploadPublic,
      });

      setDomainMessage(`Image uploaded and row created in images (bucket: ${bucket}).`);
      setUploadFile(null);
      await loadDomainResource(token, "images", 1);
      if (selectedDomainResource.key !== "images") {
        await loadDomainResource(token, selectedDomainResource.key, selectedDomainPage);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Image upload failed.");
    } finally {
      setIsUploading(false);
    }
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

  const renderOperationsHub = () => (
    <details className="domainIntegrated">
      <summary className="domainIntegratedSummary">Data Operations Hub</summary>
      <p className="muted">
        Supplemental tools for related domain tables. Existing tab workflows remain the primary moderation surface.
      </p>

      <div className="domainLayout">
        <aside className="domainSidebar">
          {visibleDomainResources.map((resource) => (
            <button
              key={resource.key}
              type="button"
              className={resource.key === selectedDomainResource.key ? "domainNavBtn domainNavBtnActive" : "domainNavBtn"}
              onClick={() => {
                setDomainResourceKey(resource.key);
                setEditingPk(null);
                setDomainMessage(null);
                if (token && (domainRows[resource.key] ?? []).length === 0) {
                  void loadDomainResource(token, resource.key, 1);
                }
              }}
            >
              {resource.label}
            </button>
          ))}
        </aside>

        <div>
          <p className="muted">
            Table <code>{selectedDomainResource.table}</code> | Capability <code>{selectedDomainResource.capability}</code>{" "}
            | PK <code>{selectedDomainResource.pkField}</code>
          </p>

          <div className="sectionToolbar">
            <input
              className="searchInput"
              type="text"
              placeholder="Filter rows on this page"
              value={domainQuery[selectedDomainResource.key] ?? ""}
              onChange={(e) => setDomainQuery((prev) => ({ ...prev, [selectedDomainResource.key]: e.target.value }))}
            />
            <span className="muted">
              {selectedDomainRows.length} rows on page {selectedDomainPage}/{selectedDomainTotalPages} (total{" "}
              {selectedDomainTotal})
            </span>
          </div>

          <div className="pager">
            <div className="pagerButtons">
              <button type="button" className="pageBtn" onClick={() => goDomainPage(selectedDomainPage - 1)} disabled={selectedDomainPage <= 1}>
                Prev
              </button>
              <button
                type="button"
                className="pageBtn"
                onClick={() => goDomainPage(selectedDomainPage + 1)}
                disabled={selectedDomainPage >= selectedDomainTotalPages}
              >
                Next
              </button>
              <button
                type="button"
                className="pageBtn"
                onClick={() => token && void loadDomainResource(token, selectedDomainResource.key, selectedDomainPage)}
              >
                Reload
              </button>
            </div>
          </div>

          {domainErrors[selectedDomainResource.key] && <p className="error">{domainErrors[selectedDomainResource.key]}</p>}
          {domainLoading[selectedDomainResource.key] && <p className="muted">Loading table...</p>}
          {domainMessage && <p className="status">{domainMessage}</p>}

          <div className="tableWrap opsTableWrap">
            <table>
              <thead>
                <tr>
                  {previewColumns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {selectedDomainRows.map((row, index) => (
                  <tr key={`${selectedDomainResource.key}-${index}`}>
                    {previewColumns.map((column) => (
                      <td key={column} className="tableTruncateCell">
                        <span className="tablePreviewValue" title={displayValue(row[column])}>
                          {displayValue(row[column])}
                        </span>
                      </td>
                    ))}
                    <td>
                      <div className="domainActionButtons">
                        <button type="button" onClick={() => setDetailRow(row)}>
                          View
                        </button>
                        {canUpdateDomain && (
                          <button type="button" onClick={() => startEditDomainRow(row)}>
                            Edit
                          </button>
                        )}
                        {canDeleteDomain && (
                          <button type="button" onClick={() => void deleteDomainRow(row)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedDomainRows.length === 0 && !domainLoading[selectedDomainResource.key] && (
            <p className="muted emptyState">No rows found.</p>
          )}

          {detailRow && (
            <section className="domainDetailCard">
              <div className="domainDetailTop">
                <h3>Row Details</h3>
                <button type="button" onClick={() => setDetailRow(null)}>
                  Close
                </button>
              </div>
              <div className="domainDetailGrid">
                {Object.entries(detailRow).map(([key, value]) => (
                  <div key={key} className="domainDetailItem">
                    <p className="domainDetailKey">{key}</p>
                    <pre className="domainDetailValue">{displayValue(value)}</pre>
                  </div>
                ))}
              </div>
            </section>
          )}

          {canCreateDomain && (
            <section className="domainEditorCard">
              <h3>Create Row</h3>
              <p className="muted">Fill in fields to insert a new record.</p>
              {editableDomainFields.length === 0 ? (
                <p className="muted">No editable columns inferred yet. Load table rows first.</p>
              ) : (
                <div className="domainFormGrid">
                  {editableDomainFields.map((field) => (
                  <label key={`create-${field}`} className="domainField">
                    <span>{field}</span>
                    {domainFieldTypes[field] === "boolean" ? (
                      <select
                        value={domainCreateForm[field] ?? ""}
                        onChange={(e) =>
                          setDomainCreateForm((prev) => ({ ...prev, [field]: e.target.value }))
                        }
                      >
                        <option value="">(blank)</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : domainFieldTypes[field] === "json" ? (
                      <textarea
                        className="domainFieldJson"
                        value={domainCreateForm[field] ?? ""}
                        onChange={(e) =>
                          setDomainCreateForm((prev) => ({ ...prev, [field]: e.target.value }))
                        }
                        placeholder='{"key":"value"}'
                      />
                    ) : (
                      <input
                        type={domainFieldTypes[field] === "number" ? "number" : "text"}
                        value={domainCreateForm[field] ?? ""}
                        onChange={(e) =>
                          setDomainCreateForm((prev) => ({ ...prev, [field]: e.target.value }))
                        }
                        placeholder="optional"
                      />
                    )}
                  </label>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => void createDomainRow()}>
                Create
              </button>
            </section>
          )}

          {canUpdateDomain && editingPk !== null && (
            <section className="domainEditorCard">
              <h3>Edit Row</h3>
              <p className="muted">
                Updating where <code>{selectedDomainResource.pkField}={String(editingPk)}</code>. PK field is removed
                from payload.
              </p>
              {editableDomainFields.length === 0 ? (
                <p className="muted">No editable columns inferred yet.</p>
              ) : (
                <div className="domainFormGrid">
                  {editableDomainFields.map((field) => (
                  <label key={`edit-${field}`} className="domainField">
                    <span>{field}</span>
                    {domainFieldTypes[field] === "boolean" ? (
                      <select
                        value={domainEditForm[field] ?? ""}
                        onChange={(e) =>
                          setDomainEditForm((prev) => ({ ...prev, [field]: e.target.value }))
                        }
                      >
                        <option value="">null</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : domainFieldTypes[field] === "json" ? (
                      <textarea
                        className="domainFieldJson"
                        value={domainEditForm[field] ?? ""}
                        onChange={(e) =>
                          setDomainEditForm((prev) => ({ ...prev, [field]: e.target.value }))
                        }
                      />
                    ) : (
                      <input
                        type={domainFieldTypes[field] === "number" ? "number" : "text"}
                        value={domainEditForm[field] ?? ""}
                        onChange={(e) =>
                          setDomainEditForm((prev) => ({ ...prev, [field]: e.target.value }))
                        }
                      />
                    )}
                  </label>
                  ))}
                </div>
              )}
              <div className="domainActionButtons">
                <button type="button" onClick={() => void saveDomainEdit()}>
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingPk(null);
                    setDomainEditForm({});
                  }}
                >
                  Cancel
                </button>
              </div>
            </section>
          )}

          {selectedDomainResource.supportsUpload && (
            <section className="domainEditorCard">
              <h3>Upload New Image</h3>
              <p className="muted">
                Upload to storage bucket <code>{process.env.NEXT_PUBLIC_IMAGE_BUCKET || "images"}</code> and create an
                `images` row.
              </p>
              <div className="domainUploadGrid">
                <label>
                  profile_id
                  <input
                    className="searchInput"
                    type="text"
                    value={uploadProfileId}
                    onChange={(e) => setUploadProfileId(e.target.value)}
                    placeholder={me?.id ?? "Defaults to signed-in user"}
                  />
                </label>
                <label>
                  storage prefix
                  <input
                    className="searchInput"
                    type="text"
                    value={uploadPrefix}
                    onChange={(e) => setUploadPrefix(e.target.value)}
                    placeholder="admin"
                  />
                </label>
                <label className="toggleLabel">
                  <input type="checkbox" checked={uploadPublic} onChange={(e) => setUploadPublic(e.target.checked)} />
                  is_public
                </label>
                <input type="file" accept="image/*" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
              </div>
              <button type="button" onClick={() => void uploadDomainImage()} disabled={isUploading}>
                {isUploading ? "Uploading..." : "Upload Image"}
              </button>
            </section>
          )}
        </div>
      </div>
    </details>
  );

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

          {renderOperationsHub()}
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
          {renderOperationsHub()}
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
          {renderOperationsHub()}
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
          {renderOperationsHub()}
        </section>
      )}

    </main>
  );
}
