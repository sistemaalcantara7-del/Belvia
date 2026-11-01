'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { requestPasswordResetAction } from '@/lib/actions/auth';
import { MailCheck, ArrowLeft, KeyRound } from 'lucide-react';

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessInfo(null);
    setLoading(true);

    const result = await requestPasswordResetAction(email);

    if (result?.error) {
      setErrorMessage(result.error);
    } else if (result?.message) {
      setSuccessInfo(result.message);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#FAF6F4]">
      <Card className="w-full max-w-[460px] bg-white rounded-3xl shadow-xl border border-[#EAD9D3]/70 overflow-hidden">
        <CardHeader className="text-center pt-8 pb-4">
          <Link href="/" className="inline-flex justify-center mb-4 group">
            <Image
              src="/img/logoz.png"
              alt="ZELUNIA"
              width={220}
              height={140}
              priority
              className="w-auto h-20 md:h-24 object-contain transition-transform group-hover:scale-[1.02]"
            />
          </Link>
          <CardTitle className="text-2xl font-serif text-[#2C1810] font-normal">
            Recuperar Senha
          </CardTitle>
          <CardDescription className="text-xs text-[#7D6B65] mt-1">
            Digite seu e-mail cadastrado para receber as instruções seguras de redefinição
          </CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-8 pt-2">
          {successInfo ? (
            <div className="space-y-4 text-center py-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-[#FAF0ED] flex items-center justify-center text-[#C4837A] border border-[#EAD9D3]">
                <MailCheck className="w-6 h-6" />
              </div>
              <h4 className="font-serif text-lg text-[#2C1810]">E-mail Enviado</h4>
              <p className="text-xs text-[#6B5A54] leading-relaxed">
                {successInfo}
              </p>
              <div className="pt-2">
                <Link href="/login">
                  <Button className="w-full" style={{ backgroundColor: 'var(--belvia-rose)' }}>
                    Voltar para o Login
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMessage && (
                <div className="p-3 text-xs rounded-xl bg-red-50 border border-red-200 text-red-700">
                  {errorMessage}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-xs font-medium text-[#2C1810]">
                  E-mail da sua conta
                </label>
                <div className="relative">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="exemplo@clinica.com.br"
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-white border border-[#EAD9D3] text-[#2C1810] placeholder-[#B5A49E] focus:outline-none focus:border-[#C4837A] transition-all"
                  />
                </div>
              </div>

              <div className="pt-2 space-y-3">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 text-xs font-semibold rounded-xl text-white shadow-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ backgroundColor: 'var(--belvia-rose)' }}
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{loading ? 'Enviando...' : 'Enviar Link de Redefinição'}</span>
                </Button>

                <div className="text-center pt-2">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1.5 text-xs text-[#7D6B65] hover:text-[#2C1810] transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Lembrou da senha? Voltar para o Login</span>
                  </Link>
                </div>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
