// Database row types (match Supabase schema)

export type Profile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
  status: 'active' | 'waitlisted';
  created_at: string;
};

export type SkillCategoryRow = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type SkillRow = {
  id: string;
  category_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type UserSkillRow = {
  user_id: string;
  skill_id: string;
  status: "covered" | "partial" | "missing";
  last_updated: string | null;
  section_title: string | null;
  coverage_note: string | null;
  fulfilled: boolean;
};

export type PlaybookSectionRow = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  content_json: Record<string, unknown> | null;
  sort_order: number;
  depth: number;
  last_updated: string;
  created_at: string;
  source_page_id?: string;
  provider: string;
};

export type SectionSkillRow = {
  section_id: string;
  skill_id: string;
};

export type StagedEditRow = {
  id: string;
  section_id: string;
  before_text: string;
  after_text: string;
  after_json: Record<string, unknown> | null;
  status: "pending" | "approved" | "rejected";
  source: "chat" | "manual" | null;
  message_id: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type ChatMessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  section_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type ConnectionRow = {
  id: string;
  provider: string;
  access_token: string;
  refresh_token: string | null;
  workspace_id: string | null;
  connected_by: string | null;
  created_at: string;
};

export type ImportRow = {
  id: string;
  provider: string;
  status: "pending" | "processing" | "completed" | "failed";
  file_path: string | null;
  metadata: Record<string, unknown> | null;
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
  error: string | null;
};

// Confluence browse types

export type ConfluenceSpace = {
  id: string;
  name: string;
  key: string;
};

export type ConfluencePageSummary = {
  id: string;
  title: string;
  parentId: string | null;
};

// Frontend-facing types (match existing component expectations)

export type Skill = {
  id: string;
  name: string;
  status: "covered" | "partial" | "missing";
  lastUpdated?: string;
  section?: string;
  coverageNote?: string;
  fulfilled: boolean;
};

export type SkillCategory = {
  id: string;
  name: string;
  skills: Skill[];
};

export type SectionSkillLink = {
  skillId: string;
  coverageNote: string | null;
};

export type PlaybookSection = {
  id: string;
  title: string;
  /** Markdown content (fallback / diff display) */
  content: string;
  /** TipTap JSON content (source of truth when present) */
  contentJson: Record<string, unknown> | null;
  depth: number;
  lastUpdated: string;
  provider: string;
  skillsCovered: SectionSkillLink[];
};

export const PROVIDER_LABELS: Record<string, string> = {
  pdf: "PDF Upload",
  taskbase: "Taskbase Template",
  notion: "Notion",
  confluence: "Confluence",
};

export type EditSource = "chat" | "manual";

export type StagedEdit = {
  id: string;
  sectionId: string;
  section: string;
  before: string;
  after: string;
  timestamp: string;
  status: "pending" | "approved" | "rejected";
  source?: EditSource;
};

export type StreamedEdit = {
  id: string;
  sectionId: string;
  sectionTitle: string;
  before: string;
  after: string;
  rationale: string;
  timestamp: string;
  /** Present when loaded from DB; absent during live streaming (defaults to "pending"). */
  status?: "pending" | "approved" | "rejected";
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  edits?: StreamedEdit[];
};

export type HealthScore = {
  score: number;
  covered: number;
  total: number;
  partial: number;
  missing: number;
  outdated: number;
  lastAnalyzed: string | null;
};
