---
title: Baja fuel-level estimator
order: 2
tools: Accelerometers, ESP32, STM32, KiCad, Python
summary: Electrical team member on Olin Baja, fall 2026 to present, co-developing a fuel gauge that reads the tank's fill from vibration.
link:
  label: github.com/mumtez/baja_logger
  href: https://github.com/mumtez/baja_logger
points:
  - Co-developing a non-contact fuel-level estimator using accelerometers, a custom PCB and a Python model
deepDive: true
frames:
  - slot: spectra
    alt: Chart of tap-averaged vibration spectra from 10 to 150 Hz, one line per fill level, showing a peak near 57 Hz and a dip near 80 Hz that shift with fill
    caption: Vibration spectra at each fill level.
    aspect: 1090 / 540
  - slot: schematic
    alt: KiCad schematic of the board's microcontroller sheet, showing an STM32F446 microcontroller, an MPU-6050 accelerometer, a 16 MHz crystal, test pads and a power LED
    caption: The microcontroller schematic.
    aspect: 1326 / 935
  - slot: layout
    alt: KiCad layout of the two-layer board, with red top and blue bottom copper, power inputs, four mounting holes and connectors along the edges
    caption: The layout, still being routed.
    aspect: 943 / 777
  - slot: predictor
    alt: Grid of charts plotting predicted against actual fill level for four predictors, under both scoring tests
    caption: Predicted vs actual fill, on fill levels the model never saw.
    aspect: 1599 / 805
  - slot: car
    alt: The Olin Baja car
---

On Olin Baja's electrical team, I'm co-developing a fuel gauge that never touches the tank. Competition rules ban sensors on the fuel tank, so we read the fill level from how the frame beside it vibrates.

## The idea

The tank sits on rubber mounts, so it behaves like a mass on a spring: more fuel should mean a lower resonant frequency.

## Bench testing

We're testing with a bucket of water on rubber erasers, filled in 50 oz steps, with ESP32 boards and accelerometers on the table beside it and a mallet tapping the table.

<!-- frame: spectra -->

## Results so far

The expected frequency drop hasn't shown up yet: the rubber stiffens under load and pushes the peak up instead. Other features still track the fill, and our predictor reads it to about ±39 oz on fill levels it never saw, against ±113 oz for guessing.

<!-- frame: predictor -->

## The board

For the car, it moves onto a custom board in KiCad: an STM32F446 and an MPU-6050 accelerometer, with CAN to talk to the rest of the car.

<!-- frame: schematic -->

<!-- frame: layout -->

<!-- frame: car -->
