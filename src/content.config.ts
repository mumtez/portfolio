/**
 * Section content: the single source of truth for every Section's Plain View HTML
 * (ADR 0002), and later for the cells the Grid typesets from it.
 *
 * - `sections`: each top-level Section's URL, nav label, heading and description, in nav order.
 *   Deep Dives come from `projects` instead, so they're defined once.
 * - `profile`: facts about Andrew (name, education, experience, languages, contact).
 * - `projects`: one Markdown file per project; a Deep Dive's file body is its Body Text.
 *
 * Content comes from the resume. No phone number or home town anywhere.
 */
import { defineCollection } from "astro:content";
import { file, glob } from "astro/loaders";
import { z } from "astro/zod";

/** Content still waiting for Andrew's own words. Rendered visibly marked; listed in PLACEHOLDERS.md. */
const placeholder = z.object({ placeholder: z.string() });

const sections = defineCollection({
  loader: file("src/content/sections.yaml"),
  schema: z.object({
    path: z.string().regex(/^\/([a-z0-9-]+\/)*$/),
    nav: z.string(),
    heading: z.string(),
    title: z.string(),
    description: z.string(),
  }),
});

const profile = defineCollection({
  loader: file("src/content/profile.yaml"),
  schema: z.object({
    name: z.string(),
    tagline: z.string(),
    bio: z.union([z.string(), placeholder]),
    education: z.object({ school: z.string(), degree: z.string(), dates: z.string() }),
    experience: z.array(
      z.object({
        org: z.string(),
        role: z.string(),
        location: z.string(),
        dates: z.string(),
        points: z.array(z.string()),
      }),
    ),
    languages: z.array(z.string()),
    skills: z.array(z.object({ area: z.string(), items: z.string() })),
    activities: z.array(z.object({ name: z.string(), role: z.string(), dates: z.string() })),
    contact: z.object({
      email: z.email(),
      github: z.url(),
      linkedin: z.url(),
      /** The resume PDF's path on the site, a file in `public/`. */
      resume: z.string().regex(/^\/[a-z0-9-]+\.pdf$/),
    }),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: "*.md", base: "src/content/projects" }),
  schema: z.object({
    title: z.string(),
    /** Position on the Projects Section. */
    order: z.number(),
    tools: z.string(),
    summary: z.string(),
    points: z.array(z.string()),
    link: z.object({ label: z.string(), href: z.url() }).optional(),
    /** A Deep Dive has its own Section at `/projects/<file name>/`, with the file body as Body Text. */
    deepDive: z.boolean().default(false),
    /** What's still missing from a Deep Dive's story, until Andrew writes it. */
    placeholder: z.string().optional(),
  }),
});

export const collections = { sections, profile, projects };
