import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";

import { Alert, Button, Field, Spinner, buttonClass } from "../components/ui";
import { useAuth } from "../features/auth/AuthProvider";
import { ApiError, api } from "../lib/api";

// Set only on the public demo build (see frontend/.env.example).
const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL as string | undefined;
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD as string | undefined;

/** Only same-site paths, so `?next=` can't be abused as an open redirect. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-sm px-4 py-16 sm:py-24">
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-text-dim">{subtitle}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}

function errorText(err: unknown, map: Record<number, string> = {}) {
  if (err instanceof ApiError && err.status === 429) {
    const minutes = err.message.match(/(\d+) min/)?.[1];
    return `Muitas tentativas. Tente de novo em ${minutes ? `${minutes} min` : "alguns minutos"}.`;
  }
  if (err instanceof ApiError) return map[err.status] ?? err.message;
  return "Algo deu errado. Tente novamente.";
}

export function LoginPage() {
  const { login, user, ready } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: (c: { email: string; password: string }) => login(c.email, c.password),
    onSuccess: () => navigate(next, { replace: true }),
  });

  if (ready && user && !mutation.isSuccess) return <Navigate to={next} replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({ email, password });
  };

  const demo = DEMO_EMAIL && DEMO_PASSWORD ? { email: DEMO_EMAIL, password: DEMO_PASSWORD } : null;

  return (
    <AuthCard
      title="Entrar"
      subtitle={
        <>
          Não tem conta?{" "}
          <Link to={`/cadastro${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-accent hover:underline">
            Criar conta
          </Link>
        </>
      }
    >
      {demo && (
        <div className="mb-6 rounded-md border border-border-strong bg-bg-elev p-4 text-sm">
          <p className="font-semibold">Só quer testar a loja?</p>
          <p className="mt-1 text-text-dim">
            Use a conta demo — já verificada. No pagamento, cartão <span className="whitespace-nowrap font-mono">4242 4242 4242 4242</span>.
          </p>
          <Button
            variant="outline"
            className="mt-3 w-full"
            onClick={() => mutation.mutate(demo)}
            loading={mutation.isPending && mutation.variables?.email === demo.email}
          >
            Entrar com a conta demo
          </Button>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Field label="E-mail">
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha">
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {mutation.error && <Alert>{errorText(mutation.error, { 401: "E-mail ou senha incorretos." })}</Alert>}
        <Button type="submit" className="w-full py-3" loading={mutation.isPending}>
          Entrar
        </Button>
        <p className="text-center text-sm">
          <Link to="/esqueci-senha" className="text-text-dim hover:text-text hover:underline">
            Esqueci minha senha
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { register, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const mutation = useMutation({
    mutationFn: async () => {
      await register(form);
      // Sign straight in: the account works right away, only buying needs a verified email.
      await login(form.email, form.password);
    },
    onSuccess: () => navigate(next === "/" ? "/cadastro/confirmar" : next, { replace: true }),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AuthCard
      title="Criar conta"
      subtitle={
        <>
          Já tem conta?{" "}
          <Link to={`/login${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-accent hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="space-y-4"
      >
        <Field label="Nome">
          <input className="input" autoComplete="name" required minLength={2} value={form.full_name} onChange={set("full_name")} />
        </Field>
        <Field label="E-mail">
          <input className="input" type="email" autoComplete="email" required value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Senha" error={form.password && form.password.length < 8 ? "Mínimo de 8 caracteres." : undefined}>
          <input className="input" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={set("password")} />
        </Field>
        {mutation.error && <Alert>{errorText(mutation.error, { 409: "Já existe uma conta com esse e-mail." })}</Alert>}
        <Button type="submit" className="w-full py-3" loading={mutation.isPending}>
          Criar conta
        </Button>
      </form>
    </AuthCard>
  );
}

export function RegisterDonePage() {
  const { user } = useAuth();
  return (
    <AuthCard title="Confira seu e-mail">
      <p className="text-text-dim">
        Enviamos um link de confirmação para <strong className="text-text">{user?.email ?? "o seu e-mail"}</strong>. Você já
        pode navegar; para comprar, é só confirmar o e-mail.
      </p>
      <Link to="/cafes" className={buttonClass("primary", "mt-8")}>
        Ver cafés
      </Link>
      <p className="mt-6 text-sm text-text-muted">
        Rodando localmente? Os e-mails caem no Mailpit:{" "}
        <a href="http://localhost:8025" target="_blank" rel="noreferrer" className="underline">
          localhost:8025
        </a>
      </p>
    </AuthCard>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { user, ready, reloadUser } = useAuth();
  const mutation = useMutation({
    mutationFn: () => api("/auth/verify-email", { method: "POST", body: { token } }),
    onSuccess: () => user && reloadUser(),
  });
  const sent = useRef(false);
  useEffect(() => {
    // Wait for the cookie-based session restore: links are opened in a fresh
    // tab, and verifying first would leave the logged-in user's banner stale.
    if (token && ready && !sent.current) {
      sent.current = true; // StrictMode runs effects twice in dev
      mutation.mutate();
    }
  }, [token, ready, mutation]);

  if (!token || mutation.isError) {
    return (
      <AuthCard title="Link inválido">
        <p className="text-text-dim">O link expirou ou já foi usado. Entre na sua conta e peça um novo pelo aviso no topo da página.</p>
        <Link to="/login" className={buttonClass("outline", "mt-8")}>
          Entrar
        </Link>
      </AuthCard>
    );
  }
  if (!mutation.isSuccess) {
    return (
      <AuthCard title="Confirmando…">
        <Spinner className="size-6 text-text-dim" />
      </AuthCard>
    );
  }
  return (
    <AuthCard title="E-mail confirmado">
      <p className="text-text-dim">Pronto! Sua conta está liberada para compras.</p>
      <Link to={user ? "/cafes" : "/login"} className={buttonClass("primary", "mt-8")}>
        {user ? "Ver cafés" : "Entrar"}
      </Link>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const mutation = useMutation({
    mutationFn: () => api("/auth/forgot-password", { method: "POST", body: { email } }),
  });

  if (mutation.isSuccess) {
    return (
      <AuthCard title="Confira seu e-mail">
        <p className="text-text-dim">
          Se existir uma conta com <strong className="text-text">{email}</strong>, você vai receber um link para criar uma
          nova senha. O link vale por 24 horas.
        </p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Esqueci minha senha" subtitle="Informe seu e-mail e enviaremos um link para criar uma nova senha.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="space-y-4"
      >
        <Field label="E-mail">
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {mutation.error && <Alert>{errorText(mutation.error)}</Alert>}
        <Button type="submit" className="w-full py-3" loading={mutation.isPending}>
          Enviar link
        </Button>
      </form>
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mutation = useMutation({
    mutationFn: () => api("/auth/reset-password", { method: "POST", body: { token, password } }),
  });
  const mismatch = confirm.length > 0 && confirm !== password;

  if (mutation.isSuccess) {
    return (
      <AuthCard title="Senha alterada">
        <p className="text-text-dim">Por segurança, encerramos todas as sessões abertas. Entre com a nova senha.</p>
        <Link to="/login" className={buttonClass("primary", "mt-8")}>
          Entrar
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Nova senha">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!mismatch) mutation.mutate();
        }}
        className="space-y-4"
      >
        <Field label="Nova senha" error={password && password.length < 8 ? "Mínimo de 8 caracteres." : undefined}>
          <input className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Repita a senha" error={mismatch ? "As senhas não coincidem." : undefined}>
          <input className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {mutation.error && (
          <Alert>{errorText(mutation.error, { 400: "Esse link expirou ou já foi usado. Peça um novo em “Esqueci minha senha”." })}</Alert>
        )}
        <Button type="submit" className="w-full py-3" loading={mutation.isPending} disabled={!token || mismatch}>
          Salvar nova senha
        </Button>
      </form>
    </AuthCard>
  );
}
