# 🚀 AI Chatbot - Installation Guide

This guide provides step-by-step instructions to set up and run the AI chatbot powered by **Ollama**.

## 📌 Prerequisites

Before starting, make sure you have the following installed:

- **Node.js 26.12.1** (run `nvm install` and `nvm use` from the repository root)
- **pnpm 12.14.0** (install with `npm install --global pnpm@12.14.0`)
- **Docker** (optional, for running Ollama in a container)
- **Git** (to clone the repository)

---

## 🧠 1. Install Ollama

Ollama is required to run the AI model locally. Install it using the following command:

```sh
curl -fsSL https://ollama.ai/install.sh | sh
```

For **Windows**, download and install Ollama from [here](https://ollama.ai/download).

---

## 📥 2. Download the Model

Once Ollama is installed, download the AI model by running:

```sh
ollama pull deepseek-r1:1.5b
```

This command fetches the **DeepSeek AI model**, which will be used by the chatbot.

---

## ▶️ 3. Start Ollama

To start the Ollama service, simply run:

```sh
ollama run deepseek-r1:1.5b
```

To run Ollama in the background:

```sh
nohup ollama serve > ollama.log 2>&1 &
```

This ensures the service stays active even after closing the terminal.

---

## 💻 4. Install the workspace

Run all setup commands from the repository root:

```sh
nvm install
nvm use
npm install --global pnpm@12.14.0
pnpm install --frozen-lockfile
cp -n backend/.env.example backend/.env
cp -n frontend/.env.example frontend/.env
```

Keep existing `.env` files if you have already configured them. The backend
requires `OLLAMA_API_URL` and `MODEL_NAME`; the frontend uses `VITE_API_BASE_URL`.

## 🔧 5. Run the applications

```sh
pnpm dev
```

This starts the frontend at **http://localhost:5173** and the backend at
**http://localhost:4000**. Stop both with Ctrl+C. To run them separately:

```sh
pnpm dev:frontend
pnpm dev:backend
```

Each package script runs in its own directory, so `.env` paths remain local
to the application. Filtered commands also run in each package directory. Build the libraries first
and include their watchers with the dependency selector `...`:

```sh
pnpm build:packages
pnpm --filter "backend..." --parallel dev
```

## Workspace commands

| Command                                  | Purpose                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`         | Install both applications using the root lockfile                                |
| `pnpm typecheck`                         | Check TypeScript in both applications                                            |
| `pnpm test`                              | Run backend regression and lifecycle tests without Ollama                        |
| `pnpm lint`                              | Run the frontend ESLint rules (backend has no ESLint configuration)              |
| `pnpm build`                             | Compile the backend into backend/dist and bundle the frontend into frontend/dist |
| `pnpm --filter backend start`            | Run the compiled backend after building                                          |
| `pnpm --filter frontend preview`         | Preview the frontend production build locally                                    |
| `pnpm --filter frontend add <package>`   | Add a runtime dependency to the frontend                                         |
| `pnpm --filter backend add -D <package>` | Add a development dependency to the backend                                      |

The root package is private and coordinates `backend/`, `frontend/` and the
internal libraries in `packages/*`. See [internal packages](docs/internal-packages.md)
for their dependencies, module formats and development workflow.
Commit the root `pnpm-lock.yaml` when changing dependencies.
See [the architecture](docs/architecture.md) for current and target system boundaries.

---

## 🎯 Final Steps

1. Ensure that **Ollama is running** before starting the backend.
2. Open **http://localhost:5173** in your browser to access the chatbot.

If you encounter any issues, check the logs:

```sh
tail -f backend/logs/server.log  # Check backend logs
tail -f ollama.log               # Check Ollama logs
```

---

## 🛠 Troubleshooting

### **Ollama is not responding**

- Run `ollama list` to check if the model is installed.
- Restart Ollama: `ollama serve`.

### **Backend is not responding**

- Ensure Ollama is running before starting the backend.
- Check if the API is reachable: `curl http://localhost:4000/api/chats/list`.

### **Frontend is not loading**

- Ensure the backend is running.
- Restart the frontend: `pnpm dev`.

---

## 📝 License

This project is licensed under the **MIT License**.

---

🚀 **Enjoy your AI chatbot!**

## Architecture and roadmap

See [the architecture](docs/architecture.md), [ADR-001](docs/adr/001-use-modular-monolith.md) and [the roadmap](docs/roadmap.md) for system boundaries, decisions and the implementation sequence.

See [backend construction and lifecycle](docs/backend-composition.md) for dependency injection, startup/shutdown behavior and the focused P0.2 regression tests.
