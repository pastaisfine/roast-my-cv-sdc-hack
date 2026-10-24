# Roast My CV

> A CV review and career-planning tool for Malaysian fresh graduates that turns CV evidence and labour-market data into practical next steps for an AI-changing workforce.

---

## Team Information

| Field | Details |
| --- | --- |
| **Team Name** | pastaisfine |
| **Team Domain** | Domain 1 — Aiversecity Future-Ready Workforce |
| **SDG Track (1–17)** | SDG 8 — Decent Work and Economic Growth (Target 8.5; supporting alignment: SDG 4, Target 4.4) |
| **Team Leader** | Darren Tan Yik Wei |
| **University** | Universiti Teknologi Malaysia (UTM) |
| **Number of Members** | 1 |

## Links

| Resource | Link |
| --- | --- |
| GitHub Repository | [pastaisfine/roast-my-cv-sdc-hack](https://github.com/pastaisfine/roast-my-cv-sdc-hack) |
| Live Demo | [roast-my-cv-seven.vercel.app](https://roast-my-cv-seven.vercel.app/) |
| RunPod Radar Endpoint | [`oqdvb7vyxw2eio`](https://api.runpod.ai/v2/oqdvb7vyxw2eio) |
| Slide Deck | [SDC2026_pastaisfine_PitchDeck.pdf](SDC2026_pastaisfine_PitchDeck.pdf) |
| Pitching Video | https://www.youtube.com/watch?v=p4rEdrsN0o4 |

---

## Overview

### Problem

Malaysian fresh graduates must choose a first career while job requirements and the impact of AI continue to change. Generic CV feedback and static course lists do not show which skills are supported by a candidate's experience, which roles are a realistic next step, or what to learn next. This makes it harder to pursue relevant training and decent work.

### Solution

Roast My CV combines evidence-based CV feedback with a Future Skills Radar built from dated labour-market references. It identifies supported skills, explains gaps, ranks relevant roles, and suggests reskilling pathways. AI can help extract information and write feedback, while the app validates evidence and computes the score and skill decisions in its own logic.

### Key Features

- **CV review** — Paste CV text for a structured, candid review with a readiness score, strengths, skill gaps, and action items.
- **Future Skills Radar** — Compare evidenced skills with ranked occupations and published labour-market demand data.
- **Reskilling guidance** — Explore skill pathways and related SDG connections for future roles.
- **AI-disruption scenarios** — See role and skill guidance through two AI-disruption scenarios.
- **Optional image import** — OCR can extract text from a CV image when the OCR worker is configured; text input remains available without it.

### Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Backend | Node.js 24, Express 5, TypeScript |
| Database | PostgreSQL, Drizzle ORM (used for the optional radar embedding cache) |
| AI / Compute | Google Gemini for extraction and feedback; RunPod Serverless with `intfloat/multilingual-e5-small` for semantic occupation ranking |
| OCR | Python, EasyOCR and CRAFT; optional app-owned worker |
| Hosting / Development | Vercel for the live demo; Replit for development |

---

## Project Structure

```text
.
├── artifacts/
│   ├── api-server/              # Express API, roast/radar services and OCR worker
│   └── roast-my-cv/             # React + Vite frontend
├── docs/                        # Operator guides, data sources and API notes
├── lib/
│   ├── api-spec/                # OpenAPI definition
│   ├── db/                      # Drizzle database schema
│   └── radar-data/              # Labour-market references, roles and skill logic
├── scripts/                     # Workspace scripts
├── submission/                  # Competition submission and proof-of-use PDFs
├── .env.example                 # Gemini and roast settings (copy to .env)
├── package.json                 # Workspace commands
├── pnpm-workspace.yaml
├── pyproject.toml               # Optional Python OCR dependencies
└── README.md
```

### Architecture

```text
Browser
  └── Vercel-hosted React app
        └── /api ──► Express API
                       ├── Gemini: CV extraction and feedback (with consent)
                       ├── RunPod: skill-label embeddings for role ranking
                       └── Optional OCR worker: CV image to text
```

Only skill labels are sent to the occupation-ranking embeddings endpoint; CV prose is not used as its input. OCR is optional and has a separate server-side configuration.

---

## How to Run

### Requirements

- Node.js 24
- pnpm 11.17.0 (the version declared by this repository)
- A Google Gemini API key for AI-generated extraction and feedback. Without it, deterministic fallbacks are available.
- PostgreSQL and RunPod credentials are optional for a basic local run. The radar can use keyword matching when semantic embeddings are not configured.

### Option 1 — Run on Replit (Development)

1. Import this GitHub repository into Replit.
2. Add `GEMINI_API_KEY` to Replit Secrets if you want AI-generated extraction and feedback.
3. Configure optional server-side values such as `DATABASE_URL`, `RUNPOD_API_KEY`, and `RUNPOD_ENDPOINT_ID` only if you are enabling those integrations. Never put secrets in frontend variables or commit them.
4. Start the frontend and API using the local commands below in separate Replit Shell sessions.

Replit is used for development; the production demo is hosted on Vercel.

### Option 2 — Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/pastaisfine/roast-my-cv-sdc-hack.git
cd roast-my-cv-sdc-hack

# 2. Install the workspace package manager and dependencies
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm install --frozen-lockfile

# 3. Set up local environment files
cp .env.example .env
cp artifacts/api-server/.env.example artifacts/api-server/.env
```

Add `GEMINI_API_KEY` to the root `.env` for AI-generated feedback. Add optional database and RunPod settings to `artifacts/api-server/.env`. Keep real credentials server-side and out of Git. If you are not setting up the Python OCR worker, set `OCR_ENABLED=false` and use pasted CV text.

Start the API and frontend in **two separate terminals**:

```bash
# Terminal 1 — API server (http://localhost:8080)
pnpm --filter @workspace/api-server run dev
```

```bash
# Terminal 2 — Frontend (http://localhost:5173)
pnpm --filter @workspace/roast-my-cv run dev
```

The frontend proxies `/api` requests to the local API server. For OCR-specific Python setup, see [`docs/ocr-imports.md`](docs/ocr-imports.md).

### Run Checks

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run test:roast
pnpm --filter @workspace/api-server run test:radar
```

---

## How We Use Replit

Replit is used as a development environment for the project. The live production demo is deployed on Vercel, not Replit.

📄 Proof of use: [`submission/SDC2026_pastaisfine_Replit_POU.pdf`](submission/SDC2026_pastaisfine_Replit_POU.pdf)

## How We Use RunPod

The app uses a RunPod Serverless endpoint for semantic embeddings that rank occupations against CV skill labels. CV prose is not sent to this embeddings endpoint. If the RunPod credentials or approval switch are not configured, the radar can fall back to local keyword matching.

The repository also includes an optional OCR worker integration for CV images. OCR endpoint configuration is separate from the radar endpoint and is supplied through server-side environment variables.

📄 Proof of use: [`submission/SDC2026_pastaisfine_RunPod_POU.pdf`](submission/SDC2026_pastaisfine_RunPod_POU.pdf)

---

## Challenges & Learnings

- Distinguishing a skill that is evidenced by a CV from one that is only mentioned as an interest or an unsupported claim requires more than a language model's prediction. The app verifies quoted CV evidence and applies deterministic skill rules.
- Labour-market guidance is more useful when its sources and time context are visible. The Future Skills Radar keeps dated reference data and matching logic in the repository.
- AI is used for extraction and feedback, while scoring and evidence decisions remain application-controlled. This also allows a deterministic fallback when an AI service is unavailable.

## Future Improvements

- [ ] Expand and periodically refresh the sourced labour-market and occupation data.
- [ ] Broaden skill and reskilling pathway coverage for Malaysian graduates.
- [ ] Improve end-to-end validation across text input, optional OCR, and hosted integrations.

## Team

| Name | Role | GitHub |
| --- | --- | --- |
| Darren Tan Yik Wei | Team Lead, Full-stack Developer, AI Developer | [@pastaisfine](https://github.com/pastaisfine) |

---

## Submission Checklist

- [x] Team name, domain and SDG track filled in
- [x] Slide deck added ([`SDC2026_pastaisfine_PitchDeck.pdf`](SDC2026_pastaisfine_PitchDeck.pdf))
- [ ] Pitching video link added — coming soon
- [x] Replit used for development; proof of use included in `submission/`
- [x] RunPod integration included; proof of use included in `submission/`
- [x] Preliminary submission completed (`submission/SDC2026_pastaisfine_Preliminary.pdf`)
- [x] Technology declaration completed (`submission/SDC2026_pastaisfine_TechDeclaration.pdf`)
- [x] Replit proof of use included (`submission/SDC2026_pastaisfine_Replit_POU.pdf`)
- [x] RunPod proof of use included (`submission/SDC2026_pastaisfine_RunPod_POU.pdf`)
- [x] "How to Run" steps documented
- [x] No API keys or secrets committed to the repository

## License

This project is identified as MIT-licensed in [`package.json`](package.json).
