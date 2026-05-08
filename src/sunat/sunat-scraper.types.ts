export interface RucData {
  ruc: string;
  razon_social: string | null;
  tipo_contribuyente: string | null;
  nombre_comercial: string | null;
  estado: string | null;
  condicion: string | null;
  direccion: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  actividades_economicas: string[];
}

export interface DniData {
  dni: string;
  nombre_completo: string | null;
  ruc: string | null;
  estado: string | null;
  condicion: string | null;
}
