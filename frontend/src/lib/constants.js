import { Bike, Car, Smartphone } from 'lucide-react';

export const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export const TIPOS = [
  { id: 'CARRO', label: 'Carros', singular: 'carro', icon: Car },
  { id: 'MOTO', label: 'Motos', singular: 'moto', icon: Bike },
  { id: 'CELULAR', label: 'Celulares', singular: 'celular', icon: Smartphone },
];

export const STATUS_OPERACAO_ENCERRADA = ['QUITADO', 'CANCELADO', 'RECUSADO'];
export const JUROS_NORMAL_VENDA = 30;

export const CONFIG_PADRAO = {
  jurosCreditoPadrao: '30',
  diasParaVencerPadrao: '30',
  parcelasCreditoPadrao: '3',
  parcelasVendaPadrao: '10',
};
