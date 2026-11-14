import React, { useCallback, useEffect, useState } from 'react';
import {
  StoreIcon, PlusIcon, EditIcon, TrashIcon, CloseIcon, ImageIcon, FileIcon, PackageIcon, TruckIcon,
  WalletIcon, CheckIcon, CameraIcon, EyeIcon,
} from '../Icons';
import {
  brl, parseBRL, centsToInput, StatusPill, TypeBadge, ProductImage, StoreAvatar, formatDate, errorText, ui,
} from './marketUtils';
import { resolveAssetUrl } from '../../api';

export default function SellerDashboard({ api, user, config, refreshKey, onOpenProduct }) {
  const [data, setData] = useState(null); // { store, products, summary }
  const [error, setError] = useState('');
  const [section, setSection] = useState('produtos'); // produtos | pedidos | config
  const [editing, setEditing] = useState(null); // null | 'new' | product

  const load = useCallback(() => {
    api.get('/market/my-store').then(({ data: d }) => { setData(d); setError(''); })
      .catch((err) => setError(errorText(err, 'Não foi possível carregar sua loja')));
  }, [api]);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (!data) return error ? <div style={ui.error}>{error}</div> : <div style={s.hint}>Carregando…</div>;
  if (!data.store) return <OpenStore api={api} user={user} config={config} onCreated={load} />;

  const { store, products, summary } = data;
  const banner = resolveAssetUrl(store.banner_url);

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ ...s.storeHeader, ...(banner ? { backgroundImage: `linear-gradient(90deg, rgba(5,10,22,0.85), rgba(5,10,22,0.35)), url(${banner})` } : {}) }}>
        <StoreAvatar store={store} size={58} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={s.storeName}>{store.name}</div>
          <div style={s.storeMeta}>{store.product_count} produto(s) à venda · {store.sales_count} venda(s){store.status === 'suspended' ? ' · LOJA SUSPENSA' : ''}</div>
        </div>
        <button type="button" style={{ ...ui.btnPrimary, background: '#fff', color: '#0B1630' }} onClick={() => setEditing('new')}>
          <PlusIcon size={15} /> Novo produto
        </button>
      </div>

      <div style={s.tiles}>
        <Tile icon={<WalletIcon size={17} />} label="Disponível pra repasse" value={brl(summary.available_cents)} accent />
        <Tile icon={<TruckIcon size={17} />} label="A liberar (em entrega)" value={brl(summary.pending_cents)} />
        <Tile icon={<CheckIcon size={17} />} label="Já repassado" value={brl(summary.paid_out_cents)} />
        <Tile icon={<PackageIcon size={17} />} label="Pedidos pra enviar" value={summary.to_ship} highlight={summary.to_ship > 0} />
      </div>
      <div style={s.feeNote}>
        O SafeCord fica com {config?.feePercent ?? 10}% do valor dos produtos (o frete é todo seu). Produto digital libera na hora;
        físico libera quando o comprador confirma o recebimento (ou 14 dias depois do envio). O repasse é feito pela chave Pix das configurações.
      </div>

      <div style={s.sectionTabs}>
        {[['produtos', `Produtos (${products.length})`], ['pedidos', `Pedidos${summary.to_ship ? ` · ${summary.to_ship} pra enviar` : ''}`], ['config', 'Configurações']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setSection(id)} style={{ ...s.sectionTab, ...(section === id ? s.sectionTabActive : {}) }}>{label}</button>
        ))}
      </div>

      {section === 'produtos' && (
        products.length === 0 ? (
          <div style={s.empty}>
            <span style={s.emptyIcon}><PackageIcon size={26} /></span>
            <div style={s.emptyTitle}>Cadastre seu primeiro produto</div>
            <div style={s.emptyText}>Pode ser físico (com frete e estoque) ou digital (o arquivo é entregue automático depois do pagamento).</div>
            <button type="button" style={{ ...ui.btnPrimary, marginTop: 14 }} onClick={() => setEditing('new')}><PlusIcon size={15} /> Novo produto</button>
          </div>
        ) : (
          <div style={s.productList}>
            {products.map((p) => {
              const incomplete = p.type === 'digital' && !p.has_file;
              return (
                <div key={p.id} style={{ ...s.productRow, opacity: p.active ? 1 : 0.55 }}>
                  <ProductImage src={p.images[0]} type={p.type} iconSize={20} style={{ width: 58, height: 58, borderRadius: 12, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.productTitle}>{p.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                      <TypeBadge type={p.type} />
                      <span style={s.productMeta}>{brl(p.price_cents)}</span>
                      {p.type === 'physical' && <span style={s.productMeta}>· {p.stock === null ? 'estoque livre' : `${p.stock} em estoque`}</span>}
                      <span style={s.productMeta}>· {p.sales_count} venda(s)</span>
                      {!p.active && <span style={s.warnTag}>Fora da vitrine</span>}
                      {incomplete && <span style={s.warnTag}>Falta o arquivo</span>}
                    </div>
                  </div>
                  <button type="button" style={s.iconBtn} title="Ver como cliente" onClick={() => onOpenProduct(p.id)}><EyeIcon size={16} /></button>
                  <button type="button" style={s.iconBtn} title="Editar" onClick={() => setEditing(p)}><EditIcon size={15} /></button>
                </div>
              );
            })}
          </div>
        )
      )}

      {section === 'pedidos' && <StoreOrders api={api} refreshKey={refreshKey} onChanged={load} />}
      {section === 'config' && <StoreSettings api={api} store={store} onSaved={load} />}

      {editing && (
        <ProductEditor
          api={api}
          config={config}
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => load()}
          onDeleted={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function Tile({ icon, label, value, accent, highlight }) {
  return (
    <div style={{ ...s.tile, ...(accent ? s.tileAccent : {}), ...(highlight ? { borderColor: 'var(--warn)' } : {}) }}>
      <span style={{ ...s.tileIcon, ...(accent ? { background: 'rgba(255,255,255,0.18)', color: '#fff' } : {}) }}>{icon}</span>
      <div style={{ ...s.tileValue, ...(accent ? { color: '#fff' } : {}) }}>{value}</div>
      <div style={{ ...s.tileLabel, ...(accent ? { color: 'rgba(255,255,255,0.8)' } : {}) }}>{label}</div>
    </div>
  );
}

// ─── Abrir loja ─────────────────────────────────────────────────────────────
function OpenStore({ api, user, config, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [payout, setPayout] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    setBusy(true);
    setError('');
    try {
      await api.post('/market/my-store', { name, description, payout_info: payout });
      onCreated();
    } catch (err) {
      setError(errorText(err, 'Não foi possível abrir a loja'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={s.openWrap}>
      <div style={s.openPitch}>
        <span style={s.openIcon}><StoreIcon size={30} /></span>
        <div style={s.openTitle}>Abra sua loja no SafeCord</div>
        <div style={s.openText}>Venda pra comunidade sem precisar de site próprio. Você cadastra, a gente cuida do pagamento e te repassa.</div>
        <div style={s.steps}>
          {[
            ['Cadastre', 'Produtos físicos (com frete e estoque) ou digitais (arquivos, cursos, presets…)'],
            ['Venda', 'O comprador paga pelo SafeCord. Digital é entregue na hora, automático.'],
            ['Receba', `Saldo repassado por Pix. Taxa de ${config?.feePercent ?? 10}% só quando vende.`],
          ].map(([t, d], i) => (
            <div key={t} style={s.step}>
              <span style={s.stepNum}>{i + 1}</span>
              <div><div style={s.stepTitle}>{t}</div><div style={s.stepText}>{d}</div></div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.openForm}>
        {!user?.email_verified && <div style={{ ...ui.error, color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 12%, transparent)' }}>Confirme seu email pra poder abrir uma loja.</div>}
        <div>
          <label style={ui.label}>Nome da loja</label>
          <input style={ui.input} value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Doces da Ana" />
        </div>
        <div>
          <label style={ui.label}>Sobre a loja</label>
          <textarea style={{ ...ui.input, resize: 'none', lineHeight: 1.5 }} rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="O que você vende, prazo de produção, cidade…" />
        </div>
        <div>
          <label style={ui.label}>Chave Pix pra receber</label>
          <input style={ui.input} value={payout} maxLength={300} onChange={(e) => setPayout(e.target.value)} placeholder="CPF, email, telefone ou chave aleatória" />
          <div style={s.fieldHint}>Só você e a equipe do SafeCord veem. Dá pra mudar depois.</div>
        </div>
        {error && <div style={ui.error}>{error}</div>}
        <button type="button" style={{ ...ui.btnPrimary, padding: '12px 18px' }} disabled={busy || !name.trim()} onClick={create}>
          {busy ? 'Abrindo…' : 'Abrir minha loja'}
        </button>
      </div>
    </div>
  );
}

// ─── Editor de produto ──────────────────────────────────────────────────────
function ProductEditor({ api, config, product, onClose, onSaved, onDeleted }) {
  const isNew = !product;
  const [type, setType] = useState(product?.type || 'physical');
  const [title, setTitle] = useState(product?.title || '');
  const [description, setDescription] = useState(product?.description || '');
  const [price, setPrice] = useState(centsToInput(product?.price_cents));
  const [shipping, setShipping] = useState(product ? centsToInput(product.shipping_cents) : '');
  const [stock, setStock] = useState(product?.stock ?? '');
  const [active, setActive] = useState(product ? product.active : true);
  const [current, setCurrent] = useState(product);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    setError('');
    const priceCents = parseBRL(price);
    if (Number.isNaN(priceCents)) return setError('Informe o preço (ex.: 49,90)');
    const body = {
      title, description, type,
      price_cents: priceCents,
      shipping_cents: type === 'physical' ? (parseBRL(shipping) || 0) : 0,
      stock: type === 'physical' && stock !== '' ? Number(stock) : null,
      active,
    };
    setBusy(true);
    try {
      const { data } = isNew && !current
        ? await api.post('/market/products', body)
        : await api.put(`/market/products/${current.id}`, body);
      setCurrent(data.product);
      onSaved(data.product);
      if (!isNew) onClose();
    } catch (err) {
      setError(errorText(err, 'Não foi possível salvar'));
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !current) return;
    setUploading('image');
    setError('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await api.post(`/market/products/${current.id}/images`, fd);
      setCurrent(data.product);
      onSaved(null);
    } catch (err) {
      setError(errorText(err, 'Não foi possível enviar a foto'));
    } finally {
      setUploading(null);
    }
  }

  async function removeImage(url) {
    try {
      const { data } = await api.delete(`/market/products/${current.id}/images`, { data: { url } });
      setCurrent(data.product);
      onSaved(null);
    } catch (err) {
      setError(errorText(err, 'Não foi possível remover a foto'));
    }
  }

  async function uploadFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !current) return;
    const maxMB = config?.maxDigitalMB || 100;
    if (file.size > maxMB * 1024 * 1024) return setError(`Arquivo grande demais (máx. ${maxMB}MB)`);
    setUploading('file');
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post(`/market/products/${current.id}/file`, fd);
      setCurrent(data.product);
      onSaved(null);
    } catch (err) {
      setError(errorText(err, 'Não foi possível enviar o arquivo'));
    } finally {
      setUploading(null);
    }
  }

  async function remove() {
    if (!window.confirm('Tirar esse produto da loja?')) return;
    try {
      await api.delete(`/market/products/${current.id}`);
      onDeleted();
    } catch (err) {
      setError(errorText(err, 'Não foi possível remover'));
    }
  }

  const created = Boolean(current);

  return (
    <div style={ui.overlay} onClick={onClose}>
      <div style={{ ...ui.modal, maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div style={s.edHeader}>
          <div>
            <div style={s.edTitle}>{isNew && !created ? 'Novo produto' : 'Editar produto'}</div>
            {isNew && created && <div style={s.edSub}>Produto criado! Agora adicione as fotos{type === 'digital' ? ' e o arquivo' : ''}.</div>}
          </div>
          <button type="button" style={ui.closeBtn} onClick={onClose}><CloseIcon size={15} /></button>
        </div>

        <div style={s.edBody}>
          {isNew && !created && (
            <div style={s.typePick}>
              {[['physical', 'Físico', 'Tem frete e estoque', PackageIcon], ['digital', 'Digital', 'Arquivo entregue automático', FileIcon]].map(([id, label, hint, Icon]) => (
                <button key={id} type="button" onClick={() => setType(id)} style={{ ...s.typeCard, ...(type === id ? s.typeCardActive : {}) }}>
                  <span style={s.typeIcon}><Icon size={20} /></span>
                  <div style={{ textAlign: 'left' }}><div style={s.typeLabel}>{label}</div><div style={s.typeHint}>{hint}</div></div>
                </button>
              ))}
            </div>
          )}

          <div>
            <label style={ui.label}>Nome do produto</label>
            <input style={ui.input} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Caixa com 12 brigadeiros" />
          </div>
          <div>
            <label style={ui.label}>Descrição</label>
            <textarea style={{ ...ui.input, resize: 'vertical', lineHeight: 1.5, minHeight: 90 }} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes, tamanho, sabores, o que vem no arquivo…" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: type === 'physical' ? '1fr 1fr 1fr' : '1fr', gap: 10 }}>
            <div>
              <label style={ui.label}>Preço (R$)</label>
              <input style={ui.input} value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} placeholder="49,90" />
            </div>
            {type === 'physical' && (
              <>
                <div>
                  <label style={ui.label}>Frete fixo (R$)</label>
                  <input style={ui.input} value={shipping} inputMode="decimal" onChange={(e) => setShipping(e.target.value)} placeholder="0 = grátis" />
                </div>
                <div>
                  <label style={ui.label}>Estoque</label>
                  <input style={ui.input} value={stock} inputMode="numeric" onChange={(e) => setStock(e.target.value.replace(/\D/g, ''))} placeholder="vazio = sem limite" />
                </div>
              </>
            )}
          </div>
          {Number.isFinite(parseBRL(price)) && (
            <div style={s.fieldHint}>
              Você recebe {brl(Math.round(parseBRL(price) * (1 - (config?.feePercent ?? 10) / 100)))} por unidade{type === 'physical' ? ' + o frete' : ''}.
            </div>
          )}

          {created && (
            <>
              <div>
                <label style={ui.label}>Fotos ({current.images.length}/6)</label>
                <div style={s.photoGrid}>
                  {current.images.map((url) => (
                    <div key={url} style={s.photo}>
                      <img src={resolveAssetUrl(url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} />
                      <button type="button" style={s.photoRemove} onClick={() => removeImage(url)} title="Remover"><CloseIcon size={11} /></button>
                    </div>
                  ))}
                  {current.images.length < 6 && (
                    <label style={s.photoAdd}>
                      {uploading === 'image' ? 'Enviando…' : <><CameraIcon size={18} /> Adicionar</>}
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={uploadImage} disabled={uploading === 'image'} />
                    </label>
                  )}
                </div>
              </div>

              {type === 'digital' && (
                <div>
                  <label style={ui.label}>Arquivo entregue ao comprador</label>
                  <div style={s.fileBox}>
                    <span style={s.fileIcon}><FileIcon size={18} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {current.has_file ? (
                        <>
                          <div style={s.fileName}>{current.digital_file_name}</div>
                          <div style={s.fieldHint}>{((current.digital_file_size || 0) / 1024 / 1024).toFixed(1)} MB · só quem pagou consegue baixar</div>
                        </>
                      ) : (
                        <div style={{ ...s.fileName, color: 'var(--warn)' }}>Nenhum arquivo ainda — o produto só aparece na vitrine depois disso</div>
                      )}
                    </div>
                    <label style={ui.btnGhost}>
                      {uploading === 'file' ? 'Enviando…' : current.has_file ? 'Trocar' : 'Enviar arquivo'}
                      <input type="file" style={{ display: 'none' }} onChange={uploadFile} disabled={uploading === 'file'} />
                    </label>
                  </div>
                </div>
              )}

              <label style={s.switchRow}>
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Mostrar na vitrine
              </label>
            </>
          )}

          {error && <div style={ui.error}>{error}</div>}
        </div>

        <div style={s.edFooter}>
          {created && !isNew && <button type="button" style={ui.btnDanger} onClick={remove}><TrashIcon size={14} /> Remover</button>}
          <div style={{ flex: 1 }} />
          {isNew && created ? (
            <>
              <button type="button" style={ui.btnGhost} onClick={save} disabled={busy}>Salvar alterações</button>
              <button type="button" style={ui.btnPrimary} onClick={onClose}>Concluir</button>
            </>
          ) : (
            <button type="button" style={ui.btnPrimary} onClick={save} disabled={busy}>
              {busy ? 'Salvando…' : isNew ? 'Criar produto' : 'Salvar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Pedidos da loja ────────────────────────────────────────────────────────
function StoreOrders({ api, refreshKey, onChanged }) {
  const [orders, setOrders] = useState(null);
  const [filter, setFilter] = useState('paid');
  const [tracking, setTracking] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/market/my-store/orders').then(({ data }) => setOrders(data.orders)).catch((err) => setError(errorText(err)));
  }, [api]);
  useEffect(() => { load(); }, [load, refreshKey]);

  async function ship(order) {
    setBusyId(order.id);
    setError('');
    try {
      await api.post(`/market/orders/${order.id}/ship`, { tracking_code: tracking[order.id] || '' });
      load();
      onChanged();
    } catch (err) {
      setError(errorText(err, 'Não foi possível marcar como enviado'));
    } finally {
      setBusyId(null);
    }
  }

  if (!orders) return <div style={s.hint}>Carregando…</div>;
  const visible = filter === 'all' ? orders : orders.filter((o) => o.status === filter);
  const counts = (st) => orders.filter((o) => o.status === st).length;

  return (
    <div>
      <div style={s.filterRow}>
        {[['paid', `Pra enviar (${counts('paid')})`], ['shipped', `Enviados (${counts('shipped')})`], ['delivered', `Concluídos (${counts('delivered')})`], ['all', 'Todos']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setFilter(id)} style={{ ...s.filterChip, ...(filter === id ? s.filterChipActive : {}) }}>{label}</button>
        ))}
      </div>
      {error && <div style={{ ...ui.error, marginBottom: 10 }}>{error}</div>}
      {visible.length === 0 && <div style={s.hint}>Nenhum pedido aqui.</div>}
      {visible.map((o) => {
        const a = o.shipping_address;
        return (
          <div key={o.id} style={s.orderCard}>
            <div style={s.orderTop}>
              <ProductImage src={o.product.image} type={o.product.type} iconSize={18} style={{ width: 50, height: 50, borderRadius: 11, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.productTitle}>{o.product.title}{o.quantity > 1 ? ` × ${o.quantity}` : ''}</div>
                <div style={s.productMeta}>
                  {o.buyer ? `${o.buyer.display_name || o.buyer.username}#${o.buyer.tag}` : 'Comprador'} · {formatDate(o.paid_at)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={s.orderValue}>{brl(o.seller_cents)}</div>
                <div style={s.productMeta}>pago {brl(o.total_cents)} · taxa {brl(o.fee_cents)}</div>
              </div>
            </div>
            <div style={s.orderBottom}>
              <StatusPill status={o.status} type={o.product.type} />
              {o.paid_out && <span style={{ ...s.productMeta, color: 'var(--success)' }}>· repassado</span>}
              {o.tracking_code && <span style={s.productMeta}>· rastreio {o.tracking_code}</span>}
            </div>
            {a && (
              <div style={s.addressBox}>
                <strong>{a.name}</strong><br />
                {a.street}, {a.number}{a.complement ? ` — ${a.complement}` : ''}<br />
                {a.district} · {a.city}/{a.state} · CEP {a.cep.replace(/(\d{5})(\d{3})/, '$1-$2')}
              </div>
            )}
            {o.status === 'paid' && o.product.type === 'physical' && (
              <div style={s.shipRow}>
                <input
                  style={{ ...ui.input, flex: 1 }}
                  placeholder="Código de rastreio (opcional)"
                  value={tracking[o.id] || ''}
                  onChange={(e) => setTracking((t) => ({ ...t, [o.id]: e.target.value }))}
                />
                <button type="button" style={ui.btnPrimary} disabled={busyId === o.id} onClick={() => ship(o)}>
                  <TruckIcon size={14} /> {busyId === o.id ? 'Salvando…' : 'Marcar como enviado'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Configurações da loja ──────────────────────────────────────────────────
function StoreSettings({ api, store, onSaved }) {
  const [name, setName] = useState(store.name);
  const [description, setDescription] = useState(store.description);
  const [payout, setPayout] = useState(store.payout_info || '');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function save() {
    setBusy(true); setError(''); setMsg('');
    try {
      await api.put('/market/my-store', { name, description, payout_info: payout });
      setMsg('Salvo!');
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Não foi possível salvar'));
    } finally {
      setBusy(false);
    }
  }

  async function upload(kind, e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(kind); setError('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      await api.post(`/market/my-store/image/${kind}`, fd);
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Não foi possível enviar a imagem'));
    } finally {
      setUploading(null);
    }
  }

  return (
    <div style={{ ...ui.card, padding: 18, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 620 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <label style={ui.btnGhost}>
          <ImageIcon size={14} /> {uploading === 'logo' ? 'Enviando…' : 'Trocar logo'}
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => upload('logo', e)} />
        </label>
        <label style={ui.btnGhost}>
          <ImageIcon size={14} /> {uploading === 'banner' ? 'Enviando…' : 'Trocar banner'}
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => upload('banner', e)} />
        </label>
      </div>
      <div>
        <label style={ui.label}>Nome da loja</label>
        <input style={ui.input} value={name} maxLength={50} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label style={ui.label}>Sobre a loja</label>
        <textarea style={{ ...ui.input, resize: 'none', lineHeight: 1.5 }} rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label style={ui.label}>Chave Pix pra receber os repasses</label>
        <input style={ui.input} value={payout} maxLength={300} onChange={(e) => setPayout(e.target.value)} />
        <div style={s.fieldHint}>Só você e a equipe do SafeCord veem.</div>
      </div>
      {error && <div style={ui.error}>{error}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" style={ui.btnPrimary} disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</button>
        {msg && <span style={{ fontSize: 13, color: 'var(--success)' }}>{msg}</span>}
      </div>
    </div>
  );
}

const s = {
  hint: { color: 'var(--text-low)', fontSize: 13, padding: '24px 0', textAlign: 'center' },
  storeHeader: {
    display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', borderRadius: 20, marginBottom: 14,
    background: 'linear-gradient(120deg, color-mix(in srgb, var(--accent) 85%, #050A16), color-mix(in srgb, var(--accent) 35%, #0A1430))',
    backgroundSize: 'cover', backgroundPosition: 'center', color: '#fff',
  },
  storeName: { fontSize: 20, fontWeight: 750, letterSpacing: -0.3 },
  storeMeta: { fontSize: 12.5, opacity: 0.85, marginTop: 2 },
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 },
  tile: { ...ui.card, padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: 4 },
  tileAccent: { background: 'var(--accent)', borderColor: 'var(--accent)' },
  tileIcon: { width: 32, height: 32, borderRadius: 10, background: 'var(--bg-elevated)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  tileValue: { fontSize: 20, fontWeight: 800, color: 'var(--text-hi)', letterSpacing: -0.4 },
  tileLabel: { fontSize: 12, color: 'var(--text-low)' },
  feeNote: { fontSize: 12, color: 'var(--text-low)', lineHeight: 1.55, margin: '10px 2px 16px' },
  sectionTabs: { display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 14 },
  sectionTab: {
    border: 'none', background: 'transparent', color: 'var(--text-mid)', fontSize: 13.5, fontWeight: 600, padding: '10px 12px',
    borderBottom: '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1,
  },
  sectionTabActive: { color: 'var(--text-hi)', borderBottomColor: 'var(--accent)' },
  productList: { display: 'flex', flexDirection: 'column', gap: 8 },
  productRow: { ...ui.card, display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16 },
  productTitle: { fontSize: 14, fontWeight: 650, color: 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  productMeta: { fontSize: 12, color: 'var(--text-low)' },
  warnTag: { fontSize: 11, fontWeight: 650, color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 14%, transparent)', borderRadius: 999, padding: '3px 8px' },
  iconBtn: { width: 36, height: 36, borderRadius: 11, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-mid)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  empty: { ...ui.card, padding: '34px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 15.5, fontWeight: 700, color: 'var(--text-hi)' },
  emptyText: { fontSize: 13, color: 'var(--text-low)', marginTop: 4, maxWidth: 380, lineHeight: 1.5 },
  fieldHint: { fontSize: 12, color: 'var(--text-low)', marginTop: 6 },

  // abrir loja
  openWrap: { display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16, maxWidth: 980 },
  openPitch: {
    borderRadius: 22, padding: 26, color: '#fff',
    background: 'linear-gradient(140deg, color-mix(in srgb, var(--accent) 85%, #050A16), #0A1430)',
    border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
  },
  openIcon: { width: 60, height: 60, borderRadius: 20, background: 'rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  openTitle: { fontSize: 24, fontWeight: 800, letterSpacing: -0.6 },
  openText: { fontSize: 14, opacity: 0.85, lineHeight: 1.55, marginTop: 8 },
  steps: { display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 },
  step: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  stepNum: { width: 28, height: 28, borderRadius: 10, background: '#fff', color: '#0B1630', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13 },
  stepTitle: { fontSize: 14, fontWeight: 700 },
  stepText: { fontSize: 12.5, opacity: 0.8, lineHeight: 1.45, marginTop: 1 },
  openForm: { ...ui.card, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, borderRadius: 22 },

  // editor
  edHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '18px 18px 10px 22px' },
  edTitle: { fontSize: 18, fontWeight: 750, color: 'var(--text-hi)' },
  edSub: { fontSize: 12.5, color: 'var(--success)', marginTop: 3 },
  edBody: { padding: '6px 22px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 },
  edFooter: { display: 'flex', alignItems: 'center', gap: 8, padding: '14px 22px 18px', borderTop: '1px solid var(--border)' },
  typePick: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  typeCard: { display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, border: '2px solid var(--border)', background: 'var(--bg-base)', cursor: 'pointer', fontFamily: 'inherit' },
  typeCardActive: { border: '2px solid var(--accent)', background: 'var(--accent-softer)' },
  typeIcon: { width: 40, height: 40, borderRadius: 13, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  typeLabel: { fontSize: 14, fontWeight: 700, color: 'var(--text-hi)' },
  typeHint: { fontSize: 12, color: 'var(--text-low)', marginTop: 1 },
  photoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))', gap: 8 },
  photo: { position: 'relative', aspectRatio: '1 / 1' },
  photoRemove: { position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11, border: 'none', background: 'rgba(0,0,0,0.65)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  photoAdd: {
    aspectRatio: '1 / 1', borderRadius: 12, border: '2px dashed var(--border)', color: 'var(--text-low)', fontSize: 12, fontWeight: 600,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer',
  },
  fileBox: { display: 'flex', alignItems: 'center', gap: 12, ...ui.card, padding: 12, borderRadius: 14 },
  fileIcon: { width: 40, height: 40, borderRadius: 12, background: 'rgba(167,139,250,0.14)', color: '#A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  fileName: { fontSize: 13.5, fontWeight: 600, color: 'var(--text-hi)', wordBreak: 'break-all' },
  switchRow: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--text-hi)', cursor: 'pointer' },

  // pedidos
  filterRow: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  filterChip: { border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-mid)', fontSize: 12.5, fontWeight: 600, padding: '7px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit' },
  filterChipActive: { background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--text-hi)' },
  orderCard: { ...ui.card, padding: 14, marginBottom: 10, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  orderTop: { display: 'flex', alignItems: 'center', gap: 12 },
  orderValue: { fontSize: 16, fontWeight: 800, color: 'var(--text-hi)' },
  orderBottom: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  addressBox: { fontSize: 12.5, color: 'var(--text-mid)', lineHeight: 1.6, background: 'var(--bg-elevated)', borderRadius: 12, padding: '10px 12px' },
  shipRow: { display: 'flex', gap: 8, alignItems: 'center' },
};
