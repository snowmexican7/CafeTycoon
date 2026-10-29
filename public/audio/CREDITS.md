# Audio credits and licenses

Every sound in CafeTycoon is either a CC0 (public domain) sample or generated in the browser
with the Web Audio API. Nothing here needs attribution, but credit is given anyway.

## Samples (`public/audio/sfx/*.mp3`)

All by **Kenney** (www.kenney.nl), licensed **CC0 1.0 Universal**
(http://creativecommons.org/publicdomain/zero/1.0/). Each pack's `License.txt` says the same.
Files were converted to mono 44.1 kHz 64 kbps MP3 with leading silence trimmed; nothing else changed.

| File | Source pack | Original file | Used for |
| --- | --- | --- | --- |
| click.mp3 | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | click_002.ogg | UI button clicks |
| cup1.mp3 | [Impact Sounds](https://kenney.nl/assets/impact-sounds) | impactPlate_light_000.ogg | cup set on the pass, order served |
| cup2.mp3 | Impact Sounds | impactPlate_light_002.ogg | cup set on the pass (variation) |
| clink.mp3 | Impact Sounds | impactGlass_light_002.ogg | picking up an item, bot mistake |
| trash.mp3 | Impact Sounds | impactTin_medium_001.ogg | binning an item |
| box.mp3 | Impact Sounds | impactSoft_heavy_001.ogg | night restock delivery |
| coins1.mp3 | [RPG Audio](https://kenney.nl/assets/rpg-audio) | handleCoins.ogg | register / tip on a serve, influencer served |
| coins2.mp3 | RPG Audio | handleCoins2.ogg | serve (variation), buying an upgrade |
| doorSlam.mp3 | RPG Audio | doorClose_4.ogg | unhappy customer storms out |
| doorOpen.mp3 | RPG Audio | doorOpen_1.ogg | customer turned away at a full queue |
| dayStart.mp3 | [Music Jingles](https://kenney.nl/assets/music-jingles) | Sax jingles/jingles_SAX10.ogg | day start stinger |
| dayEnd.mp3 | Music Jingles | Sax jingles/jingles_SAX11.ogg | doors close stinger |
| weekEnd.mp3 | Music Jingles | Sax jingles/jingles_SAX15.ogg | end of week / run over |
| rush.mp3 | Music Jingles | Pizzicato jingles/jingles_PIZZI02.ogg | rush hour event |
| inspector.mp3 | Music Jingles | Pizzicato jingles/jingles_PIZZI03.ogg | health inspector arrives |
| influencer.mp3 | Music Jingles | Sax jingles/jingles_SAX04.ogg | influencer arrives |
| pass.mp3 | Music Jingles | Pizzicato jingles/jingles_PIZZI08.ogg | inspection passed |
| fail.mp3 | Music Jingles | Sax jingles/jingles_SAX07.ogg | inspection failed, bankrupt |

Total size: about 145 KB.

## Generated in the browser (no files)

Written for this game (`src/audio/synth.ts`, `src/audio/music.ts`) and released under the same
terms as the rest of the project:

- **Station sounds**: coffee grinder, espresso pull (pump hum, hiss, dribble, portafilter clunk),
  milk steaming, cold brew pour (stream and bubbles), the "item ready" ding.
- **Shop sounds**: the door bell, the register "ching", the grumpy "hmph", the bot "boop",
  the power-flicker buzz and power-down, phone camera shutters, sparkles.
- **Music**: a swung 82 bpm lo-fi jazz day loop (FM electric piano, bass, brushed kit, vibes,
  vinyl crackle) and a 64 bpm night/menu loop. Both are composed in code and rendered once with
  an `OfflineAudioContext`, with the tail folded onto the start so they loop seamlessly.
- **Crowd murmur**: two loops (a few tables, a full room) made from filtered voice-like
  formants, cup clinks and a generated room reverb, mixed by how many drinks are owed.
