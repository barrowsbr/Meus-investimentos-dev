import { AlertTriangle } from "lucide-react";

interface Props {
  message: string;
  tab?: string;
}

export default function ErrorAlert({ message, tab }: Props) {
  return (
    <div className="glass-card border-red-500/30 p-5 flex items-start gap-3">
      <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-red-400 font-medium text-sm">
          Erro ao carregar dados{tab ? ` (${tab})` : ""}
        </p>
        <p className="text-zinc-400 text-xs mt-1">{message}</p>
        <p className="text-zinc-600 text-xs mt-2">
          Verifique as variáveis de ambiente (GOOGLE_CLIENT_EMAIL,
          GOOGLE_PRIVATE_KEY) e se a planilha está compartilhada com o service
          account.
        </p>
      </div>
    </div>
  );
}
