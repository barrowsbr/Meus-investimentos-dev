                with t2:
                    col_ex_main, col_ex_side = st.columns([3, 1], gap="medium")
                    
                    # 1. Filtro Seguro
                    col_mercado = 'mercado' if 'mercado' in df_view.columns else 'Mercado'
                    df_ex = df_view[df_view[col_mercado] == 'EX'].copy()
                    
                    # --- COLUNA ESQUERDA (TABELA) ---
                    with col_ex_main:
                        st.info("ℹ️ **Análise Cambial:** Compara a Taxa PTAX do dia da liquidação (Venda) com a Taxa PTAX do dia da aquisição (Custo Histórico).")
                        
                        if not df_ex.empty:
                            st.markdown("##### 🌎 Detalhamento da Composição do Lucro")
                            
                            # Mapeamento Inteligente
                            mapa_cols = {
                                'Data': 'data' if 'data' in df_ex.columns else 'Data',
                                'Ticker': 'ticker' if 'ticker' in df_ex.columns else 'Ticker',
                                'PTAX Aquisição': 'PTAX Compra' if 'PTAX Compra' in df_ex.columns else 'ptax_compra',
                                'PTAX Venda': 'PTAX Venda' if 'PTAX Venda' in df_ex.columns else 'ptax',
                                'Venda Total (R$)': 'Venda Total (R$)' if 'Venda Total (R$)' in df_ex.columns else 'venda_total',
                                'Lucro (R$)': 'Lucro (R$)' if 'Lucro (R$)' in df_ex.columns else 'resultado',
                                'Lucro USD': 'Lucro USD' if 'Lucro USD' in df_ex.columns else 'lucro_ativo_usd',
                                'Lucro Hoje Sim': 'Lucro Hoje Sim' if 'Lucro Hoje Sim' in df_ex.columns else 'lucro_hoje_sim'
                            }

                            df_ex_show = pd.DataFrame()
                            for nome_visual, nome_real in mapa_cols.items():
                                if nome_real in df_ex.columns:
                                    df_ex_show[nome_visual] = df_ex[nome_real]
                            
                            if 'Lucro (R$)' in df_ex_show.columns and 'Lucro USD' in df_ex_show.columns and 'PTAX Venda' in df_ex_show.columns:
                                df_ex_show['Impacto Câmbio'] = df_ex_show['Lucro (R$)'] - (df_ex_show['Lucro USD'] * df_ex_show['PTAX Venda'])
                            
                            st.dataframe(
                                df_ex_show,
                                use_container_width=True,
                                column_config={
                                    "Data": st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
                                    "Ticker": "Ativo",
                                    "PTAX Aquisição": st.column_config.NumberColumn("PTAX Aquisição", format="%.4f", help="Taxa do dia da compra (Custo Histórico)."),
                                    "PTAX Venda": st.column_config.NumberColumn("PTAX Venda", format="%.4f", help="Taxa do dia da venda."),
                                    "Venda Total (R$)": st.column_config.NumberColumn("Venda Total (R$)", format="R$ %.2f"),
                                    "Lucro (R$)": st.column_config.NumberColumn("Lucro Fiscal (R$)", format="R$ %.2f", help="Base para imposto."),
                                    "Lucro USD": st.column_config.NumberColumn("Ganho Ativo ($)", format="$ %.2f"),
                                    "Impacto Câmbio": st.column_config.NumberColumn("Efeito Câmbio (R$)", format="R$ %.2f"),
                                    "Lucro Hoje Sim": st.column_config.NumberColumn("Lucro (Dólar Hoje)", format="R$ %.2f")
                                }
                            )
                            
                            st.markdown("---")
                            st.markdown("##### 🌊 Decomposição Financeira")
                            c1, c2, c3 = st.columns(3)
                            
                            col_res = mapa_cols['Lucro (R$)']
                            col_hoje = mapa_cols['Lucro Hoje Sim']
                            
                            total_fiscal = df_ex[col_res].sum() if col_res in df_ex.columns else 0
                            total_gerencial = df_ex[col_hoje].sum() if col_hoje in df_ex.columns else 0
                            diff_timing = total_gerencial - total_fiscal
                            
                            c1.metric("Lucro Fiscal (Realizado)", f"R$ {total_fiscal:,.2f}", help="Base real de tributação.")
                            c2.metric("Lucro Gerencial (Cotação Atual)", f"R$ {total_gerencial:,.2f}", help="Se convertesse hoje.")
                            c3.metric("Diferença (Timing)", f"R$ {diff_timing:,.2f}", delta_color="off")
                            
                        else:
                            st.warning("Sem operações no Exterior neste ano.")

                    # --- COLUNA DIREITA (IMPOSTO + GUIA) ---
                    with col_ex_side:
                        col_res = 'resultado' if 'resultado' in df_ex.columns else 'Lucro (R$)'
                        if not df_ex.empty and col_res in df_ex.columns:
                            lucro_total = df_ex[col_res].sum()
                            imposto = max(0, lucro_total * 0.15) # 15% Flat
                            
                            st.markdown("### 🧾 Tributação")
                            with st.container(border=True):
                                st.metric("Base Cálculo", f"R$ {lucro_total:,.2f}")
                                st.divider()
                                st.metric("Imposto (15%)", f"R$ {imposto:,.2f}", delta="DARF (Cód 8528)", delta_color="inverse")
                        else:
                            st.info("Sem dados.")

                        # --- GUIA FISCAL EXTERIOR ---
                        st.markdown("### 📚 Guia Fiscal (Lei 14.754)")
                        
                        with st.expander("🌎 Regra Geral (2024+)", expanded=True):
                            st.markdown("""
                            **Alíquota Única:** 15% sobre o lucro anual.
                            **Isenção:** ❌ **Não existe mais** a isenção de R$ 35k. Todo lucro é tributável.
                            **Apuração:** Anual (na Declaração de Ajuste), mas recomenda-se reservar o valor.
                            """)
                        
                        with st.expander("💱 Variação Cambial"):
                            st.markdown("""
                            A variação do dólar agora compõe o lucro.
                            **Custo:** PTAX do dia da compra.
                            **Venda:** PTAX do dia da venda.
                            Se o dólar subiu, você paga imposto sobre essa valorização também.
                            """)

                        with st.expander("📉 Compensação"):
                            st.markdown("""
                            Prejuízos em ativos no exterior podem abater lucros de outros ativos no exterior dentro do **mesmo ano**.
                            """)
                        
                        st.link_button("🌐 SicalcWeb", "https://sicalc.receita.economia.gov.br/sicalc/principal", use_container_width=True)  
