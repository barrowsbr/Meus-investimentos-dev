import pdfplumber
import pandas as pd
import re

def clean_currency(value):
    """
    Limpa strings de moeda para float.
    Remove 'USD', 'CAD', espaços e converte ',' (milhar) e '.' (decimal).
    Nota: O relatório parece usar '.' como decimal e ',' como milhar (padrão US).
    """
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return value
    
    # Remove espaços e quebras de linha residuais
    value = str(value).strip()
    
    # Se estiver vazio
    if not value:
        return 0.0
        
    # Remove caracteres que não sejam números, ponto, virgula ou sinal de menos
    # Mantém apenas o que é essencial para conversão
    value = re.sub(r'[^\d.,-]', '', value)
    
    # Tratamento para padrão US (1,000.00) vs BR (1.000,00)
    # Pelo contexto do PDF (Interactive Brokers), geralmente é padrão US.
    try:
        # Remove virgula de milhar
        value = value.replace(',', '')
        return float(value)
    except ValueError:
        return 0.0

def explode_row(row):
    """
    Lida com células que têm múltiplas linhas de dados (ex: Dividendo e Imposto juntos).
    Separa o conteúdo baseando-se em '\n' e cria novas linhas.
    """
    # Verifica o número máximo de "sub-linhas" dentro desta linha
    max_splits = 1
    split_data = []
    
    for cell in row:
        if cell:
            cell_str = str(cell)
            splits = cell_str.split('\n')
            split_data.append(splits)
            if len(splits) > max_splits:
                max_splits = len(splits)
        else:
            split_data.append([None])

    new_rows = []
    for i in range(max_splits):
        new_row = []
        for col_idx, cell_splits in enumerate(split_data):
            # Se houver dados para este índice, usa. 
            # Se não (ex: data repetida que o PDF agrupa), tenta pegar o primeiro (repeat) ou deixa vazio.
            if i < len(cell_splits):
                val = cell_splits[i]
            else:
                # Em alguns relatórios, células mescladas verticalmente não repetem o texto.
                # Aqui assumimos vazio se não houver correspondência exata de quebra.
                val = "" 
            new_row.append(val)
        
        # Filtro básico: se a linha inteira for vazia ou só tiver a data/conta sem valores, ignorar
        # (Ajuste conforme a necessidade de limpeza)
        if any(item and str(item).strip() for item in new_row[2:]): # Checa se tem algo além de Data/Conta
            new_rows.append(new_row)
            
    return new_rows if new_rows else [row]

def pdf_to_excel(pdf_path, excel_output):
    all_data = []
    
    # Cabeçalhos esperados baseados no seu arquivo
    headers = [
        "Data", "Conta", "Descrição", "Tipo de transação", 
        "Símbolo", "Quantidade", "Preço", "Valor bruto", 
        "Taxa de corretagem", "Valor líquido"
    ]

    print(f"Lendo arquivo: {pdf_path}...")
    
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            print(f"Processando página {i+1}...")
            
            # Extrai a tabela da página
            tables = page.extract_tables()
            
            for table in tables:
                for row in table:
                    # Limpeza básica de None para string vazia
                    row = [cell if cell is not None else "" for cell in row]
                    
                    # Tenta identificar se é uma linha de cabeçalho
                    row_str = " ".join([str(x).replace('\n', ' ') for x in row]).lower()
                    
                    if "data" in row_str and "descrição" in row_str and "símbolo" in row_str:
                        continue # Pula o cabeçalho
                    
                    # Ignora linhas de totais ou irrelevantes que não tenham data (estrutura YYYY-MM-DD)
                    # Verifica se a primeira coluna parece uma data (202\d-...)
                    is_date_row = False
                    if row[0]:
                        if re.match(r'202\d-\d{2}-\d{2}', str(row[0]).strip()):
                            is_date_row = True
                    
                    if not is_date_row:
                        continue

                    # Explode linhas com múltiplas transações (ex: Dividendo + Imposto)
                    exploded_rows = explode_row(row)
                    
                    for exp_row in exploded_rows:
                        # Garante que a linha tem o mesmo tamanho dos cabeçalhos
                        # Às vezes o PDF lê colunas extras ou a menos
                        if len(exp_row) >= len(headers):
                            # Pega apenas as colunas que batem com nossos headers (as primeiras 10)
                            clean_row = exp_row[:10]
                            all_data.append(clean_row)

    if not all_data:
        print("Nenhum dado encontrado. Verifique se o PDF é legível (não é imagem).")
        return

    # Criar DataFrame
    df = pd.DataFrame(all_data, columns=headers)

    # Limpeza e Conversão de Tipos
    numeric_cols = ["Quantidade", "Preço", "Valor bruto", "Taxa de corretagem", "Valor líquido"]
    
    for col in numeric_cols:
        df[col] = df[col].apply(clean_currency)

    # Converter Data
    # Pega apenas os primeiros 10 caracteres para garantir YYYY-MM-DD e remove lixo
    df['Data'] = df['Data'].astype(str).str.strip().str[:10]
    df['Data'] = pd.to_datetime(df['Data'], errors='coerce')

    # Ordenar por data
    df = df.sort_values(by='Data', ascending=False)

    # Exportar para Excel
    print(f"Salvando em {excel_output}...")
    df.to_excel(excel_output, index=False)
    print("Concluído com sucesso!")

# --- Execução ---
# Substitua pelo nome exato do seu arquivo se for diferente
pdf_filename = "PDF.pdf" 
output_filename = "Transacoes_IBKR.xlsx"

try:
    pdf_to_excel(pdf_filename, output_filename)
except FileNotFoundError:
    print(f"Erro: O arquivo '{pdf_filename}' não foi encontrado.")
except Exception as e:
    print(f"Ocorreu um erro inesperado: {e}")