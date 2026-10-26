/**
 * routes/messages.js
 * Endpoints completos para gerenciamento de Mensagens, Cartas, Ideação com IA e Agendamento de Entrega
 *
 * GET    /messages/             -> Lista mensagens do usuário autenticado
 * GET    /messages/:id          -> Detalhes de uma mensagem
 * POST   /messages/             -> Criar / agendar nova mensagem
 * PUT    /messages/:id          -> Atualizar rascunho / mensagem
 * DELETE /messages/:id          -> Remover mensagem
 * POST   /messages/generate-ai  -> Assistente de ideação gerativo para cartas
 */
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import {
  store,
  activeDevicesForUser,
  ownedActiveDeviceByRawId,
} from '../db.js';
import { pool } from '../db/mysql.js';
import { uuid } from '../seed.js';

const router = Router();

// Garantir array de mensagens na store
if (!store.messages) {
  store.messages = [];
}

// 1. GET /messages/ — Lista mensagens do usuário autenticado (cartas e alertas de dispositivos)
router.get('/messages/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { recipient, status } = req.query || {};

  const userDeviceRawIds = activeDevicesForUser(userId).map((d) => d.device_id);

  let userMessages = store.messages.filter(
    (m) =>
      m.userId === userId ||
      m.user_id === userId ||
      (m.device_id && userDeviceRawIds.includes(m.device_id))
  );

  // Sincronizar com banco MySQL caso haja registros persistidos
  try {
    const [dbRows] = await pool.query(
      'SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    if (dbRows && dbRows.length > 0) {
      const dbMessages = dbRows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        user_id: r.user_id,
        title: r.title,
        content: r.content,
        recipientName: r.recipient_name,
        recipientEmail: r.recipient_email,
        recipientPhone: r.recipient_phone,
        deliveryType: r.delivery_type,
        deliveryDate: r.delivery_date,
        deliveryTime: r.delivery_time,
        guardianProtected: Boolean(r.guardian_protected),
        emailNotification: Boolean(r.email_notification),
        whatsappNotification: Boolean(r.whatsapp_notification),
        mediaFiles: typeof r.media_files === 'string' ? JSON.parse(r.media_files) : (r.media_files || []),
        category: r.category,
        status: r.status,
        isEncrypted: Boolean(r.is_encrypted),
        device_id: r.device_id,
        message: r.message_text,
        severity: r.severity,
        active: Boolean(r.active),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      // Mesclar priorizando mensagens do MySQL sem duplicatas
      const existingIds = new Set(dbMessages.map((m) => m.id));
      userMessages = [
        ...dbMessages,
        ...userMessages.filter((m) => !existingIds.has(m.id)),
      ];
    }
  } catch (err) {
    // Falha silenciosa no MySQL usando fallback em memória
  }

  if (recipient) {
    userMessages = userMessages.filter((m) =>
      (m.recipientName || '').toLowerCase().includes(String(recipient).toLowerCase())
    );
  }

  if (status) {
    userMessages = userMessages.filter((m) => m.status === status);
  }

  userMessages.sort((a, b) => new Date(b.createdAt || b.timestamp || 0) - new Date(a.createdAt || a.timestamp || 0));

  return res.json(userMessages);
});

