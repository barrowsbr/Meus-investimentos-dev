# Logos dos ativos

Coloque aqui os logos das empresas/ETFs como **PNG**, com o nome = ticker sem
sufixo de bolsa, em MAIÚSCULAS. Exemplos:

```
public/logos/PETR4.png
public/logos/TSM.png
public/logos/VOO.png
```

Esses arquivos têm **prioridade** (permanentes/offline). Quando não houver um
arquivo aqui, o componente `AssetLogo` chama o resolver `/api/logo/<ticker>`
(brapi para B3, FMP, logo.dev, Parqet e favicon por domínio) e, em último caso,
mostra um avatar de iniciais coloridas.

Para melhorar a cobertura de nomes e logos, edite o mapa em
`lib/asset-brands.ts` (ticker → nome + domínio).
