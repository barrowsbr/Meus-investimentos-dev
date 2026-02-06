
import streamlit as st

# Function to get config to avoid import loops if needed, or just a dict
# Since it uses st.column_config, it requires streamlit context.

def get_editor_config():
    # Keys match the Google Sheet Tab Names
    return {
        "meus_ativos": {
            "icon": "📈", "label": "Ações & ETFs", "date_cols": ["Data"],
            # ORDEM DOS CAMPOS: deve coincidir com a planilha Google Sheets
            # Data | Tipo de transação | Símbolo | Quantidade | Preço | Valor bruto | Taxa de corretagem | Valor líquido | Moeda | Corretora
            "form_fields": {
                "Data": "date",
                "Tipo de transação": ["Compra", "Venda"], 
                "Símbolo": "text_suggest",
                "Quantidade": "number", 
                "Preço": "currency", 
                # Valor bruto é calculado e inserido aqui na ordem
                "Taxa de corretagem": "currency",
                # Valor líquido é calculado
                # Valor bruto e Valor líquido são calculados automaticamente no Editor
                "Moeda": ["USD", "BRL", "EUR", "CAD"],
                "Corretora": ["IBKR", "XP", "Avenue", "Binance", "BTG", "Nubank"],
            },
            "column_types": {
                "Data": st.column_config.DateColumn("Data", format="DD/MM/YYYY", help="Data da execução da ordem"),
                "Tipo de transação": st.column_config.SelectboxColumn("Operação", options=["Compra", "Venda"], help="Natureza da operação"),
                "Símbolo": st.column_config.TextColumn("Ticker", width="small", validate="^[A-Za-z0-9.]+$", help="Código do ativo (ex: AAPL, PETR4)"),
                "Quantidade": st.column_config.NumberColumn("Qtd", format="%.4f", help="Número total de cotas/ações"),
                "Preço": st.column_config.NumberColumn("Preço", format="$ %.2f", help="Preço unitário de execução"),
                "Valor bruto": st.column_config.NumberColumn("Bruto", format="$ %.2f", help="Qtd * Preço (calculado)"),
                "Taxa de corretagem": st.column_config.NumberColumn("Taxas", format="$ %.2f", help="Corretagem e emolumentos"),
                "Valor líquido": st.column_config.NumberColumn("Total", format="$ %.2f", help="Qtd * Preço + Taxas (calculado)"),
                "Moeda": st.column_config.SelectboxColumn("Moeda", options=["USD", "BRL", "EUR", "CAD"], help="Moeda de liquidação"),
                "Corretora": st.column_config.SelectboxColumn("Corretora", options=["IBKR", "XP", "Avenue", "Binance", "BTG", "Nubank"], help="Instituição"),
            }
        },
        "meus_proventos": {
            "icon": "💵", "label": "Proventos", "date_cols": ["data"],
            "form_fields": {
                "ticker": "text_suggest", "data": "date",
                "lancamento": ["Dividendo", "JUROS S/ CAPITAL", "Rendimento", "Imposto"],
                "categoria": ["Ação", "Ação Internacional", "FII", "ETF", "BDR"],
                "valor": "currency", "moeda": ["USD", "BRL", "EUR"]
            },
            "column_types": {
                "data": st.column_config.DateColumn("Data", format="DD/MM/YYYY", help="Data do pagamento"),
                "ticker": st.column_config.TextColumn("Ticker", width="small", help="Código do ativo pagador"),
                "lancamento": st.column_config.SelectboxColumn("Lançamento", options=["Dividendo", "JUROS S/ CAPITAL", "Rendimento", "Imposto"], help="Tipo de provento"),
                "categoria": st.column_config.SelectboxColumn("Categoria", options=["Ação", "Ação Internacional", "FII"], help="Classe do ativo"),
                "valor": st.column_config.NumberColumn("Valor", format="%.2f", help="Valor líquido recebido na moeda original"),
                "mes": st.column_config.TextColumn("Mês Ref", disabled=True)
            }
        },
        "renda_fixa": {
            "icon": "💰", "label": "Renda Fixa", "date_cols": ["Compra"],
            "form_fields": {
                "Ticker": "text_suggest", "Valor": "currency", "Valor atual": "currency",
                "Tipo de transação": ["Compra", "Venda", "Resgate", "Vencimento"], "Compra": "date"
            },
            "column_types": {
                "Compra": st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
                "Valor": st.column_config.NumberColumn("Investido", format="R$ %.2f"),
                "Valor atual": st.column_config.NumberColumn("Atual", format="R$ %.2f"),
                "Tipo de transação": st.column_config.SelectboxColumn("Tipo", options=["Compra", "Venda", "Resgate", "Vencimento"]),
            }
        },
        "cambio": {
            "icon": "💱", "label": "Câmbio", "date_cols": ["Data"],
            "form_fields": {
                "Moeda Origem": ["BRL", "USD", "EUR"], "Moeda Destino": ["USD", "BRL", "EUR"],
                "Valor Total entrada": "currency", "Valor Total saída": "currency", "Data": "date"
            },
            "column_types": {
                "Data": st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
                "VET": st.column_config.NumberColumn("VET", format="%.4f"),
                "Valor Total entrada": st.column_config.NumberColumn("Entrada", format="%.2f"),
                "Valor Total saída": st.column_config.NumberColumn("Saída", format="%.2f")
            }
        },
        "composicao": {
            "icon": "📊", "label": "Composição (Carteira)", "date_cols": [],
            "form_fields": {
                "Símbolo (Symbol)": "text", "Descrição (Description)": "text", 
                "Valor Líquido (Net Value)": "currency", 
                "Setor (Sector)": ["Technology", "Financials", "Healthcare", "Consumer", "Cash"]
            },
            "column_types": {
                "Valor Líquido (Net Value)": st.column_config.NumberColumn("Valor Líquido", format="$ %.2f"),
                "Setor (Sector)": st.column_config.SelectboxColumn("Setor", options=["Technology", "Financials", "Consumer", "Cash"])
            }
        }
    }
