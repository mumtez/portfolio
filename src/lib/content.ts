/**
 * Reads Section content from the collections in `src/content.config.ts`.
 */
import { getCollection, getEntry, type CollectionEntry } from "astro:content";

export type Section = CollectionEntry<"sections">["data"];
export type Project = CollectionEntry<"projects">;

export async function getSection(id: string): Promise<Section> {
  const entry = await getEntry("sections", id);
  if (!entry) throw new Error(`No Section "${id}" in src/content/sections.yaml`);
  return entry.data;
}

/** The top-level Sections, in nav order. */
export async function getSections(): Promise<Section[]> {
  return (await getCollection("sections")).map((entry) => entry.data);
}

export async function getProfile(): Promise<CollectionEntry<"profile">["data"]> {
  const entry = await getEntry("profile", "andrew");
  if (!entry) throw new Error('No "andrew" entry in src/content/profile.yaml');
  return entry.data;
}

/** Every project, in Projects order. */
export async function getProjects(): Promise<Project[]> {
  return (await getCollection("projects")).sort((a, b) => a.data.order - b.data.order);
}

export async function getDeepDives(): Promise<Project[]> {
  return (await getProjects()).filter((project) => project.data.deepDive);
}

export function deepDivePath(project: Project): string {
  return `/projects/${project.id}/`;
}
