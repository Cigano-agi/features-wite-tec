# WIA-297 — Subcontas: Multi-Seller por Usuário

**Tipo:** Epic  
**Status:** Pendente  
**Cross-cutting:** afeta todas as features existentes  
**Jira:** https://witegroup.atlassian.net/browse/WIA-297

---

## Problema

O modelo atual estabelece uma relação 1:1 entre `User` e `Seller` via coluna `Seller.userId` com constraint `UNIQUE`. Isso impede que:

- Um usuário opere múltiplas empresas/contas
- Times de suporte ou operadores gerenciem sellers sem criar usuários duplicados
- Grupos empresariais centralizem acesso em um único login

---

## Solução

Substituir o modelo 1:1 por uma tabela de junção `seller_users` com roles, permitindo que um usuário pertença a múltiplos sellers e que um seller tenha múltiplos usuários com papéis distintos.

**Modelo atual:**
```
User ─── (1:1) ─── Seller (via Seller.userId UNIQUE)
```

**Modelo alvo:**
```
User ─── (N:N) ─── Seller
         via seller_users (userId, sellerId, role)
```

---

## Fluxo do Usuário

```
1. Usuário faz login → recebe JWT com sellerId do seller padrão (OWNER mais antigo)
2. GET /me/sellers → lista todos os sellers que o usuário tem acesso
3. POST /auth/switch-seller { sellerId: "uuid" } → valida acesso em seller_users
   └── Retorna novo accessToken com sellerId e sellerRole atualizados no JWT
4. Todas as requisições subsequentes usam o novo JWT
   └── SellerContextGuard valida sellerId presente no token
   └── @SellerId() decorator extrai sellerId de forma padronizada
```

---

## Invariante Crítico

> O `sellerId` no JWT é **sempre** a fonte de verdade. Nunca aceitar `sellerId` do corpo da requisição, query string ou path params como override de contexto.

---

## Subtasks

### Fase A — Modelo de Dados

#### WIA-298 — Criar tabela `seller_users` (migração Prisma)

**Deve ser executado primeiro.**

```prisma
// schema.prisma
model SellerUser {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  sellerId  String   @map("seller_id")
  role      SellerRole @default(VIEWER)
  createdAt DateTime @default(now()) @map("created_at")

  user   User   @relation(fields: [userId], references: [id])
  seller Seller @relation(fields: [sellerId], references: [id])

  @@unique([userId, sellerId])
  @@index([userId])
  @@index([sellerId])
  @@map("seller_users")
}

enum SellerRole {
  OWNER
  ADMIN
  VIEWER
}
```

**Critérios de aceitação:**
- [ ] Migração Prisma gerada e aplicável sem erros
- [ ] Índices em `user_id` e `seller_id`
- [ ] Constraint unique em `(user_id, seller_id)` — um usuário não pode ter dois papéis no mesmo seller

---

#### WIA-299 — Remover constraint única de `Seller.userId`

Remover `@unique` da coluna `Seller.userId`, mantendo a FK como nullable para compatibilidade durante a migração.

```prisma
model Seller {
  userId String? @map("user_id")  // era @unique — agora nullable sem unique
  // demais campos...
}
```

**Critérios de aceitação:**
- [ ] Migração Prisma sem perda de dados
- [ ] Coluna `user_id` permanece como FK nullable (não dropar ainda — WIA-315)

---

#### WIA-300 — Seed: migrar usuários existentes para `seller_users` como OWNER

Criar script de migração de dados que popula `seller_users` para todos os pares User↔Seller existentes.

```sql
INSERT INTO seller_users (id, user_id, seller_id, role, created_at)
SELECT
  gen_random_uuid(),
  s.user_id,
  s.id,
  'OWNER',
  NOW()
FROM sellers s
WHERE s.user_id IS NOT NULL
ON CONFLICT (user_id, seller_id) DO NOTHING;
```

**Critérios de aceitação:**
- [ ] Script idempotente (pode ser executado múltiplas vezes sem duplicar registros)
- [ ] 100% dos sellers com `user_id` não nulo migrados para `seller_users` como OWNER
- [ ] Validação pós-seed: `SELECT COUNT(*) FROM sellers WHERE user_id IS NOT NULL` = `SELECT COUNT(*) FROM seller_users WHERE role = 'OWNER'`

