import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import standaloneLiveData from "./server/api/standalone-live-data.js";

dotenv.config();
const app = express();
const PORT = 3000;
app.use(express.json());

// Financial observations require a configured deterministic adapter. Never
// substitute generated claims or canned values when a development feed is absent.
app.get("/api/live-data", standaloneLiveData);

// Configure Vite or Static Asset Serving
async function setupViteAndStatic() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

setupViteAndStatic();
