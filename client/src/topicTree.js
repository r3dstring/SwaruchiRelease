export const TOPIC_TREE = [
  { id: 'overall', label: 'Overall Refinery', icon: '🏭', children: [
    { id: 'crude-to-product', label: 'Crude-to-product basics / Petrochemical basics' },
    { id: 'refinery-economics', label: 'Refinery economics & margins' },
    { id: 'safety-fundamentals', label: 'Safety fundamentals' },
    { id: 'emergency-response', label: 'Emergency response' },
  ]},
  { id: 'individual-units', label: 'Individual Units', icon: '⚙️', children: [
    { id: 'cdu-vdu', label: 'CDU / VDU' },
    { id: 'dhdt-nht', label: 'DHDT / NHT' },
    { id: 'dcu', label: 'DCU' },
    { id: 'fcc-rfcc', label: 'FCC / RFCC' },
    { id: 'hcu', label: 'HCU' },
    { id: 'hydrogen-generation', label: 'Hydrogen Generation' },
    { id: 'sulphur-recovery', label: 'Sulphur Recovery' },
    { id: 'utilities-offsites', label: 'Utilities & Offsites' },
    { id: 'petrochemical-units', label: 'Petrochemical Units' },
  ]},
  { id: 'process', label: 'Process', icon: '🔄', children: [
    { id: 'operating-parameters', label: 'Operating parameters & limits' },
    { id: 'common-upsets', label: 'Common upsets & responses' },
    { id: 'startup-shutdown', label: 'Startup / shutdown sequences' },
    { id: 'process-incident-insights', label: 'Incident insights (from RCFAs)' },
  ]},
  { id: 'electrical', label: 'Electrical', icon: '⚡', children: [
    { id: 'motor-control', label: 'Motor control & protection' },
    { id: 'switchgear-breakers', label: 'Switchgear & breakers' },
    { id: 'power-distribution', label: 'Power distribution' },
    { id: 'electrical-incident-insights', label: 'Incident insights (from RCFAs)' },
  ]},
  { id: 'instrumentation', label: 'Instrumentation', icon: '📡', children: [
    { id: 'control-loops', label: 'Control loops & tuning' },
    { id: 'sis-sil', label: 'Safety instrumented systems (SIS/SIL)' },
    { id: 'analyzers-metering', label: 'Analyzers & metering' },
    { id: 'instr-incident-insights', label: 'Incident insights (from RCFAs)' },
  ]},
];
