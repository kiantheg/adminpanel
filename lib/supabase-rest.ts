const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function assertSupabaseConfig() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.",
    );
  }
}

function getSupabaseConfig() {
  assertSupabaseConfig();
  return {
    url: supabaseUrl as string,
    anonKey: supabaseAnonKey as string,
  };
}

type JsonRecord = Record<string, unknown>;
export type GenericRow = Record<string, unknown>;

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token?: string;
  body?: JsonRecord;
  query?: string;
  prefer?: string;
};

async function supabaseRequest<T>(
  path: string,
  { method = "GET", token, body, query, prefer }: RequestOptions = {},
): Promise<T> {
  const { url: baseUrl, anonKey } = getSupabaseConfig();
  const queryString = query ? `?${query}` : "";
  const url = `${baseUrl}${path}${queryString}`;

  const response = await fetch(url, {
    method,
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${errorBody}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: {
    id: string;
    email?: string;
  };
};

export type Profile = {
  id: string;
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;
  is_superadmin?: boolean | null;
  created_datetime_utc?: string | null;
};

export type ImageRow = {
  id: string;
  profile_id: string;
  url: string;
  is_public?: boolean | null;
  created_datetime_utc?: string | null;
  modified_datetime_utc?: string | null;
};

export type CaptionRow = {
  id: string;
  profile_id: string;
  image_id: string;
  content: string;
  is_public?: boolean | null;
  like_count?: number | null;
  created_datetime_utc?: string | null;
};

export type PagedResult<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};

export async function signInWithPassword(email: string, password: string) {
  return await supabaseRequest<AuthSession>("/auth/v1/token", {
    method: "POST",
    query: "grant_type=password",
    body: {
      email,
      password,
    },
  });
}

export function getOAuthAuthorizeUrl(provider: "google", redirectTo: string) {
  const { url } = getSupabaseConfig();
  return `${url}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(
    redirectTo,
  )}`;
}

export async function signOut(token: string) {
  const { url, anonKey } = getSupabaseConfig();
  await fetch(`${url}/auth/v1/logout`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

export async function getCurrentUser(token: string) {
  return await supabaseRequest<{ id: string; email?: string }>("/auth/v1/user", {
    token,
  });
}

export async function getMyProfile(token: string, userId: string) {
  const profiles = await supabaseRequest<Profile[]>("/rest/v1/profiles", {
    token,
    query: `select=id,email,is_superadmin,first_name,last_name&id=eq.${encodeURIComponent(
      userId,
    )}&limit=1`,
  });
  return profiles[0] ?? null;
}

async function pagedSelect<T>(
  token: string,
  table: string,
  select: string,
  order: string | null,
  page: number,
  pageSize: number,
) {
  const { url, anonKey } = getSupabaseConfig();
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(Math.max(1, pageSize), 200);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const orderQuery = order ? `&order=${encodeURIComponent(order)}` : "";
  const query = `select=${select}${orderQuery}&limit=${safePageSize}&offset=${from}`;

  const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      Prefer: "count=exact",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${errorBody}`);
  }

  const rows = (await response.json()) as T[];
  const range = response.headers.get("content-range");
  const totalRaw = range?.split("/")[1] ?? "0";
  const total = Number.isFinite(Number(totalRaw)) ? Number(totalRaw) : 0;

  return {
    rows,
    total,
    page: safePage,
    pageSize: safePageSize,
    from,
    to,
  };
}

export async function listProfiles(token: string, page = 1, pageSize = 20): Promise<PagedResult<Profile>> {
  const result = await pagedSelect<Profile>(
    token,
    "profiles",
    "id,email,first_name,last_name,is_superadmin,created_datetime_utc",
    "created_datetime_utc.desc.nullslast",
    page,
    pageSize,
  );
  return {
    rows: result.rows,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

export async function listImages(token: string, page = 1, pageSize = 24): Promise<PagedResult<ImageRow>> {
  const result = await pagedSelect<ImageRow>(
    token,
    "images",
    "id,profile_id,url,is_public,created_datetime_utc,modified_datetime_utc",
    "created_datetime_utc.desc.nullslast",
    page,
    pageSize,
  );
  return {
    rows: result.rows,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

export async function listCaptions(token: string, page = 1, pageSize = 24): Promise<PagedResult<CaptionRow>> {
  const result = await pagedSelect<CaptionRow>(
    token,
    "captions",
    "id,profile_id,image_id,content,is_public,like_count,created_datetime_utc",
    "created_datetime_utc.desc.nullslast",
    page,
    pageSize,
  );
  return {
    rows: result.rows,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

export async function countCaptionVotes(token: string) {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/caption_votes?select=id&limit=1`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      Prefer: "count=exact",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${errorBody}`);
  }

  const range = response.headers.get("content-range");
  if (!range) return 0;
  const total = range.split("/")[1];
  return Number.isFinite(Number(total)) ? Number(total) : 0;
}

export async function updateProfileFlags(
  token: string,
  id: string,
  updates: Partial<Pick<Profile, "is_superadmin">>,
) {
  return await supabaseRequest<Profile[]>("/rest/v1/profiles", {
    method: "PATCH",
    token,
    prefer: "return=representation",
    query: `id=eq.${encodeURIComponent(id)}`,
    body: updates,
  });
}

export async function updateImagePublic(token: string, id: string, isPublic: boolean) {
  return await supabaseRequest<ImageRow[]>("/rest/v1/images", {
    method: "PATCH",
    token,
    prefer: "return=representation",
    query: `id=eq.${encodeURIComponent(id)}`,
    body: { is_public: isPublic },
  });
}

export async function updateCaptionPublic(token: string, id: string, isPublic: boolean) {
  return await supabaseRequest<CaptionRow[]>("/rest/v1/captions", {
    method: "PATCH",
    token,
    prefer: "return=representation",
    query: `id=eq.${encodeURIComponent(id)}`,
    body: { is_public: isPublic },
  });
}

export async function deleteImage(token: string, id: string) {
  await supabaseRequest<null>("/rest/v1/images", {
    method: "DELETE",
    token,
    query: `id=eq.${encodeURIComponent(id)}`,
  });
}

export async function deleteCaption(token: string, id: string) {
  await supabaseRequest<null>("/rest/v1/captions", {
    method: "DELETE",
    token,
    query: `id=eq.${encodeURIComponent(id)}`,
  });
}

export async function listTableRows(
  token: string,
  table: string,
  page = 1,
  pageSize = 20,
  select = "*",
  order: string | null = null,
): Promise<PagedResult<GenericRow>> {
  const result = await pagedSelect<GenericRow>(token, table, select, order, page, pageSize);
  return {
    rows: result.rows,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

export async function insertTableRow(
  token: string,
  table: string,
  payload: GenericRow,
) {
  return await supabaseRequest<GenericRow[]>(`/rest/v1/${table}`, {
    method: "POST",
    token,
    prefer: "return=representation",
    body: payload,
  });
}

export async function updateTableRowByField(
  token: string,
  table: string,
  field: string,
  value: string | number | boolean,
  payload: GenericRow,
) {
  return await supabaseRequest<GenericRow[]>(`/rest/v1/${table}`, {
    method: "PATCH",
    token,
    prefer: "return=representation",
    query: `${encodeURIComponent(field)}=eq.${encodeURIComponent(String(value))}`,
    body: payload,
  });
}

export async function deleteTableRowByField(
  token: string,
  table: string,
  field: string,
  value: string | number | boolean,
) {
  await supabaseRequest<null>(`/rest/v1/${table}`, {
    method: "DELETE",
    token,
    query: `${encodeURIComponent(field)}=eq.${encodeURIComponent(String(value))}`,
  });
}

function encodeInFilter(values: Array<string | number | boolean>) {
  return values
    .map((value) => {
      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
      return `"${String(value).replace(/"/g, '\\"')}"`;
    })
    .join(",");
}

