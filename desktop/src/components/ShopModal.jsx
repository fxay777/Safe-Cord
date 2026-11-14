import React, { useEffect, useState } from 'react';
import { fetchShopProducts, startCheckout, confirmPurchase, fetchBadges, resolveAssetUrl } from '../api';
import { BadgeIcon, CloseIcon, CheckIcon, DiamondIcon, HeartIcon, SparklesIcon, ShopIcon, ArrowRightIcon } from './Icons';

function formatPrice(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function LockIcon({ size = 14, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function ShopModal({ api, user, onClose, onUserUpdated }) {
  const [tab, setTab] = useState('loja'); // 'loja' | 'colecao'
  const [products, setProducts] = useState([]);
  const [badges, setBadges] = useState([]);
  const [stripeEnabled, setStripeEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [pendingPurchase, setPendingPurchase] = useState(null); // {id, productName}
  const [busyProduct, setBusyProduct] = useState(null);
  const [checking, setChecking] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [shop, badgeList] = await Promise.all([fetchShopProducts(api), fetchBadges(api)]);
      setProducts(shop.products);
      setStripeEnabled(shop.stripeEnabled);
      setBadges(badgeList);
    } catch (err) {
      setError('Não foi possível carregar a loja');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function buy(product) {
    setError('');
    setInfo('');
    setBusyProduct(product.id);
    try {
      const { checkoutUrl, purchaseId } = await startCheckout(api, product.id);
      setPendingPurchase({ id: purchaseId, productName: product.name });
      // Abre o checkout do Stripe no navegador padrão do sistema
      window.open(checkoutUrl, '_blank', 'noopener');
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível iniciar o pagamento');
    } finally {
      setBusyProduct(null);
    }
  }

  async function checkPayment() {
    if (!pendingPurchase) return;
    setError('');
    setChecking(true);
    try {
      const data = await confirmPurchase(api, pendingPurchase.id);
      if (data.status === 'paid') {
        setInfo(`${pendingPurchase.productName} liberado! Já aparece no seu perfil.`);
        setPendingPurchase(null);
        onUserUpdated?.(data.user);
        load();
      } else {
        setError('O pagamento ainda não caiu. Conclua no navegador e tente de novo.');
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível checar o pagamento');
    } finally {
      setChecking(false);
    }
  }

  const isPro = Boolean(user?.is_pro);
  const proUntil = user?.pro_until ? new Date(user.pro_until).toLocaleDateString('pt-BR') : null;
  const pro = products.find((p) => p.kind === 'subscription');
  const badgeProducts = products.filter((p) => p.kind === 'badge');
  const ownedCount = badges.filter((b) => b.owned).length;
  const displayName = user?.display_name || user?.username || 'você';
  const avatarUrl = resolveAssetUrl(user?.avatar_url);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* topo */}
        <div style={styles.topBar}>
          <div style={styles.brand}>
            <span style={styles.brandIcon}><ShopIcon size={16} /></span>
            Loja
          </div>
          <div style={styles.segment}>
            {[['loja', 'Destaques'], ['colecao', `Coleção · ${ownedCount}/${badges.length || 0}`]].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setTab(id)} style={{ ...styles.segmentBtn, ...(tab === id ? styles.segmentBtnActive : {}) }}>
                {label}
              </button>
            ))}
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Fechar"><CloseIcon size={16} /></button>
        </div>

        <div style={styles.body}>
          {/* avisos */}
          {!stripeEnabled && tab === 'loja' && (
            <div style={styles.notice}>
              <strong>Pagamentos desligados.</strong> Coloque o Access Token do Mercado Pago
              (<code style={styles.code}>MERCADOPAGO_ACCESS_TOKEN=TEST-…</code>) em <code style={styles.code}>server/.env</code> e reinicie o servidor.
            </div>
          )}
          {pendingPurchase && (
            <div style={styles.pending}>
              <span style={styles.pendingPulse} />
              <span style={{ flex: 1 }}>Finalize o pagamento de <strong>{pendingPurchase.productName}</strong> no navegador.</span>
              <button style={styles.pendingBtn} onClick={checkPayment} disabled={checking}>{checking ? 'Checando…' : 'Já paguei'}</button>
            </div>
          )}
          {error && <div style={styles.error}>{error}</div>}
          {info && !error && <div style={styles.success}><CheckIcon size={14} /> {info}</div>}

          {loading && <div style={styles.hint}>Carregando…</div>}

          {!loading && tab === 'loja' && (
            <>
              {/* HERO — SafeCord Pro */}
              {pro && (
                <div style={styles.hero}>
                  <div style={styles.heroGlowA} />
                  <div style={styles.heroGlowB} />
                  <div style={styles.heroFloat1}><DiamondIcon size={30} /></div>
                  <div style={styles.heroFloat2}><SparklesIcon size={22} /></div>

                  <div style={styles.heroContent}>
                    <div style={styles.heroKicker}>{isPro ? `Ativo até ${proUntil}` : 'Assinatura'}</div>
                    <div style={styles.heroTitle}>SafeCord <span style={styles.heroTitleAccent}>Pro</span></div>
                    <div style={styles.heroDesc}>{pro.description}</div>

                    <div style={styles.perks}>
                      <Perk icon={<DiamondIcon size={15} />} text="Insígnia de diamante ao lado do nome" />
                      <Perk icon={<HeartIcon size={15} />} text="Apoio direto a quem mantém o app" />
                      <Perk icon={<CheckIcon size={15} />} text="30 dias, sem cobrança automática" />
                    </div>

                    <div style={styles.heroFooter}>
                      <button style={styles.heroBtn} onClick={() => buy(pro)} disabled={busyProduct === pro.id}>
                        {busyProduct === pro.id ? 'Abrindo…' : isPro ? 'Estender mais 30 dias' : 'Assinar Pro'}
                        <ArrowRightIcon size={15} />
                      </button>
                      <div style={styles.heroPrice}>
                        <span style={styles.heroPriceValue}>{formatPrice(pro.amount_cents)}</span>
                        <span style={styles.heroPriceUnit}>/ 30 dias</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* INSÍGNIAS */}
              <div style={styles.sectionHead}>
                <div>
                  <div style={styles.sectionTitle}>Insígnias</div>
                  <div style={styles.sectionSub}>Compra única, ficam pra sempre no seu perfil.</div>
                </div>
              </div>

              <div style={styles.grid}>
                {badgeProducts.map((p) => (
                  <div key={p.id} style={styles.card}>
                    <div style={{ ...styles.showcase, background: `radial-gradient(circle at 50% 38%, ${p.color}55, ${p.color}14 55%, transparent 75%), var(--bg-elevated)` }}>
                      <div style={{ ...styles.showcaseRing, borderColor: `${p.color}55` }} />
                      <div style={{ ...styles.showcaseIcon, color: p.color, background: `${p.color}26`, boxShadow: `0 10px 30px ${p.color}40` }}>
                        <BadgeIcon name={p.icon} size={30} />
                      </div>
                      {p.owned && <span style={styles.ownedRibbon}><CheckIcon size={11} /> Na coleção</span>}
                    </div>

                    <div style={styles.cardBody}>
                      <div style={styles.cardName}>{p.name}</div>
                      <div style={styles.cardDesc}>{p.description}</div>

                      {/* como fica no chat */}
                      <div style={styles.nameplate}>
                        {avatarUrl
                          ? <img src={avatarUrl} alt="" style={styles.nameplateAvatar} />
                          : <span style={{ ...styles.nameplateAvatar, background: user?.avatar_color || 'var(--accent)' }}>{displayName[0]?.toUpperCase()}</span>}
                        <span style={styles.nameplateName}>{displayName}</span>
                        <span style={{ ...styles.nameplateBadge, color: p.color, background: `${p.color}1F` }}><BadgeIcon name={p.icon} size={12} /></span>
                      </div>

                      <div style={styles.cardFooter}>
                        <span style={styles.price}>{formatPrice(p.amount_cents)}</span>
                        {p.owned ? (
                          <span style={styles.ownedTag}><CheckIcon size={13} /> Sua</span>
                        ) : (
                          <button style={styles.buyBtn} onClick={() => buy(p)} disabled={busyProduct === p.id}>
                            {busyProduct === p.id ? 'Abrindo…' : 'Comprar'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!loading && tab === 'colecao' && (
            <>
              <div style={styles.progressCard}>
                <div style={{ flex: 1 }}>
                  <div style={styles.progressTitle}>{ownedCount} de {badges.length} insígnias</div>
                  <div style={styles.progressTrack}>
                    <div style={{ ...styles.progressFill, width: `${badges.length ? (ownedCount / badges.length) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>

              <div style={styles.collection}>
                {badges.map((b) => (
                  <div key={b.id} style={{ ...styles.collectItem, ...(b.owned ? {} : styles.collectItemLocked) }}>
                    <div style={{
                      ...styles.collectIcon,
                      color: b.owned ? b.color : 'var(--text-low)',
                      background: b.owned ? `${b.color}24` : 'var(--bg-elevated)',
                    }}>
                      <BadgeIcon name={b.icon} size={26} />
                      {!b.owned && <span style={styles.lockDot}><LockIcon size={11} /></span>}
                    </div>
                    <div style={styles.collectName}>{b.name}</div>
                    <div style={styles.collectDesc}>{b.description}</div>
                    <div style={styles.collectTag}>
                      {b.owned
                        ? <span style={{ color: 'var(--success)' }}>Desbloqueada</span>
                        : b.id === 'pro'
                          ? <span style={{ color: 'var(--accent)' }}>Vem com o Pro</span>
                          : b.purchasable
                            ? <span>{formatPrice(b.price_cents)} na loja</span>
                            : <span>Conquista</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Perk({ icon, text }) {
  return (
    <div style={styles.perk}>
      <span style={styles.perkIcon}>{icon}</span>
      {text}
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'var(--scrim)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 130, padding: 20,
  },
  modal: {
    width: 780, maxWidth: '100%', height: 680, maxHeight: '92vh', background: 'var(--bg-surface)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },

  topBar: { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px 14px 22px' },
  brand: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 17, fontWeight: 700, color: 'var(--text-hi)' },
  brandIcon: {
    width: 30, height: 30, borderRadius: 10, background: 'var(--accent-soft)', color: 'var(--accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  segment: { display: 'flex', gap: 4, padding: 4, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-pill)', marginLeft: 'auto' },
  segmentBtn: {
    border: 'none', background: 'transparent', color: 'var(--text-mid)', fontSize: 13, fontWeight: 600,
    padding: '7px 14px', borderRadius: 'var(--radius-pill)', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  segmentBtnActive: { background: 'var(--bg-surface)', color: 'var(--text-hi)', boxShadow: 'var(--shadow-sm)' },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17, border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-mid)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  body: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 22px 24px' },
  hint: { color: 'var(--text-low)', fontSize: 13, textAlign: 'center', padding: '40px 0' },
  notice: {
    fontSize: 12.5, color: 'var(--text-mid)', background: 'color-mix(in srgb, var(--warn) 12%, transparent)',
    borderRadius: 14, padding: '10px 14px', marginBottom: 12, lineHeight: 1.55,
  },
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 11.5, background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 6 },
  pending: {
    display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-hi)',
    background: 'var(--accent-softer)', border: '1px solid var(--accent-soft)', borderRadius: 16,
    padding: '9px 9px 9px 14px', marginBottom: 12,
  },
  pendingPulse: { width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 0 4px var(--accent-soft)', flexShrink: 0 },
  pendingBtn: {
    background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 'var(--radius-pill)',
    padding: '7px 14px', fontWeight: 650, fontSize: 12.5, cursor: 'pointer', flexShrink: 0,
  },
  error: {
    fontSize: 12.5, color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
    borderRadius: 14, padding: '9px 14px', marginBottom: 12,
  },
  success: {
    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--success)',
    background: 'color-mix(in srgb, var(--success) 12%, transparent)', borderRadius: 14, padding: '9px 14px', marginBottom: 12,
  },

  // hero Pro
  hero: {
    position: 'relative', overflow: 'hidden', borderRadius: 24, padding: '26px 28px',
    background: 'linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 55%, #ffffff) 60%, #F4FAFF 100%)',
    color: '#0B2140', marginBottom: 26,
  },
  heroGlowA: {
    position: 'absolute', width: 260, height: 260, borderRadius: '50%', right: -60, top: -110,
    background: 'radial-gradient(circle, rgba(255,255,255,0.85), rgba(255,255,255,0) 70%)', pointerEvents: 'none',
  },
  heroGlowB: {
    position: 'absolute', width: 200, height: 200, borderRadius: '50%', right: 120, bottom: -120,
    background: 'radial-gradient(circle, rgba(255,255,255,0.55), rgba(255,255,255,0) 70%)', pointerEvents: 'none',
  },
  heroFloat1: {
    position: 'absolute', right: 46, top: 38, width: 74, height: 74, borderRadius: 24,
    background: 'rgba(255,255,255,0.75)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transform: 'rotate(10deg)', boxShadow: '0 18px 40px rgba(20, 80, 160, 0.25)',
  },
  heroFloat2: {
    position: 'absolute', right: 138, top: 104, width: 44, height: 44, borderRadius: 15,
    background: 'rgba(255,255,255,0.6)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transform: 'rotate(-12deg)',
  },
  heroContent: { position: 'relative', maxWidth: 440 },
  heroKicker: {
    display: 'inline-block', fontSize: 11.5, fontWeight: 700, color: '#0B2140', background: 'rgba(255,255,255,0.7)',
    borderRadius: 'var(--radius-pill)', padding: '4px 10px', marginBottom: 10,
  },
  heroTitle: { fontSize: 32, fontWeight: 800, letterSpacing: -1, lineHeight: 1.05, color: '#ffffff', textShadow: '0 2px 14px rgba(10, 60, 140, 0.25)' },
  heroTitleAccent: { color: '#0B2140', textShadow: 'none' },
  heroDesc: { fontSize: 13.5, lineHeight: 1.5, color: '#16365F', marginTop: 8 },
  perks: { display: 'flex', flexDirection: 'column', gap: 7, marginTop: 16 },
  perk: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 600, color: '#0B2140' },
  perkIcon: {
    width: 26, height: 26, borderRadius: 9, background: 'rgba(255,255,255,0.75)', color: 'var(--accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  heroFooter: { display: 'flex', alignItems: 'center', gap: 16, marginTop: 20, flexWrap: 'wrap' },
  heroBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', background: '#0B2140', color: '#ffffff',
    fontSize: 14, fontWeight: 700, padding: '12px 20px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(11, 33, 64, 0.3)',
  },
  heroPrice: { display: 'flex', alignItems: 'baseline', gap: 5 },
  heroPriceValue: { fontSize: 20, fontWeight: 800, color: '#0B2140' },
  heroPriceUnit: { fontSize: 12.5, color: '#2B4A73', fontWeight: 600 },

  // insígnias
  sectionHead: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: 700, color: 'var(--text-hi)' },
  sectionSub: { fontSize: 12.5, color: 'var(--text-low)', marginTop: 2 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 },
  card: {
    background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 22, overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
  },
  showcase: { position: 'relative', height: 118, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 6, borderRadius: 17 },
  showcaseRing: { position: 'absolute', width: 92, height: 92, borderRadius: '50%', border: '1.5px dashed' },
  showcaseIcon: {
    position: 'relative', width: 62, height: 62, borderRadius: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  ownedRibbon: {
    position: 'absolute', top: 8, left: 8, display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 10.5, fontWeight: 700, color: 'var(--success)', background: 'var(--bg-surface)',
    borderRadius: 'var(--radius-pill)', padding: '3px 8px',
  },
  cardBody: { padding: '6px 14px 14px', display: 'flex', flexDirection: 'column', flex: 1 },
  cardName: { fontSize: 14.5, fontWeight: 700, color: 'var(--text-hi)' },
  cardDesc: { fontSize: 12, color: 'var(--text-low)', marginTop: 3, lineHeight: 1.45, flex: 1 },
  nameplate: {
    display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, background: 'var(--bg-surface)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: '5px 10px 5px 5px',
  },
  nameplateAvatar: {
    width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, color: 'var(--on-color)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700,
  },
  nameplateName: { fontSize: 12.5, fontWeight: 650, color: 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 },
  nameplateBadge: { width: 20, height: 20, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  price: { fontSize: 15, fontWeight: 800, color: 'var(--text-hi)' },
  buyBtn: {
    background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none',
    borderRadius: 'var(--radius-pill)', padding: '8px 16px', fontWeight: 650, fontSize: 12.5, cursor: 'pointer',
  },
  ownedTag: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--success)', fontWeight: 700 },

  // coleção
  progressCard: {
    display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-base)', border: '1px solid var(--border)',
    borderRadius: 20, padding: '16px 18px', marginBottom: 14,
  },
  progressTitle: { fontSize: 14.5, fontWeight: 700, color: 'var(--text-hi)', marginBottom: 10 },
  progressTrack: { height: 8, borderRadius: 4, background: 'var(--bg-elevated)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, background: 'var(--accent-gradient)', transition: 'width 0.3s ease' },
  collection: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 },
  collectItem: {
    background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 20, padding: '16px 12px 14px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
  },
  collectItemLocked: { opacity: 0.75 },
  collectIcon: {
    position: 'relative', width: 56, height: 56, borderRadius: 18,
    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  lockDot: {
    position: 'absolute', right: -4, bottom: -4, width: 22, height: 22, borderRadius: '50%',
    background: 'var(--bg-surface)', color: 'var(--text-mid)', border: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  collectName: { fontSize: 13, fontWeight: 700, color: 'var(--text-hi)' },
  collectDesc: { fontSize: 11.5, color: 'var(--text-low)', marginTop: 3, lineHeight: 1.4, flex: 1 },
  collectTag: { fontSize: 11.5, fontWeight: 650, color: 'var(--text-mid)', marginTop: 10 },
};
