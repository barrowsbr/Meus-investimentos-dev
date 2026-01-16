
import streamlit as st

# Function to get config to avoid import loops if needed, or just a dict
# Since it uses st.column_config, it requires streamlit context.

def get_editor_config():
    return {
        "meus_ativos.csv": {
            "sep": ";", "decimal": ".", "encoding": "utf-8", "thousands": None,
            "icon": "📈", "label": "Ações & ETFs", "date_cols": ["Data"],
            "form_fields": {
                "Símbolo": "text_suggest", "Tipo de transação": ["Compra", "Venda"], 
                "Quantidade": "number", "Preço": "currency", "Corretora": ["IBKR", "XP", "Avenue", "Binance"],
                "Moeda": ["USD", "BRL"], "Data": "date"
            },
            "column_types": {
                "Data": st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
                "Tipo de transação": st.column_config.SelectboxColumn("Operação", options=["Compra", "Venda"]),
                "Símbolo": st.column_config.TextColumn("Ticker", width="small", validate="^[A-Za-z0-9.]+$"),
                "Quantidade": st.column_config.NumberColumn("Qtd", format="%.4f"),
                "Preço": st.column_config.NumberColumn("Preço", format="$ %.2f"),
                "Valor líquido": st.column_config.NumberColumn("Total", format="$ %.2f"),
                "Moeda": st.column_config.SelectboxColumn("Moeda", options=["USD", "BRL", "EUR"]),
            }
        },
        "meus_proventos.csv": {
            "sep": ";", "decimal": ".", "encoding": "utf-8", "thousands": None,
            "icon": "💵", "label": "Proventos", "date_cols": ["data"],
            "form_fields": {
                "ticker": "text_suggest", "data": "date",
                "lancamento": ["Dividendo", "JUROS S/ CAPITAL", "Rendimento", "Imposto"],
                "categoria": ["Ação", "Ação Internacional", "FII", "ETF", "BDR"],
                "valor": "currency", "moeda": ["USD", "BRL", "EUR"]
            },
            "column_types": {
                "data": st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
                "ticker": st.column_config.TextColumn("Ticker", width="small"),
                "lancamento": st.column_config.SelectboxColumn("Lançamento", options=["Dividendo", "JUROS S/ CAPITAL", "Rendimento", "Imposto"]),
                "categoria": st.column_config.SelectboxColumn("Categoria", options=["Ação", "Ação Internacional", "FII"]),
                "valor": st.column_config.NumberColumn("Valor", format="%.2f"),
                "mes": st.column_config.TextColumn("Mês Ref", disabled=True)
            }
        },
        "renda_fixa.csv": {
            "sep": ";", "decimal": ",", "encoding": "utf-8", "thousands": None,
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
        "cambio.csv": {
            "sep": ";", "decimal": ",", "encoding": "utf-8", "thousands": None,
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
        "composicao.csv": {
            "sep": ";", "decimal": ".", "thousands": ",", "encoding": "utf-8",
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
