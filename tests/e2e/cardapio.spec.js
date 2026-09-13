const { test, expect } = require('@playwright/test');

async function openCardapio(page) {
  await page.goto('/cardapio.html');
  await expect(page.getByRole('heading', { name: /Mais Pedidas/i })).toBeVisible();
}

async function addProduct(page, name, times = 1) {
  const button = page.getByRole('button', { name: new RegExp(`^Adicionar ${name}$`, 'i') }).first();
  await button.click();

  if (times === 1) return;

  await page.getByRole('button', { name: 'Abrir sacola' }).click();
  const modal = page.locator('#modal-revisao');
  const increaseButton = modal.getByRole('button', { name: new RegExp(`^Aumentar ${name}$`, 'i') });
  for (let index = 1; index < times; index += 1) await increaseButton.click();
  await modal.getByRole('button', { name: 'Fechar sacola' }).click();
}

test.describe('Cardapio', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test('renderiza produtos, destaques e feedbacks', async ({ page }) => {
    await openCardapio(page);

    await expect(page.getByRole('heading', { name: 'Tradicionais' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Premium' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Doces' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /QUEM PROVOU/i })).toBeVisible();
    await expect(page.getByText('Frango com Catupiry').first()).toBeVisible();
    await expect(page.getByText('30% OFF')).toHaveCount(1);
  });

  test('filtra secoes do cardapio', async ({ page }) => {
    await openCardapio(page);

    await page.getByRole('button', { name: 'Doces' }).click();
    await expect(page.locator('#sec-doces')).toBeVisible();
    await expect(page.locator('#sec-tradicionais')).toBeHidden();
    await expect(page.locator('#sec-premium')).toBeHidden();

    await page.getByRole('button', { name: 'Todas' }).click();
    await expect(page.locator('#sec-doces')).toBeVisible();
    await expect(page.locator('#sec-tradicionais')).toBeVisible();
    await expect(page.locator('#sec-premium')).toBeVisible();
  });

  test('adiciona, ajusta e remove itens da sacola', async ({ page }) => {
    await openCardapio(page);

    await addProduct(page, 'Carne', 2);
    await expect(page.locator('#qtd-badge')).toHaveText('2');
    await expect(page.locator('#total-badge')).toHaveText('R$ 15,98');

    await page.getByRole('button', { name: 'Abrir sacola' }).click();
    await expect(page.getByRole('heading', { name: 'Sua sacola' })).toBeVisible();
    await expect(page.locator('#qtd-revisao')).toHaveText('2');
    await expect(page.locator('#discount-progress-label')).toHaveText('Faltam 4 esfihas');

    const modal = page.locator('#modal-revisao');

    await modal.getByRole('button', { name: 'Aumentar Carne' }).click();
    await expect(page.locator('#qtd-revisao')).toHaveText('3');

    await modal.getByRole('button', { name: 'Diminuir Carne' }).click();
    await expect(page.locator('#qtd-revisao')).toHaveText('2');

    await modal.getByRole('button', { name: 'Remover Carne' }).click();
    await expect(page.locator('#modal-revisao')).not.toBeVisible();
    await expect(page.locator('#qtd-badge')).toBeHidden();
  });

  test('libera aviso de desconto com 6 unidades', async ({ page }) => {
    await openCardapio(page);

    await addProduct(page, 'Carne', 6);
    await page.getByRole('button', { name: 'Abrir sacola' }).click();

    await expect(page.locator('#qtd-revisao')).toHaveText('6');
    await expect(page.locator('#discount-progress-label')).toHaveText('Desconto liberado!');
    await expect(page.locator('#discount-progress-dots .is-filled')).toHaveCount(6);
  });

  test('consulta taxa de entrega no WhatsApp', async ({ page }) => {
    await openCardapio(page);

    await addProduct(page, 'Carne');
    await page.getByRole('button', { name: 'Abrir sacola' }).click();

    const consult = page.getByRole('link', { name: /Consultar taxa de entrega/i });
    await expect(consult).toHaveAttribute('href', /wa\.me\/5564992186249/);
    await expect(consult).toHaveAttribute('href', /consultar%20a%20taxa%20de%20entrega/i);
  });

  test('envia pedido para WhatsApp e limpa sacola', async ({ page }) => {
    await openCardapio(page);

    const openedUrls = [];
    await page.exposeFunction('captureOpen', (url) => openedUrls.push(url));
    await page.evaluate(() => {
      window.open = (url) => {
        window.captureOpen(url);
        return null;
      };
    });

    await addProduct(page, 'Carne');
    await addProduct(page, 'Queijo');
    await page.getByRole('button', { name: 'Abrir sacola' }).click();
    await page.getByRole('button', { name: /ENVIAR AGORA/i }).click();

    expect(openedUrls).toHaveLength(1);
    expect(openedUrls[0]).toContain('https://wa.me/5564992186249?text=');
    expect(decodeURIComponent(openedUrls[0])).toContain('*1x* Carne');
    expect(decodeURIComponent(openedUrls[0])).toContain('*1x* Queijo');
    await expect(page.locator('#qtd-badge')).toBeHidden();
  });
});
