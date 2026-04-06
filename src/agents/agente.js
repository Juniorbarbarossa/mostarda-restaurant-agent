const { anthropic } = require('../../config');
const { buscarHistoricoConversa } = require('../services/cliente');
const { buscarProdutos } = require('../services/produto');
const { enviarMensagemWhatsapp } = require('../services/whatsapp');
const { registrarPedido } = require('../services/pedido');
const { registrarReserva } = require('../services/reserva');
const { registrarReclamacao } = require('../services/reclamacao');

// Monta o system prompt personalizado para cada restaurante
function montarSystemPrompt(restaurante, produtos) {
  const cardapio = produtos.map(p => {
    const precos = Object.entries(p.precos || {})
      .map(([tam, val]) => `${tam}: R$${val}`)
      .join(' | ');
    return `- ${p.nome} (${p.categoria})${p.vegetariano ? ' 🌱' : ''}${p.destaque ? ' ⭐' : ''}: ${p.descricao || ''} — ${precos}`;
  }).join('\n');

  const personas = {
    vovo: `Você é a Vovó, atendente calorosa e acolhedora do restaurante ${restaurante.nome}. 
Trate todos com muito amor e carinho. Use expressões como "meu bem", "meu querido(a)", "netinho(a)". 
Seja simpática, paciente e sempre ofereça sugestões com entusiasmo. Use emojis com moderação. 🌿❤️`,

    chef: `Você é o Chef ${restaurante.nome}, especialista apaixonado por gastronomia.
Fale com autoridade sobre os pratos, compartilhe dicas culinárias e mostre paixão pela culinária.
Seja entusiasmado mas profissional.`,

    atendente: `Você é o atendente virtual do ${restaurante.nome}.
Seja profissional, prestativo e eficiente. Responda de forma clara e objetiva.`,
  };

  const persona = personas[restaurante.persona_agente] || personas.atendente;
  const instrucoes = restaurante.instrucoes_agente || '';

  return `${persona}

${instrucoes ? `INSTRUÇÕES ESPECÍFICAS:\n${instrucoes}\n` : ''}

INFORMAÇÕES DO RESTAURANTE:
- Nome: ${restaurante.nome}
- WhatsApp: ${restaurante.telefone_whatsapp}
- Cardápio digital: ${restaurante.cardapio_url || 'não disponível'}
- Localização: ${restaurante.maps_url || 'não disponível'}
- Contato para eventos: ${restaurante.numero_eventos || restaurante.telefone_whatsapp}

CARDÁPIO COMPLETO:
${cardapio}

REGRAS IMPORTANTES:
1. Para EVENTOS: NUNCA informe preços. Colete nome e telefone do cliente e direcione para ${restaurante.numero_eventos || restaurante.telefone_whatsapp}.
2. Para RECLAMAÇÕES: Acolha com carinho, peça desculpas sinceras e informe que registrará e retornarão o contato. Sempre registre.
3. Para RESERVAS: Colete nome, data, hora e número de pessoas. Confirme disponibilidade.
4. Para PEDIDOS: Confirme os itens, tamanho/variação, endereço (se delivery) e forma de pagamento.
5. Para LOCALIZAÇÃO: Envie o link do Google Maps quando solicitado.
6. Responda SEMPRE em português brasileiro.
7. Seja conciso — mensagens de WhatsApp devem ser curtas e diretas.

AÇÕES ESPECIAIS (responda em JSON quando for executar uma ação):
- Para registrar pedido: {"acao": "pedido", "itens": [...], "endereco": "...", "pagamento": "..."}
- Para registrar reserva: {"acao": "reserva", "data": "...", "hora": "...", "pessoas": N, "nome": "..."}
- Para registrar reclamação: {"acao": "reclamacao", "descricao": "..."}
- Para enviar localização: {"acao": "localizacao"}
- Para resposta normal: apenas o texto da resposta`;
}

async function processarMensagem({ restaurante, cliente, mensagem, from, phoneNumberId }) {
  try {
    // 1. Busca histórico de conversa (últimas 20 mensagens)
    const historico = await buscarHistoricoConversa(restaurante.id, from, 20);

    // 2. Busca cardápio do restaurante
    const produtos = await buscarProdutos(restaurante.id);

    // 3. Monta o system prompt
    const systemPrompt = montarSystemPrompt(restaurante, produtos);

    // 4. Monta o histórico no formato Anthropic
    const mensagens = historico.map(h => ({
      role: h.role,
      content: h.content,
    }));

    // Adiciona a mensagem atual
    mensagens.push({ role: 'user', content: mensagem });

    // 5. Chama o Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: mensagens,
    });

    const respostaTexto = response.content[0]?.text || '';

    // 6. Verifica se é uma ação especial (JSON)
    let textoFinal = respostaTexto;
    try {
      const json = JSON.parse(respostaTexto);
      textoFinal = await processarAcao(json, restaurante, cliente, from);
    } catch {
      // Não é JSON, é resposta normal — usa direto
    }

    // 7. Envia de volta pelo WhatsApp
    await enviarMensagemWhatsapp({
      phoneNumberId,
      accessToken: restaurante.config_meta_api?.access_token,
      to: from,
      mensagem: textoFinal,
    });

    return textoFinal;

  } catch (err) {
    console.error('❌ Erro no agente:', err.message);
    const errMsg = 'Desculpe, tive um probleminha aqui. Pode repetir sua mensagem? 🙏';
    await enviarMensagemWhatsapp({
      phoneNumberId,
      accessToken: restaurante.config_meta_api?.access_token,
      to: from,
      mensagem: errMsg,
    });
    return errMsg;
  }
}

// Processa ações especiais retornadas pelo agente
async function processarAcao(json, restaurante, cliente, from) {
  switch (json.acao) {
    case 'pedido': {
      await registrarPedido({
        restaurante_id: restaurante.id,
        cliente_id: cliente?.id,
        itens: json.itens,
        endereco: json.endereco,
        pagamento: json.pagamento,
        canal: 'whatsapp',
      });
      return `Pedido registrado com sucesso! ✅\n\nVou preparar tudo com muito carinho. Assim que ficar pronto, te aviso! 🍽️❤️`;
    }

    case 'reserva': {
      await registrarReserva({
        restaurante_id: restaurante.id,
        cliente_id: cliente?.id,
        nome_cliente: json.nome || cliente?.nome,
        whatsapp_cliente: from,
        data: json.data,
        hora: json.hora,
        num_pessoas: json.pessoas,
      });
      return `Reserva anotada com sucesso! 🎉\n\n📅 ${json.data} às ${json.hora}\n👥 ${json.pessoas} pessoa(s)\n\nTe esperamos com muito carinho! ❤️`;
    }

    case 'reclamacao': {
      await registrarReclamacao({
        restaurante_id: restaurante.id,
        cliente_id: cliente?.id,
        whatsapp_cliente: from,
        nome_cliente: cliente?.nome,
        descricao: json.descricao,
      });
      return `Meu bem, sinto muito pelo transtorno! 😔 Registrei sua reclamação e nossa equipe vai entrar em contato o mais rápido possível para resolver tudo. Sua satisfação é muito importante para nós! ❤️`;
    }

    case 'localizacao': {
      return `📍 Aqui está nossa localização:\n${restaurante.maps_url}\n\nQualquer dúvida sobre como chegar, é só perguntar! 😊`;
    }

    default:
      return JSON.stringify(json);
  }
}

module.exports = { processarMensagem };
