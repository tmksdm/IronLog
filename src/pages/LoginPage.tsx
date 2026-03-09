// src/pages/LoginPage.tsx

/**
 * Login page — email + password authentication via Supabase.
 * Shown when the user is not authenticated.
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError('Введи email и пароль');
      return;
    }

    setIsLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        // Translate common errors to Russian
        if (authError.message.includes('Invalid login credentials')) {
          setError('Неверный email или пароль');
        } else if (authError.message.includes('Email not confirmed')) {
          setError('Email не подтверждён');
        } else if (authError.message.includes('Too many requests')) {
          setError('Слишком много попыток, подожди немного');
        } else {
          setError(authError.message);
        }
        return;
      }

      onLoginSuccess();
    } catch (err) {
      console.error('Login error:', err);
      setError('Ошибка подключения к серверу');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] flex items-center justify-center px-6">
      <div className="w-full max-w-[340px]">
        {/* Logo / Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            IronLog
          </h1>
          <p className="text-[#707070] text-sm mt-2">Войди, чтобы продолжить</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoCapitalize="off"
              disabled={isLoading}
              className="w-full h-12 px-4 rounded-xl bg-[#1E1E1E] border border-[#333]
                text-white placeholder-[#555] text-base
                focus:outline-none focus:border-green-500
                disabled:opacity-50 transition-colors"
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={isLoading}
              className="w-full h-12 px-4 rounded-xl bg-[#1E1E1E] border border-[#333]
                text-white placeholder-[#555] text-base
                focus:outline-none focus:border-green-500
                disabled:opacity-50 transition-colors"
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="text-red-400 text-sm text-center px-2">
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 rounded-xl bg-green-600 text-white font-semibold text-base
              hover:bg-green-500 active:bg-green-700
              disabled:opacity-50 disabled:pointer-events-none
              transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Вход...
              </>
            ) : (
              'Войти'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
