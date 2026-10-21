# Application screenshots

The root READMEs use three scenes in English and Simplified Chinese:

- `topics-*.png`: a question about making a first pixel game with AI and its selected members.
- `topic-*.png`: an independent member reply with a tutorial source to collect.
- `reading-*.png`: the saved tutorial, its summary, pixel-game illustration, reading version, and original-text switch.

The images reuse the [promotional film's application captures](../../scripts/promo-video/README.md#application-captures). Questions, replies, source identities, and reading material are fictional examples. Each 2200 × 1520 PNG starts at the renderer's content origin and includes the application's own navigation or dialog header.

Run `npm run screenshots:readme` to copy the six validated promotional captures here. To refresh the running-application captures first, run `node scripts/promo-video/capture-demo.mjs`, then synchronize them. The [homepage build](../../docs/development.md#preview-the-homepage) consumes these same six files.

Refresh both language sets when the corresponding interface changes. Keep the sample-data caption beside the first screenshot in each root README.
