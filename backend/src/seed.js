/**
 * seed.js
 * Demo data used to populate the in-memory store so the mock returns
 * something meaningful immediately (mirrors the "demo account" idea while
 * using mock-only credentials).
 */

let counter = 0;
export function uuid() {
  // Simple UUIDv4-ish for the mock (group 4 variant, v7-style not required).
  counter = (counter + 1) % 0xfff;
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Global output is replaced entirely by db.reseed() which calls this.
export function buildSeed() {
  const now = Date.now();
  const iso = (offsetMs = 0) => new Date(now - offsetMs).toISOString();

  const userId = 'u-demo-1';

  return {
    users: [
      {
        id: userId,
        email: 'demo@ethernity.com',
        name: 'Vagner Ibas',
        phone: '(11) 98765-4321',
        password: 'Ethernity2026!Demo',
        is_admin: 1,
        subscription: {
          planId: 'family',
          planName: 'Plano Familiar Ethernity',
          status: 'active',
          cycle: 'monthly',
          maxCapsules: 50,
          maxGuardians: 10,
          storageGb: 500,
          historyDays: 365,
          expiresAt: new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString(),
          paymentMethod: 'mercado_pago_pix',
          lastPaymentId: 'mp_pay_init_demo',
        },
      },
    ],
    devices: [],
    areas: [],
    messages: [
      {
        id: 'msg-demo-1',
        userId: userId,
        user_id: userId,
        title: 'Carta para o Futuro — Formatura da Mariana',
        content: 'Minha querida filha, se você está lendo isso, parabéns pela sua formatura! Tenho um orgulho imenso de você.',
        recipientName: 'Mariana Silva',
        recipientEmail: 'mariana@ethernity.com',
        recipientPhone: '+55 11 98888-7777',
        deliveryType: 'date',
        deliveryDate: '2027-12-15',
        deliveryTime: '09:00',
        guardianProtected: true,
        emailNotification: true,
        whatsappNotification: false,
        mediaFiles: [],
        category: 'Cartas de Amor',
        status: 'scheduled',
        isEncrypted: true,
        createdAt: iso(2 * 24 * 60 * 60 * 1000),
        updatedAt: iso(2 * 24 * 60 * 60 * 1000),
      },
    ],
  };
}