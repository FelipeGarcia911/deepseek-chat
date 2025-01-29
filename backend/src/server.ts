import express, { Request, Response } from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const OLLAMA_API_URL = "http://localhost:11434/api/generate";

app.post("/chat", async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    const response = await axios.post(OLLAMA_API_URL, {
      model: "deepseek-r1:7b",
      prompt: prompt,
      stream: false,
    });

    res.json({ response: response.data.response });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al conectar con Ollama" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
