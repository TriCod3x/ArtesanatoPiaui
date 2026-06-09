# 🏺 Artesanatos Piauí — Marketplace de Artesanato Piauiense

> Plataforma completa para artesãos do Piauí divulgarem e venderem seus produtos para o Brasil inteiro.

![ArtesanatosPiauí](https://img.shields.io/badge/Artesanatos-Piauí-C4622D?style=for-the-badge)
![Version](https://img.shields.io/badge/versão-1.0.0-orange?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

---

## 📋 Sobre o Projeto

O **Artesanatos Piauí** é um marketplace focado na cultura e na produção artesanal piauiense. A plataforma conecta artesãos locais — de cerâmica, capim dourado, couro, bordado e muito mais — a compradores de todo o Brasil, de forma simples, direta e sem intermediários desnecessários.

O projeto nasceu da ausência de uma solução digna para os artesãos do estado: o que existia era genérico, sem identidade e sem funcionalidade real. Este sistema resolve isso com uma vitrine profissional, gestão de loja completa e contato direto via WhatsApp.

---

## 👥 Perfis de Acesso

| Perfil | Área | Função |
|--------|------|--------|
| **Comprador** | Vitrine pública | Explora produtos, favorita, adiciona ao carrinho e contata vendedores |
| **Vendedor** | Dashboard do artesão | Cria e gerencia sua loja, cadastra produtos, acompanha pedidos e comissões |
| **Admin** | Painel administrativo | Aprova lojas, gerencia usuários e acompanha comissões da plataforma |

---

## ✨ Funcionalidades

### 🛍️ Vitrine Pública
- Home com **hero em foto real** de artesanato piauiense
- Grid de categorias: Cerâmica, Capim Dourado, Couro, Bordado, Madeira, Palha, Bijuteria, Pintura
- Seção de **produtos em destaque** e **lojas em destaque**
- Busca por produtos, lojas e categorias
- Filtros por categoria, faixa de preço e cidade
- **Modo escuro** com toggle manual + detecção automática do sistema

### 🏪 Página da Loja
- Banner e logo personalizáveis por upload
- Descrição, cidade, avaliação média e total de vendas
- Botões de contato direto: **WhatsApp** (abre conversa com mensagem pré-definida) e **Instagram**
- Grid de produtos da loja com filtros
- **Feed da comunidade**: artesão pode postar fotos e textos sobre seu trabalho

### 📦 Página do Produto
- Galeria de até 5 fotos com navegação
- Nome, categoria, descrição, preço e estoque
- Botão **"Falar com vendedor no WhatsApp"** com mensagem automática citando o produto
- Informações da loja com link para o perfil completo
- Produtos relacionados da mesma loja

### 🧑‍🎨 Dashboard do Vendedor
- Cards de resumo: produtos ativos, pedidos pendentes, vendas do mês, avaliação média
- Atalhos rápidos: gerenciar produtos, editar loja, ver pedidos
- Link direto para a loja pública
- Estado motivacional quando ainda não há produtos cadastrados

### ⚙️ Gerenciamento da Loja
- Formulário completo: nome, URL, descrição, cidade, estado
- Upload de **banner** (1200×300px) e **logo** (200×200px) direto no Supabase Storage
- Campos de contato: **WhatsApp** (obrigatório, somente números com DDD) e **Instagram** (opcional, sem @)
- Geração automática de slug a partir do nome

### 📝 Cadastro de Produtos
- Nome, categoria, descrição, preço, estoque e tags
- Upload de até **5 fotos** por produto
- Slug gerado automaticamente
- Status: ativo, inativo ou sem estoque
- Opção de marcar como **produto em destaque**

### 🛒 Carrinho
- Adicionar produtos de múltiplas lojas
- Painel lateral slide-in com overlay
- Controle de quantidade por item
- Total calculado em tempo real
- Persistido em memória durante a sessão

### ❤️ Favoritos
- Favoritar produtos e lojas com um clique
- Página dedicada com todos os favoritos do usuário
- Sincronizado com o banco de dados (requer login)

### 🔐 Autenticação
- Cadastro separado para **compradores** (`/cadastro`) e **vendedores** (`/vender/cadastro`)
- Login com email e senha via **Supabase Auth**
- Criação automática de perfil via trigger ao cadastrar
- Proteção de rotas por role: `buyer`, `seller`, `admin`
- Sessão gerenciada via middleware Next.js

### 💰 Comissões
- Taxa configurável por loja (padrão: 10%)
- Registro automático de comissão a cada venda confirmada
- Relatório de comissões pendentes e pagas no painel admin

---

## 🗂️ Estrutura do Projeto

```
artesanatos-piaui/
├── src/
│   ├── app/
│   │   ├── (auth)/             # Login e cadastro (comprador e vendedor)
│   │   ├── (public)/           # Vitrine: lojas, produtos, categorias
│   │   ├── (buyer)/            # Área do comprador: favoritos, pedidos, carrinho
│   │   ├── (seller)/           # Área do vendedor: dashboard, loja, produtos
│   │   └── (admin)/            # Painel admin: aprovações, comissões
│   ├── components/
│   │   ├── layout/             # Header, Footer
│   │   ├── home/               # Hero, categorias, destaques
│   │   ├── store/              # Cards e página de loja
│   │   ├── product/            # Cards, galeria e formulário de produto
│   │   ├── cart/               # Drawer do carrinho
│   │   └── shared/             # ImageUpload, StarRating, WhatsAppButton
│   ├── actions/                # Server Actions: auth, stores, products, orders
│   ├── hooks/                  # useAuth, useCart, useFavorites, useStore
│   ├── lib/
│   │   ├── supabase/           # Client, server e middleware
│   │   ├── utils.ts            # formatPrice, generateSlug, formatWhatsApp
│   │   └── validations.ts      # Schemas Zod
│   └── types/                  # Tipos TypeScript gerados do Supabase
├── public/
│   └── capa.jpg                # Foto do hero (artesanato piauiense real)
├── middleware.ts               # Proteção de rotas por role
└── .env.local                  # Variáveis de ambiente (não commitado)
```

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 14 (App Router) |
| Linguagem | TypeScript |
| Estilização | Tailwind CSS |
| Componentes | shadcn/ui |
| Banco de Dados | Supabase (PostgreSQL) |
| Autenticação | Supabase Auth |
| Storage | Supabase Storage |
| Formulários | React Hook Form + Zod |
| Tipografia | Playfair Display + Inter |
| Deploy | Vercel |

---

## 🗄️ Banco de Dados (Supabase)

O schema completo está em `artesanatos_piauí_schema.sql`. Tabelas principais:

```
profiles        → dados de usuários (comprador / vendedor / admin)
categories      → 9 categorias de artesanato (seed incluso)
stores          → lojas dos artesãos com status e comissão
store_contacts  → WhatsApp, Instagram, email por loja
products        → produtos com preço, estoque, tags e status
product_images  → até 5 fotos por produto (Supabase Storage)
orders          → pedidos com status e observações
order_items     → itens do pedido (cross-loja)
commissions     → comissões por venda (taxa configurável)
favorites       → produtos e lojas favoritados
reviews         → avaliações com recálculo automático de rating
posts           → feed da comunidade de artesãos
```

**Triggers automáticos:**
- Cria `profile` ao registrar novo usuário
- Atualiza `updated_at` em todas as tabelas
- Recalcula rating da loja ao receber avaliação
- Desconta estoque ao confirmar pedido

**RLS ativo:** cada vendedor acessa apenas os próprios dados.

---

## 🚀 Como Rodar Localmente

### Pré-requisitos
- Node.js 18+
- Conta no [Supabase](https://supabase.com)

### 1. Clone o repositório
```bash
git clone https://github.com/TriCod3x/ArtesanatoPiaui.git
cd ArtesanatoPiaui/artesanatos-piaui
```

### 2. Configure o ambiente
```bash
cp .env.example .env.local
```

Edite o `.env.local` com suas credenciais:
```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-publica-aqui
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-aqui
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Instale as dependências
```bash
npm install
```

### 4. Configure o banco de dados
Acesse o **SQL Editor** do Supabase e execute o arquivo `artesanatos_piauí_schema.sql`.

### 5. Inicie o servidor
```bash
npm run dev
```

### 6. Acesse no navegador
```
http://localhost:3000              # Vitrine pública
http://localhost:3000/cadastro     # Cadastro de comprador
http://localhost:3000/vender       # Landing page do vendedor
http://localhost:3000/dashboard    # Dashboard do vendedor (requer login)
```

---

## 🔄 Fluxo Principal

```
Vendedor se cadastra em /vender/cadastro
        ↓
Cria sua loja em /minha-loja/nova
(status: pendente — aguarda aprovação do admin)
        ↓
Admin aprova a loja no painel
(status: ativa — loja aparece na vitrine)
        ↓
Vendedor cadastra produtos com fotos e preço
        ↓
Comprador encontra o produto na vitrine
(busca, categorias ou destaques)
        ↓
Comprador clica em "Falar no WhatsApp"
        ↓
Conversa direta entre comprador e vendedor
Negociação e pagamento (Pix/transferência)
        ↓
Vendedor confirma o pedido no dashboard
        ↓
Comissão registrada automaticamente
Admin acompanha no painel de comissões
```

---

## 🎨 Identidade Visual

| Token | Cor | Uso |
|-------|-----|-----|
| `primary` | `#C4622D` | Terracota — CTAs, destaques |
| `cream` | `#F5EDD6` | Creme palha — backgrounds claros |
| `green` | `#5C7A2E` | Verde capim dourado — acentos |
| `dark` | `#1A1208` | Noite do sertão — texto e dark mode |
| `amber` | `#D4920A` | Âmbar — badges, ratings |

**Tipografia:** Playfair Display (títulos) + Inter (interface)

---

## 👥 Contribuidores

| Nome | GitHub |
|------|--------|
| João William | [@zJoaozz](https://github.com/zJoaozz) |

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

<p align="center">Feito com 🧡 para os artesãos do Piauí</p>
