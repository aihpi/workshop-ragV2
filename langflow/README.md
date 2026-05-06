# RAG Workshop — Langflow Track

This folder contains a visual, flow-based companion to the main FastAPI / React
RAG track in this repository. You will build the same RAG pipeline three times,
each time with more capability, by wiring components together in
[Langflow](https://www.langflow.org/).

The three flows progress as follows:

1. **`01_RAG_basic`** — minimal RAG: load PDFs, chunk, embed, store in Qdrant,
   retrieve, prompt, generate.
2. **`02_RAG_memory`** — adds persistent memory so the assistant can recall user
   preferences and frequently retrieved facts across turns.
3. **`03_RAG_query_transformation`** — rewrites the user query into three
   variants (close / generic / specific), retrieves in parallel, merges and
   deduplicates the context, then answers.

Each flow ships in two variants:

* `*.json` — exercise version. Components are placed and configured but
  edges are missing. **Wire them up yourself.**
* `*_solution.json` — fully wired reference solution. Open it if you get stuck.

---

## 1. Prerequisites

You need three things on your machine before opening a single flow.

### 1.1 Docker Desktop

Used to run Langflow itself, Qdrant, and (optionally) Ollama.
Install: <https://www.docker.com/products/docker-desktop>

### 1.2 Ollama

Hosts the local LLM and embedding model.
Install: <https://ollama.com/download>

You can also run Ollama in Docker — see `ollama/docker-compose.yml`.

### 1.3 Qdrant

Vector store for the retrieved chunks. We bundle a Docker Compose file at
`qdrant/docker-compose.yml`, so no separate install is required. The reference
docs are at <https://qdrant.tech/documentation/quick-start/>.

---

## 2. Hardware check & model selection

The workshop default is **`mistral:7b-instruct`**:

* The **Instruct** variant is tuned to follow instructions and answer over
  retrieved documents, which is what RAG needs.
* The **Base** variant is meant for further fine-tuning, not direct use.
* The **Reasoning** variant adds chain-of-thought overhead that hurts latency
  on straightforward retrieval tasks.

`mistral:7b-instruct` runs comfortably on machines with **~8 GB of free RAM**
(or 6 GB of VRAM on a GPU). Participants with stronger hardware can swap in a
larger Mistral model (e.g. `mistral-small3.2` at ~24 GB) for higher answer
quality — set `OLLAMA_LLM_MODEL` in `.env` and `ollama pull` the bigger tag.

If you are unsure whether your machine can handle a given model, run one of
these quick screeners first:

* <https://github.com/Pavelevich/llm-checker>
* <https://github.com/AlexsJones/llmfit>

---

## 3. Pull the models into Ollama

With Ollama running (desktop app or `ollama/docker-compose.yml`), pull the LLM
and the embedding model:

```bash
ollama pull mistral:7b-instruct
ollama pull nomic-embed-text
```

`ollama list` shows everything currently downloaded. If a tag fails to resolve,
search the Ollama model library at <https://ollama.com/library>.

---

## 4. Custom Langflow container

The workshop ships a **custom Langflow image** pinned to **1.9.0** rather than
the floating `latest` tag. Two reasons:

1. The flow JSONs were authored and tested against 1.9.0 — pinning avoids
   schema-drift warnings when a new Langflow release renames a field.
2. The Dockerfile pre-installs `qdrant-client`, `pypdf`, and
   `sentence-transformers` so the flows run without follow-up `pip install`s
   inside the container.

Build and run:

```bash
cd ~/Workshops/workshop-ragV2/langflow
cp .env.example .env          # adjust ports or model tags here if you need to
docker compose up --build -d
```

Logs:

```bash
docker compose logs -f langflow
```

The UI lives at **<http://localhost:7860>** (or the `LANGFLOW_PORT` you set in
`.env`).

---

## 5. Start every service

The three stacks are independent. Start them in this order:

```bash
# 1. Qdrant — vector store on host ports 6433 (REST) and 6434 (gRPC)
cd ~/Workshops/workshop-ragV2/qdrant
docker compose up -d

# 2. Ollama — only if you do NOT already run the Ollama desktop app
cd ~/Workshops/workshop-ragV2/ollama
docker compose up -d
# (skip if you started Ollama natively; the flows will reach 11434 either way)

# 3. Langflow
cd ~/Workshops/workshop-ragV2/langflow
docker compose up --build -d
```

Verify:

```bash
curl http://localhost:6433/healthz       # Qdrant -> "healthz check passed"
curl http://localhost:11434/api/tags     # Ollama -> JSON list of pulled models
curl http://localhost:7860               # Langflow -> HTML index
```

> **Port note**: The repo's main FastAPI/React track uses Qdrant on port
> `6333`. The Langflow track deliberately uses port `6433` so both stacks can
> run side by side without conflict.

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

Repeat for `02_RAG_memory.json` and `03_RAG_query_transformation.json`.

---

## 7. Folder layout

```
langflow/
├── README.md                # this file
├── Dockerfile               # FROM langflowai/langflow:1.9.0
├── docker-compose.yml       # Langflow service
├── .env.example             # copy to .env before first run
├── data/                    # tabular data (TEP CSV)
├── pdfs/                    # 7 PDF papers used as the RAG corpus
└── flows/
    ├── 01_RAG_basic.json
    ├── 01_RAG_basic_solution.json
    ├── 02_RAG_memory.json
    ├── 02_RAG_memory_solution.json
    ├── 03_RAG_query_transformation.json
    └── 03_RAG_query_transformation_solution.json
```

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|--------|--------------|-----|
| `Connection refused` from Langflow to Qdrant | Qdrant container not started, or wrong host | Confirm `docker ps` shows `workshop-qdrant`. Inside Langflow, `QDRANT_HOST=host.docker.internal` and `QDRANT_PORT=6433` |
| `model not found` from Ollama | Tag not pulled | `ollama pull mistral:7b-instruct` and `ollama pull nomic-embed-text` |
| Flow import warns "Missing component" | Wrong Langflow version | Confirm the running container is `1.9.0`: `docker inspect workshop-langflow --format '{{.Config.Image}}'` |
| Empty retrievals | Ingest pipeline never ran | Open the flow → run the **File → SplitText → Qdrant (ingest)** branch once before chatting |
| OOM when LLM responds | Model too big for hardware | Switch `OLLAMA_LLM_MODEL` to a smaller tag (e.g. `mistral:7b-instruct-q4_K_M`) and `ollama pull` it |
