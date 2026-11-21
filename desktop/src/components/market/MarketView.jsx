import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SearchIcon, CloseIcon, StoreIcon, PackageIcon, TruckIcon, DownloadIcon, CheckIcon, ArrowRightIcon,
  WalletIcon, TagIcon, ArrowLeftIcon, ShieldCheckIcon,
} from '../Icons';
import {
  brl, StatusPill, TypeBadge, ProductImage, StoreAvatar, formatDate, errorText, downloadWithAuth, ui,
} from './marketUtils';
import SellerDashboard from './SellerDashboard';
import MarketAdmin from './MarketAdmin';
import { resolveAssetUrl } from '../../api';

const SORTS = [
  ['new', 'Mais novos'],
  ['popular', 'Mais vendidos'],
  ['price_asc', 'Menor preço'],
  ['price_desc', 'Maior preço'],
];

export default function MarketView({ api, socket, user }) {
  const [tab, setTab] = useState('explorar'); // explorar | compras | loja | admin
  const [config, setConfig] = useState(null);
  const [openProductId, setOpenProductId] = useState(null);
  const [openStoreId, setOpenStoreId] = useState(null);
  const [checkoutProduct, setCheckoutProduct] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api.get('/market/config').then(({ data }) => setConfig(data)).catch(() => setConfig({ paymentsEnabled: false }));
  }, [api]);

  // Avisos em tempo real (pedido novo pro vendedor, status mudou pro comprador, repasse feito)
  useEffect(() => {
    if (!socket) return undefined;
    const bump = () => setRefreshKey((k) => k + 1);
    socket.on('market:new-order', bump);
    socket.on('market:order-updated', bump);
    socket.on('market:payout', bump);
    socket.on('market:verification', bump);
    socket.on('market:mp-connected', bump);
    return () => {
      socket.off('market:new-order', bump);
      socket.off('market:order-updated', bump);
      socket.off('market:payout', bump);
      socket.off('market:verification', bump);
      socket.off('market:mp-connected', bump);
    };
  }, [socket]);

  const tabs = [
    ['explorar', 'Explorar', TagIcon],
    ['compras', 'Minhas compras', PackageIcon],
    ['loja', 'Minha loja', StoreIcon],
    ...(config?.isAdmin ? [['admin', 'Admin', ShieldCheckIcon]] : []),
  ];

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div style={styles.headerTitle}>
          <span style={styles.headerIcon}><StoreIcon size={18} /></span>
          <div>
            <div style={styles.title}>Mercado</div>
            <div style={styles.subtitle}>Compre de quem empreende na comunidade</div>
          </div>
        </div>
        <nav style={styles.tabs}>
          {tabs.map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setTab(id)} style={{ ...styles.tab, ...(tab === id ? styles.tabActive : {}) }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </nav>
      </header>

      <div style={styles.body}>
        {tab === 'explorar' && (
          <Explore api={api} refreshKey={refreshKey} onOpenProduct={setOpenProductId} onOpenStore={setOpenStoreId} />
        )}
        {tab === 'compras' && (
          <Purchases api={api} refreshKey={refreshKey} onOpenProduct={setOpenProductId} onExplore={() => setTab('explorar')} />
        )}
        {tab === 'loja' && (
          <SellerDashboard api={api} user={user} config={config} refreshKey={refreshKey} onOpenProduct={setOpenProductId} />
        )}
        {tab === 'admin' && config?.isAdmin && <MarketAdmin api={api} refreshKey={refreshKey} />}
      </div>

      {openProductId && (
        <ProductModal
          api={api}
          productId={openProductId}
          userId={user?.id}
          onClose={() => setOpenProductId(null)}
          onBuy={(p, store) => setCheckoutProduct({ product: p, store })}
          onOpenStore={(id) => { setOpenProductId(null); setOpenStoreId(id); }}
          onOpenProduct={setOpenProductId}
        />
      )}

      {openStoreId && (
        <StoreModal
          api={api}
          storeId={openStoreId}
          onClose={() => setOpenStoreId(null)}
          onOpenProduct={(id) => { setOpenStoreId(null); setOpenProductId(id); }}
        />
      )}

      {checkoutProduct && (
        <CheckoutModal
          api={api}
          config={config}
          product={checkoutProduct.product}
          store={checkoutProduct.store}
          onClose={() => setCheckoutProduct(null)}
          onDone={() => { setCheckoutProduct(null); setOpenProductId(null); setTab('compras'); setRefreshKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}

// ─── Explorar ───────────────────────────────────────────────────────────────
function Explore({ api, refreshKey, onOpenProduct, onOpenStore }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('new');
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let alive = true;
    api.get('/market/products', { params: { q: debounced || undefined, type: type || undefined, sort } })
      .then(({ data }) => { if (alive) { setProducts(data.products); setError(''); } })
      .catch((err) => alive && setError(errorText(err, 'Não foi possível carregar a vitrine')));
    return () => { alive = false; };
  }, [api, debounced, type, sort, refreshKey]);

  const stores = useMemo(() => {
    const map = new Map();
    (products || []).forEach((p) => { if (p.store && !map.has(p.store.id)) map.set(p.store.id, p.store); });
    return [...map.values()].slice(0, 8);
  }, [products]);

  return (
    <div>
      <div style={styles.hero}>
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 520 }}>
          <div style={styles.heroKicker}>Apoie quem empreende</div>
          <div style={styles.heroTitle}>Produtos feitos pela galera da comunidade</div>
          <div style={styles.heroText}>Doces, artes, cursos, e-books, presets… pagamento seguro e entrega acompanhada pelo SafeCord.</div>
        </div>
        <div style={styles.heroArt} aria-hidden="true">
          <span style={{ ...styles.heroBubble, width: 120, height: 120, right: 40, top: -20 }}><PackageIcon size={46} /></span>
          <span style={{ ...styles.heroBubble, width: 74, height: 74, right: 170, top: 60, transform: 'rotate(-10deg)' }}><TagIcon size={30} /></span>
        </div>
      </div>

      <div style={styles.toolbar}>
        <label style={styles.search}>
          <SearchIcon size={15} style={{ color: 'var(--text-low)', flexShrink: 0 }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar produtos ou lojas…" style={styles.searchInput} />
          {query && <button type="button" style={styles.clearBtn} onClick={() => setQuery('')}><CloseIcon size={11} /></button>}
        </label>
        <div style={styles.chips}>
          {[['', 'Tudo'], ['physical', 'Físicos'], ['digital', 'Digitais']].map(([id, label]) => (
            <button key={id || 'all'} type="button" onClick={() => setType(id)} style={{ ...styles.chip, ...(type === id ? styles.chipActive : {}) }}>{label}</button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={styles.select}>
          {SORTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>

      {stores.length > 0 && !debounced && (
        <div style={styles.storeStrip}>
          {stores.map((s) => (
            <button key={s.id} type="button" style={styles.storeChip} onClick={() => onOpenStore(s.id)}>
              <StoreAvatar store={s} size={26} />
              <span style={styles.storeChipName}>{s.name}</span>
            </button>
          ))}
        </div>
      )}

      {error && <div style={ui.error}>{error}</div>}
      {products === null && !error && <div style={styles.hint}>Carregando…</div>}
      {products?.length === 0 && (
        <div style={styles.empty}>
          <span style={styles.emptyIcon}><StoreIcon size={26} /></span>
          <div style={styles.emptyTitle}>{debounced || type ? 'Nada encontrado' : 'A vitrine ainda está vazia'}</div>
          <div style={styles.emptyText}>{debounced || type ? 'Tente outra busca ou filtro.' : 'Que tal ser a primeira loja? Vá em "Minha loja" e comece a vender.'}</div>
        </div>
      )}

      <div style={styles.grid}>
        {(products || []).map((p) => <ProductCard key={p.id} product={p} onClick={() => onOpenProduct(p.id)} />)}
      </div>
    </div>
  );
}

function ProductCard({ product, onClick }) {
  const soldOut = product.stock === 0;
  return (
    <button type="button" className="sc-product-card" style={styles.card} onClick={onClick}>
      <div style={styles.cardImageWrap}>
        <ProductImage src={product.images[0]} type={product.type} style={{ width: '100%', height: '100%' }} />
        <TypeBadge type={product.type} style={{ position: 'absolute', top: 10, left: 10, background: 'var(--bg-surface)' }} />
        {soldOut && <span style={styles.soldOut}>Esgotado</span>}
      </div>
      <div style={styles.cardBody}>
        <div style={styles.cardTitle}>{product.title}</div>
        <div style={styles.cardStore}>
          {product.store && <><StoreAvatar store={product.store} size={16} /> {product.store.name}</>}
        </div>
        <div style={styles.cardFooter}>
          <span style={styles.cardPrice}>{brl(product.price_cents)}</span>
          {product.type === 'physical' && (
            <span style={styles.cardShip}>
              <TruckIcon size={12} /> {product.shipping_cents ? `+ ${brl(product.shipping_cents)}` : 'Frete grátis'}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Produto ────────────────────────────────────────────────────────────────
function ProductModal({ api, productId, userId, onClose, onBuy, onOpenStore, onOpenProduct }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    setData(null);
    setImageIndex(0);
    api.get(`/market/products/${productId}`)
      .then(({ data: d }) => setData(d))
      .catch((err) => setError(errorText(err, 'Produto indisponível')));
  }, [api, productId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const p = data?.product;
  const store = data?.store;
  const isMine = store?.owner?.id === userId;
  const soldOut = p?.stock === 0;

  return (
    <div style={ui.overlay} onClick={onClose}>
      <div style={{ ...ui.modal, maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
        {!p ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            {error ? <div style={ui.error}>{error}</div> : <div style={styles.hint}>Carregando…</div>}
            <button type="button" style={{ ...ui.btnGhost, marginTop: 16 }} onClick={onClose}>Fechar</button>
          </div>
        ) : (
          <div style={styles.productLayout}>
            <div style={styles.gallery}>
              <ProductImage src={p.images[imageIndex]} type={p.type} iconSize={64} style={styles.galleryMain} />
              {p.images.length > 1 && (
                <div style={styles.thumbs}>
                  {p.images.map((src, i) => (
                    <button key={src} type="button" onClick={() => setImageIndex(i)} style={{ ...styles.thumb, ...(i === imageIndex ? styles.thumbActive : {}) }}>
                      <img src={resolveAssetUrl(src)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.productInfo}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <TypeBadge type={p.type} />
                <button type="button" style={ui.closeBtn} onClick={onClose} aria-label="Fechar"><CloseIcon size={15} /></button>
              </div>
              <h2 style={styles.productTitle}>{p.title}</h2>
              <div style={styles.productPrice}>{brl(p.price_cents)}</div>

              <div style={styles.factList}>
                {p.type === 'physical' ? (
                  <>
                    <Fact icon={<TruckIcon size={14} />} text={p.shipping_cents ? `Frete fixo de ${brl(p.shipping_cents)}` : 'Frete grátis'} />
                    <Fact icon={<PackageIcon size={14} />} text={p.stock === null ? 'Em estoque' : soldOut ? 'Esgotado' : `${p.stock} em estoque`} />
                  </>
                ) : (
                  <Fact icon={<DownloadIcon size={14} />} text="Download liberado assim que o pagamento cair" />
                )}
                <Fact icon={<ShieldCheckIcon size={14} />} text="Pagamento seguro pelo SafeCord" />
                {p.sales_count > 0 && <Fact icon={<CheckIcon size={14} />} text={`${p.sales_count} vendido(s)`} />}
              </div>

              {p.description && <div style={styles.productDesc}>{p.description}</div>}

              {store && (
                <button type="button" style={styles.storeRow} onClick={() => onOpenStore(store.id)}>
                  <StoreAvatar store={store} size={38} />
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <div style={styles.storeRowName}>{store.name}{store.verified && <VerifiedBadge />}</div>
                    <div style={styles.storeRowMeta}>
                      por {store.owner?.display_name || store.owner?.username} · {store.sales_count} venda(s)
                    </div>
                  </div>
                  <ArrowRightIcon size={15} style={{ color: 'var(--text-low)' }} />
                </button>
              )}

              <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                {isMine ? (
                  <div style={styles.mineNote}>Esse produto é da sua loja.</div>
                ) : (
                  <button type="button" style={{ ...ui.btnPrimary, width: '100%', padding: '13px 18px', fontSize: 15, opacity: soldOut ? 0.5 : 1 }} disabled={soldOut} onClick={() => onBuy(p, store)}>
                    {soldOut ? 'Esgotado' : 'Comprar agora'} {!soldOut && <ArrowRightIcon size={16} />}
                  </button>
                )}
              </div>

              {data.more?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={styles.moreTitle}>Mais dessa loja</div>
                  <div style={styles.moreRow}>
                    {data.more.map((m) => (
                      <button key={m.id} type="button" style={styles.moreItem} onClick={() => onOpenProduct(m.id)} title={m.title}>
                        <ProductImage src={m.images[0]} type={m.type} iconSize={20} style={{ width: '100%', aspectRatio: '1', borderRadius: 10 }} />
                        <span style={styles.morePrice}>{brl(m.price_cents)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ icon, text }) {
  return <div style={styles.fact}><span style={styles.factIcon}>{icon}</span>{text}</div>;
}

// ─── Loja (vitrine de um vendedor) ──────────────────────────────────────────
function StoreModal({ api, storeId, onClose, onOpenProduct }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get(`/market/stores/${storeId}`).then(({ data: d }) => setData(d)).catch((err) => setError(errorText(err, 'Loja não encontrada')));
  }, [api, storeId]);

  const banner = resolveAssetUrl(data?.store?.banner_url);
  return (
    <div style={ui.overlay} onClick={onClose}>
      <div style={{ ...ui.modal, maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
        {!data ? (
          <div style={{ padding: 40, textAlign: 'center' }}>{error ? <div style={ui.error}>{error}</div> : <div style={styles.hint}>Carregando…</div>}</div>
        ) : (
          <div style={{ overflowY: 'auto' }}>
            <div style={{ ...styles.storeBanner, ...(banner ? { backgroundImage: `url(${banner})` } : {}) }}>
              <button type="button" style={{ ...ui.closeBtn, position: 'absolute', top: 14, right: 14 }} onClick={onClose}><CloseIcon size={15} /></button>
            </div>
            <div style={styles.storeHead}>
              <div style={styles.storeLogoWrap}><StoreAvatar store={data.store} size={76} /></div>
              <div style={{ minWidth: 0 }}>
                <div style={styles.storeName}>{data.store.name}{data.store.verified && <VerifiedBadge light />}</div>
                <div style={styles.storeMeta}>
                  por {data.store.owner?.display_name || data.store.owner?.username} · {data.store.product_count} produto(s) · {data.store.sales_count} venda(s)
                </div>
              </div>
            </div>
            {data.store.description && <div style={styles.storeDesc}>{data.store.description}</div>}
            <div style={{ ...styles.grid, padding: '6px 24px 24px' }}>
              {data.products.map((p) => <ProductCard key={p.id} product={{ ...p, store: null }} onClick={() => onOpenProduct(p.id)} />)}
              {data.products.length === 0 && <div style={styles.hint}>Essa loja ainda não tem produtos.</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Checkout ───────────────────────────────────────────────────────────────
const EMPTY_ADDRESS = { name: '', cep: '', street: '', number: '', complement: '', district: '', city: '', state: '' };

function CheckoutModal({ api, config, product, store, onClose, onDone }) {
  const [step, setStep] = useState('form'); // form | paying | done
  const [quantity, setQuantity] = useState(1);
  const [address, setAddress] = useState(() => {
    try { return { ...EMPTY_ADDRESS, ...JSON.parse(localStorage.getItem('safecord_last_address') || '{}') }; } catch { return EMPTY_ADDRESS; }
  });
  const [order, setOrder] = useState(null); // { orderId, devPayment, checkoutUrl }
  const [finalOrder, setFinalOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cepLoading, setCepLoading] = useState(false);

  const physical = product.type === 'physical';
  const maxQty = Math.min(product.stock ?? 20, 20);
  const subtotal = product.price_cents * quantity;
  const shipping = physical ? product.shipping_cents : 0;

  function setField(key, value) { setAddress((a) => ({ ...a, [key]: value })); }

  // Preenche rua/bairro/cidade pelo CEP (ViaCEP). Se falhar, a pessoa digita.
  async function lookupCep(raw) {
    const cep = raw.replace(/\D/g, '');
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await res.json();
      if (!d.erro) {
        setAddress((a) => ({ ...a, street: a.street || d.logradouro || '', district: a.district || d.bairro || '', city: d.localidade || a.city, state: d.uf || a.state }));
      }
    } catch { /* sem internet pro ViaCEP: tudo bem, preenche na mão */ } finally {
      setCepLoading(false);
    }
  }

  async function startPayment() {
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post('/market/checkout', { productId: product.id, quantity, ...(physical ? { address } : {}) });
      if (physical) {
        try { localStorage.setItem('safecord_last_address', JSON.stringify(address)); } catch { /* ignore */ }
      }
      setOrder(data);
      if (data.checkoutUrl) window.open(data.checkoutUrl, '_blank', 'noopener');
      setStep('paying');
    } catch (err) {
      setError(errorText(err, 'Não foi possível iniciar o pagamento'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmPaid() {
    setError('');
    setBusy(true);
    try {
      const { data } = order.devPayment
        ? await api.post(`/market/orders/${order.orderId}/dev-pay`)
        : await api.post(`/market/orders/${order.orderId}/confirm`);
      if (data.order.status === 'pending') {
        setError('O pagamento ainda não caiu. Se pagou com Pix, espere alguns segundos e clique de novo; boleto pode levar até 2 dias úteis.');
      } else {
        setFinalOrder(data.order);
        setStep('done');
      }
    } catch (err) {
      setError(errorText(err, 'Não foi possível checar o pagamento'));
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    try {
      await downloadWithAuth(api, `/market/orders/${finalOrder.id}/download`, product.title);
    } catch (err) {
      setError('Não foi possível baixar agora. Tente em Minhas compras.');
    }
  }

  return (
    <div style={ui.overlay} onClick={step === 'paying' ? undefined : onClose}>
      <div style={{ ...ui.modal, maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.coHeader}>
          {step === 'form' ? 'Finalizar compra' : step === 'paying' ? 'Pagamento' : 'Compra concluída'}
          <button type="button" style={ui.closeBtn} onClick={step === 'done' ? onDone : onClose}><CloseIcon size={15} /></button>
        </div>

        <div style={styles.coBody}>
          <div style={styles.coItem}>
            <ProductImage src={product.images[0]} type={product.type} iconSize={22} style={{ width: 58, height: 58, borderRadius: 12, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.coItemTitle}>{product.title}</div>
              <div style={styles.coItemStore}>{store?.name}</div>
            </div>
            {physical && step === 'form' && (
              <div style={styles.qty}>
                <button type="button" style={styles.qtyBtn} disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button>
                <span style={styles.qtyValue}>{quantity}</span>
                <button type="button" style={styles.qtyBtn} disabled={quantity >= maxQty} onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}>+</button>
              </div>
            )}
          </div>

          {step === 'form' && physical && (
            <div style={styles.addressGrid}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={ui.label}>Quem vai receber</label>
                <input style={ui.input} value={address.name} onChange={(e) => setField('name', e.target.value)} placeholder="Nome completo" />
              </div>
              <div>
                <label style={ui.label}>CEP {cepLoading && <span style={{ color: 'var(--text-low)' }}>· buscando…</span>}</label>
                <input style={ui.input} value={address.cep} inputMode="numeric" maxLength={9}
                  onChange={(e) => { setField('cep', e.target.value); lookupCep(e.target.value); }} placeholder="00000-000" />
              </div>
              <div>
                <label style={ui.label}>UF</label>
                <input style={ui.input} value={address.state} maxLength={2} onChange={(e) => setField('state', e.target.value.toUpperCase())} placeholder="SP" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={ui.label}>Rua</label>
                <input style={ui.input} value={address.street} onChange={(e) => setField('street', e.target.value)} placeholder="Rua / Avenida" />
              </div>
              <div>
                <label style={ui.label}>Número</label>
                <input style={ui.input} value={address.number} onChange={(e) => setField('number', e.target.value)} placeholder="123" />
              </div>
              <div>
                <label style={ui.label}>Complemento</label>
                <input style={ui.input} value={address.complement} onChange={(e) => setField('complement', e.target.value)} placeholder="Apto, bloco… (opcional)" />
              </div>
              <div>
                <label style={ui.label}>Bairro</label>
                <input style={ui.input} value={address.district} onChange={(e) => setField('district', e.target.value)} />
              </div>
              <div>
                <label style={ui.label}>Cidade</label>
                <input style={ui.input} value={address.city} onChange={(e) => setField('city', e.target.value)} />
              </div>
            </div>
          )}

          {step !== 'done' && (
            <div style={styles.totals}>
              <Row label={`Produto${quantity > 1 ? ` × ${quantity}` : ''}`} value={brl(subtotal)} />
              {physical && <Row label="Frete" value={shipping ? brl(shipping) : 'Grátis'} />}
              <div style={styles.totalLine}><span>Total</span><span>{brl(subtotal + shipping)}</span></div>
            </div>
          )}

          {step === 'paying' && (
            <div style={styles.payBox}>
              {order?.devPayment ? (
                <>
                  <div style={styles.payTitle}>Modo de teste</div>
                  <div style={styles.payText}>O Mercado Pago não está configurado no servidor, então dá pra simular o pagamento pra testar a loja.</div>
                </>
              ) : (
                <>
                  <div style={styles.payTitle}>Abrimos o Mercado Pago no navegador</div>
                  <div style={styles.payText}>Pague por lá com Pix, cartão ou boleto. Quando terminar, volte e clique abaixo. Pix costuma cair na hora; boleto pode levar até 2 dias úteis.</div>
                  {order?.checkoutUrl && (
                    <button type="button" style={{ ...ui.btnGhost, marginTop: 10 }} onClick={() => window.open(order.checkoutUrl, '_blank', 'noopener')}>Abrir pagamento de novo</button>
                  )}
                </>
              )}
            </div>
          )}

          {step === 'done' && finalOrder && (
            <div style={styles.doneBox}>
              <span style={styles.doneIcon}><CheckIcon size={26} /></span>
              <div style={styles.doneTitle}>Pagamento confirmado!</div>
              <div style={styles.payText}>
                {physical
                  ? `${store?.name || 'A loja'} já foi avisada e vai enviar seu pedido. Acompanhe em Minhas compras.`
                  : 'Seu arquivo já está liberado.'}
              </div>
              {!physical && (
                <button type="button" style={{ ...ui.btnPrimary, marginTop: 14 }} onClick={download}>
                  <DownloadIcon size={15} /> Baixar agora
                </button>
              )}
            </div>
          )}

          {error && <div style={ui.error}>{error}</div>}
        </div>

        <div style={styles.coFooter}>
          {step === 'form' && (
            <>
              {!config?.paymentsEnabled && <span style={styles.coWarn}>Pagamentos ainda não configurados no servidor</span>}
              <button type="button" style={{ ...ui.btnPrimary, marginLeft: 'auto', opacity: busy ? 0.7 : 1 }} disabled={busy || !config?.paymentsEnabled} onClick={startPayment}>
                {busy ? 'Abrindo…' : 'Ir para o pagamento'} <ArrowRightIcon size={15} />
              </button>
            </>
          )}
          {step === 'paying' && (
            <>
              <button type="button" style={ui.btnGhost} onClick={() => setStep('form')}><ArrowLeftIcon size={13} /> Voltar</button>
              <button type="button" style={{ ...ui.btnPrimary, marginLeft: 'auto' }} disabled={busy} onClick={confirmPaid}>
                {busy ? 'Checando…' : order?.devPayment ? 'Simular pagamento (teste)' : 'Já paguei'}
              </button>
            </>
          )}
          {step === 'done' && (
            <button type="button" style={{ ...ui.btnPrimary, marginLeft: 'auto' }} onClick={onDone}>Ver minhas compras</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return <div style={styles.totalRow}><span>{label}</span><span>{value}</span></div>;
}

// ─── Minhas compras ─────────────────────────────────────────────────────────
function Purchases({ api, refreshKey, onOpenProduct, onExplore }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    api.get('/market/orders').then(({ data: d }) => setData(d)).catch((err) => setError(errorText(err, 'Não foi possível carregar')));
  }, [api]);
  useEffect(() => { load(); }, [load, refreshKey]);

  async function act(order, action) {
    setBusyId(order.id);
    setError('');
    try {
      if (action === 'download') await downloadWithAuth(api, `/market/orders/${order.id}/download`, order.product.title);
      if (action === 'received') { await api.post(`/market/orders/${order.id}/received`); load(); }
      if (action === 'cancel') { await api.post(`/market/orders/${order.id}/cancel`); load(); }
    } catch (err) {
      setError(errorText(err, 'Não foi possível concluir'));
    } finally {
      setBusyId(null);
    }
  }

  if (!data) return error ? <div style={ui.error}>{error}</div> : <div style={styles.hint}>Carregando…</div>;

  return (
    <div style={{ maxWidth: 860 }}>
      {error && <div style={{ ...ui.error, marginBottom: 12 }}>{error}</div>}

      {data.pending.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={styles.sectionTitle}>Aguardando pagamento</div>
          {data.pending.map((o) => (
            <div key={o.id} style={{ ...styles.orderRow, opacity: 0.8 }}>
              <ProductImage src={o.product.image} type={o.product.type} iconSize={20} style={styles.orderImg} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.orderTitle}>{o.product.title}</div>
                <div style={styles.orderMeta}>{o.store?.name} · {brl(o.total_cents)}</div>
              </div>
              <button type="button" style={ui.btnDanger} disabled={busyId === o.id} onClick={() => act(o, 'cancel')}>Cancelar</button>
            </div>
          ))}
        </div>
      )}

      <div style={styles.sectionTitle}>Pedidos</div>
      {data.orders.length === 0 ? (
        <div style={styles.empty}>
          <span style={styles.emptyIcon}><PackageIcon size={26} /></span>
          <div style={styles.emptyTitle}>Você ainda não comprou nada</div>
          <div style={styles.emptyText}>Explore a vitrine e apoie quem empreende na comunidade.</div>
          <button type="button" style={{ ...ui.btnPrimary, marginTop: 14 }} onClick={onExplore}>Explorar o Mercado</button>
        </div>
      ) : data.orders.map((o) => (
        <div key={o.id} style={styles.orderRow}>
          <button type="button" style={{ border: 'none', padding: 0, background: 'none', cursor: o.product.id ? 'pointer' : 'default' }} onClick={() => o.product.id && onOpenProduct(o.product.id)}>
            <ProductImage src={o.product.image} type={o.product.type} iconSize={20} style={styles.orderImg} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.orderTitle}>{o.product.title}{o.quantity > 1 ? ` × ${o.quantity}` : ''}</div>
            <div style={styles.orderMeta}>{o.store?.name} · {brl(o.total_cents)} · {formatDate(o.paid_at || o.created_at)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
              <StatusPill status={o.status} type={o.product.type} />
              {o.tracking_code && <span style={styles.tracking}><TruckIcon size={12} /> Rastreio: <strong>{o.tracking_code}</strong></span>}
            </div>
          </div>
          <div style={styles.orderActions}>
            {o.can_download && (
              <button type="button" style={ui.btnPrimary} disabled={busyId === o.id} onClick={() => act(o, 'download')}>
                <DownloadIcon size={14} /> {busyId === o.id ? 'Baixando…' : 'Baixar'}
              </button>
            )}
            {o.product.type === 'physical' && ['paid', 'shipped'].includes(o.status) && (
              <button type="button" style={ui.btnGhost} disabled={busyId === o.id} onClick={() => act(o, 'received')}>
                <CheckIcon size={14} /> Recebi
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const styles = {
  wrap: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg-surface)' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
    padding: '16px 22px', borderBottom: '1px solid var(--border)',
  },
  headerTitle: { display: 'flex', alignItems: 'center', gap: 12 },
  headerIcon: {
    width: 38, height: 38, borderRadius: 12, background: 'var(--accent-soft)', color: 'var(--accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: 750, color: 'var(--text-hi)', letterSpacing: -0.3 },
  subtitle: { fontSize: 12.5, color: 'var(--text-low)', marginTop: 1 },
  tabs: { display: 'flex', gap: 4, padding: 4, background: 'var(--bg-elevated)', borderRadius: 14, border: '1px solid var(--border)' },
  tab: {
    display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', background: 'transparent', color: 'var(--text-mid)',
    fontSize: 13, fontWeight: 600, padding: '8px 13px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
  },
  tabActive: { background: 'var(--accent)', color: 'var(--accent-contrast)' },
  body: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 22px 30px' },
  hint: { color: 'var(--text-low)', fontSize: 13, padding: '30px 0', textAlign: 'center' },

  hero: {
    position: 'relative', overflow: 'hidden', borderRadius: 22, padding: '24px 26px', marginBottom: 18,
    background: 'linear-gradient(120deg, color-mix(in srgb, var(--accent) 85%, #050A16), color-mix(in srgb, var(--accent) 40%, #0A1430) 70%)',
    border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', color: '#fff',
  },
  heroKicker: { display: 'inline-block', fontSize: 11.5, fontWeight: 700, background: 'rgba(255,255,255,0.16)', borderRadius: 999, padding: '4px 10px' },
  heroTitle: { fontSize: 24, fontWeight: 800, letterSpacing: -0.6, marginTop: 10, lineHeight: 1.15 },
  heroText: { fontSize: 13.5, opacity: 0.85, marginTop: 8, lineHeight: 1.5 },
  heroArt: { position: 'absolute', inset: 0, pointerEvents: 'none' },
  heroBubble: {
    position: 'absolute', borderRadius: 28, background: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.9)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(8deg)',
  },

  toolbar: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
  search: {
    flex: '1 1 260px', display: 'flex', alignItems: 'center', gap: 9, height: 42, padding: '0 12px',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, cursor: 'text',
  },
  searchInput: { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-hi)', fontSize: 13.5, fontFamily: 'inherit' },
  clearBtn: { width: 20, height: 20, borderRadius: 10, border: 'none', background: 'var(--bg-hover)', color: 'var(--text-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  chips: { display: 'flex', gap: 6 },
  chip: {
    border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-mid)', fontSize: 12.5, fontWeight: 600,
    padding: '0 14px', height: 42, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
  },
  chipActive: { background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--text-hi)' },
  select: {
    height: 42, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-hi)',
    padding: '0 12px', fontSize: 12.5, fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
  },
  storeStrip: { display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 12 },
  storeChip: {
    display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, border: '1px solid var(--border)', background: 'var(--bg-base)',
    borderRadius: 999, padding: '5px 14px 5px 5px', cursor: 'pointer', fontFamily: 'inherit',
  },
  storeChipName: { fontSize: 12.5, fontWeight: 600, color: 'var(--text-hi)', whiteSpace: 'nowrap' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 },
  card: {
    display: 'flex', flexDirection: 'column', textAlign: 'left', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
    background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden',
    transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
  },
  cardImageWrap: { position: 'relative', aspectRatio: '1 / 1', background: 'var(--bg-elevated)' },
  soldOut: {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(5,10,20,0.6)', color: '#fff', fontWeight: 750, fontSize: 14,
  },
  cardBody: { padding: '11px 13px 13px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 },
  cardTitle: {
    fontSize: 14, fontWeight: 650, color: 'var(--text-hi)', lineHeight: 1.3,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  cardStore: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-low)', minHeight: 16 },
  cardFooter: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginTop: 'auto', paddingTop: 6, flexWrap: 'wrap' },
  cardPrice: { fontSize: 17, fontWeight: 800, color: 'var(--text-hi)', letterSpacing: -0.3 },
  cardShip: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--text-low)' },

  empty: { ...ui.card, padding: '36px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 15.5, fontWeight: 700, color: 'var(--text-hi)' },
  emptyText: { fontSize: 13, color: 'var(--text-low)', marginTop: 4, maxWidth: 360, lineHeight: 1.5 },

  // produto
  productLayout: { display: 'flex', minHeight: 0, overflow: 'hidden', maxHeight: '90vh' },
  gallery: { width: '52%', flexShrink: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg-base)' },
  galleryMain: { width: '100%', aspectRatio: '1 / 1', borderRadius: 16 },
  thumbs: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  thumb: { width: 58, height: 58, padding: 2, borderRadius: 10, border: '2px solid transparent', background: 'none', cursor: 'pointer' },
  thumbActive: { border: '2px solid var(--accent)' },
  productInfo: { flex: 1, minWidth: 0, padding: '18px 22px 20px', display: 'flex', flexDirection: 'column', overflowY: 'auto' },
  productTitle: { fontSize: 22, fontWeight: 750, color: 'var(--text-hi)', letterSpacing: -0.4, margin: '12px 0 6px', lineHeight: 1.2 },
  productPrice: { fontSize: 28, fontWeight: 800, color: 'var(--text-hi)', letterSpacing: -0.6 },
  factList: { display: 'flex', flexDirection: 'column', gap: 7, margin: '14px 0' },
  fact: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--text-mid)' },
  factIcon: { width: 26, height: 26, borderRadius: 8, background: 'var(--bg-elevated)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  productDesc: { fontSize: 13.5, color: 'var(--text-hi)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 14 },
  storeRow: {
    display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: 10, borderRadius: 14, cursor: 'pointer',
    background: 'var(--bg-base)', border: '1px solid var(--border)', fontFamily: 'inherit',
  },
  storeRowName: { fontSize: 14, fontWeight: 650, color: 'var(--text-hi)' },
  storeRowMeta: { fontSize: 12, color: 'var(--text-low)', marginTop: 1 },
  mineNote: { fontSize: 13, color: 'var(--text-mid)', background: 'var(--bg-elevated)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' },
  moreTitle: { fontSize: 12.5, fontWeight: 650, color: 'var(--text-low)', marginBottom: 8 },
  moreRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
  moreItem: { border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'inherit' },
  morePrice: { fontSize: 12, fontWeight: 700, color: 'var(--text-hi)' },

  // loja
  storeBanner: {
    position: 'relative', height: 150, backgroundSize: 'cover', backgroundPosition: 'center',
    background: 'linear-gradient(120deg, color-mix(in srgb, var(--accent) 80%, #050A16), #0A1430)',
  },
  storeHead: { display: 'flex', alignItems: 'flex-end', gap: 14, padding: '0 24px', marginTop: -34 },
  storeLogoWrap: { border: '5px solid var(--bg-surface)', borderRadius: 30, background: 'var(--bg-surface)', lineHeight: 0 },
  storeName: { fontSize: 21, fontWeight: 750, color: 'var(--text-hi)', letterSpacing: -0.3 },
  storeMeta: { fontSize: 12.5, color: 'var(--text-low)', marginTop: 2, marginBottom: 6 },
  storeDesc: { fontSize: 13.5, color: 'var(--text-mid)', lineHeight: 1.55, padding: '12px 24px 4px', whiteSpace: 'pre-wrap' },

  // checkout
  coHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px 22px',
    fontSize: 17, fontWeight: 700, color: 'var(--text-hi)',
  },
  coBody: { padding: '0 22px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 },
  coItem: { display: 'flex', alignItems: 'center', gap: 12, ...ui.card, padding: 10, borderRadius: 16 },
  coItemTitle: { fontSize: 14, fontWeight: 650, color: 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  coItemStore: { fontSize: 12, color: 'var(--text-low)', marginTop: 2 },
  qty: { display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-elevated)', borderRadius: 10, padding: 3, flexShrink: 0 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--bg-surface)', color: 'var(--text-hi)', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' },
  qtyValue: { minWidth: 22, textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--text-hi)' },
  addressGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  totals: { ...ui.card, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, borderRadius: 16 },
  totalRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-mid)' },
  totalLine: { display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: 'var(--text-hi)', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 2 },
  payBox: { background: 'var(--accent-softer)', border: '1px solid var(--accent-soft)', borderRadius: 16, padding: 14 },
  payTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text-hi)', marginBottom: 4 },
  payText: { fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.5 },
  doneBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '14px 10px' },
  doneIcon: { width: 58, height: 58, borderRadius: '50%', background: 'color-mix(in srgb, var(--success) 16%, transparent)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  doneTitle: { fontSize: 18, fontWeight: 750, color: 'var(--text-hi)', marginBottom: 6 },
  coFooter: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px 18px', borderTop: '1px solid var(--border)' },
  coWarn: { fontSize: 12, color: 'var(--warn)' },

  // compras
  sectionTitle: { fontSize: 13, fontWeight: 650, color: 'var(--text-low)', margin: '0 0 10px 2px' },
  orderRow: { display: 'flex', alignItems: 'center', gap: 14, ...ui.card, padding: 12, marginBottom: 8, borderRadius: 16 },
  orderImg: { width: 64, height: 64, borderRadius: 12, flexShrink: 0 },
  orderTitle: { fontSize: 14.5, fontWeight: 650, color: 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  orderMeta: { fontSize: 12.5, color: 'var(--text-low)', marginTop: 2 },
  orderActions: { display: 'flex', gap: 8, flexShrink: 0 },
  tracking: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-mid)' },
};

function VerifiedBadge({ light }) {
  return (
    <span
      title="O SafeCord conferiu o documento, o rosto e a conta bancária desse vendedor"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 7, fontSize: 11, fontWeight: 700, verticalAlign: 'middle',
        color: light ? '#fff' : 'var(--success)',
        background: light ? 'rgba(255,255,255,0.18)' : 'color-mix(in srgb, var(--success) 13%, transparent)',
        borderRadius: 999, padding: '2px 8px',
      }}
    >
      <ShieldCheckIcon size={11} /> Verificado
    </span>
  );
}
