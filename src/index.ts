import AgentAPI from "apminsight"
AgentAPI.config()

import express from 'express';
import cors from 'cors';
import {toNodeHandler} from "better-auth/node";

import subjectsRouter from './routes/subjects.js';
import departmentsRouter from './routes/departments.js';
import classesRouter from './routes/classes.js';
import usersRouter from './routes/users.js';
import enrollmentsRouter from './routes/enrollments.js';
import statsRouter from './routes/stats.js';
import securityMiddleware from './middleware/security.js';
import {auth} from "./lib/auth.js";

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

app.use(async (req, res, next) => {
    const session = await auth.api.getSession({ headers: req.headers });
    if (session) {
        req.user = {
            role: session.user.role as any,
        };
    }
    next();
});

app.use(securityMiddleware)

app.use('/api/subjects', subjectsRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/classes', classesRouter);
app.use('/api/users', usersRouter);
app.use('/api/enrollments', enrollmentsRouter);
app.use("/api/stats", statsRouter);

app.get('/', (req, res) => {
  res.json({ message: 'Hello from Express!' });
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
