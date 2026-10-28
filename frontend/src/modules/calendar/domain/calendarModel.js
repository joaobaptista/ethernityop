/**
 * calendarModel.js — Regras do calendário de entregas (linha do tempo de cápsulas e mensagens).
 */

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const formatDateLabel = (d) => d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Monta a linha do tempo com as entregas agendadas reais do usuário (cápsulas e mensagens com data).
 * Entregas póstumas não têm data e ficam fora do calendário.
 */
export function buildCalendarEvents(capsules = [], messages = []) {
  const events = [];

  for (const cap of capsules || []) {
    const when = cap?.deliveryType !== 'posthumous' ? toDate(cap?.scheduledDate) : null;
    if (!when) continue;
    events.push({
      id: `cap-${cap.id}`,
      when,
      date: formatDateLabel(when),
      title: `Entrega da Cápsula: ${cap.title}`,
      recipient: cap.recipient || '—',
      type: 'capsule',
      tag: 'Cápsula Programada',
    });
  }

  for (const msg of messages || []) {
    const when = msg?.deliveryType !== 'posthumous' ? toDate(msg?.deliveryDate) : null;
    if (!when) continue;
    events.push({
      id: `msg-${msg.id}`,
      when,
      date: formatDateLabel(when),
      title: msg.title || 'Mensagem agendada',
      recipient: msg.recipientName || '—',
      type: 'anniversary',
      tag: msg.status === 'draft' ? 'Rascunho de Mensagem' : 'Mensagem Agendada',
    });
  }

  return events.sort((a, b) => a.when - b.when);
}
