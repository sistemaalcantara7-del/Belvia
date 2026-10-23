'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { registerTenantAction } from '@/lib/actions/auth';
import { MailCheck } from 'lucide-react';

export default function RegisterPage() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessInfo(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const result = await registerTenantAction(formData);

    if (result?.error) {
      setErrorMessage(result.error);
      setLoading(false);
    } else if (result?.emailConfirmationRequired && result?.message) {
      setSuccessInfo(result.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/" className="inline-block mb-2">
            <span className="text-2xl font-bold bg-gradient-to-r from-rose-600 to-amber-600 bg-clip-text text-transparent">
              BELVIA
            </span>
          </Link>
          <CardTitle className="text-xl">Cadastrar Clínica</CardTitle>
          <CardDescription>
            Crie sua conta multi-tenant e inicie a gestão do seu espaço
          </CardDescription>
        </CardHeader>
        <CardContent>
          {successInfo ? (
            <div className="space-y-4 text-center py-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <MailCheck className="w-6 h-6" />
              </div>
              <h4 className="font-semibold text-lg">Confirmação de E-mail Enviada</h4>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {successInfo}
              </p>
              <div className="pt-2">
                <Link href="/login">
                  <Button variant="outline" className="w-full">
                    Ir para Login
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMessage && (
                <div className="p-3 text-xs rounded bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
                  {errorMessage}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="clinicName">
                  Nome da Clínica ou Estúdio
                </label>
                <input
                  id="clinicName"
                  name="clinicName"
                  type="text"
                  placeholder="Ex: Studio Bella Estética"
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="fullName">
                  Seu Nome Completo
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  placeholder="Ex: Dra. Mariana Silva"
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="email">
                  E-mail Profissional
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="mariana@studiobella.com.br"
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="password">
                  Senha
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="plan">
                  Plano Selecionado
                </label>
                <select
                  id="plan"
                  name="plan"
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="essential">Essencial (R$ 59,90/mês)</option>
                  <option value="smart">Inteligente (R$ 99,90/mês)</option>
                </select>
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Cadastrando...' : 'Criar Conta da Clínica'}
              </Button>
            </form>
          )}
          <div className="mt-4 text-center text-xs text-zinc-500">
            Já possui uma conta?{' '}
            <Link href="/login" className="text-rose-600 hover:underline font-medium">
              Fazer Login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
