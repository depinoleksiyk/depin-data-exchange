/**
 * Canonical dataset category metadata.
 *
 * Used by the marketplace card grid, search filters, and the use-cases page.
 * Keep in sync with `gateway/config/sample-datasets.json` `category` enum.
 */
export type CategoryId = 'gps' | 'weather' | 'air-quality' | 'camera' | 'energy' | 'audio'

export interface CategoryMeta {
  id: CategoryId
  label: string
  icon: string
  blurb: string
  primaryUseCase: string
  cadenceHint: string
  pricingHint: string
}

export const DATASET_CATEGORIES: CategoryMeta[] = [
  {
    id: 'gps',
    label: 'GPS / Telemetry',
    icon: '📍',
    blurb: 'Real-time vehicle and asset location streams from logistics fleets.',
    primaryUseCase: 'route optimization, ETA prediction, fleet utilization',
    cadenceHint: '1–30s',
    pricingHint: '$5/day per fleet',
  },
  {
    id: 'weather',
    label: 'Weather',
    icon: '⛅',
    blurb: 'Hyperlocal weather from community-run stations covering microclimates.',
    primaryUseCase: 'agriculture, insurance, energy demand forecasting',
    cadenceHint: '60s',
    pricingHint: '$1/day per region',
  },
  {
    id: 'air-quality',
    label: 'Air Quality',
    icon: '🌫',
    blurb: 'PM2.5, PM10, ozone, NO₂ readings from low-cost sensor mesh.',
    primaryUseCase: 'public-health alerts, urban planning, ESG reporting',
    cadenceHint: '60s',
    pricingHint: '$2/day per city',
  },
  {
    id: 'camera',
    label: 'Streetview / Camera',
    icon: '📷',
    blurb: 'Geo-tagged image frames from rolling-stock dashcams + fixed mounts.',
    primaryUseCase: 'mapping, change-detection, autonomous-driving training',
    cadenceHint: '1Hz',
    pricingHint: '$12/day per route',
  },
  {
    id: 'energy',
    label: 'Energy',
    icon: '⚡',
    blurb: 'Solar generation, EV charging, grid-edge meter readings.',
    primaryUseCase: 'demand response, renewable forecasting, p2p trading',
    cadenceHint: '60s',
    pricingHint: '$3/day per substation',
  },
  {
    id: 'audio',
    label: 'Audio / Acoustic',
    icon: '🎙',
    blurb: 'Ambient sound classification — gunshot detection, wildlife monitoring.',
    primaryUseCase: 'public safety, biodiversity research',
    cadenceHint: 'event-driven',
    pricingHint: '$8/day per sensor',
  },
]

export function getCategory(id: CategoryId): CategoryMeta | undefined {
  return DATASET_CATEGORIES.find((c) => c.id === id)
}
