# Registro de ventas en Solana — Proyecto final (Ruta B)

Proyecto final del **Solana Engineering Track: Advanced** de WayLearn.

| | |
|---|---|
| **Ruta elegida** | **B — Proyecto guiado con mejora funcional** |
| **Nombre para el certificado** | Jesus Salvador Juárez Maya |
| **Correo del registro** | jjjuarezmaya@gmail.com |
| **Red** | Devnet |
| **Program ID** | [`AAXbCn12Pp2pSpudogSgU1TF67j9JhPBu15uN89dFcWF`](https://explorer.solana.com/address/AAXbCn12Pp2pSpudogSgU1TF67j9JhPBu15uN89dFcWF?cluster=devnet) |

## Propósito

Aplicación para llevar el registro de ventas de un negocio en Solana. Un **Registro** (negocio) tiene **Clientes**, y cada cliente tiene **Ventas** activas. Todas son cuentas PDA derivadas de su cuenta padre:

```
registro <- ["registro", nombre_negocio, owner]
cliente  <- ["cliente",  registro, id_cliente (u16 LE)]
venta    <- ["venta",    cliente,  sku]
```

Solo la wallet `owner` del registro puede escribir (`has_one = owner`).

## Versión de partida

- **Programa:** [WayLearnLatam/Registro-Ventas-Solana-PDA](https://github.com/WayLearnLatam/Registro-Ventas-Solana-PDA), con las cinco instrucciones base: `crear_registro`, `crear_cliente`, `registrar_venta`, `cambiar_monto` y `hacer_devolucion`.
- **Frontend:** este repositorio (fork de [WayLearnLatam/Registro-Ventas-Solana-App](https://github.com/WayLearnLatam/Registro-Ventas-Solana-App)), partiendo de `npm run clase:resuelto` (base del día 4).

## Qué se añadió (aporte propio)

### 1. Baja de cliente (base obligatoria del día 5)

**Programa**: `programa/src/lib.rs`. Instrucción nueva: `eliminar_cliente(id_cliente: u16)` con su contexto `EliminarCliente`.

- **Autoridad:** `owner` firma y `has_one = owner @ NoOwner`.
- **PDA del cliente:** se valida con las mismas semillas del proyecto (`registro` + `id_cliente`).
- **Pertenencia:** el cliente debe estar en `registro.clientes`, o la instrucción falla con `ClienteNoRegistrado`.
- **Precondición:** `cliente.historial.is_empty() && cliente.compras == 0`, o la instrucción falla con `ClienteConVentas`.
- **Índice:** se retira solo la dirección de ese cliente de `registro.clientes`.
- **Cierre:** `close = owner`; el rent vuelve a la autoridad.
- **Contador:** `id_counter` **no se modifica**, así que los IDs no se reutilizan.
- **Atomicidad:** validación, índice y cierre ocurren en una sola instrucción. Si algo falla, no cambia nada.

**Frontend:**
- `src/solana/acciones.ts`: nueva función `eliminarCliente()`, con los mismos validadores, PDAs, el constructor generado `getEliminarClienteInstruction` y `enviar`.
- `src/components/Registro.tsx`: nueva pestaña **"Baja de cliente"**, que solo pide el ID del cliente y reutiliza los estados de firma, confirmación, error y recarga.

### 2. Mejora funcional: validación de monto en Rust

`#[max_len]` solo reserva espacio y no valida reglas de negocio. Se añadió la regla **"el monto debe ser mayor a 0"** directamente en el programa:

- `registrar_venta`: `require!(monto > 0, Errores::MontoInvalido)`.
- `cambiar_monto`: `require!(nuevo_monto > 0, Errores::MontoInvalido)`.

Así el programa protege el dato aunque alguien envíe la transacción sin pasar por el frontend. Su caso de rechazo está comprobado en Devnet (R1 y R2, más abajo).

### 3. Mejora en el manejo de errores del frontend

**Problema detectado:** cuando el programa rechazaba una operación, Solflare solo devolvía `Internal error`, y el usuario no sabía por qué ([captura antes](evidencias/capturas/03a-baja-rechazada-antes-internal-error.png)).

**Corrección** (`src/solana/tx.ts`): antes de pedir la firma, `enviar()` **simula la transacción contra el programa desplegado**. Si el programa la rechaza, se lanza `ErrorSimulacion` con los logs, y `traducir()` muestra el error real del IDL en español. Por ejemplo: *"ClienteConVentas: Error, el cliente tiene ventas activas y no puede darse de baja"* ([captura después](evidencias/capturas/03b-baja-rechazada-clienteconventas.png)). Además, la wallet ya no pide firmar una operación que va a fallar.

### Errores del programa

Los dos errores originales conservan su orden, y los nuevos se agregaron al final:

| Código | Nombre | Uso |
|---|---|---|
| 6000 | `NoOwner` | La wallet no es la autoridad del registro |
| 6001 | `NoSKU` | La venta no está en el historial del cliente |
| 6002 | `ClienteConVentas` | **Nuevo.** Baja de un cliente con ventas activas |
| 6003 | `ClienteNoRegistrado` | **Nuevo.** El cliente no está en el índice del registro |
| 6004 | `MontoInvalido` | **Nuevo (mejora).** Monto igual a 0 |

## Estructura relevante

```
programa/src/lib.rs                 Programa Anchor (desplegado en Devnet)
programa/client/pruebas_rechazo.ts  Pruebas controladas para Solana Playground
idl.json                            IDL exportado del despliegue
src/config/programa.json            Program ID configurado
clients/js/src/generated/           Cliente generado con Codama (incluye eliminarCliente.ts)
src/solana/acciones.ts              Operaciones del frontend (+ eliminarCliente)
src/solana/tx.ts                    Envío, simulación previa y traducción de errores
src/components/Registro.tsx         Interfaz (+ pestaña "Baja de cliente")
evidencias/                         Salida de pruebas y capturas
```

## Configuración y ejecución

### Requisitos
- Wallet de navegador (Solflare) en **Devnet**, con SOL de prueba (https://faucet.solana.com).
- GitHub Codespaces (recomendado) o Dev Containers en local.

### Programa (Solana Playground)
1. Abrir https://beta.solpg.io e importar `programa/src/lib.rs`.
2. **Build** y **Deploy** en Devnet. Para revisar no hace falta desplegar: el programa ya está desplegado con el Program ID de arriba.

### Frontend
```bash
npm install
npm run comprobar:idl   # Comprueba que IDL, Program ID y cliente generado coinciden
npm run verificar       # Comprobaciones del template
npm run dev             # Abre el puerto 5173
```
En la app: **Conectar wallet** (Solflare, Devnet) → escribir el nombre del negocio → **Consultar registro**.

## Cómo probarlo

### A. Desde la app (autoridad `9Atc7gce2GBAVxLKsxPCMVERMyd4ZdWAu7QuJwTqnB9z`, negocio `Cafe WayLearn D1`)

| # | Caso | Resultado observado | Evidencia |
|---|---|---|---|
| 1 | Crear registro | Registro creado, legible desde la app | [tx](https://explorer.solana.com/tx/2XiJEThA4iHVPTCJsAtAxLCZVkpHYjSmAhzfcPkiy4QFnpiTYjNS7cK5n8Jf27vLeCPWpzuufxnHKH5oQqQa3kWf?cluster=devnet) |
| 2 | Crear cliente "Salvador" | Cliente #1, último ID asignado = 1 | [tx](https://explorer.solana.com/tx/6SUotT84MKpuZHMNDbPd4zTkynhbHZ9sNArLmGviNQgsMNMY5yN4gxgKkh6e9514DHwhouSpZscsRcTMkDuLEjy?cluster=devnet) · [captura](evidencias/capturas/01-cliente-1-salvador.png) |
| 3 | Crear cliente "Jose" | Cliente #2, 0 ventas | [tx](https://explorer.solana.com/tx/8AMgtayKhGrAyDyKkKS7xEgwDJWAj1rQLkUGbb4221GrXBpGBGsXypaM9Y1nCUEsq2MvXQ43HaJqJJUHjsycVQd?cluster=devnet) |
| 4 | Registrar venta CAF01 (35) a Salvador | Venta creada; Salvador con 1 venta activa | [tx](https://explorer.solana.com/tx/UrCPrEoroyXsNm4cKqWoUaeDuRgzHabcyy9ber3RCUWF9ZRcGxxY5jwVzRSM9Y5mZtRRtAQ9QCD8kuauKgEheq1?cluster=devnet) |
| 5 | Corregir importe CAF01: 35 → 50 | Cambia el monto de la misma venta y conserva la relación | [tx](https://explorer.solana.com/tx/27GWiBGDqhrkbbkBMNhmHquVzKh62Zf7ZHtTcXHcyzTpdZwBs5UaHC7nCArZ3Z59jYJ5CzY1wx5TTQZAmCR3McvM?cluster=devnet) · [captura](evidencias/capturas/02-corregir-importe.png) |
| 6 | Devolución CAF01 de Salvador | Venta cerrada; Salvador con 0 ventas | [tx](https://explorer.solana.com/tx/5UszTacJzoK4XYGVijDndW7N7Ue6hvLbcvmvFC9t6frjTc3eJS1qFfyVn2Rr2Uw2zxgMJmWYimo5oA6cQwngSBhP?cluster=devnet) |
| 7 | Registrar venta PAN01 (20) a Jose | Jose con 1 venta activa | [tx](https://explorer.solana.com/tx/Fa6bbxL5jiy4yLGPna5de1is5K3tdCpHJL99NnyB3DKhi7KANmGTyY2kHeKdBakwqPx2oFnd6enLxwjp8pJ1Zpv?cluster=devnet) |
| 8 | **Rechazo:** baja de Jose con venta activa | El programa rechaza en la simulación previa con `ClienteConVentas`; Jose y PAN01 se conservan | [captura](evidencias/capturas/03b-baja-rechazada-clienteconventas.png) |
| 9 | Baja de Salvador (sin ventas) | Cuenta cerrada, se retira del registro y Jose queda intacto | [tx](https://explorer.solana.com/tx/5vgftjDhNH3JAFH2zvMCe2WpvjWgBSVngkdZnxzQDruqAbYFj2GWw9tX4FUBjoKHF1HCTZ9NJqPTjhsqTcM8oToS?cluster=devnet) · [captura](evidencias/capturas/04-baja-valida-salvador.png) |
| 10 | Crear cliente "Maria" después de la baja | Cliente **#3**: el contador no retrocedió | [tx](https://explorer.solana.com/tx/2ymdbtNgicczTriA4LVFN4eHP6o7gs1KcBmtHQvCvWL3Kpn3JxJr4a4JBZTLQbPGWK5RAmxZ45R8USN6DBZTcgky?cluster=devnet) · [captura](evidencias/capturas/05-maria-cliente-3.png) |

El caso 8 se rechaza en la simulación previa, así que no genera una transacción consultable. Se conserva el error y se comprobó que el estado no cambió. El mismo caso con transacción fallida en cadena está en R5.

### B. Solicitudes controladas (Solana Playground)

`programa/client/pruebas_rechazo.ts` envía las instrucciones directamente al programa, sin las validaciones del frontend, con `skipPreflight: true`, para que **cada rechazo quede como transacción fallida consultable en Explorer**. Crea un negocio de pruebas propio (`Pruebas 49061`, autoridad `n7ZGjfmJCCaYsKSLsVLrkGyfJoBH327oMdQuvQZXkSf`) y lee el estado después de cada rechazo.

**Uso:** pegar el archivo en `client/client.ts` del proyecto de Playground y presionar **Run**. La salida completa está en [`evidencias/salida_pruebas_playground.txt`](evidencias/salida_pruebas_playground.txt).

| Caso | Esperado | Obtenido | Estado después | Evidencia |
|---|---|---|---|---|
| Preparación: registro, Ana #1, Luis #2, venta CAF01 (50) | ok | ok | — | [1](https://explorer.solana.com/tx/5aAwRKtACHAEkzQDydfH8xdtt1ioQRi3Gzy5UJfvAWAXAioZpoMe3MQPqDdAe4gWV9Ycm8wNCZHxsxQ7JzYqZicv?cluster=devnet) · [2](https://explorer.solana.com/tx/3CaQpkeiD4TAK4R2rKLNtiJ2a8gF7b2Yy9MS7M2MAUBD6noV6gadxQSzPeLWt5cywM1RN6J7YrhWnh7Mynhuap4S?cluster=devnet) · [3](https://explorer.solana.com/tx/5o3dBtuzSmfAD9F8wx48Vx85akkzbLh7oduMscWJsKzA6KKsjTpRQXSQrjCtGJZtqYWznyqhBgUWWHE29ycDg3v4?cluster=devnet) · [4](https://explorer.solana.com/tx/5QmvzJTcAs7AjTJ7V5VWRmicPYxSwugz1JAFrYq1psKkDg1dqfKYxGUe9bzejNDPXWNrGu1ofQokS5jUEyWcg2un?cluster=devnet) |
| **R1 (mejora)** Registrar venta con monto 0 | `MontoInvalido` (6004) | `MontoInvalido` | La venta PAN01 no existe; compras de Ana = 1 | [tx](https://explorer.solana.com/tx/21qomFErLvQGzqtVpCX35YZG7qAjXkuEk5VTs3SQ6EzpHjPEyfmDeoFfZUDqZXkb1K1dSEh7aq1bWpwbPX9vhWSt?cluster=devnet) |
| **R2 (mejora)** Corregir importe a 0 | `MontoInvalido` (6004) | `MontoInvalido` | Monto de CAF01 sigue en 50 | [tx](https://explorer.solana.com/tx/2eDndHZVSRRE1e2VaPSN87JTHh7p3vdadNGqh8mYZp2jvAKgPphuZ2EMBao7rpSxKuUyxxEPaEqjtT2MBvKwZsvb?cluster=devnet) |
| **R3** Wallet no autorizada corrige importe | `NoOwner` (6000) | `NoOwner` | Monto de CAF01 sigue en 50 | [tx](https://explorer.solana.com/tx/2gZv3884fbf1oyVKLBnSVx1zmgqvkyAEjtMnzQszxySeN32gbbyphHzev8MskA7GMiPyMm3hULM7kGUzeTS8Uw1a?cluster=devnet) |
| **R4** Venta de Ana presentada como de Luis | `ConstraintSeeds` (2006) | `ConstraintSeeds` | La venta de Ana existe; compras de Ana = 1 | [tx](https://explorer.solana.com/tx/2Cfev4Z1EjnCXNNnPFCwSpT2WdRQhnB9Fwp4FbLeNJ2XcAzR4rqRtU2Dz1Th4487ukHhewxHycWNtQM7Fk473yHv?cluster=devnet) |
| **R5** Baja de Ana con venta activa | `ClienteConVentas` (6002) | `ClienteConVentas` | Ana existe; 2 clientes; `id_counter` = 2 | [tx](https://explorer.solana.com/tx/2miDPoetvm1MvJ9hKXGAzR9X5T1uRpkKYv15oJLV3wJyUj3YutYMZ2u5JfVjXmzN1QDj4RRGuqWjwXNhfbCdwL6d?cluster=devnet) |
| Devolución válida de CAF01 | ok | ok | — | [tx](https://explorer.solana.com/tx/3XBtjR1RN399Sx9UjNNz9XkCopFrisQEXGCnA2gDCygq1N9iX7htkuJnZ9x9xoXHTYJ4gKJHV4V8Y7uT75oLGYsQ?cluster=devnet) |
| Baja válida de Ana | ok | ok | Ana cerrada; 1 cliente; `id_counter` = 2; Luis intacto | [tx](https://explorer.solana.com/tx/4hrUGPD8MhEUkhuERmPuwyniVMbfLxKon6UnLPQY9oCEapuMGDHx7UCR9hWjSPf2Z9sBxzuy9wCVqye8hoaKGokz?cluster=devnet) |
| Crear Marta después de la baja | ok, ID 3 | ok, ID 3 | — | [tx](https://explorer.solana.com/tx/3y6zCmRbcDvQc8UPh9yLZvV3BiREpuVa1gCHgzKWvQ39yT36k7BXnJT1tNmViPJVACAqbHKcnQvsJUAiGXgwNwBa?cluster=devnet) |

## Correspondencia con los criterios de acreditación

| Criterio | Dónde se demuestra |
|---|---|
| 1. Flujo funcional entre programa y frontend | Tabla A, casos 1 a 10, todos desde la app |
| 2. Reglas de autoridad, pertenencia y cierre | R3 (autoridad), R4 (pertenencia), R5 y caso 8 (cierre condicionado), casos 6 y 9 (cierre válido) |
| 3. Firma, confirmación, actualización y errores | Estados de firma y confirmación, recarga tras cada operación y mejora 3 (error real del programa) |
| 4. Resultados reproducibles | Instrucciones de ejecución, script `pruebas_rechazo.ts` y links de Explorer |
| 5. Aporte identificable | Baja de cliente, validación `MontoInvalido` (R1/R2) y simulación previa con errores traducidos |

## Uso de IA

Se usó un asistente de IA para apoyar la implementación y la redacción. Todos los cambios integrados se revisaron, se compilaron, se desplegaron en Devnet y se probaron con las operaciones documentadas arriba.
