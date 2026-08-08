# AI share — sketch → viewer URL

Goal: an agent (or human) emits a small Rig document, then hands the user a link that opens it in RigViewer.

**Viewer presents; Player plays.** Use Viewer URLs for geometry / UI / GLSL sketches. Cart documents (pixel + Lua) go to [RigPlayer](https://github.com/rigkid/RigPlayer) or export `.p8` via [PicoForge](https://github.com/GitBruno/PicoForge) — do not stuff a cart into `?doc=` and expect it to play.

## Ladder (pick the smallest that fits)

| Size | Mechanism | When |
|------|-----------|------|
| **Small** (~creative-coding sketch) | `?doc=` inline payload | Fits under soft limit — best for chat |
| **Getting large** | Still `?doc=` + **warning banner** | Soft limit crossed; prefer migrating soon |
| **Too large** | **Refuse** Copy link; **Save local** or `?src=` | Hard limit — do not stuff the URL |
| **Any durable share** | `?src=https://…/file.json` | Gist / git blob / Pages / CDN |
| **This browser only** | `Save local` / `?local=1` | Quota-friendly; not a share link |

### Budgets (`web/share.mjs`)

| Limit | Encoded `?doc=` chars | Behavior |
|-------|----------------------|----------|
| Soft | 4000 | Allow Copy link; yellow banner — “getting large” |
| Hard | 8000 | Block Copy link; offer localStorage + tell agent to use `?src=` |

Payload formats (stable): `u1.<base64url(utf8)>` or `z1.<base64url(deflate-raw)>` (viewer picks the shorter). Bare base64url is accepted as uncompressed.

## What to do as an agent

1. Generate JSON using the RigWorks skill + [port-map](port-map.md) + [examples](../examples/).
2. Validate (`rig-validate` or ensure zero skipped keys).
3. **If small:** encode or open the viewer, hit **Copy link**, paste the `?doc=` URL.
4. **If soft warning:** still OK for a one-off; prefer gist/`?src=` if the user will reshare.
5. **If hard:** do **not** invent a mega-URL. Save a gist / commit a blob and reply with:

```
https://viewer.rigs.works/web/?src=https://gist.githubusercontent.com/.../raw/.../sketch.json
```

Local preview:

```
npm run serve
http://127.0.0.1:<port>/web/?src=/examples/minimal-scene.json
http://127.0.0.1:<port>/web/?doc=u1.<payload>
http://127.0.0.1:<port>/web/?local=1
```

## UI chrome

| Control | Role |
|---------|------|
| **Copy link** | Builds `?doc=` (compressed when smaller). Soft/hard feedback in the banner. |
| **Save local** | `localStorage` (`rigviewer.sketch.v1`) — survives refresh; not shareable. |
| **Restore** | Reload last local sketch (also `?local=1`). |

Skipped Contract keys still show in the bottom overlay — fix those before sharing.

## Domain

Production host (pin): **`https://viewer.rigs.works`**. Keep `?src=` and `?doc=` stable — that is the agent contract. Until DNS/Pages are wired, use GitHub Pages or `npm run serve` locally.

## Checklist

- [x] Examples with zero skipped keys (`npm test`)
- [x] Port map honesty
- [x] `?src=` load path
- [x] `?doc=` + soft/hard feedback
- [x] localStorage save / restore
- [x] `llms.txt`
- [ ] Hosted production URL decided and documented
- [ ] Optional: Doxygen HTML under `/api/` (desktop only)
