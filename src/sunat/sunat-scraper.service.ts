import { Injectable } from "@nestjs/common";
import { chromium as playwrightChromium } from "playwright-core";
import * as cheerio from "cheerio";
import { ContribuyentePanel, DniData, RucData } from "./sunat-scraper.types";

export { DniData, RucData };

const SUNAT_URL =
  "https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/FrameCriterioBusquedaWeb.jsp";

const NOT_FOUND_PATTERNS = [
  /no\s+registra/i,
  /no\s+es\s+v[aá]lido/i,
  /no\s+se\s+encontr[oó]/i,
  /sin\s+resultados/i,
];

const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-dev-shm-usage",
  "--no-sandbox",
  "--disable-setuid-sandbox",
];

async function launchBrowser() {
  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isLambda) {
    const chromiumPath = "/opt/nodejs/node_modules/@sparticuz/chromium";
    const chromium = require(chromiumPath);
    return playwrightChromium.launch({
      args: [...chromium.args, ...STEALTH_ARGS],
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }

  return playwrightChromium.launch({
    headless: true,
    args: STEALTH_ARGS,
  });
}

async function createStealthContext(browser: any) {
  return browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "es-PE",
    extraHTTPHeaders: {
      "Accept-Language": "es-PE,es;q=0.9,en;q=0.8",
    },
  });
}

interface ScrapeOutcome {
  notFound: boolean;
  html: string | null;
}

function valueColFor($: cheerio.CheerioAPI, label: string) {
  const heading = $("h4.list-group-item-heading")
    .filter((_, el) => $(el).text().trim() === label)
    .first();
  if (!heading.length) return null;
  const labelCol = heading.parent('[class^="col-sm-"]');
  if (!labelCol.length) return null;
  const next = labelCol.nextAll('[class^="col-sm-"]').first();
  return next.length ? next : null;
}

function getText($: cheerio.CheerioAPI, label: string): string | null {
  const col = valueColFor($, label);
  if (!col) return null;
  let txt = col
    .find("p.list-group-item-text, h4.list-group-item-heading")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  if (!txt) {
    txt = col.text().replace(/\s+/g, " ").trim();
  }
  if (!txt || txt === "-") return null;
  return txt;
}

function getTableLines($: cheerio.CheerioAPI, label: string): string[] {
  const col = valueColFor($, label);
  if (!col) return [];
  const lines: string[] = [];
  col.find("table tr td").each((_, td) => {
    const txt = $(td).text().replace(/\s+/g, " ").trim();
    if (txt) lines.push(txt);
  });
  return lines;
}

function splitRucLine(line: string | null): {
  ruc: string | null;
  razon_social: string | null;
} {
  if (!line) return { ruc: null, razon_social: null };
  const idx = line.indexOf(" - ");
  if (idx < 0) return { ruc: line.trim(), razon_social: null };
  return {
    ruc: line.slice(0, idx).trim(),
    razon_social: line.slice(idx + 3).trim() || null,
  };
}

function splitDocumentoLine(line: string | null): {
  tipo: string | null;
  numero: string | null;
  nombre: string | null;
} {
  if (!line) return { tipo: null, numero: null, nombre: null };
  const m = line.match(/^(\S+)\s+(\d+)(?:\s+-\s+(.+))?$/);
  if (!m) return { tipo: null, numero: null, nombre: null };
  return {
    tipo: m[1] ?? null,
    numero: m[2] ?? null,
    nombre: m[3]?.trim() ?? null,
  };
}

function parsePanel(html: string): ContribuyentePanel | null {
  const $ = cheerio.load(html);
  if (!$(".panel.panel-primary").length) return null;

  const rucLine = getText($, DETAIL_MARKER_LABEL);
  // Sin el label "Número de RUC:" no estamos en el panel de detalle (puede ser
  // la lista "Relación de contribuyentes" o el panel de "no registra").
  if (!rucLine) return null;
  const { ruc, razon_social } = splitRucLine(rucLine);
  const docLine = getText($, "Tipo de Documento:");
  const doc = splitDocumentoLine(docLine);

  return {
    ruc,
    razon_social,
    tipo_contribuyente: getText($, "Tipo Contribuyente:"),
    tipo_documento: doc.tipo,
    numero_documento: doc.numero,
    nombre_documento: doc.nombre,
    nombre_comercial: getText($, "Nombre Comercial:"),
    fecha_inscripcion: getText($, "Fecha de Inscripción:"),
    fecha_inicio_actividades: getText($, "Fecha de Inicio de Actividades:"),
    estado: getText($, "Estado del Contribuyente:"),
    condicion: getText($, "Condición del Contribuyente:"),
    domicilio_fiscal: getText($, "Domicilio Fiscal:"),
    sistema_emision_comprobante: getText($, "Sistema Emisión de Comprobante:"),
    actividad_comercio_exterior: getText($, "Actividad Comercio Exterior:"),
    sistema_contabilidad: getText($, "Sistema Contabilidad:"),
    actividades_economicas: getTableLines($, "Actividad(es) Económica(s):"),
    comprobantes_pago: getTableLines(
      $,
      "Comprobantes de Pago c/aut. de impresión (F. 806 u 816):",
    ),
    sistema_emision_electronica: getTableLines(
      $,
      "Sistema de Emisión Electrónica:",
    ),
    emisor_electronico_desde: getText($, "Emisor electrónico desde:"),
    comprobantes_electronicos: getText($, "Comprobantes Electrónicos:"),
    afiliado_ple_desde: getText($, "Afiliado al PLE desde:"),
    padrones: getTableLines($, "Padrones:"),
  };
}

