# AI Real-Time Canvas

A real-time collaborative canvas. Type a natural-language prompt → the backend
turns it into **strict JSON** describing circles/rectangles → React Konva renders
them → shapes are **draggable** → every change is broadcast over Socket.io so all
connected tabs/users stay in sync.

> Prompt → LLM structured output → validated/normalized JSON → live canvas.

## Demo prompts

- `Create a star layout with 1 center node and 6 surrounding nodes`
- `Create a 3x4 grid of circles labeled A-L`
- `Create 4 rectangles in a row and 1 circle above center`

## Prerequisites

- **Node 18+** (uses built-in `crypto.randomUUID` and `fetch`). npm workspaces —
  no extra package manager needed.
- An **OpenAI API key** (or any OpenAI-compatible endpoint). The UI generates
  layouts via the LLM, so a key is required to generate. Get one at
  <https://platform.openai.com/api-keys>.

## Quick start -- How to Run

```bash
# 1. Install all workspaces (shared, backend, frontend)
npm install

# 2. Create your env file, then add your key
#    macOS/Linux:  cp .env.example .env
#    Windows:      copy .env.example .env
#    then open .env and set:  LLM_API_KEY=sk-...

# 3. Start backend (NestJS, :4000) + frontend (Vite, :5173) together
#    (builds the shared package first, then runs both with live reload)
npm run dev
```

Then open **http://localhost:5173**.

> `.env` is git-ignored — your key never gets committed.

## Try it

- Type a prompt (or click a sample chip) and hit **Generate**.
- **Open a second tab** → it instantly syncs to the current canvas. You'll see the
  other user's **live cursor** (with their name) and a "joined" toast.
- **Drag a shape** → it moves in the other tab in real time. Toggle **Snap to
  grid** to align to the grid. **Click a shape** to select it — other users see
  your selection ringed in your color with your name.
- Expand **View output JSON** to see the structured JSON the LLM returned and the
  rendered `{ nodes }`.
- **Refresh** any tab → the canvas is restored from the server.

## Scripts

```bash
npm run dev        # backend + frontend with live reload
npm run build      # production build of shared + backend + frontend
npm test           # unit tests: parser, normalize/validation & lock service (Vitest)
npm run typecheck  # strict TypeScript across all workspaces
```

Run pieces individually: `npm run build:shared` once, then `npm run dev:backend`
and `npm run dev:frontend` in separate terminals.

## Environment

All variables live in `.env` at the repo root (copy from `.env.example`).

| Variable | Default | Purpose |
|---|---|---|
| `LLM_API_KEY` | _(unset)_ | **Required** — OpenAI-compatible key for generation |
| `LLM_MODEL` | `gpt-4o` | LLM model |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | LLM endpoint (change for a compatible provider) |
| `PORT` | `4000` | Backend port |
| `VITE_SERVER_URL` | `http://localhost:4000` | Where the frontend finds the backend |

## Architecture overview

```
shared   Pure domain core (zero framework deps), shared by both apps:
                  schema (Zod) · intent + prompt parser (constraint checks)
                  · validate/normalize tail · socket event contract. Unit-tested.

backend       NestJS + Socket.io. Single source of truth.
                  CanvasGateway (events) · CanvasStateService (state) ·
                  LockService (soft locks) · PersistenceService (JSON file) ·
                  LLM generator + generation service.

frontend          React + React Konva + Zustand.
                  Responsive scaled Stage · draggable shapes · singleton socket
                  client decoupled from the store · prompt bar.
```

