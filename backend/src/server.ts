import express from "express";
import cors from "cors";
import router from "./routes";

const app = express();
app.use(express.json());

// 📌 Permitir todas las conexiones CORS
app.use(cors({ origin: "*" }));

app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.url}`);
  next();
});

app.use("/api", router);

app.use((err: any, req: any, res: any, next: any) => {
  console.error("❌ Error en el servidor:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
