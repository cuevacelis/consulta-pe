export interface ContribuyentePanel {
  ruc: string | null;
  razon_social: string | null;
  tipo_contribuyente: string | null;
  tipo_documento: string | null;
  numero_documento: string | null;
  nombre_documento: string | null;
  nombre_comercial: string | null;
  fecha_inscripcion: string | null;
  fecha_inicio_actividades: string | null;
  estado: string | null;
  condicion: string | null;
  domicilio_fiscal: string | null;
  sistema_emision_comprobante: string | null;
  actividad_comercio_exterior: string | null;
  sistema_contabilidad: string | null;
  actividades_economicas: string[];
  comprobantes_pago: string[];
  sistema_emision_electronica: string[];
  emisor_electronico_desde: string | null;
  comprobantes_electronicos: string | null;
  afiliado_ple_desde: string | null;
  padrones: string[];
}

export interface RucData extends ContribuyentePanel {
  ruc: string;
}

export interface DniData extends ContribuyentePanel {
  dni: string;
}
