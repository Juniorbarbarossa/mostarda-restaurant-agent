const { supabase } = require('../../config');

// ============================================================
// RESTAURANTE
// ============================================================
async function buscarRestaurantePorWhatsapp(phoneNumberId) {
  const { data, error } = await supabase
    .from('restaurantes')
    .select('*')
    .eq('ativo', true)
    .filter('config_meta_api->>phone_number_id', 'eq', phoneNumberId)
    .single();

  if (error) {
    console.error('Erro ao buscar restaurante:', error.message);
    return null;
  }
  return data;
}

async function buscarRestautantePorId(id) {
  const { data } = await supabase
    .from('restaurantes')
    .select('*')
    .eq('id', id)
    .single();
  return data;
}

// ============================================================
// CLIENTE
// ============================================================
async function buscarOuCriarCliente(restauranteId, whatsapp) {
  // Tenta encontrar cliente existente
  const { data: existente } = await supabase
    .from('clientes')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .eq('whatsapp', whatsapp)
    .single();

  if (existente) return existente;

  // Cria novo cliente
  const { data: novo, error } = await supabase
    .from('clientes')
    .insert({
      restaurante_id: restauranteId,
      whatsapp,
      nome: 'Cliente',
      origem: 'whatsapp',
    })
    .select()
    .single();

  if (error) console.error('Erro ao criar cliente:', error.message);
  return novo;
}

async function atualizarNomeCliente(clienteId, nome) {
  await supabase
    .from('clientes')
    .update({ nome })
    .eq('id', clienteId);
}

async function buscarHistoricoConversa(restauranteId, whatsapp, limite = 20) {
  const { data } = await supabase
    .from('conversas')
    .select('mensagens')
    .eq('restaurante_id', restauranteId)
    .eq('whatsapp_from', whatsapp)
    .eq('status', 'ativa')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return [];

  const msgs = data.mensagens || [];
  // Retorna as últimas N mensagens
  return msgs.slice(-limite);
}

async function salvarMensagemConversa(restauranteId, whatsapp, role, content) {
  // Busca conversa ativa
  const { data: conversa } = await supabase
    .from('conversas')
    .select('id, mensagens')
    .eq('restaurante_id', restauranteId)
    .eq('whatsapp_from', whatsapp)
    .eq('status', 'ativa')
    .single();

  const novaMensagem = { role, content, timestamp: new Date().toISOString() };

  if (conversa) {
    const msgs = [...(conversa.mensagens || []), novaMensagem];
    await supabase
      .from('conversas')
      .update({ mensagens: msgs, updated_at: new Date() })
      .eq('id', conversa.id);
  } else {
    await supabase.from('conversas').insert({
      restaurante_id: restauranteId,
      whatsapp_from: whatsapp,
      canal: 'whatsapp',
      mensagens: [novaMensagem],
      status: 'ativa',
    });
  }
}

// ============================================================
// PRODUTO
// ============================================================
async function buscarProdutos(restauranteId) {
  const { data } = await supabase
    .from('produtos')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .eq('disponivel', true)
    .order('categoria');
  return data || [];
}

// ============================================================
// PEDIDO
// ============================================================
async function registrarPedido({ restaurante_id, cliente_id, itens, endereco, pagamento, canal }) {
  const total = (itens || []).reduce((acc, item) => acc + (item.preco * item.quantidade), 0);

  const { data: pedido, error } = await supabase
    .from('pedidos')
    .insert({
      restaurante_id,
      cliente_id,
      canal,
      tipo: endereco ? 'delivery' : 'mesa',
      status: 'novo',
      total,
      endereco_entrega: endereco,
      forma_pagamento: pagamento,
    })
    .select()
    .single();

  if (error) {
    console.error('Erro ao registrar pedido:', error.message);
    return null;
  }

  // Registra itens
  if (itens && itens.length > 0) {
    await supabase.from('pedido_itens').insert(
      itens.map(item => ({
        pedido_id: pedido.id,
        nome_produto: item.nome,
        variacao: item.variacao,
        quantidade: item.quantidade,
        preco_unitario: item.preco,
        observacao: item.observacao,
      }))
    );
  }

  // Atualiza stats do cliente
  if (cliente_id) {
    await supabase.rpc('incrementar_gasto_cliente', {
      p_cliente_id: cliente_id,
      p_valor: total,
    }).catch(() => {}); // ignora se a função não existir ainda
  }

  console.log(`✅ Pedido #${pedido.id} registrado — R$${total}`);
  return pedido;
}

// ============================================================
// RESERVA
// ============================================================
async function registrarReserva({ restaurante_id, cliente_id, nome_cliente, whatsapp_cliente, data, hora, num_pessoas, observacoes }) {
  const { data: reserva, error } = await supabase
    .from('reservas')
    .insert({
      restaurante_id,
      cliente_id,
      nome_cliente,
      whatsapp_cliente,
      data,
      hora,
      num_pessoas,
      observacoes,
      status: 'pendente',
    })
    .select()
    .single();

  if (error) {
    console.error('Erro ao registrar reserva:', error.message);
    return null;
  }

  console.log(`✅ Reserva registrada para ${nome_cliente} em ${data} às ${hora}`);
  return reserva;
}

// ============================================================
// RECLAMAÇÃO
// ============================================================
async function registrarReclamacao({ restaurante_id, cliente_id, whatsapp_cliente, nome_cliente, descricao }) {
  const { data, error } = await supabase
    .from('reclamacoes')
    .insert({
      restaurante_id,
      cliente_id,
      whatsapp_cliente,
      nome_cliente,
      descricao,
      status: 'aberta',
    })
    .select()
    .single();

  if (error) {
    console.error('Erro ao registrar reclamação:', error.message);
    return null;
  }

  console.log(`⚠️ Reclamação registrada: ${descricao?.substring(0, 50)}...`);
  return data;
}

module.exports = {
  buscarRestaurantePorWhatsapp,
  buscarRestautantePorId,
  buscarOuCriarCliente,
  atualizarNomeCliente,
  buscarHistoricoConversa,
  salvarMensagemConversa,
  buscarProdutos,
  registrarPedido,
  registrarReserva,
  registrarReclamacao,
};
