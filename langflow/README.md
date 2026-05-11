# RAG Workshop — Langflow Track

This folder contains a visual, flow-based companion to the main FastAPI / React
RAG track in this repository. You will build the same RAG pipeline twice,
each time with more capability, by wiring components together in
[Langflow](https://www.langflow.org/).

The flows progress as follows:

0. **`00_ChatBot`** — warm-up: a plain Ollama-backed chat bot, no retrieval.
1. **`01_RAG_basic`** — minimal RAG: load PDFs, chunk, embed, store in Qdrant,
   retrieve, prompt, generate.
2. **`02_RAG_memory`** — adds persistent memory so the assistant can recall user
   preferences and frequently retrieved facts across turns.

Flows 1 and 2 ship in two variants:

* `*.json` — exercise version. Components are placed and configured but
  edges are missing. **Wire them up yourself.**
* `*_solution.json` — fully wired reference solution. Open it if you get stuck.

---

## 1. Prerequisites

You need three things on your machine before opening a single flow:

* Docker Desktop (or Docker CLI)
* Qdrant and Qdrant container in Docker
* Ollama

This setup should be installed already from the [Getting Started Workshop](https://github.com/aihpi/workshop-getting-started).

### 1.1 Docker

Used to run the Langflow container (and the Qdrant container).
Install: <https://www.docker.com/products/docker-desktop>

### 1.2 Ollama (local install)

Hosts the local LLM and embedding model. Install **natively on the host**
(not in Docker) — the Langflow container reaches it via
`host.docker.internal:11434`.
Install: <https://ollama.com/download>

### 1.3 Qdrant container

Vector store for the retrieved chunks. The workshop assumes you already run
a Qdrant container reachable on host port **6333** (the standard default).
Quick start if you do not have one yet:

```bash
docker run -d --name qdrant -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

Reference docs: <https://qdrant.tech/documentation/quick-start/>.

---

## 2. Hardware check & model selection

The workshop default is **`qwen2.5:7b-instruct`**:

* The **Instruct** variant is tuned to follow instructions and answer over
  retrieved documents, which is what RAG needs.
* The **Base** variant is meant for further fine-tuning, not direct use.

`qwen2.5:7b-instruct` runs comfortably on machines with **~8 GB of free RAM**
(or 6 GB of VRAM on a GPU). Participants with stronger hardware can swap in a
larger model for higher answer quality — set `OLLAMA_LLM_MODEL` in `.env` and
`ollama pull` the bigger tag.

If you are unsure whether your machine can handle a given model, run one of
these quick screeners first:

* <https://github.com/Pavelevich/llm-checker>
* <https://github.com/AlexsJones/llmfit>

---

## 3. Pull the models into Ollama

With Ollama running on the host, pull the LLM and the embedding model:

```bash
ollama pull qwen2.5:7b-instruct
ollama pull nomic-embed-text
```

`ollama list` shows everything currently downloaded. If a tag fails to resolve,
search the Ollama model library at <https://ollama.com/library>.

---

## 4. Langflow container

The workshop uses the **published Langflow image** pinned to **1.9.0** rather
than the floating `latest` tag. The flow JSONs were authored and tested
against 1.9.0 — pinning avoids schema-drift warnings when a new Langflow
release renames a field.

Run:

```bash
cd ~/Workshops/workshop-ragV2/langflow
cp .env.example .env          # adjust ports or model tags here if you need to
docker compose up -d
```

Logs:

```bash
docker compose logs -f langflow
```

The UI lives at **<http://localhost:7860>** (or the `LANGFLOW_PORT` you set in
`.env`).

---

## 5. Start every service

The Langflow container is the only thing this folder starts. Make sure the
other two pieces are already running:

```bash
# 1. Qdrant — your existing container on host port 6333
docker ps --filter ancestor=qdrant/qdrant

# 2. Ollama — running natively on the host
ollama list

# 3. Langflow
cd ~/Workshops/workshop-ragV2/langflow
docker compose up -d
```

Verify:

```bash
curl http://localhost:6333/healthz       # Qdrant -> "healthz check passed"
curl http://localhost:11434/api/tags     # Ollama -> JSON list of pulled models
curl http://localhost:7860               # Langflow -> HTML index
```

---

## 6. Open Langflow and import the flows

1. Open <http://localhost:7860> in your browser.
2. **My Flows → Import** in the top-right.
3. Pick `langflow/flows/01_RAG_basic.json`.
4. Open the imported flow. You will see all components placed but no edges.

Wire it up to match the data flow:

```
File ──► SplitText ──► QdrantVectorStore (ingest)
                              ▲
              OpenAIEmbeddings ┘
ChatInput ──► QdrantVectorStore (retrieve) ──► PromptTemplate ──► LLM ──► ChatOutput
              ▲                                       ▲
              OpenAIEmbeddings ──┘     ChatInput ─────┘
```

Click **Playground**, type a question about the Tennessee Eastman Process
(e.g. *"What is the purpose of the TEP benchmark?"*), and confirm you get a
grounded answer.

When stuck, open `01_RAG_basic_solution.json` in a second tab to compare.

Repeat for `02_RAG_memory.json`.

---

## 7. Folder layout

```
langflow/
├── README.md                # this file
├── docker-compose.yml       # Langflow service (uses langflowai/langflow:1.9.0)
├── .env.example             # copy to .env before first run
├── data/                    # tabular data (TEP CSV)
├── pdfs/                    # 7 PDF papers used as the RAG corpus
└── flows/
    ├── 00_ChatBot.json
    ├── 01_RAG_basic.json
    ├── 01_RAG_basic_solution.json
    ├── 02_RAG_memory.json
    └── 02_RAG_memory_solution.json
```

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|--------|--------------|-----|
| `Connection refused` from Langflow to Qdrant | Qdrant container not started, or wrong host | Confirm `docker ps` shows a running Qdrant container. Inside Langflow, `QDRANT_HOST=host.docker.internal` and `QDRANT_PORT=6333` |
| `model not found` from Ollama | Tag not pulled | `ollama pull qwen2.5:7b-instruct` and `ollama pull nomic-embed-text` |
| Flow import warns "Missing component" | Wrong Langflow version | Confirm the running container is `1.9.0`: `docker inspect workshop-langflow --format '{{.Config.Image}}'` |
| Empty retrievals | Ingest pipeline never ran | Open the flow → run the **File → SplitText → Qdrant (ingest)** branch once before chatting |
| OOM when LLM responds | Model too big for hardware | Switch `OLLAMA_LLM_MODEL` to a smaller tag (e.g. `qwen2.5:3b-instruct`) and `ollama pull` it |
