# Sprint Armi · Dashboard del equipo

Tablero en vivo del sprint del equipo **Armi Delivery Remo** (proyecto `ADR` en Jira de Farmatodo). Conecta vía **OAuth 2.0 (3LO)** a Atlassian — no requiere API tokens manuales.

Pensado como herramienta del líder técnico para:

- Ver el estado del sprint sin entrar a Jira (KPIs, gráficos, tabla)
- Identificar HU sin asignar, ítems sin movimiento, bugs activos
- Marcar miembros **junior** y darles seguimiento extra (alertas + chart por carga)
- Generar el **stand-up diario** copiable al portapapeles
- Llevar un **journal** del día a día (pedidos de stakeholders, lineamientos del jefe, decisiones, riesgos, bloqueos, spikes) con **impacto en sprint** declarado para visibilizarle a tu jefe el costo de cada cosa nueva

## Setup en 5 pasos

1. **Crea la app OAuth en Atlassian**
   - Ve a https://developer.atlassian.com/console/myapps/
   - Create -> OAuth 2.0 integration -> nombre: `Sprint Armi · Dashboard`
   - Permissions -> agrega **dos** APIs:
     - **Jira API** con scopes: `read:jira-work`, `read:jira-user`, `offline_access`
     - **User identity API** con scope: `read:me` *(sin esto el `/me` da 403)*
   - Authorization -> Callback URL: `http://localhost:3000/api/auth/callback`
   - Settings -> copia **Client ID** y **Secret**

2. **Configura variables de entorno**

   Si todavía no existe `.env.local`, cópialo desde el ejemplo:

   ```bash
   cp .env.local.example .env.local
   ```

   Edita `.env.local`:
   - Pega `ATLASSIAN_CLIENT_ID` y `ATLASSIAN_CLIENT_SECRET` del paso 1
   - El `SESSION_SECRET` ya viene generado (o regéneralo con `openssl rand -base64 48`)

3. **Instala dependencias**

   ```bash
   npm install
   ```

4. **Levanta en local**

   ```bash
   npm run dev
   ```

5. **Abre el navegador**

   http://localhost:3000 -> "Conectar con Atlassian" -> consent screen -> dashboard.

## Tabs del dashboard

| Tab | Para qué sirve |
|-----|----------------|
| **Resumen** | KPIs, gráficos de estado, tipo, prioridad y carga por persona |
| **Por Persona** | Tarjetas por asignado con su mix de items y % de avance |
| **Tabla completa** | Tabla buscable y ordenable de todas las issues del sprint |
| **Journal** | Bitácora del líder. Pedidos de stakeholders, lineamientos del jefe, decisiones, riesgos, bloqueos, spikes. Exportable a markdown |
| **Stand-up** | Vista por persona con "hoy / cerrado / bloqueos". Botón **copiar** para pegar en Slack |

El botón **👥 Juniors** del header abre el modal para marcar quiénes son miembros junior; los marcados aparecen con ⭐ en alertas, charts y stand-up.

## Refresco automático

El cliente consulta `/api/jira/sprint` cada 5 minutos (con TanStack Query). El header muestra "actualizado hace Xs · próximo refresh en Ys". También hay botón manual **↻ Refrescar**.

## Scripts

```bash
npm run dev        # next dev
npm run build      # next build
npm start          # next start (después de build)
npm run lint       # next lint
npm run typecheck  # tsc --noEmit
```

## Alertas Slack 2 veces al día (con coaching para juniors)

Hay un endpoint `POST /api/reports/digest?time=morning|afternoon` que:

1. Trae el sprint via API token (no necesita sesión)
2. Construye un mensaje con KPIs, foco/cierres del día, riesgos y **coaching personalizado por cada junior** (qué decirle, qué evitar, basado en su estado real en el sprint)
3. Lo manda a Slack via Incoming Webhook

### Setup adicional

Además de los pasos 1–5 del Setup principal:

1. **Webhook de Slack** → `https://api.slack.com/apps` → tu app → Incoming Webhooks → Add Webhook → copia la URL en `SLACK_WEBHOOK_URL`
2. **API token de Atlassian** → `https://id.atlassian.com/manage-profile/security/api-tokens` → Create → copia en `JIRA_API_TOKEN` (y pon tu email en `JIRA_USER_EMAIL`)
3. **`REPORTS_AUTH_TOKEN`** → ya viene generado en `.env.local`. Es la llave que protege el endpoint
4. **Lista de juniors** → pon en `ARMI_JUNIORS` los emails separados por coma (ej. `junior1@tuarmi.com,junior2@tuarmi.com`). Si lo dejas vacío, sale sin coaching

### Probar localmente sin spamear Slack

`preview=1` devuelve el mensaje en JSON en vez de mandarlo:

```bash
curl 'http://localhost:3000/api/reports/digest?time=morning&preview=1&token=TU_REPORTS_AUTH_TOKEN' | jq .markdown -r
```

Cuando se vea bien, ejecuta el envío real:

```bash
curl -X POST 'http://localhost:3000/api/reports/digest?time=morning' \
  -H "X-Reports-Token: TU_REPORTS_AUTH_TOKEN"
```

### Programar en Vercel

Ya hay un `vercel.json` con cron a las 13:00 y 21:00 UTC (= 9am y 5pm Caracas, lunes a viernes):

```json
{
  "crons": [
    { "path": "/api/reports/digest?time=morning",   "schedule": "0 13 * * 1-5" },
    { "path": "/api/reports/digest?time=afternoon", "schedule": "0 21 * * 1-5" }
  ]
}
```

Vercel inyecta automáticamente `Authorization: Bearer <CRON_SECRET>` en cada llamada del cron — sólo asegúrate de tener `CRON_SECRET` en las env vars del proyecto.

## Deploy a Vercel (opcional)

1. Crea una segunda app OAuth en Atlassian (separar dev/prod) con Callback URL apuntando a tu dominio de Vercel.
2. En Vercel -> Project Settings -> Environment Variables, configura las variables de `.env.production.example`.
3. `vercel --prod` o push a `main` si tienes auto-deploy.

## Personalizar

- **Cambiar de proyecto Jira:** edita `NEXT_PUBLIC_JIRA_PROJECT_KEY` y `NEXT_PUBLIC_JIRA_PROJECT_NAME` en `.env.local`.
- **Cambiar el JQL del sprint:** en `app/api/jira/sprint/route.ts` (por default usa `sprint in openSprints()`).
- **Persistencia del journal y de la lista de juniors:** localStorage del navegador (`armi.journal.v1`, `armi.sprint.juniors.v1`). Si limpias el caché del browser, se pierden — exporta a `.md` regularmente.

## Stack

- Next.js 14 (App Router) + React 18
- Tailwind CSS
- TanStack Query (refetch + cache)
- iron-session (cookie cifrada para los tokens OAuth)
- Recharts (gráficos)
