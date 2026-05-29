#!/usr/bin/env python3
"""
snapshot_patrimonio.py
======================
Grava snapshot horário do patrimônio total no Google Sheets.
Rodado via GitHub Actions com cron '0 * * * *' (toda hora, 24h/dia).

Cria automaticamente a aba 'historico_patrimonio' em gdados se não existir.
"""

import sys, io, json, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ── Mock Streamlit ANTES de qualquer import do core ────────────────────────
class _FakeCache:
    def __call__(self, func=None, **kwargs):
        return func if func is not None else lambda f: f
    def clear(self): pass

class _FakeSecrets:
    def __contains__(self, key):
        if key == 'gcp_service_account':
            return bool(os.environ.get('SERVICE_ACCOUNT_JSON'))
        return bool(os.environ.get(key))

    def __getitem__(self, key):
        if key == 'gcp_service_account':
            creds = json.loads(os.environ['SERVICE_ACCOUNT_JSON'])
            if 'private_key' in creds:
                creds['private_key'] = creds['private_key'].replace('\\n', '\n')
            return creds
        val = os.environ.get(key)
        if val is None:
            raise KeyError(key)
        return val

    def get(self, key, default=None):
        try:
            return self[key]
        except Exception:
            return default

class _FakeST:
    cache_data     = _FakeCache()
    cache_resource = _FakeCache()
    secrets        = _FakeSecrets()
    def error(self, msg, *a, **kw):   print(f"[ERR]  {msg}")
    def warning(self, msg, *a, **kw): print(f"[WARN] {msg}")
    def info(self, *a, **kw):    pass
    def success(self, *a, **kw): pass

sys.modules['streamlit'] = _FakeST()

# ── Adiciona app/ ao sys.path para importar core/ ─────────────────────────
_APP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
if _APP_DIR not in sys.path:
    sys.path.insert(0, _APP_DIR)

from datetime import datetime, timezone, timedelta

from core.computed import get_portfolio_snapshot
from core.data.gsheets import connect_to_gsheets, _open_spreadsheet, SPREADSHEET_NAME

# ── Configuração ───────────────────────────────────────────────────────────
TAB_NAME = 'historico_patrimonio'
HEADERS  = [
    'timestamp', 'data', 'hora',
    'patrimonio_total', 'rv', 'rf',
    'variacao_dia_pct', 'n_ativos',
]
BRT = timezone(timedelta(hours=-3))


def _fmt_brl(val: float) -> str:
    return f"R$ {val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _get_or_create_worksheet():
    """Abre (ou cria) a aba historico_patrimonio usando a mesma auth do core."""
    import gspread

    client = connect_to_gsheets()
    if not client:
        raise RuntimeError(
            "Falha na autenticação com Google Sheets. "
            "Verifique SERVICE_ACCOUNT_JSON / service_account.json."
        )

    sh = _open_spreadsheet(client, SPREADSHEET_NAME)
    if sh is None:
        raise RuntimeError(
            f"Planilha '{SPREADSHEET_NAME}' não encontrada. "
            "Verifique SPREADSHEET_KEY e que a planilha foi compartilhada com a service account."
        )

    try:
        ws = sh.worksheet(TAB_NAME)
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet(title=TAB_NAME, rows=50000, cols=len(HEADERS))
        print(f"   ✅ Aba '{TAB_NAME}' criada.")

    # Garante headers na primeira linha
    if not ws.row_values(1):
        ws.append_row(HEADERS)
        print(f"   ✅ Headers adicionados à aba '{TAB_NAME}'.")

    return ws


def main():
    now = datetime.now(BRT)

    print("=" * 60)
    print("📸 BARROOTS — Snapshot Patrimonial Horário")
    print(f"📅 {now.strftime('%d/%m/%Y %H:%M:%S')} BRT")
    print("=" * 60)

    print("\n📊 Calculando snapshot do portfólio...")
    try:
        snap = get_portfolio_snapshot()
    except Exception as e:
        print(f"❌ Erro ao calcular snapshot: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)

    erros = snap.get("errors", [])
    if erros:
        print(f"   ⚠️  Avisos do snapshot: {'; '.join(erros)}")

    positions = snap.get('positions', [])
    print(f"   Posições carregadas: {len(positions)}")

    if not positions:
        print("❌ Portfólio vazio — nenhuma posição encontrada.")
        print("   Verifique se SPREADSHEET_KEY e SERVICE_ACCOUNT_JSON estão configurados")
        print("   e se a aba 'meus_ativos' existe e tem dados.")
        sys.exit(1)

    patrimonio = snap.get('total_patrimonio_brl', 0.0)
    rv         = snap.get('rv_patrimonio_brl',    0.0)
    rf         = snap.get('rf_patrimonio_brl',    0.0)
    var_pct    = snap.get('portfolio_day_pnl_pct', 0.0)
    n_ativos   = len([p for p in positions if p.get('has_price')])

    print(f"   Patrimônio: {_fmt_brl(patrimonio)}")
    print(f"   RV:         {_fmt_brl(rv)}")
    print(f"   RF:         {_fmt_brl(rf)}")
    pct_sign = '+' if var_pct >= 0 else ''
    print(f"   Var. dia:   {pct_sign}{var_pct:.2f}%")
    print(f"   Ativos c/ preço: {n_ativos}/{len(positions)}")

    row = [
        now.strftime('%Y-%m-%d %H:%M:%S'),  # timestamp BRT
        now.strftime('%d/%m/%Y'),            # data
        now.hour,                            # hora (0-23)
        round(patrimonio, 2),
        round(rv, 2),
        round(rf, 2),
        round(var_pct, 4),
        n_ativos,
    ]

    print(f"\n📋 Gravando no Google Sheets ({SPREADSHEET_NAME} → {TAB_NAME})...")
    try:
        ws = _get_or_create_worksheet()
        ws.append_row(row, value_input_option='USER_ENTERED')
        print(f"   ✅ Linha gravada: {row}")
    except Exception as e:
        print(f"   ❌ Erro ao gravar no Sheets: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)

    print("\n" + "=" * 60)
    print("✅ Snapshot concluído com sucesso.")


if __name__ == '__main__':
    main()
