const axios = require('axios');

const META_API_URL = 'https://graph.facebook.com/v19.0';

async function enviarMensagemWhatsapp({ phoneNumberId, accessToken, to, mensagem }) {
  try {
    await axios.post(
      `${META_API_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: mensagem },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`📤 Mensagem enviada para ${to}`);
  } catch (err) {
    console.error('❌ Erro ao enviar WhatsApp:', err.response?.data || err.message);
    throw err;
  }
}

async function enviarTemplateWhatsapp({ phoneNumberId, accessToken, to, templateName, params }) {
  try {
    await axios.post(
      `${META_API_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'pt_BR' },
          components: params ? [{
            type: 'body',
            parameters: params.map(p => ({ type: 'text', text: p })),
          }] : [],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`📤 Template "${templateName}" enviado para ${to}`);
  } catch (err) {
    console.error('❌ Erro ao enviar template:', err.response?.data || err.message);
    throw err;
  }
}

module.exports = { enviarMensagemWhatsapp, enviarTemplateWhatsapp };
