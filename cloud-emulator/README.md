# Modo nuvem do Fliperama (emulador no servidor)

O emulador roda **dentro do navegador do iPhone**, e o Safari tem um teto de
memória para WebAssembly — por isso jogos eventualmente crasham. A solução
definitiva é rodar o emulador **num contêiner no servidor** (sua conta do Google
Cloud) e **transmitir o vídeo** para o celular: o iPhone só recebe o stream e
manda os botões, então o teto de memória deixa de existir.

Usamos o **[CloudRetro / cloud-game](https://github.com/giongto35/cloud-game)** —
projeto open-source pronto de cloud gaming para jogos retrô (Game Boy, GBA,
SNES, Mega Drive, NES…), via **WebRTC** (baixa latência), Dockerizado.

O app já tem o gancho: se a variável `NEXT_PUBLIC_CLOUD_GAMING_URL` estiver
definida, aparece o cartão **"Modo nuvem"** no Fliperama, que abre a sua
instância. Sem a variável, nada muda.

---

## 🛒 O que você precisa pegar (e onde)

1. **Projeto no Google Cloud com faturamento (billing) ativo**
   - https://console.cloud.google.com/ → topo, seletor de projeto → **Novo projeto**
     (ou use um existente). Anote o **ID do projeto**.
   - Faturamento: https://console.cloud.google.com/billing → vincule um cartão ao
     projeto. (O custo real é baixíssimo — veja "Custo" no fim.)

2. **Região**: use **`southamerica-east1`** (São Paulo) para a menor latência.

3. Ao final você vai ter **um endereço** tipo `http://SEU_IP:8000` (ou
   `https://seu-dominio`) — é esse endereço que você me manda / coloca na Vercel.

Você **não precisa** me dar senha nem chave nenhuma: você mesmo cria a VM
seguindo os passos abaixo (copiar e colar), e no fim só me passa o endereço.

---

## 🚀 Passo a passo (≈ 15 min)

### 1) Criar a VM (Compute Engine)
Console → **Compute Engine → Instâncias de VM → Criar instância**
(ative a API se pedir). Configure:
- **Região**: `southamerica-east1` (São Paulo)
- **Tipo de máquina**: `e2-medium` (2 vCPU, 4 GB) — dá conta do emulador + vídeo
- **Disco de inicialização**: Ubuntu 22.04 LTS, 20 GB
- **Firewall**: marque **Permitir tráfego HTTP** e **HTTPS**
- Em **Rede → deixe anotado o IP externo** depois de criar.

> Alternativa **quase de graça**: crie e, quando não estiver jogando, **PARE a VM**
> (Compute Engine → ⋮ → Parar). VM parada não cobra CPU, só o disco (~R$ 2/mês).
> Ligue só para jogar.

### 2) Abrir as portas do WebRTC (firewall)
Console → **VPC network → Firewall → Criar regra de firewall**:
- Nome: `cloudretro`
- Direção: entrada (ingress) · Ação: permitir
- Destinos: todas as instâncias (ou por tag)
- Faixas de IP de origem: `0.0.0.0/0`
- Protocolos/portas: **TCP `8000,9000`** e **UDP `8443`**

(8000 = site, 9000 = coordenação, 8443/udp = vídeo WebRTC — porta única, fácil.)

### 3) Instalar e subir o CloudRetro
SSH na VM (botão **SSH** na lista de instâncias) e cole:
```bash
# Docker + compose
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# CloudRetro
git clone https://github.com/giongto35/cloud-game.git
cd cloud-game

# Suas ROMs vão AQUI (veja passo 4) — a pasta assets/games:
mkdir -p assets/games

# Sobe (build na 1ª vez demora alguns minutos)
docker compose up --build -d
```
Pronto: o site fica em `http://SEU_IP_EXTERNO:8000`.

### 4) Colocar suas ROMs
As ROMs ficam em **`cloud-game/assets/games/`** na VM. Duas formas:
- **Simples**: no SSH, `cd ~/cloud-game/assets/games` e faça upload pelos ⋮ →
  *Fazer upload de arquivo* do SSH do navegador; ou
- **Do seu PC**: `gcloud compute scp ./MINHAS_ROMS/* NOME_DA_VM:~/cloud-game/assets/games/ --zone southamerica-east1-a`

Formatos aceitos: `.gb .gbc .gba .sfc .smc .md .gen .bin .nes …`
Depois de adicionar ROMs: `docker compose restart` (na pasta cloud-game).

### 5) Ligar no app
Me manda o endereço `http://SEU_IP:8000` — eu ponho na Vercel a variável
`NEXT_PUBLIC_CLOUD_GAMING_URL`, ou você mesmo em
**Vercel → Project → Settings → Environment Variables** (nome
`NEXT_PUBLIC_CLOUD_GAMING_URL`, valor o endereço). Redeploy e o cartão
**"Modo nuvem"** aparece no Fliperama.

---

## 🔒 HTTPS (se o vídeo não abrir no iPhone)

O Safari do iPhone costuma exigir **HTTPS** para WebRTC. Se em `http://IP:8000`
o vídeo não iniciar no celular, colocamos um proxy com TLS automático. Precisa de
um **domínio** apontando pro IP da VM (um subdomínio grátis serve). Na VM:
```bash
# Caddy faz HTTPS automático (Let's Encrypt)
sudo apt install -y caddy
echo 'seu-dominio.com { reverse_proxy localhost:8000 }' | sudo tee /etc/caddy/Caddyfile
sudo systemctl restart caddy
```
Abra também **TCP 443** no firewall. Aí o endereço vira `https://seu-dominio.com`.

---

## 💰 Custo (por que é "quase de graça")

- VM `e2-medium` em São Paulo: ~US$ 0,033/hora **só enquanto ligada**.
- Jogando ~10 h/mês e **parando a VM** depois → **~US$ 0,33/mês** + disco (~US$ 0,40).
- Parada o mês todo: só o disco (~US$ 0,40/mês).

O tráfego de vídeo do GB/SNES é pequeno (resolução baixa), então banda também é barata.

---

## Latência
Com a VM em São Paulo e 5G/Wi-Fi no Brasil: ~50–100 ms de input lag. Ótimo para
Pac-Man, RPG e plataforma; perceptível só em jogo de reflexo puro.
