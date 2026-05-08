import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { chromium as playwrightChromium } from "playwright-core";
import * as cheerio from "cheerio";
import { DniData, RucData } from "./sunat-scraper.types";

export { DniData, RucData };

const SUNAT_URL =
  "https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/FrameCriterioBusquedaWeb.jsp";

const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-dev-shm-usage",
  "--no-sandbox",
  "--disable-setuid-sandbox",
];

async function launchBrowser() {
  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isLambda) {
    // @sparticuz/chromium viene del Lambda Layer montado en /opt/nodejs/node_modules
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

@Injectable()
export class SunatScraperService {
  private field($: cheerio.CheerioAPI, label: string): string | null {
    const heading = $("h4.list-group-item-heading").filter(
      (_, el) => $(el).text().trim() === label,
    );
    if (!heading.length) return null;
    const row = heading.closest(".row");
    const value = row
      .find(
        ".col-sm-7 p.list-group-item-text, .col-sm-7 h4.list-group-item-heading",
      )
      .last();
    return value.text().trim() || null;
  }

  private parseRuc(html: string, ruc: string): RucData {
    const $ = cheerio.load(html);

    // "Número de RUC:" → "20100148162 - NOMBRE EMPRESA S.A"
    const rucLine = this.field($, "Número de RUC:") ?? "";
    const razon_social = rucLine.includes(" - ")
      ? rucLine.split(" - ").slice(1).join(" - ").trim()
      : null;

    const actividades: string[] = [];
    $("h4.list-group-item-heading")
      .filter((_, el) => /Actividad.*Econ/i.test($(el).text()))
      .each((_, el) => {
        $(el)
          .closest(".row")
          .find(".col-sm-7 li, .col-sm-7 p")
          .each((_, li) => {
            const txt = $(li).text().trim();
            if (txt) {
              actividades.push(txt);
            }
          });
      });

    // "Domicilio Fiscal:" → "DIRECCION - DEPARTAMENTO - DISTRITO"
    const domicilio = this.field($, "Domicilio Fiscal:") ?? "";
    const domParts = domicilio.split(/\s+-\s+/);
    const direccion = domParts[0]?.trim() || null;
    const departamento = domParts[domParts.length - 2]?.trim() || null;
    const distrito = domParts[domParts.length - 1]?.trim() || null;

    return {
      ruc,
      razon_social,
      tipo_contribuyente: this.field($, "Tipo Contribuyente:"),
      nombre_comercial: this.field($, "Nombre Comercial:"),
      estado: this.field($, "Estado del Contribuyente:"),
      condicion: this.field($, "Condición del Contribuyente:"),
      direccion,
      departamento,
      provincia: null,
      distrito,
      actividades_economicas: actividades,
    };
  }

  private parseDni(html: string, dni: string): DniData {
    const $ = cheerio.load(html);

    // La búsqueda por documento devuelve una lista de .aRucs con data-ruc
    const first = $("a.aRucs").first();
    if (first.length) {
      const ruc = first.attr("data-ruc") ?? null;
      const headings = first.find("h4.list-group-item-heading");
      const nombre_completo =
        headings
          .eq(1)
          .text()
          .replace(/^RUC:\s*\d+/, "")
          .trim() ||
        headings
          .eq(0)
          .text()
          .replace(/^RUC:\s*/, "")
          .split(" ")
          .slice(1)
          .join(" ") ||
        null;
      const estadoEl = first.find("p.list-group-item-text strong span");
      const estado = estadoEl.text().trim() || null;
      return { dni, ruc, nombre_completo, estado, condicion: null };
    }

    return {
      dni,
      ruc: null,
      nombre_completo: null,
      estado: null,
      condicion: null,
    };
  }

  private async scrape(
    action: (page: any) => Promise<string>,
  ): Promise<string> {
    const browser = await launchBrowser();
    const context = await createStealthContext(browser);
    const page = await context.newPage();
    // Eliminar navigator.webdriver para pasar detección básica
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

  async consultarRuc(ruc: string): Promise<RucData> {
    const html = await this.scrape(async (page: any) => {
      await page.goto(SUNAT_URL, { waitUntil: "networkidle" });

      // Seleccionar "Por RUC" (ya activo por defecto)
      await page.fill("#txtRuc", ruc);
      await page.click("#btnAceptar");

      // Esperar resultado o error
      await page.waitForSelector("table, .error, .msg", { timeout: 15000 });
      return page.content();
    });

    const result = this.parseRuc(html, ruc);
    if (!result.razon_social && !result.estado) {
      throw new HttpException(`RUC ${ruc} no encontrado`, HttpStatus.NOT_FOUND);
    }
    return result;
  }

  async consultarDni(dni: string): Promise<DniData> {
    const html = await this.scrape(async (page: any) => {
      await page.goto(SUNAT_URL, { waitUntil: "networkidle" });

      // Cambiar a búsqueda por documento
      await page.click("#btnPorDocumento");
      await page.waitForSelector("#txtNumeroDocumento", { state: "visible" });
      await page.selectOption("#cmbTipoDoc", "1"); // DNI
      await page.fill("#txtNumeroDocumento", dni);
      await page.click("#btnAceptar");

      // Esperar navegación al resultado (puede demorar por reCAPTCHA v3)
      await Promise.race([
        page.waitForNavigation({ timeout: 15000 }),
        page.waitForSelector(".list-group-item", { timeout: 15000 }),
      ]).catch(() => {});
      await new Promise((r) => setTimeout(r, 1000));
      return page.content();
    });

    const result = this.parseDni(html, dni);
    if (!result.ruc && !result.nombre_completo) {
      throw new HttpException(`DNI ${dni} no encontrado`, HttpStatus.NOT_FOUND);
    }
    return result;
  }
}
