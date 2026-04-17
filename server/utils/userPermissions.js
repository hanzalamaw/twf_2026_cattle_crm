/**
 * Build the permissions object returned to the client from a joined users+roles row.
 * Operation sub-screens only apply when operation_management is enabled.
 * @param {object} row - DB row with role permission columns
 */
export function buildPermissionsFromRoleRow(row) {
  const op = !!row.operation_management;
  return {
    control_management: !!row.control_management,
    booking_management: !!row.booking_management,
    operation_management: op,
    operation_general_dashboard: op && !!row.operation_general_dashboard,
    operation_customer_support: op && !!row.operation_customer_support,
    operation_rider_management: op && !!row.operation_rider_management,
    operation_deliveries_management: op && !!row.operation_deliveries_management,
    operation_challan_management: op && !!row.operation_challan_management,
    farm_management: !!row.farm_management,
    procurement_management: !!row.procurement_management,
    accounting_and_finance: !!row.accounting_and_finance,
    performance_management: !!row.performance_management
  };
}