function looksLikeNotFound(html: string): boolean {
  const $ = cheerio.load(html);
  // Solo miramos las áreas donde SUNAT pone el mensaje de error,
  // para no confundirnos con texto suelto de la página.
  const candidates = $(
    ".panel.panel-primary .panel-body, .alert, .error, .msg, .panel-body.text-center",
  );
  const text = (candidates.length ? candidates.text() : $("body").text()) || "";
  return NOT_FOUND_PATTERNS.some((re) => re.test(text));
}

const DETAIL_MARKER_LABEL = "Número de RUC:";

async function waitForDetailPanel(page: any, timeoutMs: number): Promise<void> {
  await page.waitForFunction(
    (label: string) => {
      const headings = document.querySelectorAll("h4.list-group-item-heading");
      return Array.from(headings).some(
        (el) => el.textContent?.trim() === label,
      );
    },
    DETAIL_MARKER_LABEL,
    { timeout: timeoutMs },
  );
}

@Injectable()
export class SunatScraperService {
  private async scrape(
    action: (page: any) => Promise<ScrapeOutcome>,
  ): Promise<ScrapeOutcome> {
    const browser = await launchBrowser();
    const context = await createStealthContext(browser);
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    try {
      return await action(page);
    } finally {
      await context.close();
      await browser.close();
    }
  }

  async consultarRuc(ruc: string): Promise<RucData | null> {
    const outcome = await this.scrape(async (page: any) => {
      await page.goto(SUNAT_URL, { waitUntil: "networkidle" });
      await page.fill("#txtRuc", ruc);
      await page.click("#btnAceptar");
      await page
        .waitForSelector(".panel.panel-primary, .alert, .error, .msg", {
          timeout: 20000,
        })
        .catch(() => {});

      const html = await page.content();
      if (looksLikeNotFound(html)) return { notFound: true, html: null };

      // Esperamos a que aparezca el panel de detalle (label "Número de RUC:").
      try {
        await waitForDetailPanel(page, 20000);
      } catch {
        // Si nunca cargó el detalle pero tampoco vimos "no registra",
        // re-leemos por si el mensaje cargó tarde.
        const html2 = await page.content();
        if (looksLikeNotFound(html2)) return { notFound: true, html: null };
        throw new Error("SUNAT no devolvió panel de detalle ni mensaje (RUC)");
      }

      return { notFound: false, html: await page.content() };
    });

    if (outcome.notFound) return null;
    const panel = parsePanel(outcome.html!);
    if (!panel) {
      throw new Error(`No se pudo parsear el panel SUNAT para RUC ${ruc}`);
    }
    return { ...panel, ruc };
  }

  async consultarDni(dni: string): Promise<DniData | null> {
    const outcome = await this.scrape(async (page: any) => {
      await page.goto(SUNAT_URL, { waitUntil: "networkidle" });
      await page.click("#btnPorDocumento");
      await page.waitForSelector("#txtNumeroDocumento", { state: "visible" });
      await page.selectOption("#cmbTipoDoc", "1"); // DNI
      await page.fill("#txtNumeroDocumento", dni);
      await page.click("#btnAceptar");

      await page
        .waitForSelector("a.aRucs, .panel.panel-primary", {
          timeout: 20000,
        })
        .catch(() => {});

      const firstHtml = await page.content();
      const aRucs = await page.$("a.aRucs[data-ruc]");

      if (!aRucs) {
        if (looksLikeNotFound(firstHtml)) {
          return { notFound: true, html: null };
        }
        throw new Error("SUNAT respondió sin resultados ni mensaje (DNI)");
      }

      // Click navega al panel detalle. La página de lista YA tiene
      // .panel.panel-primary, así que esperar ese selector resuelve al toque
      // y devuelve HTML viejo. En su lugar esperamos por el label
      // "Número de RUC:" que solo aparece en el panel detalle.
      await aRucs.click();
      try {
        await waitForDetailPanel(page, 20000);
      } catch {
        const recovered = await page.content();
        if (looksLikeNotFound(recovered)) {
          return { notFound: true, html: null };
        }
        throw new Error("SUNAT no cargó el panel detalle tras click en aRucs");
      }

      return { notFound: false, html: await page.content() };
    });

    if (outcome.notFound) return null;
    const panel = parsePanel(outcome.html!);
    if (!panel) {
      throw new Error(`No se pudo parsear el panel SUNAT para DNI ${dni}`);
    }
    return { ...panel, dni };
  }
}
