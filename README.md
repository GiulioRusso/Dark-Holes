# Dark Holes

An endless, procedurally generated universe to explore from the cockpit of a small spaceplane. No goal, no game over: fly between star systems, orbit strange worlds, chase comets, dive past pulsars and fall into black holes.

**Play in the browser:** https://giuliorusso.github.io/Dark-Holes/

<p align="center">
  <img src="docs/3d-home.png" alt="Home world" width="420">
  <img src="docs/3d-pulsar.png" alt="Pulsar" width="420">
</p>

## What's out there

Star systems (yellow, orange and red dwarfs, white and blue stars, red giants, brown dwarfs, binaries) with rocky, terran, gas, lava and ice worlds, moons, rings, asteroid belts and comets — plus black holes with gravitational lensing, pulsars, wormholes, nebulae and planetary nebulae around white dwarfs. Everything orbits in real time, gravity is Newtonian, and time runs slower near black holes and at high speed.

## Controls

| Flight | |
|---|---|
| Mouse / arrows | turn (pitch & yaw) |
| `Q` / `E` | roll |
| `W` / `S` | thrust forward / back |
| `A` / `D` · `R` / `F` | slide sideways · up / down |
| `Space` | brake |
| `Shift` (with `W`) | warp drive |

| Navigation | |
|---|---|
| `T` | lock the object in your sights |
| `G` | autopilot to the target |
| `O` | orbit the nearest object (flies there first if needed) |
| ◇ | on-screen marker: point here and thrust to reach orbit |
| `B` | back to the home system |

| View & system | |
|---|---|
| `C` | cockpit / outside camera |
| `M` | radar range |
| `P` · `V` · `H` | pause · sound · help |

## HUD

- **Bottom left:** speed (negative when flying backwards), β (fraction of light speed), time dilation, number of worlds visited, alarms, list of visited worlds.
- **Radar (bottom right):** 3D view of what's around you, your flight path, and the orbit you could hold around the nearest object with directions on how to get there.
- **Proximity / gravity alarm** when you get too close to a surface, a black hole or a strong gravity well.

Discoveries and your position are saved in the browser.

## Run locally

No build step, just a static web server (the game uses ES modules, so opening `index.html` directly from disk won't work):

```bash
git clone https://github.com/GiulioRusso/Dark-Holes.git
cd Dark-Holes
python3 -m http.server 8000
# open http://localhost:8000
```

An internet connection is needed: three.js is loaded from a CDN.

## Files

```
index.html   page, HUD and styles
game3d.js    the whole game: universe generation, shaders, flight, radar, audio
docs/        screenshots
```

The original 2D version lives on the [`classic-2d`](https://github.com/GiulioRusso/Dark-Holes/tree/classic-2d) branch.
