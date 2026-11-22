// =====================================================================
// Pruebas controladas de reglas del programa (Solana Playground, Devnet)
// ---------------------------------------------------------------------
// Ejecuta solicitudes "a mano", sin pasar por las validaciones del
// frontend, para demostrar que el PROGRAMA es quien rechaza.
// Se envian con skipPreflight: true para que cada rechazo quede como
// transaccion fallida consultable en Solana Explorer.
//
// Uso: pega este archivo en client/client.ts de Playground y presiona Run.
// Cada ejecucion crea un registro nuevo (nombre con sufijo), asi que se
// puede repetir sin conflictos.
// =====================================================================

const programId = pg.program.programId;
const owner = pg.wallet.keypair; // Autoridad del registro de pruebas
const conn = pg.connection;

// ---------- Derivacion de PDAs (mismas seeds que el programa) ----------
const u16le = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const pdaRegistro = (nombre: string, autoridad: web3.PublicKey) =>
  web3.PublicKey.findProgramAddressSync(
    [Buffer.from("registro"), Buffer.from(nombre), autoridad.toBuffer()],
    programId
  )[0];
const pdaCliente = (registro: web3.PublicKey, id: number) =>
  web3.PublicKey.findProgramAddressSync(
    [Buffer.from("cliente"), registro.toBuffer(), u16le(id)],
    programId
  )[0];
const pdaVenta = (cliente: web3.PublicKey, sku: string) =>
  web3.PublicKey.findProgramAddressSync(
    [Buffer.from("venta"), cliente.toBuffer(), Buffer.from(sku)],
    programId
  )[0];

const explorer = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

// ---------- Envio controlado ----------
// esperado: "ok" o el nombre del error que debe devolver el programa.
async function enviar(
  etiqueta: string,
  ix: web3.TransactionInstruction,
  firmantes: web3.Keypair[],
  esperado: string
) {
  const tx = new web3.Transaction().add(ix);
  const sig = await conn.sendTransaction(tx, firmantes, { skipPreflight: true });
  await conn.confirmTransaction(sig, "confirmed");

  let info: web3.VersionedTransactionResponse | null = null;
  for (let i = 0; i < 10 && !info; i++) {
    info = await conn.getTransaction(sig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!info) await new Promise((r) => setTimeout(r, 1000));
  }

  const fallo = !!info?.meta?.err;
  const lineaError =
    info?.meta?.logMessages?.find((l) => l.includes("Error Code")) ?? "";
  const obtenido = fallo
    ? (lineaError.match(/Error Code: (\w+)/)?.[1] ?? "ErrorDesconocido")
    : "ok";
  const cumple = obtenido === esperado;

  console.log(`\n[${cumple ? "OK" : "REVISAR"}] ${etiqueta}`);
  console.log(`  Esperado: ${esperado} | Obtenido: ${obtenido}`);
  if (lineaError) console.log(`  ${lineaError.replace("Program log: ", "")}`);
  console.log(`  ${explorer(sig)}`);
  return { sig, obtenido };
}

const leerRegistro = (p: web3.PublicKey) => pg.program.account.registro.fetch(p);
const leerCliente = (p: web3.PublicKey) => pg.program.account.cliente.fetch(p);
const leerVenta = (p: web3.PublicKey) => pg.program.account.venta.fetch(p);
const existe = async (p: web3.PublicKey) => (await conn.getAccountInfo(p)) !== null;

// =====================================================================
const nombre = `Pruebas ${Date.now() % 100000}`; // <= 30 bytes
const registro = pdaRegistro(nombre, owner.publicKey);
const ana = pdaCliente(registro, 1);
const luis = pdaCliente(registro, 2);
const ventaAna = pdaVenta(ana, "CAF01");
const system = web3.SystemProgram.programId;

console.log("Programa:", programId.toBase58());
console.log("Autoridad de pruebas:", owner.publicKey.toBase58());
console.log("Negocio:", nombre, "->", registro.toBase58());

// ---------- Preparacion: registro, 2 clientes, 1 venta ----------
await enviar(
  "Crear registro",
  await pg.program.methods.crearRegistro(nombre)
    .accountsStrict({ owner: owner.publicKey, registro, systemProgram: system })
    .instruction(),
  [owner], "ok"
);
await enviar(
  "Crear cliente #1 Ana",
  await pg.program.methods.crearCliente("Ana")
    .accountsStrict({ owner: owner.publicKey, registro, cliente: ana, systemProgram: system })
    .instruction(),
  [owner], "ok"
);
await enviar(
  "Crear cliente #2 Luis",
  await pg.program.methods.crearCliente("Luis")
    .accountsStrict({ owner: owner.publicKey, registro, cliente: luis, systemProgram: system })
    .instruction(),
  [owner], "ok"
);
await enviar(
  "Registrar venta CAF01 (50) a Ana",
  await pg.program.methods.registrarVenta(1, "CAF01", "Cafe americano", 50)
    .accountsStrict({ owner: owner.publicKey, registro, cliente: ana, venta: ventaAna, systemProgram: system })
    .instruction(),
  [owner], "ok"
);

