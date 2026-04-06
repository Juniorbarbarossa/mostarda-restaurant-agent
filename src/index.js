require('dotenv').config();
const express = require('express');
const webhookRoutes = require('./routes/webhook');
const apiRoutes = require('./routes/api');
const { iniciarCrons } = require('./services/cron');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'online', sistema: 'Mostarda Restaurant Agent', versao: '1.0.0' });
});

// Rotas
app.use('/webhook', webhookRoutes);
app.use('/api', apiRoutes);

// Inicia servidor
app.listen(PORT, () => {
  console.log(`\n🌿 Mostarda Restaurant Agent rodando na porta ${PORT}`);
  console.log(`📡 Webhook: POST /webhook/whatsapp`);
  console.log(`🔧 API: /api\n`);
  iniciarCrons();
});
