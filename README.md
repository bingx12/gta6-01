# Veldora Bay — an open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/bingx12/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/bingx12/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Rae Calloway, a former getaway driver, is back in Veldora Bay — a sun-soaked coastal city of towers, palms, beach and docks — and owes the fixer Marla Voss one last job. Five story missions take Rae from a tutorial drive through a police chase, a timed parcel run and a dockside shootout to a final armoured van heist.

## Play

- **On foot:** WASD to move, Shift to run, Space to jump, mouse to look, click to fire the pistol.
- **Driving:** walk up to any parked or traffic car and press **E** to steal it. WASD drives with arcade handling; the chase camera sits behind the car.
- **Wanted:** stealing cars, hit-and-runs and shootouts raise heat (0–5 stars). Police cars chase and ram; foot officers can bust you on foot. Lie low and heat cools.
- **Missions:** press **N** to start the next job. Dialogue, objective markers, a countdown on the timed run, and cash rewards.
- **Health:** regenerates slowly out of combat. Getting killed shows WASTED; getting caught shows BUSTED; both respawn.
- **HUD:** minimap (player, traffic, police, enemies, mission marker), health, cash, wanted stars, speed, in-game clock, objective tracker and mission list.
- **Save:** progress, cash and mission state save to localStorage; CONTINUE on the start screen resumes. **M** mutes, **P** pauses.

## Tech

- Static files only — no build step, no network requests at run time. Serve `game/` with any static server (`node serve.ts`, then http://localhost:8080).
- three.js 0.160.0 vendored as a minified module build under `game/vendor/`.
- All art, sound and music are procedural: the city is built from primitives with a canvas window texture, and every sound (engine hum, sirens, gunshots, pickup blips, looping synth music) is synthesised with the Web Audio API.
- Source is split one job per file under `game/src/`: config, seeded random, input, audio, city, vehicles, traffic, police, combat, missions, HUD/minimap, player, and main.
- Screenshots are deterministic: `?shot=start|drive|chase|mission&seed=1` stages each scene from a fixed seed.

## Screenshots

1. `1-start.jpg` — title screen over the sunset city.
2. `2-drive.jpg` — driving through Veldora Bay with the HUD and minimap.
3. `3-chase.jpg` — a three-star police chase.
4. `4-mission.jpg` — the dockside shootout, mission 4.

## License

MIT — see [LICENSE](LICENSE).

---

Built for the make.fun gta6-01 bounty by @bingx12. Play Veldora Bay and build your own entry with my referral code: **k6eq9xtw** — https://make.fun/r/k6eq9xtw
