# AutoMod rule icons

These 128 × 128 PNGs are the application emojis used by the AutoMod rule
selectors. `sources.json` maps each rule type to its filename, Figma node and
Discord emoji name.

The editable icons are in the `Normal` grid on the `Emoji` page of
[Icons (Brand WolfStar)](https://www.figma.com/design/mENlr6NioJQolUsV3FI7eX/Icons--Brand-WolfStar-?node-id=2097-2).
They reuse WolfStar glyphs and symbols from the
[Discord icon sheet](https://www.figma.com/design/Z3PFMvgHo95bNq2IdAZNNr?node-id=1-448),
with matching grey glyphs and dark circular backgrounds. Attachments, capitals,
duplicates, phishing and zalgo have purpose-drawn glyphs; cooldown rules add a
clock.

Upload each PNG under its `emojiName` to the staging, beta and production
applications. `loadApplicationEmojis` resolves the application-specific IDs at
startup.