---

### Fase B — Auth e Contexto

#### WIA-303 — JWT claims: `sellerId` ativo e `sellerRole`

Atualizar o payload do JWT para incluir o seller ativo e seu papel.

**Payload do JWT (novo):**

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "sellerId": "seller-uuid",
  "sellerRole": "OWNER",
  "iat": 1234567890,
  "exp": 1234567890
}
```

**Regras:**
- `sellerId` no JWT é o seller ativo no momento do login ou do último `switch-seller`
- Login inicial: usar o seller mais antigo onde o usuário é OWNER
- Se usuário não tiver seller: retornar erro — sem acesso sem seller

**Critérios de aceitação:**
- [ ] JWT contém `sellerId` e `sellerRole`
- [ ] `JwtStrategy` popula `req.user.sellerId` e `req.user.sellerRole`
- [ ] Testes: token decodificado contém os novos campos

---

#### WIA-301 — `GET /me/sellers` — listar sellers do usuário

```
GET /me/sellers
Auth: JWT
```

**Response 200:**

```json
{
  "sellers": [
    {
      "id": "seller-uuid",
      "name": "Empresa A",
      "role": "OWNER",
      "isActive": true
    },
    {
      "id": "seller-uuid-2",
      "name": "Empresa B",
      "role": "ADMIN",
      "isActive": false
    }
  ]
}
```

`isActive: true` indica o seller atualmente ativo no JWT do usuário.

**Critérios de aceitação:**
- [ ] Retorna apenas sellers onde o usuário tem entrada em `seller_users`
- [ ] `isActive` calculado comparando com `req.user.sellerId`

---

#### WIA-302 — `POST /auth/switch-seller` — trocar seller ativo

```
POST /auth/switch-seller
Auth: JWT
Body: { "sellerId": "uuid" }
```

**Fluxo:**
```
1. Validar que sellerId existe em seller_users para o userId do JWT
   └── 403 se usuário não tem acesso ao seller solicitado
2. Buscar role do usuário no seller alvo
3. Emitir novo accessToken com sellerId e sellerRole atualizados
4. Logar evento de switch (WIA-304)
```

**Response 200:**
```json
{
  "accessToken": "jwt...",
  "sellerId": "seller-uuid",
  "sellerRole": "OWNER"
}
```

**Response 403:**
```json
{
  "error": "seller_access_denied",
  "correlationId": "uuid"
}
```

**Critérios de aceitação:**
- [ ] 403 se usuário não tem acesso ao seller
- [ ] Novo token contém o `sellerId` correto
- [ ] Evento logado (WIA-304)

---

#### WIA-305 — `SellerContextGuard`

Guard NestJS que valida se `sellerId` está presente no JWT antes de permitir acesso a rotas de seller.

```typescript
@Injectable()
export class SellerContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    if (!request.user?.sellerId) {
      throw new ForbiddenException('seller_context_required')
    }
    return true
  }
}
```

Aplicar em todos os módulos que operam no contexto de um seller. Usar `@UseGuards(JwtAuthGuard, SellerContextGuard)`.

**Critérios de aceitação:**
- [ ] 403 em rotas de seller sem `sellerId` no token
- [ ] Guard testado isoladamente

---

#### WIA-306 — Decorator `@SellerId()`

Decorator que extrai `sellerId` do `request.user` de forma padronizada — substitui todos os `req.user.sellerId` diretos no código.

```typescript
// shared/decorators/seller-id.decorator.ts
export const SellerId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest()
    return request.user.sellerId
  }
)
```

**Uso nos controllers:**
```typescript
@Get()
async listLinks(@SellerId() sellerId: string) {
  return this.service.findAll(sellerId)
}
```

**Critérios de aceitação:**
- [ ] Decorator funciona em todos os controllers que o adotam
- [ ] Testes: sellerId extraído corretamente do contexto do request

---

### Fase C — Auditoria e RBAC

#### WIA-304 — Logs estruturados de switch-seller

Logar o evento de troca de seller com campos obrigatórios:

```json
{
  "event": "seller.switch",
  "userId": "uuid",
  "fromSellerId": "uuid",
  "toSellerId": "uuid",
  "sellerRole": "OWNER",
  "correlationId": "uuid",
  "timestamp": "ISO 8601"
}
```

**Critérios de aceitação:**
- [ ] Log gerado em cada chamada ao `/auth/switch-seller`
- [ ] Todos os campos obrigatórios presentes
- [ ] Sem PII nos logs (sem email, nome)

---

#### WIA-307 — Infraestrutura base de RBAC

Criar a infraestrutura mínima para verificação de role por rota. Não implementar RBAC completo agora — apenas a base para uso futuro.

```typescript
// shared/decorators/require-role.decorator.ts
export const RequireRole = (...roles: SellerRole[]) =>
  SetMetadata(ROLES_KEY, roles)

