---
title: FTC Event Viewer
order: 3
tools: TypeScript, React, Docker, FTCScout API
summary: A scouting web app, used by 30+ FTC teams, that ranks the teams at any FTC event by offensive power rating (OPR).
points:
  - Built a scouting web app, used by 30+ FTC teams, that ranks event teams by offensive power rating (OPR)
link:
  label: ftc.aburustum.com
  href: https://ftc.aburustum.com
deepDive: true
frames:
  - slot: teams
    alt: The FTC Event Viewer listing an event's teams by OPR
    caption: The teams at the 2025 Maryland Tech Invitational, best OPR first.
    aspect: 16 / 10
---

At an FTC event you want to know who the strongest teams are: who to watch in qualification matches, and who to pick or hope to be picked by in alliance selection. OPR (offensive power rating) is the quickest single number for that. It estimates how many points a team adds to its alliance's score, worked out from its match results. But there was no way to take an event and sort its teams by OPR to see who was best, so I built one.

<!-- frame: teams -->

## How it works

You type an event code, such as `2024/USCHSLAOS` (the season, then the event). Half a second after you stop typing, the app asks the FTCScout API for that event's teams. Then, for every team at once, it fetches the team's details and its OPR for that season, and sorts them best first. You can click the column headers to sort by number or name instead. Click a team to see its school, location, rookie year and world OPR rank, with links to its FTCScout and Orange Alliance pages and its own website.

It's a React app written in TypeScript, with Material UI for the table.

## A bug when the season rolled over

When the 2026 season started, every team suddenly showed no name and an OPR of 0. FTCScout's team stats endpoint returns the current season's numbers unless you ask for another, and the new season didn't have any yet. Event codes already start with their season, so the fix was to read it from the code and ask for that season's stats.

## Deployment

It runs in Docker on my homelab. A two-stage Dockerfile builds the app with Node, then serves the static build with `serve` in a small Node image. The image is on Docker Hub, and Docker Compose runs it with a health check on the same network as Nginx Proxy Manager, which serves it at [ftc.aburustum.com](https://ftc.aburustum.com).
