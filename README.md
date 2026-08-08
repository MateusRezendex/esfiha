# Esfiha

Site estático (HTML + imagens) com `index.html` e `cardapio.html`.

## Como abrir

- Abra `index.html` no navegador.

## Analytics

O site carrega `js/analytics.js` em `index.html` e `cardapio.html`.

Em desenvolvimento local, o tracker não envia eventos se nenhum endpoint for
configurado. Para testar o envio, defina explicitamente:

```text
http://localhost:3000/api/analytics/events
```

Em producao, configure a URL publica do backend antes de publicar:

```html
<script>
  window.SQV_ANALYTICS_ENDPOINT = "https://api.seudominio.com/api/analytics/events";
</script>
<script src="./js/analytics.js"></script>
```

Eventos principais: `page_view`, `product_impression`, `product_view`,
`add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`,
`checkout_submit`, `whatsapp_click`, `instagram_click`, `category_click` e
`cart_abandoned_signal`.

