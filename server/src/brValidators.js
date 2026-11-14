// Validações de dados brasileiros usadas na verificação de vendedores.

const onlyDigits = (v) => String(v ?? '').replace(/\D/g, '');

function isValidCPF(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

function isValidCNPJ(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(cnpj[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

// Bancos e instituições de pagamento mais usados (código COMPE). "Outro" aceita qualquer código de 3 dígitos.
const BANKS = [
  ['001', 'Banco do Brasil'], ['033', 'Santander'], ['104', 'Caixa Econômica Federal'], ['237', 'Bradesco'],
  ['341', 'Itaú'], ['260', 'Nubank'], ['077', 'Inter'], ['336', 'C6 Bank'], ['323', 'Mercado Pago'],
  ['290', 'PagBank (PagSeguro)'], ['380', 'PicPay'], ['197', 'Stone'], ['403', 'Cora'], ['536', 'Neon'],
  ['212', 'Banco Original'], ['208', 'BTG Pactual'], ['102', 'XP Investimentos'], ['422', 'Safra'],
  ['756', 'Sicoob'], ['748', 'Sicredi'], ['041', 'Banrisul'], ['070', 'BRB'], ['004', 'Banco do Nordeste'],
  ['021', 'Banestes'], ['047', 'Banese'], ['037', 'Banpará'], ['085', 'Ailos'], ['136', 'Unicred'],
  ['133', 'Cresol'], ['218', 'BS2'], ['655', 'Banco Votorantim'], ['746', 'Modal'], ['637', 'Sofisa'],
  ['389', 'Mercantil do Brasil'], ['318', 'BMG'], ['623', 'Pan'], ['707', 'Daycoval'], ['274', 'Grafeno'],
].map(([code, name]) => ({ code, name }));

function bankName(code) {
  return BANKS.find((b) => b.code === code)?.name || null;
}

const PIX_TYPES = ['cpf', 'cnpj', 'email', 'phone', 'random'];

/** Devolve a chave Pix normalizada ou null se não bater com o tipo. */
function normalizePixKey(type, key) {
  const raw = String(key ?? '').trim();
  switch (type) {
    case 'cpf': return isValidCPF(raw) ? onlyDigits(raw) : null;
    case 'cnpj': return isValidCNPJ(raw) ? onlyDigits(raw) : null;
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw) && raw.length <= 77 ? raw.toLowerCase() : null;
    case 'phone': {
      let d = onlyDigits(raw);
      if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
      return /^[1-9]{2}9?\d{8}$/.test(d) ? `+55${d}` : null;
    }
    case 'random': return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ? raw.toLowerCase() : null;
    default: return null;
  }
}

function isValidPhone(value) {
  return /^[1-9]{2}9?\d{8}$/.test(onlyDigits(value));
}

/** Idade em anos a partir de AAAA-MM-DD; null se a data for inválida. */
function ageFrom(dateStr, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) age -= 1;
  return age;
}

// Pra mostrar sem expor tudo
function maskCPF(cpf) {
  const d = onlyDigits(cpf);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '';
}
function maskCNPJ(cnpj) {
  const d = onlyDigits(cnpj);
  return d.length === 14 ? `**.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-**` : '';
}
function maskTail(value, keep = 4) {
  const s = String(value || '');
  return s.length <= keep ? s : `${'•'.repeat(Math.min(s.length - keep, 6))}${s.slice(-keep)}`;
}
function formatCPF(cpf) {
  const d = onlyDigits(cpf);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d;
}
function formatCNPJ(cnpj) {
  const d = onlyDigits(cnpj);
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d;
}

module.exports = {
  onlyDigits, isValidCPF, isValidCNPJ, isValidPhone, ageFrom, UFS, BANKS, bankName, PIX_TYPES, normalizePixKey,
  maskCPF, maskCNPJ, maskTail, formatCPF, formatCNPJ,
};
