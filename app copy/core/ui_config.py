
import streamlit as st

def get_editor_config():
    """
    Configuracao dos editores.
    IMPORTANTE: Os nomes dos campos em form_fields DEVEM coincidir EXATAMENTE
    com os nomes das colunas na planilha Google Sheets.
    """
    return {
        # =====================================================================
        # ACOES & ETFs (meus_ativos)
        # Colunas da planilha: Data | Tipo de transacao | Simbolo | Quantidade |
        # Preco | Valor bruto | Taxa de corretagem | Valor liquido | Moeda | Corretora
        # =====================================================================
        "meus_ativos": {
            "icon": "📈",
            "label": "Ações & ETFs",
            "date_cols": ["Data"],
            "form_fields": {
                # Campos na ORDEM da planilha (exceto calculados)
                "Data": "date",
                "Tipo de transação": ["Compra", "Venda"],
                "Símbolo": "text_suggest",
                "Quantidade": "number",
                "Preço": "currency",
                # "Valor bruto" -> CALCULADO (Qtd * Preco)
                "Taxa de corretagem": "currency",
                # "Valor liquido" -> CALCULADO (Valor bruto + Taxas)
                "Moeda": ["USD", "BRL", "EUR", "CAD"],
                "Corretora": ["IBKR", "XP", "Avenue", "Binance", "BTG", "Nubank", "Rico", "Clear"],
            },
            "column_types": {
                "Data": st.column_config.DateColumn("Data", format="DD/MM/YYYY", help="Data de execução"),
                "Tipo de transação": st.column_config.SelectboxColumn("Operação", options=["Compra", "Venda"]),
                "Símbolo": st.column_config.TextColumn("Ticker", width="small"),
                "Quantidade": st.column_config.NumberColumn("Qtd", format="%.4f"),
                "Preço": st.column_config.NumberColumn("Preço", format="%.2f"),
                "Valor bruto": st.column_config.NumberColumn("Bruto", format="%.2f", disabled=True),
                "Taxa de corretagem": st.column_config.NumberColumn("Taxas", format="%.2f"),
                "Valor líquido": st.column_config.NumberColumn("Total", format="%.2f", disabled=True),
                "Moeda": st.column_config.SelectboxColumn("Moeda", options=["USD", "BRL", "EUR", "CAD"]),
                "Corretora": st.column_config.SelectboxColumn("Corretora", options=["IBKR", "XP", "Avenue", "Binance", "BTG", "Nubank", "Rico", "Clear"]),
            }
        },

        # =====================================================================
        # PROVENTOS (meus_proventos)
        # Colunas da planilha: ticker | data | lancamento | categoria | valor | moeda | mes | ano | decisao
        # =====================================================================
        "meus_proventos": {
            "icon": "💵",
            "label": "Proventos",
            "date_cols": ["data"],
            "form_fields": {
                # Campos na ORDEM da planilha
                "ticker": "text_suggest",
                "data": "date",
                "lancamento": ["Dividendo", "JCP", "Rendimento", "Imposto", "Bonificação"],
                "categoria": ["Ação BR", "Ação EUA", "FII", "ETF", "BDR", "REIT"],
                "valor": "currency",
                "moeda": ["BRL", "USD", "EUR"],
                # "mes" e "ano" sao CALCULADOS automaticamente a partir de "data"
                # "decisao" e preenchido com o valor de "lancamento"
            },
            "column_types": {
                "ticker": st.column_config.TextColumn("Ticker", width="small"),
                "data": st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
                "lancamento": st.column_config.SelectboxColumn("Tipo", options=["Dividendo", "JCP", "Rendimento", "Imposto", "Bonificação"]),
                "categoria": st.column_config.SelectboxColumn("Categoria", options=["Ação BR", "Ação EUA", "FII", "ETF", "BDR", "REIT"]),
                "valor": st.column_config.NumberColumn("Valor", format="%.2f"),
                "moeda": st.column_config.SelectboxColumn("Moeda", options=["BRL", "USD", "EUR"]),
                "mes": st.column_config.TextColumn("Mês Ref", disabled=True),
                "ano": st.column_config.NumberColumn("Ano", disabled=True),
            }
        },

        # =====================================================================
        # RENDA FIXA (renda_fixa)
        # Colunas da planilha: Ticker | Compra | Tipo de transacao | Valor | Valor atual | Moeda
        # =====================================================================
        "renda_fixa": {
            "icon": "💰",
            "label": "Renda Fixa",
            "date_cols": ["Compra"],
            "form_fields": {
                # Campos na ORDEM da planilha
                "Ticker": "text_suggest",
                "Compra": "date",
                "Tipo de transação": ["Compra", "Venda", "Resgate", "Vencimento", "Aporte"],
                "Valor": "currency",
                "Valor atual": "currency",
                "Moeda": ["BRL", "USD"],
            },
            "column_types": {
                "Ticker": st.column_config.TextColumn("Ativo", width="medium"),
                "Compra": st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
                "Tipo de transação": st.column_config.SelectboxColumn("Tipo", options=["Compra", "Venda", "Resgate", "Vencimento", "Aporte"]),
                "Valor": st.column_config.NumberColumn("Investido", format="R$ %.2f"),
                "Valor atual": st.column_config.NumberColumn("Atual", format="R$ %.2f"),
                "Moeda": st.column_config.SelectboxColumn("Moeda", options=["BRL", "USD"]),
            }
        },

        # =====================================================================
        # CAMBIO (cambio)
        # Colunas da planilha: Data | Moeda Origem | Moeda Destino | Valor Total entrada |
        # Valor Total saida | VET | Corretora destino
        # =====================================================================
        "cambio": {
            "icon": "💱",
            "label": "Câmbio",
            "date_cols": ["Data"],
            "form_fields": {
                # Campos na ORDEM da planilha
                "Data": "date",
                "Moeda Origem": ["BRL", "USD", "EUR"],
                "Moeda Destino": ["USD", "BRL", "EUR"],
                "Valor Total entrada": "currency",
                "Valor Total saída": "currency",
                "VET": "number",
                "Corretora destino": ["IBKR", "Avenue", "Wise", "Remessa Online", "XP", "BTG"],
            },
            "column_types": {
                "Data": st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
                "Moeda Origem": st.column_config.SelectboxColumn("Origem", options=["BRL", "USD", "EUR"]),
                "Moeda Destino": st.column_config.SelectboxColumn("Destino", options=["USD", "BRL", "EUR"]),
                "Valor Total entrada": st.column_config.NumberColumn("Entrada", format="%.2f"),
                "Valor Total saída": st.column_config.NumberColumn("Saída", format="%.2f"),
                "VET": st.column_config.NumberColumn("VET", format="%.4f", help="Valor Efetivo Total (taxa real)"),
                "Corretora destino": st.column_config.SelectboxColumn("Corretora", options=["IBKR", "Avenue", "Wise", "Remessa Online", "XP", "BTG"]),
            }
        },
    }
