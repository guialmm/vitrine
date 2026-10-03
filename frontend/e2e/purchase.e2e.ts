import { expect, test } from "@playwright/test";

import { emailSubjects, linkFromEmail, sendStripeEvent } from "./helpers";

// One full customer journey on the real stack; only Stripe's hosted page is faked.
test("new customer signs up, confirms email, pays, and staff ships the order", async ({ page, request }) => {
  const email = `e2e+${Date.now()}@example.org`;
  const password = "senha-do-e2e-123";

  // Stripe Checkout is another site: stand in for it so the test stays offline.
  await page.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Stripe Checkout (mock)</h1>" }),
  );
  // The page leaves for Stripe right after /api/checkout answers, so record the
  // order id on the way through (the request still hits the real API).
  const orderIds: string[] = [];
  await page.route("**/api/checkout", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    orderIds.push(body.order_id);
    await route.fulfill({ response, json: body });
  });

  // 1. Sign up → logged in, but buying is blocked until the email is confirmed.
  await page.goto("/cadastro");
  await page.getByLabel("Nome").fill("Cliente E2E");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText("Confirme seu e-mail para poder comprar")).toBeVisible();

  // 2. Confirm through the link that actually arrived by email.
  await page.goto(await linkFromEmail(request, email, "Confirme seu e-mail"));
  await expect(page.getByRole("heading", { name: "E-mail confirmado" })).toBeVisible();
  await expect(page.getByText("Confirme seu e-mail para poder comprar")).toBeHidden();

  // 3. Filter the catalogue and add two bags to the cart.
  await page.goto("/cafes");
  await page.getByRole("button", { name: "Moídos" }).click();
  await expect(page).toHaveURL(/category=moidos/);
  await page.getByRole("link", { name: /Blend da Casa/ }).first().click();
  await page.getByRole("button", { name: "Aumentar" }).click();
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();
  await expect(page.getByRole("link", { name: "Carrinho, 2 itens" })).toBeVisible();

  // 4. Checkout → (mock) Stripe. Stock is reserved at this point.
  await page.goto("/carrinho");
  await expect(page.getByText("R$ 78,00").first()).toBeVisible();
  await page.getByRole("button", { name: "Ir para o pagamento" }).click();
  await expect(page.getByText("Stripe Checkout (mock)")).toBeVisible();
  const abandoned = orderIds.at(-1)!;

  // 5. Back out of Stripe: the store cancels that order and keeps the cart.
  await page.goto(`/carrinho?checkout=cancelado&pedido=${abandoned}`);
  await expect(page.getByText("Pagamento não concluído")).toBeVisible();
  await expect(page.getByText("Blend da Casa").first()).toBeVisible();

  // 6. Try again and "pay": Stripe would send this signed webhook.
  await page.getByRole("button", { name: "Ir para o pagamento" }).click();
  await expect(page.getByText("Stripe Checkout (mock)")).toBeVisible();
  const orderId = orderIds.at(-1)!;
  await sendStripeEvent(request, "checkout.session.completed", {
    metadata: { order_id: orderId },
    amount_total: 7800,
    payment_status: "paid",
    payment_intent: "pi_e2e",
    collected_information: {
      shipping_details: {
        name: "Cliente E2E",
        address: { line1: "Rua dos Cafezais, 100", city: "Varginha", state: "MG", postal_code: "37010000", country: "BR" },
      },
    },
  });

  // 7. Stripe's success redirect: paid, cart emptied, abandoned order hidden from the list.
  await page.goto(`/pedidos/${orderId}?checkout=sucesso`);
  await expect(page.getByText("Pagamento confirmado!")).toBeVisible();
  await expect(page.getByText("Rua dos Cafezais, 100")).toBeVisible();
  await expect(page.getByRole("link", { name: "Carrinho, 0 itens" })).toBeVisible();
  await page.goto("/pedidos");
  await expect(page.getByText(`#${orderId.slice(0, 8).toUpperCase()}`)).toBeVisible();
  await expect(page.getByText(`#${abandoned.slice(0, 8).toUpperCase()}`)).toBeHidden();

  // 8. A customer can't open the back-office…
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Acesso restrito" })).toBeVisible();

  // …but staff can, and ship the order.
  await page.locator("button[aria-expanded]").click(); // account menu
  await page.getByRole("button", { name: "Sair" }).click();
  await page.goto("/login?next=/admin");
  await page.getByLabel("E-mail").fill("admin@vitrine.dev");
  await page.getByLabel("Senha").fill("vitrine-admin"); // dev-only seed credentials
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  const row = page.getByRole("row", { name: new RegExp(orderId.slice(0, 8), "i") });
  await row.getByRole("button", { name: "Marcar como enviado" }).click();
  await page.getByRole("button", { name: "Enviados" }).click();
  const shipped = page.getByRole("row", { name: new RegExp(orderId.slice(0, 8), "i") });
  await expect(shipped).toContainText("Enviado");
  await expect.poll(() => emailSubjects(request, email)).toContain(`Pedido #${orderId.slice(0, 8)} enviado`);

  // 9. Admin refunds it: two clicks, the second one showing the amount.
  await shipped.getByRole("button", { name: "Reembolsar" }).click();
  await shipped.getByRole("button", { name: "Reembolsar R$ 78,00?" }).click();
  await page.getByRole("button", { name: "Reembolsados" }).click();
  await expect(page.getByRole("row", { name: new RegExp(orderId.slice(0, 8), "i") })).toContainText("Reembolsado");
  await expect.poll(() => emailSubjects(request, email)).toContain(`Reembolso do pedido #${orderId.slice(0, 8)}`);
});
