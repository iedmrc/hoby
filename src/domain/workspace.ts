import { z } from "zod";

import { DomainError } from "./errors";
import { isNormalizedHttpUrl } from "./url";

export const WORKSPACE_SCHEMA_VERSION = 1 as const;
export const DEFAULT_COLLECTION_COLOR = "stone" as const;

export const CollectionColorSchema = z.enum([
  "stone",
  "sky",
  "mint",
  "amber",
  "rose",
  "violet",
]);
export type CollectionColor = z.infer<typeof CollectionColorSchema>;

const IdSchema = z.string().trim().min(1).max(128);
const NameSchema = z.string().trim().min(1).max(80);
const IsoDateSchema = z.iso.datetime({ offset: true });
const NormalizedUrlSchema = z
  .string()
  .max(4_096)
  .refine(isNormalizedHttpUrl, "Expected a normalized HTTP(S) URL.");

export const SavedTabSchema = z
  .object({
    id: IdSchema,
    title: z.string().trim().min(1).max(512),
    url: NormalizedUrlSchema,
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
  })
  .strict();
export type SavedTab = z.infer<typeof SavedTabSchema>;

export const CollectionSchema = z
  .object({
    id: IdSchema,
    name: NameSchema,
    color: CollectionColorSchema,
    collapsed: z.boolean(),
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
    tabs: z.array(SavedTabSchema),
  })
  .strict()
  .superRefine((collection, context) => {
    const urls = new Set<string>();
    for (const [index, tab] of collection.tabs.entries()) {
      if (urls.has(tab.url)) {
        context.addIssue({
          code: "custom",
          message: "A collection cannot contain duplicate normalized URLs.",
          path: ["tabs", index, "url"],
        });
      }
      urls.add(tab.url);
    }
  });
export type Collection = z.infer<typeof CollectionSchema>;

export const SpaceSchema = z
  .object({
    id: IdSchema,
    name: NameSchema,
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
    collections: z.array(CollectionSchema),
  })
  .strict();
export type Space = z.infer<typeof SpaceSchema>;

export const WorkspaceDocumentSchema = z
  .object({
    schemaVersion: z.literal(WORKSPACE_SCHEMA_VERSION),
    revision: z.number().int().nonnegative(),
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
    activeSpaceId: IdSchema,
    spaces: z.array(SpaceSchema).min(1),
  })
  .strict()
  .superRefine((workspace, context) => {
    const ids = new Set<string>();
    const reportId = (id: string, path: (string | number)[]) => {
      if (ids.has(id)) {
        context.addIssue({ code: "custom", message: "IDs must be unique.", path });
      }
      ids.add(id);
    };

    for (const [spaceIndex, space] of workspace.spaces.entries()) {
      reportId(space.id, ["spaces", spaceIndex, "id"]);
      for (const [collectionIndex, collection] of space.collections.entries()) {
        reportId(collection.id, [
          "spaces",
          spaceIndex,
          "collections",
          collectionIndex,
          "id",
        ]);
        for (const [tabIndex, tab] of collection.tabs.entries()) {
          reportId(tab.id, [
            "spaces",
            spaceIndex,
            "collections",
            collectionIndex,
            "tabs",
            tabIndex,
            "id",
          ]);
        }
      }
    }

    if (!workspace.spaces.some((space) => space.id === workspace.activeSpaceId)) {
      context.addIssue({
        code: "custom",
        message: "The active space must exist.",
        path: ["activeSpaceId"],
      });
    }
  });
export type WorkspaceDocument = z.infer<typeof WorkspaceDocumentSchema>;

const LegacySavedTabSchema = SavedTabSchema.omit({ updatedAt: true });
const LegacyCollectionSchema = z
  .object({
    id: IdSchema,
    name: NameSchema,
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
    tabs: z.array(LegacySavedTabSchema),
  })
  .strict();
const LegacySpaceSchema = z
  .object({
    id: IdSchema,
    name: NameSchema,
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
    collections: z.array(LegacyCollectionSchema),
  })
  .strict();
const LegacyWorkspaceDocumentSchema = z
  .object({
    schemaVersion: z.literal(0),
    revision: z.number().int().nonnegative(),
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
    activeSpaceId: IdSchema,
    spaces: z.array(LegacySpaceSchema).min(1),
  })
  .strict();

export interface DomainContext {
  readonly createId: () => string;
  readonly now: () => string;
}

export const defaultDomainContext: DomainContext = {
  createId: () => globalThis.crypto.randomUUID(),
  now: () => new Date().toISOString(),
};

export function createStarterWorkspace(
  context: DomainContext = defaultDomainContext,
): WorkspaceDocument {
  const now = context.now();
  const spaceId = context.createId();
  const collectionId = context.createId();

  return WorkspaceDocumentSchema.parse({
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    activeSpaceId: spaceId,
    spaces: [
      {
        id: spaceId,
        name: "My space",
        createdAt: now,
        updatedAt: now,
        collections: [
          {
            id: collectionId,
            name: "Inbox",
            color: DEFAULT_COLLECTION_COLOR,
            collapsed: false,
            createdAt: now,
            updatedAt: now,
            tabs: [],
          },
        ],
      },
    ],
  });
}

export function parseWorkspaceDocument(input: unknown): WorkspaceDocument {
  const parsed = WorkspaceDocumentSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("WORKSPACE_INVALID", "The workspace data is invalid.", {
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}

export function migrateWorkspaceDocument(input: unknown): WorkspaceDocument {
  const version = z
    .object({ schemaVersion: z.number().int() })
    .passthrough()
    .safeParse(input);

  if (!version.success) {
    throw new DomainError(
      "WORKSPACE_INVALID",
      "The workspace does not contain a valid schema version.",
    );
  }

  if (version.data.schemaVersion === WORKSPACE_SCHEMA_VERSION) {
    return parseWorkspaceDocument(input);
  }

  if (version.data.schemaVersion === 0) {
    const legacy = LegacyWorkspaceDocumentSchema.safeParse(input);
    if (!legacy.success) {
      throw new DomainError("WORKSPACE_INVALID", "The legacy workspace is invalid.", {
        issues: legacy.error.issues,
      });
    }

    return parseWorkspaceDocument({
      ...legacy.data,
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      spaces: legacy.data.spaces.map((space) => ({
        ...space,
        collections: space.collections.map((collection) => ({
          ...collection,
          color: DEFAULT_COLLECTION_COLOR,
          collapsed: false,
          tabs: collection.tabs.map((tab) => ({ ...tab, updatedAt: tab.createdAt })),
        })),
      })),
    });
  }

  throw new DomainError(
    "WORKSPACE_UNSUPPORTED",
    `Workspace schema version ${version.data.schemaVersion} is not supported.`,
    { schemaVersion: version.data.schemaVersion },
  );
}

export function cloneWorkspace(workspace: WorkspaceDocument): WorkspaceDocument {
  return {
    ...workspace,
    spaces: workspace.spaces.map((space) => ({
      ...space,
      collections: space.collections.map((collection) => ({
        ...collection,
        tabs: collection.tabs.map((tab) => ({ ...tab })),
      })),
    })),
  };
}
