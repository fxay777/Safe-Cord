const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'safecord.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const ensureUserColumns = () => {
  const cols = db.prepare('PRAGMA table_info(users)').all();
  const existing = new Set(cols.map((c) => c.name));

  const migrations = [
    ['display_name', "TEXT NOT NULL DEFAULT ''"],
    ['avatar_url', 'TEXT'],
    ['banner_url', 'TEXT'],
    ['bio', 'TEXT NOT NULL DEFAULT ""'],
    ['spotify_track_id', 'TEXT'],
    ['spotify_track', "TEXT"], // JSON: {id, name, artists, album, image, preview_url, external_url} — cache local pra não rebuscar no Spotify toda hora
    ['connections', "TEXT NOT NULL DEFAULT '[]'"],
    ['status_mode', "TEXT NOT NULL DEFAULT 'online'"], // 'online' | 'idle' | 'dnd' | 'invisible' — escolhido pelo usuário
    // --- Verificação de email ---
    ['email', 'TEXT'],
    ['email_verified', 'INTEGER NOT NULL DEFAULT 0'],
    ['verification_code', 'TEXT'],
    ['verification_expires', 'INTEGER'],
    ['verification_sent_at', 'INTEGER'],
    // --- Assinatura (SafeCord Pro, comprada via Stripe) ---
    ['pro_until', 'INTEGER'], // timestamp em que a assinatura expira; null = não é Pro
    ['last_seen_at', 'INTEGER'], // quando a última conexão caiu — "Visto há 1h" na lista de membros
    ['pronouns', "TEXT NOT NULL DEFAULT ''"],      // ex.: ela/dela
    ['status_text', "TEXT NOT NULL DEFAULT ''"],   // status personalizado ("jogando valorant")
    ['theme_primary', 'TEXT'],                     // tema do perfil: cor de cima do card
    ['theme_secondary', 'TEXT'],                   // tema do perfil: cor de baixo do card
  ];

  for (const [name, definition] of migrations) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
    }
  }
};

const ensureServerColumns = () => {
  const cols = db.prepare('PRAGMA table_info(servers)').all();
  const existing = new Set(cols.map((c) => c.name));

  const migrations = [
    ['icon_url', 'TEXT'],
    ['banner_url', 'TEXT'],
    ['color', "TEXT NOT NULL DEFAULT '#16C7B3'"],
    ['description', 'TEXT NOT NULL DEFAULT \'\''],
  ];

  for (const [name, definition] of migrations) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE servers ADD COLUMN ${name} ${definition}`);
    }
  }
};

const ensureChannelColumns = () => {
  const cols = db.prepare('PRAGMA table_info(channels)').all();
  const existing = new Set(cols.map((c) => c.name));
  if (!existing.has('category_id')) {
    db.exec('ALTER TABLE channels ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL');
  }
  // Descrição do canal (aparece embaixo do nome no topo do chat)
  if (!existing.has('topic')) {
    db.exec("ALTER TABLE channels ADD COLUMN topic TEXT NOT NULL DEFAULT ''");
  }
};

// Bancos antigos não tinham `responded_at` — sem isso, aceitar/recusar amizade quebra
// com "no such column: responded_at".
const ensureFriendshipColumns = () => {
  const cols = db.prepare('PRAGMA table_info(friendships)').all();
  const existing = new Set(cols.map((c) => c.name));
  if (!existing.has('responded_at')) {
    db.exec('ALTER TABLE friendships ADD COLUMN responded_at INTEGER');
  }
};

// Anexos de imagem/vídeo nas mensagens — JSON: [{url, name, size, width, height, type}]
const ensureMessageColumns = () => {
  for (const table of ['messages', 'dm_messages']) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    const existing = new Set(cols.map((c) => c.name));
    if (!existing.has('attachments')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'`);
    }
  }
};

