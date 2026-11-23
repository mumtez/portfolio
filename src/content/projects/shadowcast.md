---
title: Shadowcast
highlight: 1st place · $10,000 prize
order: 1
tools: ESP32-C5, ESP-NOW, Python, NumPy, Server-Sent Events, GitHub Actions
summary: 1st place and a $10,000 prize at the USSOCOM-sponsored Code Metal Forge hackathon. A WiFi sensing system that shows where people are moving inside a building, with no cameras and no network.
points:
  - Wrote the Python pipeline that turns WiFi signal data from ESP32 boards into a live motion call for each link and a room heatmap
  - Built the dashboard server, simulator and replay tools, with 447 automated tests running in CI
  - Measured receiver noise across boards and moved the rig to ESP32-C5s, cutting false alarms in a quiet room from 35–65% to 4–16%
link:
  label: Code on GitHub
  href: https://github.com/CodeMetalForge-Hackathon/Team-12-Shadowcast
deepDive: true
frames:
  - slot: demo
    alt: Top, a teammate walks across an office test area. Bottom, the laptop dashboard switches links to motion and the heatmap lights up.
    caption: Live test, walking through the links.
    aspect: 1080 / 1206
  - slot: puck
    alt: A Seeed XIAO ESP32-C5 board sealed in a small clear screw-top case
    caption: One sensor puck.
    aspect: 1 / 1
  - slot: live-map
    alt: A pitch slide showing a live room heatmap with four pucks and their links, beside the stats
    caption: The live map, from our pitch.
    aspect: 16 / 9
---

Shadowcast took 1st place and a $10,000 prize at the Code Metal Forge hackathon, sponsored by USSOCOM, in November 2026. You put small WiFi pucks around a room, and a laptop shows where someone is moving. It needs no camera, nothing on the person and no outside network, so it works for teams going into a building when comms are down.

<!-- frame: demo -->

## How it works

Each puck is an ESP32-C5 on a battery. Two send packets 40 times a second and two receive them. Each packet carries 114 measurements of how the signal crossed the room, and those numbers flicker when someone walks between two pucks. Each sender-to-receiver link gets its own call, empty or motion, and the links together make a heatmap.

<!-- frame: puck -->

## What I built

I wrote most of the software: the signal parser, motion scoring and calibration, the heatmap, a simulator so it runs without boards, and the dashboard server. I also set up flashing and CI. My teammates built the wireless receivers, the final UI and the pitch.

<!-- frame: live-map -->

## Results

On a single-link test, every walking window read as motion and 94% of empty-room windows read as empty.
