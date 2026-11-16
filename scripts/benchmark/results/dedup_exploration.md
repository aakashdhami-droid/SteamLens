# SteamLens Deduplication Exploration

**Date:** 2026-11-17  
**Deduplication:** word-level Jaccard similarity, default threshold `0.7` (unchanged)  
**Sample:** 300 most recent English reviews per game, `purchase_type=all`

## Data source note

The requested endpoint `https://store.steampowered.com/appreviews/<appid>?...` currently responds with an HTTP 302 redirect to the Steam homepage from this environment (tested with and without a cursor, plus cookies, referer, and XHR headers). `scripts/benchmark/dedup-explore.js` attempts that endpoint first, then falls back to Steam's official `IUserReviewsService/GetAppReviews/v1` endpoint, which is the same service `server/services/steamService.js` uses. Every count below comes from live responses fetched on 2026-11-17; no numbers are estimated.

## Candidates

Names were resolved with the Steam store search / appdetails APIs, not from memory.

| Game | App ID | Why it was included |
| :--- | ---: | :--- |
| Dead by Daylight | 381210 | Recently review-bombed in the Nov 1–6, 2026 window |
| HELLDIVERS™ 2 | 553850 | Review-bombed in March 2026; many recent reviews |
| Team Fortress 2 | 440 | Meme/copypasta-heavy |
| Garry's Mod | 4000 | Meme/copypasta-heavy |
| Counter-Strike 2 | 730 | Popular, high recent-review volume |
| Dota 2 | 570 | Popular, high recent-review volume |

## Results

Removal percentage is relative to the after-spam-filter count, matching the main benchmark's definition.

| Game | App ID | Raw | After spam filter | Removed @0.5 | Removed @0.6 | Removed @0.7 | Removed @0.8 | Removal @0.7 |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Dead by Daylight | 381210 | 300 | 294 | 2 | 2 | 2 | 2 | 0.68% |
| HELLDIVERS™ 2 | 553850 | 300 | 300 | 0 | 0 | 0 | 0 | 0.00% |
| Team Fortress 2 | 440 | 300 | 295 | 0 | 0 | 0 | 0 | 0.00% |
| Garry's Mod | 4000 | 300 | 294 | 3 | 1 | 1 | 0 | 0.34% |
| Counter-Strike 2 | 730 | 300 | 294 | 0 | 0 | 0 | 0 | 0.00% |
| Dota 2 | 570 | 300 | 285 | 0 | 0 | 0 | 0 | 0.00% |

## Example pairs at threshold 0.7

### Dead by Daylight (highest removal: 2 of 294 after spam filtering)

1. Removed `#238270410` vs kept `#238270321`
   - Removed: `NOT RECOMMENDED - The game is currently in an unplayable and unfair state The developers have completely ruined the game balance with an undeniable...`
   - Kept: `NOT RECOMMENDED - The game is currently in an unplayable and unfair state The developers have completely ruined the game balance with an undeniable...`
   - Full-text check: both reviews are exactly 2,010 characters and byte-for-byte identical.

2. Removed `#238270635` vs kept `#238270321`
   - Removed: `NOT RECOMMENDED - The game is currently in an unplayable and unfair state The developers have completely ruined the game balance with an undeniable...`
   - Kept: `NOT RECOMMENDED - The game is currently in an unplayable and unfair state The developers have completely ruined the game balance with an undeniable...`
   - Full-text check: 2,011 characters, differing from the kept review only by one trailing newline.

### Garry's Mod (1 of 294 after spam filtering)

1. Removed `#239933851` vs kept `#239990912`
   - Removed: `Please describe what you liked or disliked about this game and whether you recommend it to others. Please remember to be polite and follow the Rule...`
   - Kept: `Write a review for Garry's Mod Please describe what you liked or disliked about this game and whether you recommend it to others. Please remember t...`
   - Full-text check: these are Steam review-form boilerplate/placeholder strings, not substantive user opinions. The removed text is 164 characters; the kept text is 195 characters and prepends `Write a review for Garry's Mod`.

## Honest judgment

- **Dead by Daylight is a real positive result.** The two removed reviews are not merely "similar"; they are copies of the same 2,010-character copypasta. One is identical to the kept review, and the other differs only by a trailing newline. The 0.7 threshold is doing exactly what it should here.
- **Garry's Mod is a technical catch, not a meaningful one.** The pair is near-identical because both are Steam's own review-form boilerplate. Deduplicating it is harmless, but it does not demonstrate removal of duplicated player opinion.
- **The other four games removed nothing at any tested threshold.** HELLDIVERS 2, Team Fortress 2, Counter-Strike 2, and Dota 2 all had 0 removals even at 0.5. In this sample, word-level Jaccard is conservative and does not appear to over-dedupe ordinary, differently-worded reviews.
- **Threshold sanity check:** lowering to 0.5 only added two more Garry's Mod boilerplate removals (3 vs. 1); no other game changed. Raising to 0.8 still caught the exact Dead by Daylight copies but lost the Garry's Mod subset match. A 0.7 default is reasonable for literal/near-literal copypasta, but it will not catch paraphrases or reviews that merely share an opinion.

## Recommendation for a second benchmark run

Use **Dead by Daylight (App ID 381210)**. It is the only candidate with a meaningful non-zero removal at 0.7, and the removed pairs are defensible as genuine near-copies rather than ordinary similar reviews.

The caveat is that the effect is small: 2 of 294 after spam filtering (0.68%). That is honest but much lower than the old character-overlap result on Terraria (68.04%). If the goal is a high deduplication number, it would require a corpus with more active copypasta; do not use Garry's Mod to inflate the result, because its only 0.7 match is placeholder boilerplate rather than duplicated player opinion. Because reviews are live, the exact Dead by Daylight counts may change if rerun later.
