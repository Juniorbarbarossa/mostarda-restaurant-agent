const cron = require('node-cron');
const { supabase } = require('../../config');
const { enviarMensagemWhatsapp } = require('./whatsapp');

function iniciarCrons() {
  console.log('⏰ Iniciando tarefas automáticas...');

  // Todo dia às 9h — envia mensagens de aniversário
  cron.schedule('0 9 * * *', async () => {
    console.log('🎂 Verificando aniversariantes do dia...');
    await enviarAniversarios();
  });

  // A cada 2 horas — carrinho abandonado (sem resposta há 2h)
  cron.schedule('0 */2 * * *', async () => {
    console.log('🛒 Verificando carrinhos abandonados...');
    await followUpCarrinhoAbandonado();
  });

  // A cada 5 minutos — processa campanhas agendadas
  cron.schedule('*/5 * * * *', async () => {
    await processarCampanhasAgendadas();
  });

  console.log('✅ Crons iniciados!');
}

async function enviarAniversarios() {
  try {
    const hoje = new Date();
    const mes = hoje.getMonth() + 1;
    const dia = hoje.getDate();

    // Busca aniversariantes de hoje em todos os restaurantes
    const { data: clientes } = await supabase
      .from('clientes')
      .select('*, restaurantes(*)')
      .filter('extract(month from aniversario)', 'eq', mes)
      .filter('extract(day from aniversario)', 'eq', dia)
      .not('whatsapp', 'is', null);

    if (!clientes || clientes.length === 0) return;

    console.log(`🎂 ${clientes.length} aniversariante(s) hoje!`);

    for (const cliente of clientes) {
      const restaurante = cliente.restaurantes;
      if (!restaurante?.config_meta_api?.access_token) continue;

      const mensagem = montarMensagemAniversario(cliente, restaurante);

      await enviarMensagemWhatsapp({
        phoneNumberId: restaurante.config_meta_api.phone_number_id,
        accessToken: restaurante.config_meta_api.access_token,
        to: cliente.whatsapp,
        mensagem,
      });

      console.log(`🎂 Parabéns enviado para ${cliente.nome} (${cliente.whatsapp})`);

      // Pequeno delay entre envios
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (err) {
    console.error('❌ Erro nos aniversários:', err.message);
  }
}

function montarMensagemAniversario(cliente, restaurante) {
  const nome = cliente.nome !== 'Cliente' ? cliente.nome.split(' ')[0] : 'meu bem';

  const mensagens = [
    `🎂 Feliz Aniversário, ${nome}! A ${restaurante.nome} deseja um dia lindo e cheio de alegrias! Hoje é um dia especial e queremos celebrar junto com você! 🎉❤️\n\nComo presente, você tem 20% de desconto no seu próximo pedido este mês! É só avisar que é aniversariante. 🥳`,
    `🎉 Hoje é seu dia, ${nome}! Muitas felicidades da equipe ${restaurante.nome}! 🎂\n\nPara comemorar, preparamos um presente especial: 20% de desconto em qualquer pedido hoje! Aproveite! ❤️`,
    `Meu bem, Feliz Aniversário! 🎂✨\n\nA ${restaurante.nome} te deseja muita saúde, amor e realizações! Que tal comemorar com a gente? Você tem direito a 50% de desconto se vier jantar hoje aqui! 🍽️❤️`,
  ];

  return mensagens[Math.floor(Math.random() * mensagens.length)];
}

async function followUpCarrinhoAbandonado() {
  try {
    const duasHorasAtras = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const quatroHorasAtras = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    // Busca conversas ativas sem resposta nas últimas 2-4h
    const { data: conversas } = await supabase
      .from('conversas')
      .select('*, restaurantes(*)')
      .eq('status', 'ativa')
      .lt('updated_at', duasHorasAtras)
      .gt('updated_at', quatroHorasAtras);

    if (!conversas || conversas.length === 0) return;

    for (const conversa of conversas) {
      const restaurante = conversa.restaurantes;
      if (!restaurante?.config_meta_api?.access_token) continue;

      // Verifica se última mensagem foi do cliente (não do bot)
      const msgs = conversa.mensagens || [];
      const ultimaMsg = msgs[msgs.length - 1];
      if (!ultimaMsg || ultimaMsg.role !== 'user') continue;

      const mensagem = `Olá! 😊 Vi que você estava me falando antes e ficou alguma dúvida? Pode me chamar que estou aqui para te ajudar! ❤️`;

      await enviarMensagemWhatsapp({
        phoneNumberId: restaurante.config_meta_api.phone_number_id,
        accessToken: restaurante.config_meta_api.access_token,
        to: conversa.whatsapp_from,
        mensagem,
      });

      console.log(`🛒 Follow-up enviado para ${conversa.whatsapp_from}`);
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (err) {
    console.error('❌ Erro no follow-up:', err.message);
  }
}

async function processarCampanhasAgendadas() {
  try {
    const agora = new Date().toISOString();

    const { data: campanhas } = await supabase
      .from('campanhas')
      .select('*, restaurantes(*)')
      .eq('status', 'agendada')
      .lte('agendado_para', agora);

    if (!campanhas || campanhas.length === 0) return;

    for (const campanha of campanhas) {
      console.log(`📢 Processando campanha: ${campanha.nome}`);

      // Atualiza status para enviando
      await supabase
        .from('campanhas')
        .update({ status: 'enviando' })
        .eq('id', campanha.id);

      // Busca destinatários
      const { data: destinatarios } = await supabase
        .from('campanha_clientes')
        .select('*, clientes(*)')
        .eq('campanha_id', campanha.id)
        .eq('status', 'pendente');

      if (!destinatarios || destinatarios.length === 0) {
        await supabase.from('campanhas').update({ status: 'concluida' }).eq('id', campanha.id);
        continue;
      }

      const restaurante = campanha.restaurantes;
      let enviadas = 0;

      for (const dest of destinatarios) {
        const cliente = dest.clientes;
        if (!cliente?.whatsapp) continue;

        try {
          // Personaliza a mensagem
          const mensagem = campanha.mensagem
            .replace('{nome}', cliente.nome?.split(' ')[0] || 'meu bem')
            .replace('{restaurante}', restaurante.nome);

          await enviarMensagemWhatsapp({
            phoneNumberId: restaurante.config_meta_api?.phone_number_id,
            accessToken: restaurante.config_meta_api?.access_token,
            to: cliente.whatsapp,
            mensagem,
          });

          await supabase
            .from('campanha_clientes')
            .update({ status: 'enviado', enviado_em: new Date() })
            .eq('id', dest.id);

          enviadas++;
          await new Promise(r => setTimeout(r, 500)); // delay entre envios
        } catch {
          await supabase
            .from('campanha_clientes')
            .update({ status: 'falhou' })
            .eq('id', dest.id);
        }
      }

      // Finaliza campanha
      await supabase
        .from('campanhas')
        .update({ status: 'concluida', total_enviadas: enviadas })
        .eq('id', campanha.id);

      console.log(`✅ Campanha "${campanha.nome}" concluída — ${enviadas} enviadas`);
    }
  } catch (err) {
    console.error('❌ Erro nas campanhas:', err.message);
  }
}

module.exports = { iniciarCrons };
