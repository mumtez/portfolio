# Placeholders

Everything on the site still waiting for Andrew's own words or media. Each one shows in its Section as a dashed box labelled **Placeholder:**. `npm run test:site` fails if a placeholder on the site isn't listed here.

To fill one in, edit the file named, remove the `placeholder` field (or replace `{ placeholder: ... }` with your text), and delete its line below.

| Section | File | What's missing |
| --- | --- | --- |
| `/about/` | `src/content/profile.yaml` (`bio`) | A short bio in Andrew's own words (a few sentences on who he is and what he likes to build). |
| `/projects/roborebels/` | `src/content/projects/roborebels.md` | The RoboRebels story in Andrew's own words (how the robots worked, the Mexico Premier Event run, what he learned as captain), plus photos and video. |
| `/projects/baja/` | `src/content/projects/baja.md` | The Baja story in Andrew's own words (the problem, how the estimator works, the PCB and the model, results so far), plus photos and video. |
| `/projects/ftc-event-viewer/` | `src/content/projects/ftc-event-viewer.md` | The FTC Event Viewer story in Andrew's own words (why scouts need it, how it uses the FTCScout API, how it's deployed on the homelab), plus screenshots. |
| `/contact/` | `public/andrew-aburustum-resume.pdf` | The real resume PDF. Replace the placeholder file with it, keeping the same file name (no Placeholder box shows on the site for this one, so check the PDF itself). |

The Deep Dive Body Text currently in those files is a short draft from the resume, so it's accurate but not the full story.