// Conversas em grupo (várias pessoas numa DM, como no Discord). A tabela antiga só tinha
// user_a/user_b; grupos usam a tabela dm_participants e deixam esses dois campos nulos.
const ensureConversationColumns = () => {
  const cols = db.prepare('PRAGMA table_info(dm_conversations)').all();
  const existing = new Set(cols.map((c) => c.name));
  const migrations = [
    ['is_group', 'INTEGER NOT NULL DEFAULT 0'],
    ['name', 'TEXT'],
    ['icon_url', 'TEXT'],
    ['owner_id', 'TEXT'],
  ];
  for (const [name, definition] of migrations) {
    if (!existing.has(name)) db.exec(`ALTER TABLE dm_conversations ADD COLUMN ${name} ${definition}`);
  }

  // Preenche dm_participants para as conversas 1:1 que já existiam antes dessa tabela.
  const needsBackfill = db
    .prepare(`SELECT COUNT(*) AS n FROM dm_conversations c
              WHERE c.is_group = 0 AND NOT EXISTS (SELECT 1 FROM dm_participants p WHERE p.conversation_id = c.id)`)
    .get().n;
  if (needsBackfill > 0) {
    const rows = db.prepare('SELECT id, user_a, user_b, created_at FROM dm_conversations WHERE is_group = 0').all();
    const insert = db.prepare(
      'INSERT OR IGNORE INTO dm_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
    );
    const tx = db.transaction(() => {
      for (const r of rows) {
        if (r.user_a) insert.run(r.id, r.user_a, r.created_at);
        if (r.user_b) insert.run(r.id, r.user_b, r.created_at);
      }
    });
    tx();
  }
};

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  tag TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#2DD4BF',
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  banner_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'offline',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  invite_code TEXT UNIQUE NOT NULL,
  icon_url TEXT,
  banner_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS server_members (
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (server_id, user_id)
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text', -- 'text' ou 'voice'
  position INTEGER NOT NULL DEFAULT 0,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#99AAB5',
  permissions TEXT NOT NULL DEFAULT '[]', -- JSON array de chaves de permissão
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS member_roles (
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (server_id, user_id, role_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS friendships (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted'
  created_at INTEGER NOT NULL,
  responded_at INTEGER,
  UNIQUE (requester_id, addressee_id)
);

CREATE TABLE IF NOT EXISTS dm_conversations (
  id TEXT PRIMARY KEY,
  user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE (user_a, user_b)
);

CREATE TABLE IF NOT EXISTS dm_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Participantes de uma conversa: serve tanto pra DM 1:1 quanto pra grupo.
CREATE TABLE IF NOT EXISTS dm_participants (
  conversation_id TEXT NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

-- Catálogo de insígnias. As "de sistema" (verificado, fundador) são dadas pelo servidor;
-- as compráveis têm price_cents e aparecem na loja.
CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'badge',
  color TEXT NOT NULL DEFAULT '#2DD4BF',
  price_cents INTEGER,             -- null = não está à venda (só concedida)
  purchasable INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_badges (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, badge_id)
);

-- Histórico de compras (Stripe). status: 'pending' | 'paid' | 'canceled'
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'brl',
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_session_id TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);

-- ─── Mercado (lojas dos microempreendedores) ───────────────────────────────
-- O pagamento cai na conta do SafeCord; cada pedido guarda quanto é do vendedor
-- (seller_cents) e a taxa da plataforma (fee_cents). O repasse é manual (payouts).
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  logo_url TEXT,
  banner_url TEXT,
  payout_info TEXT NOT NULL DEFAULT '',   -- chave Pix / dados bancários (só o dono e o admin veem)
  status TEXT NOT NULL DEFAULT 'active',  -- 'pending' (esperando verificação) | 'active' | 'suspended'
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,                      -- 'physical' | 'digital'
  price_cents INTEGER NOT NULL,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  stock INTEGER,                           -- null = ilimitado
  images TEXT NOT NULL DEFAULT '[]',       -- JSON com URLs públicas
  digital_file TEXT,                       -- nome do arquivo na pasta privada (nunca exposta direto)
  digital_file_name TEXT,
  digital_file_size INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  sales_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'canceled'
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_snapshot TEXT NOT NULL,          -- título/tipo/imagem no momento da compra
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL,
  seller_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  shipping_address TEXT,                   -- JSON (só produto físico)
  tracking_code TEXT,
  stripe_session_id TEXT,
  payout_id TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  shipped_at INTEGER,
  delivered_at INTEGER
);

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  order_count INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

-- Banidos de um servidor: não conseguem entrar de novo nem com convite
CREATE TABLE IF NOT EXISTS server_bans (
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '',
  banned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (server_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id, active);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_dm_participants_user ON dm_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_categories_server ON categories(server_id);
CREATE INDEX IF NOT EXISTS idx_roles_server ON roles(server_id);
CREATE INDEX IF NOT EXISTS idx_member_roles_user ON member_roles(server_id, user_id);
CREATE INDEX IF NOT EXISTS idx_dm_messages_conv ON dm_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_a ON dm_conversations(user_a);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_b ON dm_conversations(user_b);
`);

ensureUserColumns();
ensureServerColumns();
ensureChannelColumns();
ensureFriendshipColumns();
ensureMessageColumns();

// Qual provedor cobrou ('mercadopago' | 'stripe' | 'dev'). O id da cobrança no provedor
// continua na coluna stripe_session_id (nome antigo, mantido pra não perder dados).
for (const table of ['purchases', 'orders']) {
  const cols = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  if (!cols.has('payment_provider')) db.exec(`ALTER TABLE ${table} ADD COLUMN payment_provider TEXT`);
}
ensureConversationColumns();

// ─── Verificação de vendedores (KYC) ────────────────────────────────────────
// Tudo que identifica a pessoa (CPF, endereço, banco) fica em data_enc, criptografado.
// Documento, selfie e fotos da prova de vida ficam em private-files/kyc, também criptografados.
db.exec(`
CREATE TABLE IF NOT EXISTS seller_verifications (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',      -- 'draft' | 'pending' | 'approved' | 'rejected'
  person_type TEXT,                          -- 'pf' | 'pj'
  data_enc TEXT,                             -- JSON criptografado: dados pessoais, empresa, endereço, banco, Pix
  cpf_hash TEXT,                             -- HMAC do CPF (acha duplicado sem guardar aberto)
  cnpj_hash TEXT,
  doc_type TEXT,                             -- 'rg' | 'cnh' | 'rne' | 'passaporte'
  files TEXT NOT NULL DEFAULT '{}',          -- {doc_front, doc_back, selfie, liveness:[...]} → nomes dos arquivos criptografados
  liveness_at INTEGER,
  terms_accepted_at INTEGER,
  submitted_at INTEGER,
  reviewed_at INTEGER,
  reviewed_by TEXT,
  reject_reason TEXT,
  reject_sections TEXT NOT NULL DEFAULT '[]',
  payout_mode TEXT NOT NULL DEFAULT 'manual', -- 'manual' (Pix pelo admin) | 'mercadopago' (futuro: recebe direto)
  mp_user_id TEXT,                            -- futuro: conta Mercado Pago conectada (OAuth)
  mp_connected_at INTEGER,
  provider TEXT NOT NULL DEFAULT 'manual',    -- quem verificou: 'manual' ou um serviço (idwall, unico…)
  provider_ref TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seller_verif_status ON seller_verifications(status);
CREATE INDEX IF NOT EXISTS idx_seller_verif_cpf ON seller_verifications(cpf_hash);
CREATE INDEX IF NOT EXISTS idx_seller_verif_cnpj ON seller_verifications(cnpj_hash);

CREATE TABLE IF NOT EXISTS liveness_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  steps TEXT NOT NULL,                       -- JSON: ['frente', 'esquerda', ...]
  frames TEXT NOT NULL DEFAULT '[]',         -- JSON: [{step, file, sha, at}]
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS verification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,                      -- 'submitted' | 'approved' | 'rejected'
  actor_id TEXT,
  note TEXT,
  created_at INTEGER NOT NULL
);
`);
{
  // Lojas novas só aparecem depois da verificação. Lojas antigas (antes disso) ficam com 0.
  const cols = new Set(db.prepare('PRAGMA table_info(stores)').all().map((c) => c.name));
  if (!cols.has('requires_verification')) db.exec('ALTER TABLE stores ADD COLUMN requires_verification INTEGER NOT NULL DEFAULT 0');
  if (!cols.has('category')) db.exec("ALTER TABLE stores ADD COLUMN category TEXT NOT NULL DEFAULT ''");
  if (!cols.has('contact_email')) db.exec("ALTER TABLE stores ADD COLUMN contact_email TEXT NOT NULL DEFAULT ''");
  if (!cols.has('contact_phone')) db.exec("ALTER TABLE stores ADD COLUMN contact_phone TEXT NOT NULL DEFAULT ''");
}

// Ninguém está conectado quando o servidor acaba de subir. Sem isso, quem estava online
// quando o servidor caiu/reiniciou ficava "online" pra sempre na lista de membros.
db.prepare("UPDATE users SET status = 'offline', last_seen_at = COALESCE(last_seen_at, ?) WHERE status != 'offline'").run(Date.now());

// O schema antigo tinha UNIQUE em users.username, o que impedia dois "joao" existirem.
// Com nicks estilo Discord quem identifica é o par nome#tag, então o UNIQUE sai da coluna
// e vira um índice composto. SQLite não deixa remover constraint de coluna, então a tabela
// é recriada preservando todos os dados.
const relaxUsernameUnique = () => {
  const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get()?.sql || '';
  const usernameIsUnique = /username\s+TEXT\s+UNIQUE/i.test(ddl);
  if (!usernameIsUnique) return;

  const columns = db.prepare('PRAGMA table_info(users)').all();
  const columnList = columns.map((c) => `"${c.name}"`).join(', ');
  const newDdl = ddl
    .replace(/CREATE TABLE\s+"?users"?/i, 'CREATE TABLE users_migrated')
    .replace(/username\s+TEXT\s+UNIQUE/i, 'username TEXT');

  db.pragma('foreign_keys = OFF');
  const tx = db.transaction(() => {
    db.exec(newDdl);
    db.exec(`INSERT INTO users_migrated (${columnList}) SELECT ${columnList} FROM users`);
    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_migrated RENAME TO users');
  });
  tx();
  db.pragma('foreign_keys = ON');
  console.log('[migração] users.username deixou de ser único (agora quem identifica é nome#tag)');
};
relaxUsernameUnique();

// Grupos não têm "user_a/user_b" (quem participa está em dm_participants), então essas
// duas colunas precisam aceitar NULL. O schema antigo as criou como NOT NULL.
const relaxConversationPair = () => {
  const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='dm_conversations'").get()?.sql || '';
  if (!/user_a\s+TEXT\s+NOT NULL/i.test(ddl)) return;

  const columns = db.prepare('PRAGMA table_info(dm_conversations)').all();
  const columnList = columns.map((c) => `"${c.name}"`).join(', ');
  const newDdl = ddl
    .replace(/CREATE TABLE\s+"?dm_conversations"?/i, 'CREATE TABLE dm_conversations_migrated')
    .replace(/user_a\s+TEXT\s+NOT NULL/i, 'user_a TEXT')
    .replace(/user_b\s+TEXT\s+NOT NULL/i, 'user_b TEXT');

  db.pragma('foreign_keys = OFF');
  const tx = db.transaction(() => {
    db.exec(newDdl);
    db.exec(`INSERT INTO dm_conversations_migrated (${columnList}) SELECT ${columnList} FROM dm_conversations`);
    db.exec('DROP TABLE dm_conversations');
    db.exec('ALTER TABLE dm_conversations_migrated RENAME TO dm_conversations');
  });
  tx();
  db.pragma('foreign_keys = ON');
  console.log('[migração] conversas agora aceitam grupos (user_a/user_b opcionais)');
};
relaxConversationPair();

// Tag única por usuário: username#0000 é o identificador público, igual ao Discord antigo.
// O par (username, tag) precisa ser único pra busca de amigos nunca achar duas pessoas.
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_tag ON users(username, tag)');

// Insígnias padrão. O campo icon é uma CHAVE (o app desenha o ícone em SVG), não um emoji;
// o upsert atualiza bancos antigos que ainda tinham emoji guardado.
const DEFAULT_BADGES = [
  { id: 'verified', name: 'Email verificado', description: 'Confirmou o endereço de email.', icon: 'verified', color: '#34D399', price_cents: null, purchasable: 0, position: 0 },
  { id: 'founder', name: 'Fundador', description: 'Esteve aqui desde o começo do SafeCord.', icon: 'crown', color: '#F0B429', price_cents: null, purchasable: 0, position: 1 },
  { id: 'pro', name: 'SafeCord Pro', description: 'Assinante do SafeCord Pro.', icon: 'diamond', color: '#3A9BFF', price_cents: null, purchasable: 0, position: 2 },
  { id: 'early', name: 'Pioneiro', description: 'Entrou nos primeiros dias.', icon: 'rocket', color: '#38BDF8', price_cents: null, purchasable: 0, position: 3 },
  { id: 'supporter', name: 'Apoiador', description: 'Apoiou o projeto com uma compra.', icon: 'heart', color: '#FB7185', price_cents: 990, purchasable: 1, position: 4 },
  { id: 'star', name: 'Estrela', description: 'Insígnia dourada de destaque.', icon: 'star', color: '#F0B429', price_cents: 1490, purchasable: 1, position: 5 },
  { id: 'wizard', name: 'Mago', description: 'Pra quem manja dos paranauê.', icon: 'wand', color: '#A78BFA', price_cents: 1990, purchasable: 1, position: 6 },
];
const insertBadge = db.prepare(
  `INSERT INTO badges (id, name, description, icon, color, price_cents, purchasable, position)
   VALUES (@id, @name, @description, @icon, @color, @price_cents, @purchasable, @position)
   ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
     icon = excluded.icon, color = excluded.color, price_cents = excluded.price_cents,
     purchasable = excluded.purchasable, position = excluded.position`
);
for (const b of DEFAULT_BADGES) insertBadge.run(b);

module.exports = db;
