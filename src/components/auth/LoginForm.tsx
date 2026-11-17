import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { Branch } from '../../types';
import { INITIAL_BRANCHES } from '../../constants/branches';
import { SaccoLogo } from '../common/SaccoLogo';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { RefreshCw, Eye, EyeOff, WifiOff } from 'lucide-react';

interface LoginFormProps {
  onOpenSetupAdmin?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = () => {
  const { login } = useAuth();

  // Helper to ensure Kamubeizi is first/top in the branch dropdown where required
  const orderBranches = (branches: Branch[]): Branch[] => {
    const kamubeizi = branches.find(b => b.code === 'KAMUBEIZI' || b.name.toLowerCase().includes('kamubeizi'));
    if (!kamubeizi) return branches;
    return [kamubeizi, ...branches.filter(b => b.id !== kamubeizi.id)];
  };

  const isOnline = useOnlineStatus();
  const [allBranches, setAllBranches] = useState<Branch[]>(() => orderBranches(INITIAL_BRANCHES));
  const [selectedBranchId, setSelectedBranchId] = useState<string>('br-nyamuyanja');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Load latest branches from server while already having immediate initial branches
  useEffect(() => {
    async function loadBranches() {
      try {
        const res = await apiClient.getBranches();
        if (res.success && res.data.length > 0) {
          const ordered = orderBranches(res.data);
          setAllBranches(ordered);
          setSelectedBranchId((prev) => {
            if (ordered.some((b) => b.id === prev)) return prev;
            const nyamuyanja = ordered.find(
              (b) => b.code === 'NYAMUYANJA' || b.name.toLowerCase().includes('nyamuyanja')
            );
            return nyamuyanja ? nyamuyanja.id : ordered[0].id;
          });
        }
      } catch (err) {
        console.error('Failed to refresh branches from server:', err);
      }
    }
    loadBranches();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanUser = username.trim();
    if (!cleanUser) {
      setErrorMessage('Please enter your username.');
      return;
    }

    if (cleanUser.length < 4 || cleanUser.length > 10) {
      setErrorMessage('Username must be between 4 and 10 characters.');
      return;
    }

    if (!selectedBranchId) {
      setErrorMessage('Please select your branch.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await login(selectedBranchId, cleanUser, password);
      if (!result.success) {
        setErrorMessage(result.message || 'Authentication failed. Please verify credentials.');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '';
      const lower = errMsg.toLowerCase();
      if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
        setErrorMessage('Unable to connect to authentication server. Please verify network connection.');
      } else if (errMsg.includes('404')) {
        setErrorMessage('Authentication service endpoint not found (HTTP 404). Please contact administrator.');
      } else {
        setErrorMessage(errMsg || 'An unexpected error occurred during login. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f4f6f8] flex flex-col items-center justify-center p-4 sm:p-6">
      {/* PROFESSIONAL INSTITUTIONAL LOGIN CARD: ~420px max width, clean and minimal */}
      <div className="w-full max-w-[420px] bg-white rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-slate-100 px-6 py-8 sm:px-9 sm:py-9 flex flex-col items-center">
        
        {/* SACCO LOGO: Centered */}
        <div className="mb-4 flex justify-center">
          <SaccoLogo size="lg" className="justify-center" />
        </div>

        {/* TITLE: "TURIHAMWE" in dark navy */}
        <h1 className="text-[20px] font-semibold text-[#0f2744] text-center tracking-tight mb-1">
          TURIHAMWE
        </h1>
        <p className="text-xs text-slate-500 font-medium tracking-wide uppercase mb-6 text-center">
          Nyamuyanja SACCO Ltd
        </p>

        {!isOnline && (
          <div className="w-full mb-4 p-2.5 rounded-[8px] bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center justify-center gap-2 font-medium">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            <span>Internet offline — new server sign-in requires connectivity.</span>
          </div>
        )}

        {/* Error message banner */}
        {errorMessage && (
          <div className="w-full mb-5 p-3 rounded-[8px] bg-red-50 border border-red-200 text-red-700 text-xs text-center font-medium leading-relaxed">
            {errorMessage}
          </div>
        )}

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="w-full space-y-4">
          
          {/* BRANCH: Centered label, full width selector, 44px height, rounded-[8px] */}
          <div>
            <label
              htmlFor="branch"
              className="block text-center text-xs font-medium text-slate-700 uppercase tracking-wider mb-1.5"
            >
              Branch
            </label>
            <div className="relative w-full">
              <select
                id="branch"
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                required
                className="w-full h-[44px] px-3.5 pr-9 bg-[#f4f5f7] hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-600 rounded-[8px] text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer appearance-none transition-colors"
              >
                <option value="">
                  Select branch
                </option>
                {allBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
              {/* Dropdown chevron on the right */}
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500">
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* USERNAME: Centered label, plain username input, 44px height, rounded-[8px] */}
          <div>
            <label
              htmlFor="username"
              className="block text-center text-xs font-medium text-slate-700 uppercase tracking-wider mb-1.5"
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              minLength={4}
              maxLength={10}
              value={username}
              onChange={(e) => setUsername(e.target.value.trim())}
              placeholder="Enter username"
              autoComplete="username"
              required
              className="w-full h-[44px] px-3.5 bg-[#f4f5f7] hover:bg-white focus:bg-white border border-slate-200 rounded-[8px] text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-colors"
            />
          </div>

          {/* PASSWORD: Centered label, full width input with show/hide password toggle, 44px height, rounded-[8px] */}
          <div>
            <label
              htmlFor="password"
              className="block text-center text-xs font-medium text-slate-700 uppercase tracking-wider mb-1.5"
            >
              Password
            </label>
            <div className="relative w-full">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
                className="w-full h-[44px] pl-3.5 pr-10 bg-[#f4f5f7] hover:bg-white focus:bg-white border border-slate-200 rounded-[8px] text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 cursor-pointer focus:outline-none"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* LOGIN BUTTON: Centered, primary blue, 42px high, rounded-[10px] */}
          <div className="pt-2 flex justify-center">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full sm:w-[130px] h-[42px] bg-[#1a44b8] hover:bg-[#153896] text-white font-semibold text-sm rounded-[10px] flex items-center justify-center transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" />
                  <span>Signing in...</span>
                </>
              ) : (
                'Login'
              )}
            </button>
          </div>
        </form>

        {/* INSTITUTIONAL HELP MESSAGE: Centered, medium slate-gray */}
        <p className="mt-5 text-center text-[13px] text-[#556987] leading-relaxed max-w-[320px]">
          Cannot sign in? Contact an authorised administrator.
        </p>

        {/* PWA Installation Entry Point */}
        <div className="mt-4 pt-4 border-t border-slate-100 w-full flex justify-center">
          <PWAInstallButton variant="login" />
        </div>
      </div>
    </div>
  );
};
