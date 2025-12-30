'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, Loader2, CloudUpload } from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    // Check if already authenticated
    if (api.isAuthenticated()) {
      router.replace('/dashboard');
    } else {
      setCheckingAuth(false);
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      toast.error('Please enter username and password');
      return;
    }

    setLoading(true);

    try {
      const response = await api.login(username, password);

      if (response.success) {
        toast.success('Login successful');
        router.push('/dashboard');
      } else {
        toast.error(response.error || 'Login failed');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <Loader2 className="w-8 h-8 text-neon-cyan animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-900 p-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-neon-cyan/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-neon-purple/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl
                         bg-gradient-to-br from-dark-700 to-dark-800 border border-dark-600
                         shadow-neon-cyan mb-4">
            <CloudUpload className="w-10 h-10 text-neon-cyan" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">My CDN</h1>
          <p className="text-gray-500">Personal File Hosting</p>
        </div>

        {/* Login Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-dark-800 rounded-2xl border border-dark-600 p-8 shadow-2xl"
        >
          <h2 className="text-xl font-semibold text-white mb-6">Admin Login</h2>

          <div className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full pl-11 pr-4 py-3 bg-dark-700 border border-dark-500 rounded-xl
                           text-white placeholder-gray-500 font-mono
                           focus:outline-none focus:border-neon-cyan focus:ring-1 focus:ring-neon-cyan/30
                           transition-all duration-200"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full pl-11 pr-4 py-3 bg-dark-700 border border-dark-500 rounded-xl
                           text-white placeholder-gray-500 font-mono
                           focus:outline-none focus:border-neon-cyan focus:ring-1 focus:ring-neon-cyan/30
                           transition-all duration-200"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 py-3 px-4 bg-neon-cyan text-dark-900 font-bold rounded-xl
                     hover:bg-neon-cyan-dim disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-200 hover:shadow-neon-cyan
                     flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-gray-600 text-sm mt-6 font-mono">
          Powered by Cloudflare Workers + R2
        </p>
      </div>
    </div>
  );
}
