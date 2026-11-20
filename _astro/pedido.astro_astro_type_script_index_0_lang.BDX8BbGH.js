import{r as e}from"./catalog.vS6gGGV0.js";import{a as t,i as n,o as r,r as i,s as a}from"./cart.CO6tjIz8.js";function o(e){return e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`)}function s(e,t){let n=e[t.productId];return n?.variants?.[t.flavorId]||n?.image||`/placeholder.svg`}function c(e){return e&&e!==`Único`?e:``}function l(){let r=document.querySelector(`[data-order]`),a=r?.querySelector(`[data-order-body]`);if(!r||!a)return;let l=JSON.parse(r.dataset.photos||`{}`),u=r.dataset.phone??``,d=t();if(!d.length){a.innerHTML=`
        <div class="rounded-3xl border border-line bg-panel p-6">
          <p class="text-lg font-semibold">Tu pedido está vacío.</p>
          <a href="/#catalogo" class="mt-4 inline-flex font-semibold text-acid hover:text-paper">Ver productos</a>
        </div>`;return}let f=n(d);a.innerHTML=`
      <div class="grid gap-3">${d.map(t=>{let n=c(t.flavorName),r=o(s(l,t)),i=o(t.productId),a=o(t.flavorId);return`
          <article class="flex gap-4 rounded-3xl border border-line bg-panel p-4">
            <img src="${r}" alt="" width="96" height="96" class="h-24 w-24 shrink-0 rounded-2xl bg-raised object-contain p-2" />
            <div class="min-w-0 flex-1">
              <h2 class="font-bold leading-snug">${o(t.name)}</h2>
              ${n?`<p class="mt-1 text-sm text-fog">${o(n)}</p>`:``}
              <p class="mt-2 font-extrabold text-acid">${e(t.transferPrice)}</p>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" data-qty="-1" data-product="${i}" data-flavor="${a}" class="h-9 w-9 rounded-full border border-line font-bold hover:border-acid" aria-label="Bajar cantidad">−</button>
                <span class="min-w-6 text-center font-bold">${t.quantity}</span>
                <button type="button" data-qty="1" data-product="${i}" data-flavor="${a}" class="h-9 w-9 rounded-full border border-line font-bold hover:border-acid" aria-label="Subir cantidad">+</button>
                <button type="button" data-remove data-product="${i}" data-flavor="${a}" class="ml-auto text-sm font-semibold text-fog hover:text-warn">Quitar</button>
              </div>
            </div>
          </article>`}).join(``)}</div>
      <div class="mt-6 rounded-3xl border border-line bg-panel p-6">
        <p class="font-extrabold text-4xl text-acid">${e(f.transferPrice)}</p>
        <p class="mt-1 text-sm uppercase tracking-[0.14em] text-fog">Total transferencia o efectivo</p>
        <p class="mt-3 text-paper/60">Total de lista ${e(f.price)}</p>
        <a data-order-wa href="${o(i(u,d))}" target="_blank" rel="noopener noreferrer" class="mt-6 inline-flex w-full items-center justify-center rounded-full bg-acid px-5 py-3 text-sm font-extrabold uppercase tracking-[0.12em] text-ink transition hover:bg-paper">Enviar pedido por WhatsApp</a>
        <p class="mt-3 text-xs text-fog">Te respondemos por WhatsApp para coordinar el pago y la entrega.</p>
      </div>`}document.addEventListener(`astro:page-load`,()=>{let e=document.querySelector(`[data-order]`);e&&e.dataset.bound!==`1`&&(e.dataset.bound=`1`,l(),e.addEventListener(`click`,e=>{let n=e.target?.closest(`[data-qty], [data-remove]`);if(!n)return;let i=n.dataset.product??``,o=n.dataset.flavor??``;if(n.hasAttribute(`data-remove`)){r(i,o);return}let s=Number(n.dataset.qty),c=t().find(e=>e.productId===i&&e.flavorId===o);!c||!Number.isFinite(s)||c.quantity+s<1||a(i,o,c.quantity+s)}))}),document.addEventListener(`sasu-order`,l);