---
title: U2 robot tool changer
order: 6
tools: ROS 2, Python, Raspberry Pi, Arduino, control systems
summary: ROS 2 software for the U2 robot's end effector, which runs a two-jaw claw, or a drill, from one motor by switching solenoid clutches.
points:
  - Implemented a ROS 2 package on a Raspberry Pi that plans and runs claw moves through one motor and two solenoid clutches
  - Implemented a burst-based closed-loop motor controller with stall, overshoot and runaway aborts
  - Covered the planner, estimator and controller with about 180 simulation tests and a pre-commit check
deepDive: true
frames:
  - slot: effector
    alt: The U2 end effector with the claw fitted, showing the motor, solenoids and jaws
  - slot: dashboard
    alt: The web dashboard planning a claw move
  - slot: change-clip
    alt: A clip of the claw moving one jaw, then both
---

The U2 robot's end effector runs a two-jaw claw from a single motor. Solenoid clutches decide which jaw the motor turns, and the same motor can spin a drill instead. I worked on the software side: a ROS 2 package on a Raspberry Pi that plans and runs the moves.

<!-- frame: effector -->

## The idea

With no solenoid powered, the motor turns both jaws together. Powering one solenoid holds that jaw still, so only the other moves. The planner works out the order of clutch modes and motor moves to reach a target, and moves both jaws at once when it can.

## The software

An Arduino Mega reads the encoder and switches the solenoids. ROS 2 nodes on the Pi talk to it over serial, estimate where the jaws are, plan, and drive the motor. Feedback is slow, so the controller moves in short bursts, brakes, measures, and stops on anything it can't explain. A local web dashboard simulates moves, saves paths and runs them on the robot.

<!-- frame: dashboard -->

## Where it stands

Motor control and the clutches work on the bench, with one of the two solenoids fitted so far.

<!-- frame: change-clip -->