**The AI → JSON pipeline (structured, not messy).** The **LLM** returns the
canvas JSON *with coordinates directly*
(`{nodes:[{type,x,y,radius|w/h,label}]}`, the spec's exact shape) via strict
structured outputs. Before the call, the prompt is parsed deterministically to
**reject** unsupported shapes and over-limit counts (not silently coerce them);
after, every result passes one **validate + normalize** tail:

```
cap to 12 nodes → clamp sizes → truncate labels to 2 chars
→ clamp each bounding box inside the padded canvas → assign ids → Zod-validate
```

So the geometry is correct *by construction* and the output always matches the
spec shape `{ "nodes": [...] }`.

**Real-time model.** The server owns state; clients are thin.

| Flow | Fan-out |
|---|---|
| `canvas:generate` → `canvas:generated` | to **everyone** (identical authoritative result) |
| `node:move` → `node:moved` | to **everyone except the sender** (sender already moved optimistically) |
| on connect → `canvas:state` | snapshot to the joining socket (drives multi-tab sync + refresh) |

Bounds are enforced **three times**: on generate, on the client during drag, and
again on the server for every `node:move` (defense in depth).

**Soft locking.** On `dragstart` a client claims a node (`node:lock`, granted via
ack); other clients render it non-draggable with a dashed outline in the locker's
color. On `dragend` it's released (`node:unlock`). Locks are freed on
**disconnect**, with a 10s idle timeout as a backstop. Last-write-wins is the
fallback for any unlocked race.

**Presence & live cursors.** Each socket gets an ephemeral name + color on connect
(no auth). A joining client receives the full presence roster (`presence:init`);
others get `presence:join` / `presence:leave` (with toasts). Cursor positions are
broadcast on a throttle (`cursor:move` → `cursor:moved`) in **logical canvas
coords** (screen px ÷ stage scale), so a cursor at (400, 200) lands on the same
spot for everyone, and are drawn on a dedicated Konva layer.

Generation is **LLM-only**, so it requires `LLM_API_KEY` to be set. The prompt
parser still runs on every request to enforce the hard constraints (reject
unsupported shapes / over-limit counts) before the LLM is called.

## Constraints enforced

- Circles and rectangles only · max **12** shapes · labels **≤ 2 chars**
- Over-limit or unsupported-shape requests are **rejected with an error toast**
  (e.g. "create 13 circles" or "draw a triangle") — not silently trimmed
- AI returns **JSON only**
- Nothing leaves the canvas (generate + client drag + server move)
- TypeScript **strict** mode across all packages

## Notes

### AI tool used

**Claude** (Anthropic) was used to build this project, for validating
the architecture, optimizing the code, the tests, and this documentation.
Generation itself uses an OpenAI-compatible **LLM** that returns the canvas JSON
(with coordinates) via a strict structured-output schema; the prompt parser runs
deterministically around it purely to enforce the hard constraints.

### What I'd improve (with more than the ~2h budget)

**Concurrency & correctness**
- Replace last-write-wins + soft locks with a **CRDT (Yjs)** so two users can edit
  the same node concurrently and converge without locking. This is the right long-
  term answer; soft locking is the pragmatic one for the timebox.
- Add an **offline queue + reconnection** flow so drags made while briefly
  disconnected replay against the server's authoritative state.

**Multi-canvas / scale**
- **Rooms** (`/canvas/:id`) so the app hosts many independent canvases — the
  natural horizontal-scaling axis. Today everyone shares one global canvas.
- Move state + locks to **Redis** so multiple server instances stay consistent
  behind a load balancer (Socket.io Redis adapter for fan-out).
- Swap the JSON-file persistence for **SQLite/Postgres** with per-canvas rows and
  an updated-at for optimistic concurrency.

**Collaboration UX**
- Lock indicators could show *who* (name/avatar), not just a color — the presence
  layer already has the names, so this is a small follow-up.
- Cursors persist at their last position when a peer's mouse leaves the canvas;
  fading or hiding them on `mouseleave` would be a nice touch.

**Product features**
- Create/delete/resize shapes directly on the canvas; **undo/redo** (trivial once
  the server is the single source of truth — keep a command log).
- More shape types and richer layouts (trees, flows) behind the same intent model.

**Hardening & ops**
- AuthN/Z, per-socket **rate limiting** on `canvas:generate`, and input size caps.
- **E2E tests** (Playwright) for the drag + multi-tab sync flows to complement the
  pure-function unit tests.
- Structured logging/metrics (latency, lock contention) and a health endpoint.
- Code-split Konva so the initial web bundle is smaller.

### Deliberate scope decisions

- **LLM generation with deterministic guards.** The LLM produces the layout, but
  the prompt is still parsed deterministically to enforce the hard constraints
  (reject unsupported shapes / over-limit counts) and every result is validated +
  normalized server-side. This keeps generation flexible without giving up the
  "structured, not messy" guarantees.
- **Clean error over silent coercion.** An unsupported prompt (e.g. "triangle")
  returns a clear error rather than guessing — better UX and matches the spec's
  "JSON only / no messy output" intent.
