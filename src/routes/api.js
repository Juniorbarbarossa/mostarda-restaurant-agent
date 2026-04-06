const express = require('express');
const router = express.Router();
const { supabase } = require('../../config');

// ── Restaurantes ────────────────────────────────────────────
router.get('/restaurantes', async (req, res) => {
  const { data, error } = await supabase.from('restaurantes').select('*').eq('ativo', true);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/restaurantes', async (req, res) => {
  const { data, error } = await supabase.from('restaurantes').insert(req.body).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/restaurantes/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('restaurantes').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Clientes ────────────────────────────────────────────────
router.get('/restaurantes/:id/clientes', async (req, res) => {
  const { tag, search } = req.query;
  let query = supabase.from('clientes').select('*').eq('restaurante_id', req.params.id);
  if (tag) query = query.eq('tag', tag);
  if (search) query = query.ilike('nome', `%${search}%`);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/restaurantes/:id/clientes/importar-csv', async (req, res) => {
  const { clientes } = req.body; // array de clientes do CSV
  const inserir = clientes.map(c => ({ ...c, restaurante_id: req.params.id }));
  const { data, error } = await supabase.from('clientes').upsert(inserir, { onConflict: 'whatsapp,restaurante_id' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ importados: clientes.length });
});

// ── Produtos (cardápio) ─────────────────────────────────────
router.get('/restaurantes/:id/produtos', async (req, res) => {
  const { data, error } = await supabase
    .from('produtos').select('*').eq('restaurante_id', req.params.id).order('categoria');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/restaurantes/:id/produtos', async (req, res) => {
  const { data, error } = await supabase
    .from('produtos').insert({ ...req.body, restaurante_id: req.params.id }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/produtos/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('produtos').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Pedidos ─────────────────────────────────────────────────
router.get('/restaurantes/:id/pedidos', async (req, res) => {
  const { status } = req.query;
  let query = supabase
    .from('pedidos').select('*, clientes(nome, whatsapp), pedido_itens(*)')
    .eq('restaurante_id', req.params.id);
  if (status) query = query.eq('status', status);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/pedidos/:id/status', async (req, res) => {
  const { status } = req.body;
  const { data, error } = await supabase
    .from('pedidos').update({ status }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Reservas ────────────────────────────────────────────────
router.get('/restaurantes/:id/reservas', async (req, res) => {
  const { data: date } = req.query;
  let query = supabase
    .from('reservas').select('*').eq('restaurante_id', req.params.id);
  if (date) query = query.eq('data', date);
  const { data, error } = await query.order('hora');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Campanhas ────────────────────────────────────────────────
router.get('/restaurantes/:id/campanhas', async (req, res) => {
  const { data, error } = await supabase
    .from('campanhas').select('*').eq('restaurante_id', req.params.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/restaurantes/:id/campanhas', async (req, res) => {
  const { clientes_ids, ...campanha } = req.body;
  const { data: novaCampanha, error } = await supabase
    .from('campanhas').insert({ ...campanha, restaurante_id: req.params.id }).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Adiciona destinatários
  if (clientes_ids?.length) {
    await supabase.from('campanha_clientes').insert(
      clientes_ids.map(cid => ({ campanha_id: novaCampanha.id, cliente_id: cid }))
    );
  }
  res.json(novaCampanha);
});

// ── Reclamações ─────────────────────────────────────────────
router.get('/restaurantes/:id/reclamacoes', async (req, res) => {
  const { data, error } = await supabase
    .from('reclamacoes').select('*').eq('restaurante_id', req.params.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/reclamacoes/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('reclamacoes').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Dashboard stats ──────────────────────────────────────────
router.get('/restaurantes/:id/stats', async (req, res) => {
  const id = req.params.id;
  const hoje = new Date().toISOString().split('T')[0];

  const [pedidos, reservas, conversas, reclamacoes] = await Promise.all([
    supabase.from('pedidos').select('total, status').eq('restaurante_id', id).gte('created_at', hoje),
    supabase.from('reservas').select('id, status').eq('restaurante_id', id).eq('data', hoje),
    supabase.from('conversas').select('id, status').eq('restaurante_id', id).eq('status', 'ativa'),
    supabase.from('reclamacoes').select('id, status').eq('restaurante_id', id).eq('status', 'aberta'),
  ]);

  const faturamentoHoje = (pedidos.data || [])
    .filter(p => p.status !== 'cancelado')
    .reduce((acc, p) => acc + (p.total || 0), 0);

  res.json({
    faturamento_hoje: faturamentoHoje,
    pedidos_ativos: (pedidos.data || []).filter(p => ['novo','confirmado','em_preparo'].includes(p.status)).length,
    reservas_hoje: (reservas.data || []).length,
    conversas_ativas: (conversas.data || []).length,
    reclamacoes_abertas: (reclamacoes.data || []).length,
  });
});

module.exports = router;