export async function listTableRowsByFieldIn(
  token: string,
  table: string,
  field: string,
  values: Array<string | number | boolean>,
  select = "*",
  order: string | null = null,
) {
  if (values.length === 0) {
    return [] as GenericRow[];
  }

  return await supabaseRequest<GenericRow[]>(`/rest/v1/${table}`, {
    token,
    query: `select=${select}&${encodeURIComponent(field)}=in.(${encodeURIComponent(
      encodeInFilter(values),
    )})${order ? `&order=${encodeURIComponent(order)}` : ""}`,
  });
}

export async function listImagesByIds(token: string, ids: string[]) {
  return (await listTableRowsByFieldIn(
    token,
    "images",
    "id",
    ids,
    "id,profile_id,url,is_public,created_datetime_utc,modified_datetime_utc",
  )) as ImageRow[];
}

export async function listCaptionsByImageIds(token: string, imageIds: string[]) {
  return (await listTableRowsByFieldIn(
    token,
    "captions",
    "image_id",
    imageIds,
    "id,profile_id,image_id,content,is_public,like_count,created_datetime_utc",
    "created_datetime_utc.desc.nullslast",
  )) as CaptionRow[];
}

export async function listCaptionExamplesByImageIds(token: string, imageIds: string[]) {
  return await listTableRowsByFieldIn(
    token,
    "caption_examples",
    "image_id",
    imageIds,
    "id,image_id,caption,priority,modified_datetime_utc",
    "priority.asc.nullslast",
  );
}
