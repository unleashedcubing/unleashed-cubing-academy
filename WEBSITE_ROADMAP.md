# Unleashed Cubing Website Roadmap

## Product vision

Build one connected cubing ecosystem instead of several unrelated websites:

1. **Main site** — the public home for tutorials, videos, mosaics, news, and the Academy introduction.
2. **Unleashed Cubing Academy (UCA)** — the existing timer, training, battles, quests, social features, and Cubey assistant.
3. **Shop** — a focused store for useful or distinctive cubing products.
4. **The Cubing Post** — an original, human-reviewed publication about cubing news, techniques, creators, and competitions.

The shared design system should use the same navigation, account, appearance theme, typography, and Cubey personality everywhere.

## Current product decisions

- The timer remains useful without requiring users to learn algorithms.
- Basic Cubey and core training tools stay in the free experience.
- Pro Cubey can become a paid feature only after the free assistant is reliable and useful.
- Algorithm animations can be part of the free Academy.
- Algorithm videos featuring professional cubers are **unconfirmed** and are not part of the current build or launch plan.
- The sketched membership prices of `$3.99/month` and `$29.99/year` are hypotheses to test, not final prices.

## Product structure

### Main site

Launch with a small number of strong pages:

- **Home** — clear explanation of Unleashed Cubing, a direct timer launch button, and featured content.
- **Learn** — written tutorials, beginner paths, and links into relevant Academy training.
- **Academy** — an introduction to the timer, algorithms, goals, battles, social tools, quests, and Cubey.
- **Mosaics** — gallery, planning information, and a future path to kits or commissions.
- **The Cubing Post** — original articles and news.
- **Shop** — initially limited to products that can be tested and supported well.

### Academy

Keep improving the current app around three user paths:

- **Timer-first cuber** — can time solves, view useful statistics, complete solve-based quests, and progress without algorithm requirements.
- **Learner** — can study algorithms, see today's training, use animations, and build practice plans.
- **Social competitor** — can add friends, message, join calls, invite people to battles, and track live activity.

### Shop

Test differentiated products before adding a large catalogue:

1. Mosaic kits.
2. Custom cube setups or setup guidance.
3. Small branded products with low inventory risk.
4. Clothes and bags only after supplier quality, returns, shipping, and margins have been tested.

### The Cubing Post

Use AI only to assist research, outlines, transcription cleanup, and editing. Every article should add original reporting, explanation, opinion, or analysis and receive a human review before publishing. Credit and link sources; do not copy or lightly rewrite a creator's video or article.

## Delivery phases

### Phase 0 — Stabilize the Academy

- Fix messaging, calls, battle invites, presence, and Firestore-rule reliability.
- Finish the Cubey visual asset and define its thinking, success, quest, and idle states.
- Make quests clear, achievable, theme-aware, and useful to timer-first users.
- Test the app on desktop, tablet, and mobile without overflow or blocked controls.
- Add basic error reporting and product analytics before expanding scope.

**Exit condition:** the main timer and social flows work reliably for real users.

### Phase 1 — Build the public site foundation

- Create the shared header, footer, colour themes, typography, buttons, cards, and responsive layout.
- Build Home, Learn, Academy, Mosaics, Post, and Shop landing pages.
- Add search-friendly page titles, descriptions, social preview images, and clean URLs.
- Connect every relevant page back to the Academy timer with one obvious action.

**Exit condition:** a new visitor understands the product and can reach the timer or a useful tutorial quickly.

### Phase 2 — Publish useful content

- Release a beginner learning path and a small set of high-quality tutorials.
- Publish original Cubing Post articles on a consistent schedule.
- Add text, diagrams, and existing permitted video embeds where they improve the lesson.
- Build the mosaic gallery and explain how kits or commissions would work.

**Exit condition:** the site has enough original content to earn repeat visits without relying only on the app.

### Phase 3 — Define Free and Pro

- Measure which free features users return to before choosing paid limits.
- Keep the timer, solve history, basic statistics, solve-based progression, and Basic Cubey useful for free users.
- Prototype Pro Cubey, deeper analytics, enhanced planning, or premium mosaic tools.
- Test pricing and demand before building a full subscription system.

**Exit condition:** users clearly understand the paid value and it does not weaken the free timer experience.

### Phase 4 — Run a small commerce pilot

- Start with one or two mosaic or custom-setup offers.
- Validate product quality, packaging, delivery time, support, returns, and actual profit.
- Add reviews and clear fulfilment information.
- Expand into dropshipped clothes or bags only if samples pass quality checks.

**Exit condition:** fulfilment works consistently and customers receive a product worth recommending.

## Suggested 90-day sequence

### Weeks 1–3: reliability

- Complete Firestore and social-flow testing with two real accounts.
- Finalize Cubey's base design and core states.
- Fix the highest-impact mobile, overflow, and accessibility issues.
- Define a short release checklist for every push.

### Weeks 4–6: public site MVP

- Create shared site navigation and design tokens.
- Build Home, Learn, Academy, and Post index pages.
- Publish one complete beginner tutorial and one original article.
- Add a clear launch path into the timer.

### Weeks 7–9: content and mosaics

- Publish two more tutorials and two more articles.
- Build the mosaic gallery and a simple interest form.
- Add internal links between tutorials, algorithm training, and timer sessions.

### Weeks 10–12: validate the next business step

- Interview or survey active users about Pro Cubey and mosaic products.
- Prototype the strongest paid idea without locking free timer features.
- Test one shop offer with a small audience before expanding inventory.
- Review retention, timer usage, tutorial completion, and support problems.

## Measures that matter

- Visitors who launch the timer.
- New users who complete their first 5, 25, and 100 solves.
- Weekly returning timer users.
- Tutorial completion and return visits.
- Quest completion without forced algorithm learning.
- Successful messages, calls, and battle invites.
- Mosaic interest or shop conversion.
- Support issues and failed actions per active user.

## Next implementation backlog

1. Finish and test Academy reliability before creating paid features.
2. Finalize Cubey and replace temporary character assets.
3. Create the public-site information architecture and shared navigation.
4. Build the Home and Learn MVP pages.
5. Write the first original beginner tutorial and Cubing Post article.
6. Prototype a mosaic gallery and interest form.
7. Validate Pro and shop demand before adding subscriptions or a large catalogue.
