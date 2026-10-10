# Placeholders

Everything on the site still waiting for Andrew's own words or media. Each one shows in its Section as a dashed box labelled **Placeholder:**. `npm run test:site` fails if a placeholder on the site isn't listed here.

To fill one in, edit the file named, remove the `placeholder` field (or replace `{ placeholder: ... }` with your text), and delete its line below.

| Section | File | What's missing |
| --- | --- | --- |
| `/about/` | `src/content/profile.yaml` (`bio`) | A short bio in Andrew's own words (a few sentences on who he is and what he likes to build). |
| `/projects/roborebels/` | `src/content/projects/roborebels.md` | The RoboRebels story in Andrew's own words (how the robots worked, the Mexico Premier Event run, what he learned as captain), plus photos and video. |
| `/projects/baja/` | `src/content/projects/baja.md` | The Baja story in Andrew's own words (the problem, how the estimator works, the PCB and the model, results so far), plus photos and video. |
| `/projects/ftc-event-viewer/` | `src/content/projects/ftc-event-viewer.md` | The FTC Event Viewer story in Andrew's own words (why scouts need it, how it uses the FTCScout API, how it's deployed on the homelab), plus screenshots. |

The Deep Dive Body Text currently in those files is a short draft from the resume, so it's accurate but not the full story.

## Photos and videos (Frames)

Each Deep Dive has **Frames**: slots for photos and videos, shown in the page as a dashed placeholder box until the file is there. To fill one, drop the file into the folder below, named after the Frame's slot, with any of these extensions: `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`, `.gif` (shown as a photo) or `.mp4`, `.webm`, `.mov` (shown as a video with controls; a video wins over a photo with the same name). No code changes: the next build picks it up (restart `npm run dev` if it's running), and you delete the line below.

- Folder: `public/media/<deep dive>/`, where `<deep dive>` is the Markdown file's name (`roborebels`, `baja`, `ftc-event-viewer`). Create it if it isn't there.
- File name: `<slot>.<extension>`, all lowercase, e.g. `public/media/baja/pcb.jpg`.
- Keep photos to about 2000px on the long side and videos short and compressed (H.264 `.mp4`); they're served as they are.
- To add, remove, move or describe a Frame, edit `frames:` in the Deep Dive's Markdown front matter (`slot`, `alt` describing what it shows, optional `caption`, optional `aspect` such as `16 / 9`; the default is `3 / 2`). Put a line `<!-- frame: <slot> -->` in the Body Text where it should go; Frames without one follow the Body Text. The media keeps its own shape inside the Frame.

| Section | Slot | What it's for | Placeholder |
| --- | --- | --- | --- |
| `/projects/roborebels/` | `robot` | One of the robots | Photo or video: add public/media/roborebels/robot.jpg (or .jpeg, .png, .webp, .avif, .gif, .mp4, .webm, .mov) |
| `/projects/roborebels/` | `match` | A match (16:9 Frame, good for video) | Photo or video: add public/media/roborebels/match.jpg (or .jpeg, .png, .webp, .avif, .gif, .mp4, .webm, .mov) |
| `/projects/baja/` | `pcb` | The estimator's custom PCB | Photo or video: add public/media/baja/pcb.jpg (or .jpeg, .png, .webp, .avif, .gif, .mp4, .webm, .mov) |
| `/projects/baja/` | `car` | The Baja car | Photo or video: add public/media/baja/car.jpg (or .jpeg, .png, .webp, .avif, .gif, .mp4, .webm, .mov) |
| `/projects/ftc-event-viewer/` | `teams` | A screenshot of an event's teams sorted by OPR (16:10 Frame) | Photo or video: add public/media/ftc-event-viewer/teams.jpg (or .jpeg, .png, .webp, .avif, .gif, .mp4, .webm, .mov) |
