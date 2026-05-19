import 'dotenv/config'
import express from "express";
import jwt from 'jsonwebtoken'
import auth from './src/middleware/auth.middleware.js'
import cors from 'cors'
import loginRouter from './src/routes/login.route.js'
import deliveryRouter from './src/routes/delivery.routes.js'


console.log('JWT_SECRET value:', process.env.JWT_SECRET)

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

app.use('/api/login', loginRouter)   // ← moved above listen()
app.use('/api/deliveries', deliveryRouter)

// ── Start server ────────────────────────

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});