# AutoMod rule icons

These 128 × 128 PNGs are the application emojis used by the AutoMod rule
selectors. `sources.json` maps each rule type to its filename, Figma node and
Discord emoji name.

The editable icons are in the `Normal` grid on the `Emoji` page of
[Icons (Brand WolfStar)](https://www.figma.com/design/mENlr6NioJQolUsV3FI7eX/Icons--Brand-WolfStar-?node-id=2097-2).
They reuse WolfStar glyphs and symbols from the
[Discord icon sheet](https://www.figma.com/design/Z3PFMvgHo95bNq2IdAZNNr?node-id=1-448).
Attachments, capitals, duplicates, phishing and zalgo have purpose-drawn glyphs;
cooldown rules add a clock.

The dark circle behind each glyph is only there in Figma, to see the grey glyph
on something. The PNGs are exported without it, as a transparent image with the
glyph in `#80848E` at 76% opacity (alpha 195), the grey of the other emojis of
the bot. The glyph is `#B5BBC0` in Figma, so recolour the export: a glyph left
opaque looks lighter than the others in Discord.

Upload each PNG under its `emojiName` to the staging, beta and production
applications. `loadApplicationEmojis` resolves the application-specific IDs at
startup.
