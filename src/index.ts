import AgentAPI from "apminsight"
AgentAPI.config()

import express from 'express';
import cors from 'cors';

import subjectsRouter from './routes/subjects.js';
import securityMiddleware from './middleware/security';
import {toNodeHandler} from "better-auth/node";
import {auth} from "./lib/auth";

const app = express();
const PORT = 8000;
const frontendUrl = process.env.FRONTEND_URL;
if (!frontendUrl) {
    throw new Error("FRONTEND_URL is required for CORS configuration");
  }

app.use(cors({
  origin: frontendUrl,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}))

app.all('/api/auth/*splat',toNodeHandler(auth));

app.use(express.json());

app.use(securityMiddleware)

app.use('/api/subjects', subjectsRouter);

app.get('/', (req, res) => {
  res.json({ message: 'Hello from Express!' });
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
