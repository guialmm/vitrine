import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createBrowserRouter } from "react-router";

import { Layout } from "./components/Layout";
import { AuthProvider } from "./features/auth/AuthProvider";
import { RequireAuth } from "./features/auth/RequireAuth";
import { CartProvider } from "./features/cart/CartProvider";
import { ApiError } from "./lib/api";
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterDonePage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from "./pages/AuthPages";
import { CartPage } from "./pages/CartPage";
import { CatalogPage } from "./pages/CatalogPage";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OrderPage, OrdersPage } from "./pages/OrdersPages";
import { ProductPage } from "./pages/ProductPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't hammer the API on 4xx: those won't fix themselves on retry.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "cafes", element: <CatalogPage /> },
      { path: "cafes/:slug", element: <ProductPage /> },
      { path: "carrinho", element: <CartPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "cadastro", element: <RegisterPage /> },
      { path: "cadastro/confirmar", element: <RegisterDonePage /> },
      { path: "verificar-email", element: <VerifyEmailPage /> },
      { path: "esqueci-senha", element: <ForgotPasswordPage /> },
      { path: "redefinir-senha", element: <ResetPasswordPage /> },
      { path: "pedidos", element: <RequireAuth><OrdersPage /></RequireAuth> },
      { path: "pedidos/:id", element: <RequireAuth><OrderPage /></RequireAuth> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <RouterProvider router={router} />
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
