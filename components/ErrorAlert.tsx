import { AlertTriangle } from "lucide-react";

interface Props {
  message: string;
  tab?: string;
}

export default function ErrorAlert({ message, tab }: Props) {
  return (
    <div className="glass-card border-red-500/20 p-5 flex items-start gap-3 animate-fade-in">
      <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
        <AlertTriangle size={16} className="text-red-400" />
      </div>
      <div>
        <p className="text-red-400 font-medium text-sm">
          Erro ao carregar dados{tab ? ` (${tab})` : ""}
        </p>
        <p className="text-zinc-400 text-xs mt-1">{message}</p>
        <p className="text-zinc-600 text-xs mt-2">
          Verifique se as variáveis de ambiente{" "}
          <code className="text-zinc-500">GOOGLE_API_KEY</code> e{" "}
          <code className="text-zinc-500">SPREADSHEET_ID</code> estão
          configuradas na Vercel.
        </p>
      </div>
    </div>
  );
}
