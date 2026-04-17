/** Operations sub-modules — same card metadata pattern as SubSystemSelection OPTIONS */
export const OPERATION_MODULES = [
  {
    id: 'general',
    name: 'General Dashboard',
    desc: 'Operational overview & KPIs',
    path: '/operations/general',
    permission: 'operation_general_dashboard',
    emoji: '📊',
    accent: '#E65100',
    soft: '#FFF3E0',
  },
  {
    id: 'support',
    name: 'Customer Support',
    desc: 'Tickets & customer support',
    path: '/operations/support',
    permission: 'operation_customer_support',
    emoji: '💬',
    accent: '#D84315',
    soft: '#FBE9E7',
  },
  {
    id: 'riders',
    name: 'Rider Management',
    desc: 'Riders, vehicles & routes',
    path: '/operations/riders',
    permission: 'operation_rider_management',
    emoji: '🏍️',
    accent: '#BF360C',
    soft: '#FFCCBC',
  },
  {
    id: 'deliveries',
    name: 'Deliveries Management',
    desc: 'Deliveries, riders & QR status',
    path: '/operations/deliveries',
    permission: 'operation_deliveries_management',
    emoji: '🚚',
    accent: '#FF5722',
    soft: '#FFE0B2',
  },
  {
    id: 'challan',
    name: 'Challan Management',
    desc: 'Challan PDFs & batch data',
    path: '/operations/challan',
    permission: 'operation_challan_management',
    emoji: '📄',
    accent: '#D84315',
    soft: '#FFCCBC',
  },
];

export function countAccessibleOperationModules(permissions) {
  const p = permissions || {};
  return OPERATION_MODULES.filter((m) => !!p[m.permission]).length;
}