// shared/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<SellerRole[]>(ROLES_KEY, context.getHandler())
    if (!requiredRoles?.length) return true
    const { user } = context.switchToHttp().getRequest()
    return requiredRoles.includes(user.sellerRole)
  }
}
```

**Critérios de aceitação:**
- [ ] `@RequireRole('OWNER')` bloqueia ADMIN e VIEWER
- [ ] Rotas sem `@RequireRole` permitem qualquer role autenticada

---

### Fase D — Mapeamento Legado

#### WIA-308 — Catalogar pontos de código com modelo 1:1

Antes de refatorar, mapear todos os pontos que usam o modelo legado.

**Comando de busca:**
```bash
grep -rn "Seller\.userId\|req\.user\.seller\b\|seller_id.*body\|sellerId.*params" src/
```

**Saída esperada:** Lista de arquivos e linhas onde o modelo 1:1 está em uso. Salvar em `docs/legacy-seller-map.md`.

**Critérios de aceitação:**
- [ ] Documento `legacy-seller-map.md` criado com todos os pontos mapeados
- [ ] Estimativa de esforço de refatoração por módulo

---

### Fase E — Refatoração das Features Existentes

Todas as subtasks abaixo seguem o mesmo padrão: substituir o acesso legado ao `sellerId` pelo decorator `@SellerId()` e garantir que `SellerContextGuard` está aplicado na rota.

#### WIA-309 — Refatorar API Keys

#### WIA-310 — Refatorar Webhooks (rotas de seller)

#### WIA-311 — Refatorar Transactions (rotas de seller)

#### WIA-312 — Refatorar Withdrawals

#### WIA-313 — Refatorar Wallet / BalanceStatement

#### WIA-314 — Refatorar Acquirer Configs

**Para cada módulo acima:**
- [ ] `@SellerId()` decorator em todos os handlers que recebem `sellerId`
- [ ] `SellerContextGuard` aplicado em todas as rotas do módulo
- [ ] Testes unitários atualizados
- [ ] Sem acesso direto a `req.user.sellerId` no controller

---

#### WIA-315 — Remover todo código legado 1:1

Executado após WIA-309 a WIA-314 estarem completos e em produção.

- Remover coluna `Seller.userId` do schema Prisma (migration)
- Remover todos os acessos legados mapeados em WIA-308
- `seller_users` é a única fonte de verdade para relação User↔Seller

**Critérios de aceitação:**
- [ ] Coluna `Seller.userId` removida do banco
- [ ] `grep "Seller\.userId"` retorna zero resultados no codebase
- [ ] Testes de integração passando sem o campo legado

---

## Dependências entre subtasks

```
WIA-298 → WIA-299 → WIA-300
               ↓
          WIA-303
               ↓
     WIA-301, WIA-302 (paralelos)
          WIA-305, WIA-306 (paralelos)
               ↓
          WIA-304, WIA-307 (paralelos)
               ↓
          WIA-308
               ↓
  WIA-309, WIA-310, WIA-311, WIA-312, WIA-313, WIA-314 (todos paralelos)
               ↓
          WIA-315
```

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Usuários existentes perdem acesso ao seller após migração | WIA-300 executa seed de OWNER antes de qualquer mudança de comportamento |
| sellerId aceito do body de requisição por descuido | WIA-305 e WIA-306 padronizam extração; code review obrigatório |
| Remoção da coluna userId quebra queries legadas não mapeadas | WIA-308 mapeia todos os pontos antes de WIA-315 |
| Switch-seller sem log dificulta auditoria de segurança | WIA-304 obrigatório antes de habilitar o endpoint em produção |