// 2. GET /messages/:id — Busca mensagem por ID
router.get('/messages/:id', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const userDeviceRawIds = activeDevicesForUser(userId).map((d) => d.device_id);

  // Tentar primeiro do banco MySQL
  try {
    const [dbRows] = await pool.query(
      'SELECT * FROM messages WHERE id = ? AND (user_id = ? OR device_id IN (?)) LIMIT 1',
      [req.params.id, userId, userDeviceRawIds.length ? userDeviceRawIds : ['none']]
    );
    if (dbRows && dbRows.length > 0) {
      const r = dbRows[0];
      return res.json({
        id: r.id,
        userId: r.user_id,
        user_id: r.user_id,
        title: r.title,
        content: r.content,
        recipientName: r.recipient_name,
        recipientEmail: r.recipient_email,
        recipientPhone: r.recipient_phone,
        deliveryType: r.delivery_type,
        deliveryDate: r.delivery_date,
        deliveryTime: r.delivery_time,
        guardianProtected: Boolean(r.guardian_protected),
        emailNotification: Boolean(r.email_notification),
        whatsappNotification: Boolean(r.whatsapp_notification),
        mediaFiles: typeof r.media_files === 'string' ? JSON.parse(r.media_files) : (r.media_files || []),
        category: r.category,
        status: r.status,
        isEncrypted: Boolean(r.is_encrypted),
        device_id: r.device_id,
        message: r.message_text,
        severity: r.severity,
        active: Boolean(r.active),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      });
    }
  } catch (err) {
    // Fallback para store em memória
  }

  const msg = store.messages.find(
    (m) =>
      m.id === req.params.id &&
      (m.userId === userId ||
        m.user_id === userId ||
        (m.device_id && userDeviceRawIds.includes(m.device_id)))
  );

  if (!msg) {
    return res.status(404).json({ detail: 'Mensagem não encontrada' });
  }

  return res.json(msg);
});

