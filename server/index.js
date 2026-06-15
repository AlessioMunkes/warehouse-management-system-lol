import 'dotenv/config'
import express from "express";
import cors from 'cors'
import loginRouter from './src/routes/login.route.js'
import deliveryRouter from './src/routes/delivery.routes.js'

const app = express();
const port = 5000;

// ── Middleware ──────────────────────────
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

// ── Routes ──────────────────────────────
app.get("/", (req, res) => {
  res.send("Hello, welcome to Ladles of Love WMS!");
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'server is working' })
})

app.use('/api/login', loginRouter)
app.use('/api/deliveries', deliveryRouter)

// ── Start server ────────────────────────

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});