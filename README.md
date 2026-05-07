# consulta-pe

Microservicio serverless para consulta de **DNI** y **RUC** en Perú a partir del scraping del portal público de SUNAT, con **cache en DynamoDB** y **refresh asíncrono vía SQS**.

Construido con NestJS, Playwright (Chromium en Lambda Layer vía `@sparticuz/chromium`) y Serverless Framework sobre AWS Lambda + API Gateway.

> ⚠️ Este servicio depende de la disponibilidad y estructura HTML del portal de SUNAT. Cualquier cambio en SUNAT puede romper el parser; usar bajo tu propio riesgo y respetando los términos de uso del sitio.

---

## Tabla de contenidos

- [Arquitectura](#arquitectura)
- [Endpoints](#endpoints)
- [Flujo de cache](#flujo-de-cache)
- [Requisitos](#requisitos)
- [Variables de entorno](#variables-de-entorno)
- [Desarrollo local](#desarrollo-local)
- [Build y despliegue](#build-y-despliegue)
- [Recursos AWS provisionados](#recursos-aws-provisionados)
- [Alarmas y notificaciones](#alarmas-y-notificaciones)
- [Estructura del proyecto](#estructura-del-proyecto)

---

## Arquitectura

```
                        ┌──────────────────────────────┐
   GET /api/dni/:dni    │   API Gateway (HTTP ANY)     │
   GET /api/ruc/:ruc    └──────────────┬───────────────┘
                                       │
                                       ▼
                           ┌────────────────────────┐
                           │   Lambda  main         │
                           │   (NestJS + Playwright)│
                           └─┬────────┬─────────────┘
                             │        │
              ┌──────────────┘        └──────────────┐
              ▼                                       ▼
   ┌────────────────────┐                  ┌──────────────────┐
   │  DynamoDB          │                  │  SQS RefreshQueue │
   │  consulta-pe-cache │                  │  (mensajes stale) │
   │  PK: pk            │                  └────────┬──────────┘
   │  TTL: 1 año        │                           │
   └─────────┬──────────┘                           ▼
             │                          ┌──────────────────────┐
             │     ◄────  upsert ──────│  Lambda refreshWorker │
             │                          │  (scrape + put)      │
             │                          └──────────┬───────────┘
             │                                     │
             │                                     ▼
             │                              ┌──────────────┐
             │                              │  Refresh DLQ │
             │                              └──────────────┘
             │
             └──── SUNAT (https://e-consultaruc.sunat.gob.pe) ◄─── scraping
```

---

## Endpoints

| Método | Ruta              | Body                  | Respuesta                |
|--------|-------------------|-----------------------|--------------------------|
| GET    | `/api/dni/:dni`   | —                     | `DniData`                |
| POST   | `/api/dni`        | `{ "dni": "12345678" }` | `DniData`              |
| GET    | `/api/ruc/:ruc`   | —                     | `RucData`                |
| POST   | `/api/ruc`        | `{ "ruc": "20100148162" }` | `RucData`           |
| GET    | `/`               | —                     | `"consulta-pe ok"`       |

`DniData` y `RucData` están definidos en [`src/sunat/sunat-scraper.service.ts`](src/sunat/sunat-scraper.service.ts).

### Ejemplo

```bash
curl https://<api-id>.execute-api.us-east-1.amazonaws.com/dev/api/ruc/20100148162
```

```json
{
  "ruc": "20100148162",
  "razon_social": "EJEMPLO S.A.C.",
  "tipo_contribuyente": "SOCIEDAD ANONIMA CERRADA",
  "nombre_comercial": "EJEMPLO",
  "estado": "ACTIVO",
  "condicion": "HABIDO",
  "direccion": "AV. EJEMPLO 123",
  "departamento": "LIMA",
  "provincia": null,
  "distrito": "MIRAFLORES",
  "actividades_economicas": ["..."]
}
```

---

## Flujo de cache

Para cada consulta el servicio sigue el patrón **read-through con refresh asíncrono**:

1. Busca `pk = "<DNI|RUC>#<id>"` en DynamoDB.
2. **Cache hit**:
   - Devuelve la data inmediatamente.
   - Si `updatedAt` tiene **más de 24 h**, encola un mensaje `{kind, id}` en la cola SQS de refresh — el cliente nunca espera el re-scrape.
3. **Cache miss**: scrapea SUNAT en sincrónico, guarda en DynamoDB y devuelve la data.

El **`refreshWorker`** consume la cola, vuelve a scrapear y reescribe el item. Si falla 3 veces el mensaje pasa a la **DLQ** y dispara la alarma.

**TTL de DynamoDB**: 1 año. Se almacena como atributo `ttl` (epoch en segundos) y DynamoDB lo borra automáticamente.

Constantes relevantes:
- `STALE_AFTER_MS` (24 h): definido en `dni.service.ts` y `ruc.service.ts`.
- `TTL_SECONDS` (365 días): definido en `cache.service.ts`.

---

## Requisitos

- Node.js 20.x
- npm (o pnpm — hay `pnpm-lock.yaml` disponible)
- Cuenta AWS con permisos para crear Lambda, API Gateway, DynamoDB, SQS, SNS, CloudWatch
- AWS CLI configurada (`aws configure --profile default`)
- Serverless Framework (se invoca vía `npx`, no requiere instalación global)

---

## Variables de entorno

Las inyecta `serverless.yml` en runtime; localmente puedes ponerlas en `.env`.

| Variable             | Descripción                                       | Default                  |
|----------------------|---------------------------------------------------|--------------------------|
| `CACHE_TABLE_NAME`   | Nombre de la tabla DynamoDB                       | `consulta-pe-cache-<stage>` |
| `REFRESH_QUEUE_URL`  | URL de la SQS de refresh                          | _(se inyecta vía CFN)_   |
| `AWS_REGION`         | Región AWS                                        | `us-east-1`              |
| `ALARM_EMAIL`        | Email destino para alarmas (en deploy time)       | `cuevacelis@gmail.com`   |
| `CHROMIUM_LAYER`     | Flag interno para usar el layer en Lambda         | `1`                      |

---

## Desarrollo local

```bash
npm install
npm run start:dev    # NestJS en watch mode (puerto 3000)
```

O con emulador serverless-offline:

```bash
npm run offline      # build + serverless offline (puerto 3001)
```

> Nota: en local el scraper usa Playwright/Chromium del sistema, **no** el layer.
> En local, las llamadas a DynamoDB y SQS apuntan a AWS real (con `--aws-profile default`); si no quieres tocar AWS, comenta los `await this.cache...` o configura un mock.

---

## Build y despliegue

```bash
# Build TypeScript
npm run build

# Deploy a AWS (stage por defecto: dev)
npx serverless deploy --aws-profile default

# Otro stage
npx serverless deploy --aws-profile default --stage prod

# Remove
npx serverless remove --aws-profile default
```

`provider.profile` ya está parametrizado: usa `--aws-profile <nombre>`, la env `AWS_PROFILE`, o cae a `default`.

---

## Recursos AWS provisionados

CloudFormation crea por stage:

- **`AWS::Lambda::Function`** `main` — API NestJS (HTTP ANY).
- **`AWS::Lambda::Function`** `refreshWorker` — consumidor SQS.
- **`AWS::Lambda::LayerVersion`** Chromium — `@sparticuz/chromium`.
- **`AWS::DynamoDB::Table`** `consulta-pe-cache-<stage>` — PK `pk`, TTL `ttl`, `PAY_PER_REQUEST`.
- **`AWS::SQS::Queue`** `consulta-pe-refresh-<stage>` — con `RedrivePolicy` (3 reintentos).
- **`AWS::SQS::Queue`** `consulta-pe-refresh-dlq-<stage>` — DLQ, retención 14 días.
- **`AWS::SNS::Topic`** `consulta-pe-alarms-<stage>` + suscripción email.
- **3 `AWS::CloudWatch::Alarm`**: errores Lambda main, errores Lambda worker, mensajes en DLQ.

---

## Alarmas y notificaciones

Se notifica vía email a `${ALARM_EMAIL}` cuando:

- ❌ La Lambda **`main`** registra ≥1 error en una ventana de 60 s.
- ❌ La Lambda **`refreshWorker`** registra ≥1 error en una ventana de 60 s.
- 📨 Llega ≥1 mensaje a la **DLQ** (significa que un refresh falló 3 veces).

> **Importante**: tras el primer deploy AWS envía un email de confirmación a la dirección configurada. Hay que hacer click en el link **"Confirm subscription"** o no llegarán las alarmas.

Para cambiar el email sin tocar el repo:

```bash
ALARM_EMAIL=otro@correo.com npx serverless deploy --aws-profile default
```

---

## Estructura del proyecto

```
src/
├── app.module.ts            # Root module
├── main.ts                  # Lambda handler HTTP (NestJS + serverless-express)
├── worker.ts                # Lambda handler SQS (refresh worker)
├── cache/
│   ├── cache.module.ts
│   ├── cache.service.ts          # DynamoDB get/put (single-table, PK = kind#id)
│   └── refresh-queue.service.ts  # SQS publisher
├── dni/
│   ├── dni.controller.ts
│   ├── dni.module.ts
│   ├── dni.service.ts            # Cache-first DNI
│   └── dto/consulta-dni.dto.ts
├── ruc/
│   ├── ruc.controller.ts
│   ├── ruc.module.ts
│   ├── ruc.service.ts            # Cache-first RUC
│   └── dto/consulta-ruc.dto.ts
└── sunat/
    ├── sunat.module.ts
    └── sunat-scraper.service.ts  # Playwright + cheerio

layer-chromium/nodejs/       # Lambda Layer con @sparticuz/chromium
serverless.yml               # Infra como código
```

---

## Licencia

ISC. Usalo bajo tu propia responsabilidad y respeta los términos del portal de SUNAT.