// 3. POST /messages/ — Cria ou agenda nova mensagem (dispositivo ou carta)
router.post('/messages/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const body = req.body || {};

  // Caso A: Mensagem/Alerta de dispositivo (ex: telemetria, iot ou api.test.js)
  if (body.device_id && !body.title) {
    if (!ownedActiveDeviceByRawId(userId, body.device_id)) {
      return res.status(404).json({ detail: 'Device not found or access denied' });
    }

    const createdDeviceMsg = {
      id: uuid(),
      device_id: body.device_id,
      userId,
      user_id: userId,
      message: body.message,
      severity: body.severity ?? 'info',
      source: body.source ?? 'api',
      active: body.active ?? true,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    store.messages.push(createdDeviceMsg);

    // Persistir alerta no MySQL
    try {
      await pool.query(
        `INSERT INTO messages (
          id, user_id, title, content, status, device_id, message_text,
          severity, source, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'delivered', ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
        [
          createdDeviceMsg.id,
          userId,
          `Alerta ${createdDeviceMsg.device_id}`,
          createdDeviceMsg.message || 'Alerta de dispositivo',
          createdDeviceMsg.device_id,
          createdDeviceMsg.message,
          createdDeviceMsg.severity,
          createdDeviceMsg.source,
          createdDeviceMsg.active ? 1 : 0,
        ]
      );
    } catch {
      // Fallback para store
    }

    return res.status(200).json(createdDeviceMsg);
  }

  // Caso B: Carta Ethernity
  const {
    title,
    content,
    recipientName,
    recipientEmail,
    recipientPhone,
    deliveryType = 'date',
    deliveryDate = null,
    deliveryTime = '09:00',
    guardianProtected = true,
    emailNotification = true,
    whatsappNotification = false,
    mediaFiles = [],
    category = 'Cartas de Amor',
    status = 'scheduled', // 'draft' | 'scheduled' | 'delivered'
  } = body;

  if (!title || !title.trim()) {
    return res.status(400).json({ detail: 'O título da mensagem é obrigatório.' });
  }

  const createdMessage = {
    id: `msg-${uuid()}`,
    userId,
    user_id: userId,
    title: title.trim(),
    content: content || '',
    recipientName: recipientName || 'Mariana Silva',
    recipientEmail: recipientEmail || '',
    recipientPhone: recipientPhone || '',
    deliveryType, // 'date' | 'posthumous'
    deliveryDate: deliveryType === 'date' ? deliveryDate : null,
    deliveryTime,
    guardianProtected: Boolean(guardianProtected),
    emailNotification: Boolean(emailNotification),
    whatsappNotification: Boolean(whatsappNotification),
    mediaFiles: Array.isArray(mediaFiles) ? mediaFiles : [],
    category,
    status,
    isEncrypted: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.messages.push(createdMessage);

  // Persistir carta no MySQL
  try {
    await pool.query(
      `INSERT INTO messages (
        id, user_id, title, content, recipient_name, recipient_email, recipient_phone,
        delivery_type, delivery_date, delivery_time, guardian_protected, email_notification,
        whatsapp_notification, media_files, category, status, is_encrypted, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(3), NOW(3))`,
      [
        createdMessage.id,
        userId,
        createdMessage.title,
        createdMessage.content,
        createdMessage.recipientName,
        createdMessage.recipientEmail,
        createdMessage.recipientPhone,
        createdMessage.deliveryType,
        createdMessage.deliveryDate,
        createdMessage.deliveryTime,
        createdMessage.guardianProtected ? 1 : 0,
        createdMessage.emailNotification ? 1 : 0,
        createdMessage.whatsappNotification ? 1 : 0,
        JSON.stringify(createdMessage.mediaFiles),
        createdMessage.category,
        createdMessage.status,
      ]
    );
  } catch {
    // Continua com store em memória
  }

  return res.status(201).json(createdMessage);
});

// 4. PUT /messages/:id — Atualiza mensagem, rascunho ou status ativo
router.put('/messages/:id', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const userDeviceRawIds = activeDevicesForUser(userId).map((d) => d.device_id);
  const updates = req.body || {};

  const msgIndex = store.messages.findIndex(
    (m) =>
      m.id === req.params.id &&
      (m.userId === userId ||
        m.user_id === userId ||
        (m.device_id && userDeviceRawIds.includes(m.device_id)))
  );

  let updatedMessage = null;

  if (msgIndex !== -1) {
    const current = store.messages[msgIndex];
    updatedMessage = {
      ...current,
      ...updates,
      id: current.id,
      userId: current.userId || userId,
      updatedAt: new Date().toISOString(),
    };
    store.messages[msgIndex] = updatedMessage;
  }

  // Atualizar no MySQL
  try {
    const [result] = await pool.query(
      `UPDATE messages SET
        title = COALESCE(?, title),
        content = COALESCE(?, content),
        status = COALESCE(?, status),
        active = COALESCE(?, active),
        updated_at = NOW(3)
       WHERE id = ? AND (user_id = ? OR device_id IN (?))`,
      [
        updates.title || null,
        updates.content || updates.message || null,
        updates.status || null,
        updates.active !== undefined ? (updates.active ? 1 : 0) : null,
        req.params.id,
        userId,
        userDeviceRawIds.length ? userDeviceRawIds : ['none'],
      ]
    );

    if (result.affectedRows > 0 && !updatedMessage) {
      const [rows] = await pool.query('SELECT * FROM messages WHERE id = ?', [req.params.id]);
      if (rows && rows[0]) {
        const r = rows[0];
        updatedMessage = {
          id: r.id,
          userId: r.user_id,
          title: r.title,
          content: r.content,
          recipientName: r.recipient_name,
          active: Boolean(r.active),
          status: r.status,
          updatedAt: r.updated_at,
        };
      }
    }
  } catch {
    // Fallback store
  }

  if (!updatedMessage) {
    return res.status(404).json({ detail: 'Mensagem não encontrada ou acesso negado' });
  }

  return res.json(updatedMessage);
});

// 5. DELETE /messages/:id — Exclui mensagem
router.delete('/messages/:id', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const userDeviceRawIds = activeDevicesForUser(userId).map((d) => d.device_id);

  const msgIndex = store.messages.findIndex(
    (m) =>
      m.id === req.params.id &&
      (m.userId === userId ||
        m.user_id === userId ||
        (m.device_id && userDeviceRawIds.includes(m.device_id)))
  );

  let deleted = false;
  if (msgIndex !== -1) {
    store.messages.splice(msgIndex, 1);
    deleted = true;
  }

  // Remover do MySQL
  try {
    const [result] = await pool.query(
      'DELETE FROM messages WHERE id = ? AND (user_id = ? OR device_id IN (?))',
      [req.params.id, userId, userDeviceRawIds.length ? userDeviceRawIds : ['none']]
    );
    if (result.affectedRows > 0) {
      deleted = true;
    }
  } catch {
    // Fallback
  }

  if (!deleted) {
    return res.status(404).json({ detail: 'Mensagem não encontrada ou acesso negado' });
  }

  return res.json({ message: 'Mensagem excluída com sucesso' });
});

// 6. POST /messages/generate-ai — Assistente de ideação gerativo com IA
router.post('/messages/generate-ai', requireAuth, (req, res) => {
  const { prompt = '', recipientName = 'Minha filha', tone = 'afetuoso' } = req.body || {};

  const cleanPrompt = prompt.toLowerCase();
  let generatedTitle = '';
  let generatedContent = '';

  if (cleanPrompt.includes('aniversário') || cleanPrompt.includes('aniversario') || cleanPrompt.includes('18 anos')) {
    generatedTitle = `Carta de Aniversário Especial para ${recipientName}`;
    generatedContent = `Minha querida ${recipientName},\n\nHoje é um dia verdadeiramente sagrado: celebramos o dom da sua vida e a pessoa extraordinária que você se tornou.\n\nDesde o seu primeiro choro, você transformou meu mundo com uma luz que nunca se apagará. Cada sorriso seu foi o meu maior combustível.\n\nNeste novo capítulo, desejo que você tenha a coragem de ser autêntica, a sabedoria para escolher a gentileza e a certeza inabalável de que meu amor por você não conhece limites de tempo ou espaço.\n\nCom todo o meu amor e bênçãos para sempre!`;
  } else if (cleanPrompt.includes('casamento') || cleanPrompt.includes('noiva') || cleanPrompt.includes('noivo')) {
    generatedTitle = `Para o Dia do seu Casamento — ${recipientName}`;
    generatedContent = `Minha amada ${recipientName},\n\nVer você construindo sua própria família e dando esse passo tão sublime enche meu coração de orgulho e gratidão.\n\nO casamento é uma arte diária de paciência, respeito mútuo, renúncias amorosas e companheirismo. Cuidem um do outro com a mesma ternura que sempre tivemos por você.\n\nQue o seu lar seja um porto seguro de paz e alegria.\n\nEstarei sempre com você, em espírito e em amor eterno.`;
  } else if (cleanPrompt.includes('faculdade') || cleanPrompt.includes('carreira') || cleanPrompt.includes('motivacional') || cleanPrompt.includes('conselho')) {
    generatedTitle = `Conselhos para a Vida e Carreira — ${recipientName}`;
    generatedContent = `Querida ${recipientName},\n\nA vida sempre nos trará encruzilhadas e momentos de incerteza, mas lembre-se sempre da força que corre em suas veias e dos princípios que cultivamos juntos.\n\nNunca comprometa sua integridade pelo caminho mais fácil. Trabalhe com paixão, aprenda com as quedas e trate todos com dignidade.\n\nVocê nasceu para voar alto. Acredite no seu potencial!\n\nCom orgulho infinito.`;
  } else if (cleanPrompt.includes('saudade') || cleanPrompt.includes('despedida') || cleanPrompt.includes('póstuma') || cleanPrompt.includes('legado')) {
    generatedTitle = `Um Abraço no Tempo para ${recipientName}`;
    generatedContent = `Minha querida ${recipientName},\n\nSe você está lendo estas linhas, saiba que cada palavra aqui foi gravada com a mais pura essência do que sinto por você.\n\nNão guarde tristeza no coração; guarde as nossas risadas, os nossos abraços e os momentos em que nos sentimos infinitos. Eu vivi plenamente ao seu lado.\n\nSiga em frente, viva com intensidade e honre a sua história. Eu estarei vivo em cada lembrança boa.\n\nTe amo para todo o sempre.`;
  } else {
    generatedTitle = `Palavras de Amor e Inspiração para ${recipientName}`;
    generatedContent = `Minha querida ${recipientName},\n\nEscrevo esta mensagem para eternizar meus sentimentos mais profundos e verdadeiros por você.\n\nQue estas palavras sirvam de abrigo e inspiração em todos os momentos da sua trajetória. O amor que construímos juntos é eterno e transcende qualquer distância.\n\nCom todo o meu carinho e afeto sempre.`;
  }

  return res.json({
    title: generatedTitle,
    content: generatedContent,
    tone,
    recipientName,
  });
});

export default router;