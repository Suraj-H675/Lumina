# Product

## Purpose

Nova-Lumina is a public astronomy learning and exploration platform. It aims to connect discovery, understanding, deterministic experimentation, observation planning, real-sky context, live-space information, and personal learning tools without compromising scientific provenance.

## Audience

The interface should work for beginners while still exposing enough detail, source context, and model limitations for students and experienced astronomy enthusiasts.

## Main product areas

Current user-facing areas include:

- Mission Control;
- Explore and object pages;
- Compare and Collections;
- Observe, Tonight, and Journal;
- Learn;
- Space Lab simulations;
- Space Now and provider-backed live information;
- Deep Sky / WorldWide Telescope experiences;
- Participate;
- optional Identify / plate-solving capability.

## Product principles

1. **Scientific honesty first.** Do not present model output as measurement or stale data as current data.
2. **Provenance is part of the product.** Users should be able to understand where important scientific information came from.
3. **Accessibility is functional behaviour.** Core understanding cannot depend solely on colour, animation, pointer input, or WebGL.
4. **Graceful degradation.** Optional providers, weather, visualisation engines, and other external services should fail without taking unrelated core functionality down.
5. **Free use.** Required core functionality must not depend on a paid API/SDK; current infrastructure planning is constrained to zero-cost services until explicitly changed.
6. **Avoid unnecessary complexity.** Accounts, cloud sync, LLMs, additional databases, queues, and services should be added only when they solve a demonstrated user problem better than the simpler design.

## Non-assumptions

These are deliberately **not** permanent product rules:

- personal data does not have to remain local-first forever;
- accounts/cloud persistence are not forbidden;
- the current frontend/backend split is not immune to redesign;
- existing feature scope, naming, routes, or implementation phases are not sacred;
- lack of an LLM today does not create a prohibition on all future AI use, but any such addition must be justified against scientific reliability, privacy, cost, accessibility, and product value.
