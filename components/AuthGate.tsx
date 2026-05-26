"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import Image from "next/image";
import { Lock, User, Eye, EyeOff, ArrowRight, ShieldCheck, Fingerprint } from "lucide-react";

const AUTH_KEY = "mi_auth";
const BIOMETRIC_KEY = "mi_biometric_cred";
const VALID_USER = "LBF";
const VALID_PASS = "1015";

const RP_NAME = "Meus Investimentos";
const USER_ID = new Uint8Array([1, 2, 3, 4]);
const USER_NAME = "LBF";

function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function randomChallenge(): Uint8Array {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return arr;
}

async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function getStoredCredentialId(): string | null {
  try {
    return localStorage.getItem(BIOMETRIC_KEY);
  } catch {
    return null;
  }
}

async function registerBiometric(): Promise<boolean> {
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge().buffer as ArrayBuffer,
        rp: { name: RP_NAME },
        user: {
          id: USER_ID.buffer as ArrayBuffer,
          name: USER_NAME,
          displayName: USER_NAME,
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },
          { alg: -257, type: "public-key" },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (credential) {
      localStorage.setItem(BIOMETRIC_KEY, bufferToBase64(credential.rawId));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function authenticateWithBiometric(): Promise<boolean> {
  const credId = getStoredCredentialId();
  if (!credId) return false;

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge().buffer as ArrayBuffer,
        allowCredentials: [
          {
            id: base64ToBuffer(credId).buffer as ArrayBuffer,
            type: "public-key",
            transports: ["internal"],
          },
        ],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioRegistered, setBioRegistered] = useState(false);
  const [showBioPrompt, setShowBioPrompt] = useState(false);
  const [bioAuthenticating, setBioAuthenticating] = useState(false);

  useEffect(() => {
    const init = async () => {
      const isAuthed = sessionStorage.getItem(AUTH_KEY) === "1";
      setAuthed(isAuthed);

      const available = await isBiometricAvailable();
      setBioAvailable(available);

      const registered = !!getStoredCredentialId();
      setBioRegistered(registered);

      setMounted(true);

      if (available && registered && !isAuthed) {
        handleBiometricLogin();
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBiometricLogin = useCallback(async () => {
    setBioAuthenticating(true);
    setError("");
    const success = await authenticateWithBiometric();
    if (success) {
      sessionStorage.setItem(AUTH_KEY, "1");
      setAuthed(true);
    } else {
      setError("Biometria falhou. Use usuário e senha.");
    }
    setBioAuthenticating(false);
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    setTimeout(() => {
      if (user.trim().toUpperCase() === VALID_USER && pass === VALID_PASS) {
        sessionStorage.setItem(AUTH_KEY, "1");
        setAuthed(true);

        if (bioAvailable && !bioRegistered) {
          setShowBioPrompt(true);
        }
      } else {
        setError("Usuário ou senha incorretos.");
        setPass("");
      }
      setSubmitting(false);
    }, 350);
  }

  async function handleEnableBiometric() {
    const success = await registerBiometric();
    if (success) {
      setBioRegistered(true);
    }
    setShowBioPrompt(false);
  }

  if (!mounted) return null;

  // Biometric registration prompt after successful password login
  if (showBioPrompt) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 overflow-hidden">
        <div className="absolute inset-0" style={{ background: "#0D0E11" }} />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 35%, rgba(212,165,116,0.10) 0%, transparent 60%)",
          }}
        />
        <div className="relative z-10 w-full max-w-sm animate-fade-in">
          <div
            className="rounded-2xl p-px"
            style={{
              background:
                "linear-gradient(145deg, rgba(212,165,116,0.35) 0%, rgba(212,165,116,0.08) 50%, rgba(212,165,116,0.22) 100%)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
            }}
          >
            <div
              className="rounded-[calc(1rem-1px)] p-6 backdrop-blur-xl text-center"
              style={{ background: "rgba(17,18,24,0.92)" }}
            >
              <div
                className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: "rgba(212,165,116,0.12)" }}
              >
                <Fingerprint size={32} className="text-[#d4a574]" />
              </div>
              <h2 className="text-lg font-semibold text-zinc-100 mb-2">
                Ativar Face ID / Biometria?
              </h2>
              <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                Use Face ID ou impressão digital para entrar mais rápido nas próximas vezes.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBioPrompt(false)}
                  className="flex-1 rounded-xl py-2.5 text-sm font-medium text-zinc-400 border border-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  Agora não
                </button>
                <button
                  onClick={handleEnableBiometric}
                  className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-zinc-900 transition-all hover:brightness-110"
                  style={{
                    background:
                      "linear-gradient(135deg, #f5d49a 0%, #d4a574 50%, #c49060 100%)",
                    boxShadow: "0 4px 20px rgba(212,165,116,0.25)",
                  }}
                >
                  Ativar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (authed) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0" style={{ background: "#0D0E11" }} />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, rgba(212,165,116,0.10) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(20,184,166,0.06) 0%, transparent 55%)",
        }}
      />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-sm animate-fade-in">
        {/* Logo + brand */}
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/midias/carregamento.png"
            alt="Meus Investimentos"
            width={120}
            height={120}
            className="h-20 w-auto mb-5"
            priority
          />
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{
              background: "linear-gradient(135deg, #d4a574 0%, #f5d49a 50%, #c49060 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Meus Investimentos
          </h1>
          <p className="text-[11px] text-zinc-600 mt-1.5 tracking-widest uppercase">
            Painel Financeiro Pessoal
          </p>
        </div>

        {/* Biometric quick login */}
        {bioAvailable && bioRegistered && (
          <div className="mb-5">
            <button
              onClick={handleBiometricLogin}
              disabled={bioAuthenticating}
              className="w-full flex items-center justify-center gap-3 rounded-2xl py-4 text-sm font-semibold text-zinc-100 transition-all duration-200 hover:bg-white/[0.06] disabled:opacity-50 border border-zinc-800 hover:border-[#d4a574]/30"
              style={{ background: "rgba(212,165,116,0.06)" }}
            >
              <Fingerprint size={22} className="text-[#d4a574]" />
              {bioAuthenticating ? "Verificando…" : "Entrar com Face ID"}
            </button>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-[10px] text-zinc-600 uppercase tracking-widest">ou</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>
          </div>
        )}

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-px"
          style={{
            background:
              "linear-gradient(145deg, rgba(212,165,116,0.35) 0%, rgba(212,165,116,0.08) 50%, rgba(212,165,116,0.22) 100%)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          }}
        >
          <div
            className="rounded-[calc(1rem-1px)] p-6 backdrop-blur-xl"
            style={{ background: "rgba(17,18,24,0.92)" }}
          >
            <div className="flex items-center gap-2 mb-5">
              <ShieldCheck size={15} className="text-[#d4a574]" />
              <span className="text-sm font-semibold text-zinc-200">Acesso restrito</span>
            </div>

            {/* Usuário */}
            <label className="block mb-3.5">
              <span className="text-[11px] text-zinc-500 font-medium mb-1.5 block uppercase tracking-wide">
                Usuário
              </span>
              <div className="relative">
                <User
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
                />
                <input
                  type="text"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="characters"
                  placeholder="Seu usuário"
                  className="w-full bg-white/[0.03] border border-zinc-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-700 outline-none transition-colors focus:border-[#d4a574]/50 focus:bg-white/[0.05]"
                />
              </div>
            </label>

            {/* Senha */}
            <label className="block mb-2">
              <span className="text-[11px] text-zinc-500 font-medium mb-1.5 block uppercase tracking-wide">
                Senha
              </span>
              <div className="relative">
                <Lock
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
                />
                <input
                  type={showPass ? "text" : "password"}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••"
                  className="w-full bg-white/[0.03] border border-zinc-800 rounded-xl pl-9 pr-10 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-700 outline-none transition-colors focus:border-[#d4a574]/50 focus:bg-white/[0.05]"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
                  tabIndex={-1}
                  aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>

            {/* Error */}
            {error && (
              <p className="text-red-400 text-xs mt-2 mb-1 animate-fade-in">{error}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !user || !pass}
              className="w-full mt-4 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-zinc-900 transition-all duration-200 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, #f5d49a 0%, #d4a574 50%, #c49060 100%)",
                boxShadow: "0 4px 20px rgba(212,165,116,0.25)",
              }}
            >
              {submitting ? "Verificando…" : "Entrar"}
              {!submitting && <ArrowRight size={15} />}
            </button>
          </div>
        </form>

        <p className="text-center text-[10px] text-zinc-700 mt-6 tracking-wider uppercase">
          v1.0 · Personal
        </p>
      </div>
    </div>
  );
}
