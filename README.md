# 🚀 AI Chatbot - Installation Guide

This guide provides step-by-step instructions to set up and run the AI chatbot powered by **Ollama**.

## 📌 Prerequisites

Before starting, make sure you have the following installed:

- **Node.js** (Recommended: use `nvm` for version management)
- **Yarn** or **yarn** (for package management)
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

## 💻 4. Install and Start the Frontend

Navigate to the frontend directory and install dependencies:

```sh
cd frontend
yarn install  # Or use: npm install
```

Start the development server:

```sh
yarn dev  # Or use: npm dev
```

By default, the frontend runs on **http://localhost:5173**.

---

## 🔧 5. Install and Start the Backend

Navigate to the backend directory and install dependencies:

```sh
cd backend
yarn install  # Or use: npm install
```

Start the backend server:

```sh
yarn dev  # Or use: npm dev
```

The backend should be running on **http://localhost:4000**.

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
- Check if the API is reachable: `curl http://localhost:4000/api/health`.

### **Frontend is not loading**

- Ensure the backend is running.
- Restart the frontend: `yarn dev`.

---

## 📝 License

This project is licensed under the **MIT License**.

---

🚀 **Enjoy your AI chatbot!**
