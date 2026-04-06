const express = require('express');
const router = express.Router();
const { processarMensagem } = require('../agents/agente');
const { buscarRestaurantePorWhatsapp } = require('../services/restaurante');
const { buscarOuCriarCliente, salvarMensagemConversa } = require('../services/restaurante');

// Verificação do webhook (Meta exige esse endpoint)
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    console.log('✅ Webhook verificado com sucesso');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Recebe mensagens do WhatsApp
router.post('/whatsapp', async (req, res) => {
  // Responde 200 imediatamente (Meta exige resposta rápida)
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Ignorar status de mensagens (delivered, read, etc)
    if (value?.statuses) return;

    const messages = value?.messages;
    if (!messages || messages.length === 0) return;

    const msg = messages[0];
    const phoneNumberId = value.metadata?.phone_number_id;
    const from = msg.from; // número do cliente
    const tipo = msg.type; // text | audio | image | etc

    // Por enquanto só processa texto
    if (tipo !== 'text') {
      console.log(`⚠️ Tipo de mensagem não suportado: ${tipo}`);
      return;
    }

    const textoRecebido = msg.text?.body;
    if (!textoRecebido) return;

    console.log(`\n📩 Mensagem de ${from}: "${textoRecebido}"`);

    // 1. Busca o restaurante pelo phone_number_id da Meta
    const restaurante = await buscarRestaurantePorWhatsapp(phoneNumberId);
    if (!restaurante) {
      console.log(`❌ Restaurante não encontrado para phone_number_id: ${phoneNumberId}`);
      return;
    }

    // 2. Busca ou cria o cliente
    const cliente = await buscarOuCriarCliente(restaurante.id, from);

    // 3. Salva a mensagem do cliente no histórico
    await salvarMensagemConversa(restaurante.id, from, 'user', textoRecebido);

    // 4. Processa com o agente IA
    const resposta = await processarMensagem({
      restaurante,
      cliente,
      mensagem: textoRecebido,
      from,
      phoneNumberId,
    });

    // 5. Salva a resposta do agente no histórico
    await salvarMensagemConversa(restaurante.id, from, 'assistant', resposta);

    console.log(`✅ Resposta enviada para ${from}`);

  } catch (err) {
    console.error('❌ Erro no webhook:', err.message);
  }
});

module.exports = router;
