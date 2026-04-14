export type ResourceCapability = "read" | "update" | "crud";

export type ResourceFieldType = "text" | "longtext" | "number" | "boolean" | "json";

export type ResourceField = {
  name: string;
  label: string;
  type?: ResourceFieldType;
  required?: boolean;
  placeholder?: string;
};

export type AdminResource = {
  key: string;
  label: string;
  description: string;
  table: string;
  pkField: string;
  capability: ResourceCapability;
  navGroup: "core" | "catalog" | "ai" | "access";
  previewFields: string[];
  formFields?: ResourceField[];
  defaultOrder?: string | null;
};

const resources: AdminResource[] = [
  {
    key: "humorFlavors",
    label: "Humor Flavors",
    description: "Catalog of humor flavor records used by the generation pipeline.",
    table: "humor_flavors",
    pkField: "id",
    capability: "read",
    navGroup: "catalog",
    previewFields: ["id", "slug", "description", "created_datetime_utc"],
    defaultOrder: "created_datetime_utc.desc.nullslast",
  },
  {
    key: "humorFlavorSteps",
    label: "Humor Flavor Steps",
    description: "Ordered prompt steps attached to each humor flavor.",
    table: "humor_flavor_steps",
    pkField: "id",
    capability: "read",
    navGroup: "catalog",
    previewFields: ["id", "humor_flavor_id", "order_by", "description", "llm_model_id"],
    defaultOrder: "order_by.asc.nullslast",
  },
  {
    key: "humorMix",
    label: "Humor Mix",
    description: "Mixing weights or counts for humor flavor combinations.",
    table: "humor_flavor_mix",
    pkField: "id",
    capability: "update",
    navGroup: "catalog",
    previewFields: ["id", "humor_flavor_id", "caption_count", "created_datetime_utc"],
    formFields: [
      { name: "humor_flavor_id", label: "Humor Flavor ID", required: true },
      { name: "caption_count", label: "Caption Count", type: "number", required: true },
    ],
    defaultOrder: "created_datetime_utc.desc.nullslast",
  },
  {
    key: "captionRequests",
    label: "Caption Requests",
    description: "Incoming caption generation requests.",
    table: "caption_requests",
    pkField: "id",
    capability: "read",
    navGroup: "core",
    previewFields: ["id", "profile_id", "image_id", "created_datetime_utc"],
    defaultOrder: "created_datetime_utc.desc.nullslast",
  },
  {
    key: "captionExamples",
    label: "Caption Examples",
    description: "Reference captions tied to images.",
    table: "caption_examples",
    pkField: "id",
    capability: "crud",
    navGroup: "core",
    previewFields: ["id", "image_id", "caption", "priority", "modified_datetime_utc"],
    formFields: [
      { name: "image_id", label: "Image ID", required: true },
      { name: "caption", label: "Caption", type: "longtext", required: true },
      { name: "priority", label: "Priority", type: "number" },
    ],
    defaultOrder: "modified_datetime_utc.desc.nullslast",
  },
  {
    key: "terms",
    label: "Terms",
    description: "Configurable terms used by prompt generation or curation.",
    table: "terms",
    pkField: "id",
    capability: "crud",
    navGroup: "catalog",
    previewFields: ["id", "term", "term_type_id", "priority", "modified_datetime_utc"],
    formFields: [
      { name: "term", label: "Term", required: true },
      { name: "term_type_id", label: "Term Type ID", required: true },
      { name: "priority", label: "Priority", type: "number" },
    ],
    defaultOrder: "modified_datetime_utc.desc.nullslast",
  },
  {
    key: "llmModels",
    label: "LLM Models",
    description: "Configured LLM model definitions.",
    table: "llm_models",
    pkField: "id",
    capability: "crud",
    navGroup: "ai",
    previewFields: ["id", "name", "llm_provider_id", "provider_model_id", "is_temperature_supported"],
    formFields: [
      { name: "name", label: "Name", required: true },
      { name: "llm_provider_id", label: "Provider ID", required: true },
      { name: "provider_model_id", label: "Provider Model ID", required: true },
      { name: "is_temperature_supported", label: "Supports Temperature", type: "boolean" },
    ],
    defaultOrder: "created_datetime_utc.desc.nullslast",
  },
  {
    key: "llmProviders",
    label: "LLM Providers",
    description: "Configured LLM providers.",
    table: "llm_providers",
    pkField: "id",
    capability: "crud",
    navGroup: "ai",
    previewFields: ["id", "name", "created_datetime_utc"],
    formFields: [{ name: "name", label: "Name", required: true }],
    defaultOrder: "created_datetime_utc.desc.nullslast",
  },
  {
    key: "llmPromptChains",
    label: "LLM Prompt Chains",
    description: "Prompt chain execution records.",
    table: "llm_prompt_chains",
    pkField: "id",
    capability: "read",
    navGroup: "ai",
    previewFields: ["id", "caption_request_id", "created_datetime_utc"],
    defaultOrder: "created_datetime_utc.desc.nullslast",
  },
  {
    key: "llmResponses",
    label: "LLM Responses",
    description: "Stored LLM responses and processing metadata.",
    table: "llm_model_responses",
    pkField: "id",
    capability: "read",
    navGroup: "ai",
    previewFields: [
      "id",
      "llm_model_id",
      "caption_request_id",
      "humor_flavor_id",
      "processing_time_seconds",
      "llm_model_response",
    ],
    defaultOrder: "created_datetime_utc.desc.nullslast",
  },
  {
    key: "allowedDomains",
    label: "Allowed Domains",
    description: "Domain allowlist for account creation.",
    table: "allowed_signup_domains",
    pkField: "id",
    capability: "crud",
    navGroup: "access",
    previewFields: ["id", "apex_domain", "created_datetime_utc"],
    formFields: [{ name: "apex_domain", label: "Apex Domain", required: true }],
    defaultOrder: "created_datetime_utc.desc.nullslast",
  },
  {
    key: "whitelistedEmails",
    label: "Whitelisted Emails",
    description: "Specific email allowlist entries.",
    table: "whitelist_email_addresses",
    pkField: "id",
    capability: "crud",
    navGroup: "access",
    previewFields: ["id", "email_address", "modified_datetime_utc", "created_datetime_utc"],
    formFields: [{ name: "email_address", label: "Email Address", required: true }],
    defaultOrder: "modified_datetime_utc.desc.nullslast",
  },
];

export const ADMIN_RESOURCES = resources;

export const ADMIN_RESOURCE_MAP = new Map(resources.map((resource) => [resource.key, resource]));

export function getAdminResource(key: string) {
  return ADMIN_RESOURCE_MAP.get(key) ?? null;
}

export const ADMIN_NAV_GROUPS: Array<{ key: AdminResource["navGroup"]; label: string }> = [
  { key: "core", label: "Core Data" },
  { key: "catalog", label: "Catalog" },
  { key: "ai", label: "AI Pipeline" },
  { key: "access", label: "Access Control" },
];