// ---------- R1. Mejora: registrar venta con monto 0 ----------
const ventaCero = pdaVenta(ana, "PAN01");
await enviar(
  "R1 (mejora) Registrar venta con monto 0",
  await pg.program.methods.registrarVenta(1, "PAN01", "Pan dulce", 0)
    .accountsStrict({ owner: owner.publicKey, registro, cliente: ana, venta: ventaCero, systemProgram: system })
    .instruction(),
  [owner], "MontoInvalido"
);
console.log("  Estado: venta PAN01 existe =", await existe(ventaCero),
  "| compras de Ana =", (await leerCliente(ana)).compras);

// ---------- R2. Mejora: corregir importe a 0 ----------
await enviar(
  "R2 (mejora) Corregir importe a 0",
  await pg.program.methods.cambiarMonto(1, "CAF01", 0)
    .accountsStrict({ owner: owner.publicKey, registro, cliente: ana, venta: ventaAna })
    .instruction(),
  [owner], "MontoInvalido"
);
console.log("  Estado: monto de CAF01 =", (await leerVenta(ventaAna)).monto);

// ---------- R3. Wallet no autorizada ----------
const intruso = web3.Keypair.generate(); // No es la autoridad del registro
await enviar(
  "R3 Wallet no autorizada intenta corregir importe",
  await pg.program.methods.cambiarMonto(1, "CAF01", 999)
    .accountsStrict({ owner: intruso.publicKey, registro, cliente: ana, venta: ventaAna })
    .instruction(),
  [owner, intruso], // owner solo paga la comision; el firmante "owner" de la instruccion es el intruso
  "NoOwner"
);
console.log("  Estado: monto de CAF01 =", (await leerVenta(ventaAna)).monto);

// ---------- R4. Venta ajena al cliente ----------
// Se presenta la venta REAL de Ana junto con el cliente Luis.
await enviar(
  "R4 Devolucion con venta de Ana presentada como de Luis",
  await pg.program.methods.hacerDevolucion(2, "CAF01")
    .accountsStrict({ owner: owner.publicKey, registro, cliente: luis, venta: ventaAna })
    .instruction(),
  [owner], "ConstraintSeeds"
);
console.log("  Estado: venta de Ana existe =", await existe(ventaAna),
  "| compras de Ana =", (await leerCliente(ana)).compras);

// ---------- R5. Baja de cliente con ventas activas ----------
await enviar(
  "R5 Baja de Ana con una venta activa",
  await pg.program.methods.eliminarCliente(1)
    .accountsStrict({ owner: owner.publicKey, registro, cliente: ana })
    .instruction(),
  [owner], "ClienteConVentas"
);
let reg = await leerRegistro(registro);
console.log("  Estado: Ana existe =", await existe(ana),
  "| clientes en registro =", reg.clientes.length, "| id_counter =", reg.idCounter);

// ---------- Flujo valido de baja ----------
await enviar(
  "Devolucion valida de CAF01 (Ana)",
  await pg.program.methods.hacerDevolucion(1, "CAF01")
    .accountsStrict({ owner: owner.publicKey, registro, cliente: ana, venta: ventaAna })
    .instruction(),
  [owner], "ok"
);
await enviar(
  "Baja valida de Ana (sin ventas)",
  await pg.program.methods.eliminarCliente(1)
    .accountsStrict({ owner: owner.publicKey, registro, cliente: ana })
    .instruction(),
  [owner], "ok"
);
reg = await leerRegistro(registro);
console.log("  Estado: Ana existe =", await existe(ana),
  "| clientes en registro =", reg.clientes.length, "| id_counter =", reg.idCounter,
  "| Luis conserva datos =", (await leerCliente(luis)).nombre);

const marta = pdaCliente(registro, reg.idCounter + 1);
await enviar(
  "Crear cliente Marta despues de la baja",
  await pg.program.methods.crearCliente("Marta")
    .accountsStrict({ owner: owner.publicKey, registro, cliente: marta, systemProgram: system })
    .instruction(),
  [owner], "ok"
);
console.log("  Estado: id de Marta =", (await leerCliente(marta)).idCliente, "(esperado 3)");

console.log("\nPruebas terminadas.");
