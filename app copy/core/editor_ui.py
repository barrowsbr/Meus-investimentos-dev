import streamlit as st
import pandas as pd
from datetime import datetime, date
from core.ui_config import get_editor_config


def render_editor_section():
    with st.expander("💰 Caixa Rápido — Atualizar Saldo", expanded=False):
        try:
            from core.data.provider import DataProvider
            from core.data.gsheets import get_worksheet
            from core.utils import format_decimal_br, parse_decimal_br

            df_rf = DataProvider.get_fixed_income()

            if not df_rf.empty and 'Ticker' in df_rf.columns and 'Valor' in df_rf.columns:
                mask = df_rf['Ticker'].astype(str).str.upper().str.contains('CAIXA', na=False)
                caixa_rows = df_rf[mask]

                if caixa_rows.empty:
                    st.info("Nenhuma linha 'CAIXA' encontrada na aba renda_fixa.")
                else:
                    for idx, row in caixa_rows.iterrows():
                        ticker_name = str(row['Ticker'])
                        current_val = row.get('Valor', 0)
                        try:
                            current_float = float(current_val) if current_val else 0.0
                        except (ValueError, TypeError):
                            current_float = parse_decimal_br(str(current_val)) if current_val else 0.0

                        moeda = str(row.get('Moeda', 'BRL'))
                        prefix = "R$" if moeda == "BRL" else "$"

                        st.markdown(
                            f'<div style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">'
                            f'{ticker_name} — Saldo atual: '
                            f'<span style="color:#34d399;font-weight:700;font-size:0.85rem;">'
                            f'{prefix} {current_float:,.2f}</span></div>',
                            unsafe_allow_html=True,
                        )

                        col_input, col_btn = st.columns([3, 1])
                        with col_input:
                            new_val = st.number_input(
                                f"Novo saldo — {ticker_name}",
                                value=current_float,
                                min_value=0.0,
                                step=100.0,
                                format="%.2f",
                                key=f"ed_caixa_input_{idx}",
                                label_visibility="collapsed",
                            )
                        with col_btn:
                            if st.button("💾 Salvar", key=f"ed_caixa_save_{idx}", type="primary", use_container_width=True):
                                try:
                                    ws = get_worksheet('gdados', 'renda_fixa')
                                    if ws:
                                        sheet_row = int(idx) + 2
                                        headers = ws.row_values(1)
                                        col_idx = headers.index('Valor') + 1
                                        ws.update_cell(sheet_row, col_idx, new_val)
                                        st.cache_data.clear()
                                        st.toast(f"✅ {ticker_name} atualizado para {prefix} {new_val:,.2f}", icon="💰")
                                        st.rerun()
                                    else:
                                        st.error("Não foi possível acessar a planilha.")
                                except Exception as e:
                                    st.error(f"Erro ao salvar: {e}")
            else:
                st.warning("Aba renda_fixa não encontrada ou sem colunas esperadas (Ticker, Valor).")
        except Exception as e:
            st.error(f"Erro ao carregar dados do caixa: {e}")

    tabs_config = get_editor_config()

    col_sel, col_stats = st.columns([1, 2])
    with col_sel:
        selected_key = st.selectbox(
            "Selecione a Tabela:",
            list(tabs_config.keys()),
            format_func=lambda x: f"{tabs_config[x]['icon']} {tabs_config[x]['label']}"
        )

    if 'ed_editor_key' not in st.session_state or st.session_state.ed_editor_key != selected_key:
        st.session_state.ed_editor_key = selected_key
        st.session_state.pop('ed_editor_df', None)

    cfg = tabs_config[selected_key]

    def convert_smart_date(x):
        if pd.isnull(x) or str(x).strip() == '':
            return pd.NaT
        try:
            if isinstance(x, (pd.Timestamp, datetime, date)):
                return x
            x_float = float(x)
            if 30000 < x_float < 70000:
                return pd.to_datetime(x_float, unit='D', origin='1899-12-30')
        except Exception:
            pass
        try:
            return pd.to_datetime(x, dayfirst=True, errors='coerce')
        except Exception:
            return pd.NaT

    if 'ed_editor_df' not in st.session_state or st.session_state.ed_editor_df is None:
        try:
            from core.data.provider import DataProvider
            from core.utils import format_decimal_br

            df = DataProvider.fetch_data(selected_key)

            for col in cfg.get("date_cols", []):
                if col in df.columns:
                    df[col] = df[col].apply(convert_smart_date)

            if selected_key == "meus_proventos":
                if 'data' in df.columns:
                    meses = {1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr', 5: 'mai', 6: 'jun',
                             7: 'jul', 8: 'ago', 9: 'set', 10: 'out', 11: 'nov', 12: 'dez'}

                    def get_mes_ref(d):
                        if pd.isnull(d):
                            return ""
                        try:
                            return f"{meses.get(d.month, '')}/{str(d.year)[-2:]}"
                        except Exception:
                            return ""

                    df['mes'] = df['data'].apply(get_mes_ref)
                    df['ano'] = df['data'].apply(lambda x: x.year if pd.notnull(x) else 0).astype(int)

            st.session_state.ed_editor_df = df
        except Exception as e:
            st.error(f"Erro ao carregar dados: {e}")
            st.session_state.ed_editor_df = pd.DataFrame()

    df_current = st.session_state.ed_editor_df

    from core.utils import format_decimal_br, parse_decimal_br

    fields_cfg = cfg.get("form_fields", {})
    numeric_cols = [k for k, v in fields_cfg.items() if v in ["currency", "number"]]

    df_display = df_current.copy() if df_current is not None else pd.DataFrame()

    if not df_display.empty:
        for col in numeric_cols:
            if col in df_display.columns:
                decimals = 2
                if 'Quantidade' in col or 'Qtd' in col or 'VET' in col:
                    decimals = 4
                df_display[col] = df_display[col].apply(lambda x: format_decimal_br(x, decimals))

    df_hidden_disp = pd.DataFrame()
    df_visible = pd.DataFrame()

    if df_display is not None and not df_display.empty:
        if len(df_display) > 10:
            df_hidden_disp = df_display.iloc[:-10]
            df_visible = df_display.iloc[-10:]
        else:
            df_visible = df_display
            df_hidden_disp = pd.DataFrame()

    if df_visible is not None:

        with st.expander("⚡ Adicionar Novo Lançamento", expanded=False):
            with st.form(key=f"ed_form_add_{selected_key}", clear_on_submit=False):
                form_cols = st.columns(4)
                input_data = {}

                history_tickers = []
                if not df_display.empty:
                    possible_cols = ["Ticker", "Símbolo", "ticker", "Símbolo (Symbol)"]
                    for c in possible_cols:
                        if c in df_display.columns:
                            history_tickers = df_display[c].dropna().unique().tolist()
                            break

                idx = 0
                for field_name, field_type in fields_cfg.items():
                    c = form_cols[idx % 4]
                    idx += 1

                    key_widget = f"ed_in_{selected_key}_{field_name}"

                    if field_type == "text_suggest":
                        opts = [""] + sorted([str(x) for x in history_tickers])
                        val_sel = c.selectbox(f"{field_name}", options=opts, key=key_widget)
                        if val_sel == "":
                            input_data[field_name] = c.text_input(f"Novo {field_name}?", key=f"{key_widget}_new")
                        else:
                            input_data[field_name] = val_sel

                    elif isinstance(field_type, list):
                        input_data[field_name] = c.selectbox(field_name, options=field_type, key=key_widget)

                    elif field_type == "text":
                        input_data[field_name] = c.text_input(field_name, key=key_widget)

                    elif field_type == "date":
                        input_data[field_name] = c.date_input(field_name, value="today", format="DD/MM/YYYY", key=key_widget)

                    elif field_type in ("currency", "number"):
                        val_str = c.text_input(field_name, value="0,00", key=key_widget, help="Use vírgula como separador decimal")
                        input_data[field_name] = val_str

                submit_btn = st.form_submit_button("➕ Adicionar Linha", type="primary")

            if submit_btn:
                if any(str(v).strip() == "" for v in input_data.values()):
                    st.warning("Preencha todos os campos obrigatorios.")
                else:
                    parsed_data = input_data.copy()

                    for k, v in parsed_data.items():
                        if k in numeric_cols:
                            f_val = parse_decimal_br(v)
                            decimals = 4 if ('Quantidade' in k or 'Qtd' in k or 'VET' in k) else 2
                            parsed_data[k] = format_decimal_br(f_val, decimals)

                    if selected_key == "meus_ativos":
                        qtd_f = parse_decimal_br(parsed_data.get('Quantidade', '0'))
                        preco_f = parse_decimal_br(parsed_data.get('Preço', '0'))
                        taxas_f = parse_decimal_br(parsed_data.get('Taxa de corretagem', '0'))
                        valor_bruto = qtd_f * preco_f
                        valor_liq = valor_bruto + taxas_f
                        parsed_data = {
                            'Data': parsed_data.get('Data'),
                            'Tipo de transação': parsed_data.get('Tipo de transação'),
                            'Símbolo': parsed_data.get('Símbolo'),
                            'Quantidade': parsed_data.get('Quantidade'),
                            'Preço': parsed_data.get('Preço'),
                            'Valor bruto': format_decimal_br(valor_bruto, 2),
                            'Taxa de corretagem': format_decimal_br(taxas_f, 2),
                            'Valor líquido': format_decimal_br(valor_liq, 2),
                            'Moeda': parsed_data.get('Moeda'),
                            'Corretora': parsed_data.get('Corretora'),
                        }

                    elif selected_key == "meus_proventos":
                        d_obj = pd.to_datetime(input_data['data'])
                        meses_dict = {1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr', 5: 'mai', 6: 'jun',
                                      7: 'jul', 8: 'ago', 9: 'set', 10: 'out', 11: 'nov', 12: 'dez'}
                        parsed_data = {
                            'ticker': parsed_data.get('ticker'),
                            'data': parsed_data.get('data'),
                            'lancamento': parsed_data.get('lancamento'),
                            'categoria': parsed_data.get('categoria'),
                            'valor': parsed_data.get('valor'),
                            'moeda': parsed_data.get('moeda'),
                            'mes': f"{meses_dict.get(d_obj.month, '')}/{str(d_obj.year)[-2:]}",
                            'ano': d_obj.year,
                            'decisao': parsed_data.get('lancamento', ''),
                        }

                    elif selected_key == "renda_fixa":
                        parsed_data = {
                            'Ticker': parsed_data.get('Ticker'),
                            'Compra': parsed_data.get('Compra'),
                            'Tipo de transação': parsed_data.get('Tipo de transação'),
                            'Valor': parsed_data.get('Valor'),
                            'Valor atual': parsed_data.get('Valor atual'),
                            'Moeda': parsed_data.get('Moeda'),
                        }

                    elif selected_key == "cambio":
                        parsed_data = {
                            'Data': parsed_data.get('Data'),
                            'Moeda Origem': parsed_data.get('Moeda Origem'),
                            'Moeda Destino': parsed_data.get('Moeda Destino'),
                            'Valor Total entrada': parsed_data.get('Valor Total entrada'),
                            'Valor Total saída': parsed_data.get('Valor Total saída'),
                            'VET': parsed_data.get('VET'),
                            'Corretora destino': parsed_data.get('Corretora destino'),
                        }

                    new_row = pd.DataFrame([parsed_data])

                    for d_col in cfg.get("date_cols", []):
                        if d_col in new_row.columns:
                            new_row[d_col] = pd.to_datetime(new_row[d_col])

                    row_floats = new_row.copy()
                    all_numeric = list(numeric_cols) + ['Valor bruto', 'Valor líquido', 'Taxa de corretagem', 'VET']
                    for col in all_numeric:
                        if col in row_floats.columns:
                            row_floats[col] = row_floats[col].apply(parse_decimal_br)

                    if not st.session_state.ed_editor_df.empty:
                        existing_cols = st.session_state.ed_editor_df.columns.tolist()
                        row_floats = row_floats.reindex(columns=existing_cols)

                    st.session_state.ed_editor_df = pd.concat(
                        [st.session_state.ed_editor_df, row_floats], ignore_index=True
                    )
                    st.success("Linha adicionada!")
                    st.rerun()

        st.markdown("---")

        final_col_config = cfg.get("column_types", {}).copy()

        def get_conf_attr(obj, attr, default=None):
            if isinstance(obj, dict):
                return obj.get(attr, default)
            return getattr(obj, attr, default)

        for nc in numeric_cols:
            if nc in final_col_config:
                orig_conf = final_col_config[nc]
                current_label = get_conf_attr(orig_conf, 'label')
                current_width = get_conf_attr(orig_conf, 'width')
                current_help = get_conf_attr(orig_conf, 'help', '')
                final_col_config[nc] = st.column_config.TextColumn(
                    label=current_label,
                    width=current_width,
                    help=f"{current_help} (Formato: 1.000,00)",
                    validate="^[0-9.,]+$"
                )

        st.info("ℹ️ Exibindo apenas as últimas 10 entradas para melhor performance.")

        for d_col in cfg.get("date_cols", []):
            if d_col in df_visible.columns:
                df_visible[d_col] = pd.to_datetime(df_visible[d_col], errors='coerce')

        df_edited = st.data_editor(
            df_visible,
            column_config=final_col_config,
            num_rows="dynamic",
            use_container_width=True,
            height=400,
            key=f"ed_grid_{selected_key}"
        )

        st.markdown("### 💾 Ações")
        col_save, col_discard = st.columns([1, 4])

        with col_save:
            if st.button("Gravar Alterações", type="primary", use_container_width=True):
                try:
                    if not df_hidden_disp.empty:
                        df_full_str = pd.concat([df_hidden_disp, df_edited], ignore_index=True)
                    else:
                        df_full_str = df_edited.copy()

                    df_to_save = df_full_str.copy()
                    for col in numeric_cols:
                        if col in df_to_save.columns:
                            df_to_save[col] = df_to_save[col].apply(parse_decimal_br)

                    if selected_key == 'meus_proventos':
                        if 'data' in df_to_save.columns:
                            dates = pd.to_datetime(df_to_save['data'], errors='coerce')
                            meses = {1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr', 5: 'mai', 6: 'jun',
                                     7: 'jul', 8: 'ago', 9: 'set', 10: 'out', 11: 'nov', 12: 'dez'}

                            def get_mes_ref(d):
                                if pd.isnull(d):
                                    return ""
                                return f"{meses.get(d.month, '')}/{str(d.year)[-2:]}"

                            df_to_save['mes'] = dates.apply(get_mes_ref)
                            df_to_save['ano'] = dates.dt.year.fillna(0).astype(int)

                    for d_col in cfg.get("date_cols", []):
                        if d_col in df_to_save.columns:
                            s_dates = pd.to_datetime(df_to_save[d_col], errors='coerce')
                            df_to_save[d_col] = s_dates.dt.strftime('%Y-%m-%d').replace('NaT', '')

                    from core.data.provider import DataProvider
                    if DataProvider.save_data(selected_key, df_to_save):
                        st.toast("Dados salvos com sucesso!", icon="✅")
                        st.balloons()
                        st.session_state.pop('ed_editor_df', None)
                        st.rerun()
                    else:
                        st.error("Falha ao salvar. Verifique logs.")

                except Exception as e:
                    st.error(f"Erro durante salvamento: {e}")

        with col_discard:
            if st.button("❌ Descartar"):
                st.session_state.pop('ed_editor_df', None)
                st.rerun()
